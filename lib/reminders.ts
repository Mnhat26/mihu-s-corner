import { importPKCS8, SignJWT } from 'jose';
import { config, db, decodeState } from './server';
import { todayVN, addDays, tasksOn, nextBreak, type Occurrence, type State } from './domain';
import { reminderMessage, focusEndMessage } from './reminder-text';

/** Settings the server needs before it can send any push. Names only, never values. */
export function pushMissing() {
  const required = ['FIREBASE_API_KEY', 'FIREBASE_PROJECT_ID', 'FIREBASE_APP_ID', 'FIREBASE_SENDER_ID', 'FIREBASE_VAPID_KEY', 'FIREBASE_SERVICE_ACCOUNT'];
  const missing = required.filter(k => !config(k));
  // On unless explicitly switched off (REMINDERS_ENABLED=false), e.g. on a development machine.
  if (config('REMINDERS_ENABLED') === 'false') missing.push('REMINDERS_ENABLED');
  return missing;
}

let cached: { token: string; until: number } | null = null;
async function googleToken() {
  if (cached && cached.until > Date.now()) return cached.token;
  const sa = JSON.parse(config('FIREBASE_SERVICE_ACCOUNT')) as { private_key: string; client_email: string };
  const key = await importPKCS8(sa.private_key, 'RS256');
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.messaging' }).setProtectedHeader({ alg: 'RS256' }).setIssuer(sa.client_email).setAudience('https://oauth2.googleapis.com/token').setIssuedAt().setExpirationTime('55m').sign(key);
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
  if (!r.ok) throw new Error('Push authorization unavailable');
  cached = { token: (await r.json() as { access_token: string }).access_token, until: Date.now() + 50 * 60000 };
  return cached.token;
}

export type PushPayload = { title: string; body: string; url: string; tag: string };
/**
 * Send one data message. The service worker turns it into the notification, so iOS and
 * desktop show the same text. Returns 'gone' when the device token is no longer valid.
 */
export async function sendPush(token: string, p: PushPayload, ttlSeconds = 900): Promise<'sent' | 'gone'> {
  const access = await googleToken();
  const r = await fetch('https://fcm.googleapis.com/v1/projects/' + encodeURIComponent(config('FIREBASE_PROJECT_ID')) + '/messages:send', {
    method: 'POST', headers: { Authorization: 'Bearer ' + access, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { token, data: p, webpush: { headers: { TTL: String(ttlSeconds), Urgency: 'high' } } } }),
  });
  if (r.ok) return 'sent';
  const detail = await r.json().catch(() => ({})) as { error?: { status?: string; details?: { errorCode?: string }[] } };
  if (r.status === 404 || detail.error?.details?.some(x => x.errorCode === 'UNREGISTERED')) { await db().prepare('DELETE FROM devices WHERE token=?').bind(token).run(); return 'gone'; }
  throw new Error('Push delivery unavailable');
}

const dueAt = (t: Pick<Occurrence, 'occurrenceDate' | 'time' | 'reminder'>) => Date.parse(t.occurrenceDate + 'T' + t.time + ':00+07:00') - t.reminder * 60000;
const startsAt = (t: Pick<Occurrence, 'occurrenceDate' | 'time'>) => Date.parse(t.occurrenceDate + 'T' + t.time + ':00+07:00');
const sha256 = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))).map(n => n.toString(16).padStart(2, '0')).join('');
const WINDOW = 15 * 60000;

/*
 * The cron runs every minute. Decoding an account's whole data each minute gets slow as it
 * grows (and the free plan allows ~10 ms of CPU), so each worker keeps a small "agenda" per
 * account and rebuilds it only when that account's data version or the day changes.
 */
type Item = { kind: 'task'; key: string; due: number } | { kind: 'focus'; key: string; due: number };
const agendas = new Map<string, { version: number; day: string; items: Item[] }>();
function buildAgenda(state: State, today: string): Item[] {
  const items: Item[] = [];
  for (const t of [addDays(today, -1), today, addDays(today, 1)].flatMap(d => tasksOn(state, d)))
    if (!t.done && t.reminder >= 0 && t.time) items.push({ kind: 'task', key: t.key, due: dueAt(t) });
  const a = state.focus.active; if (a && a.pausedAt === null) items.push({ kind: 'focus', key: a.id, due: a.endsAt });
  return items;
}

async function deliver(uid: string, key: string, now: number, send: (token: string) => Promise<'sent' | 'gone' | 'skip'>) {
  let sent = 0;
  const devices = await db().prepare('SELECT token FROM devices WHERE uid=?').bind(uid).all<{ token: string }>();
  for (const d of devices.results) {
    const lockKey = key + ':' + await sha256(d.token);
    const lock = await db().prepare("INSERT INTO deliveries(key,status,updated) VALUES(?,'sending',?) ON CONFLICT(key) DO UPDATE SET status='sending',updated=excluded.updated WHERE deliveries.status='retry' OR (deliveries.status='sending' AND deliveries.updated<?) RETURNING key").bind(lockKey, now, now - 120000).first();
    if (!lock) continue;
    try {
      const r = await send(d.token); if (r === 'sent') sent++;
      await db().prepare('UPDATE deliveries SET status=?,updated=? WHERE key=?').bind(r === 'skip' ? 'cancelled' : 'sent', Date.now(), lockKey).run();
    } catch { await db().prepare("UPDATE deliveries SET status='retry',updated=? WHERE key=?").bind(Date.now(), lockKey).run(); }
  }
  return sent;
}

export async function sendDueReminders() {
  if (pushMissing().length) return { enabled: false, sent: 0 };
  const now = Date.now(); const today = todayVN(); let sent = 0;
  const versions = await db().prepare('SELECT uid,version FROM spaces').all<{ uid: string; version: number }>();
  for (const { uid, version } of versions.results) {
    try { // one broken account never stops the other's reminders
      let plan = agendas.get(uid);
      if (!plan || plan.version !== version || plan.day !== today) {
        const row = await db().prepare('SELECT state,version FROM spaces WHERE uid=?').bind(uid).first<{ state: string; version: number }>();
        if (!row) continue;
        plan = { version: row.version, day: today, items: buildAgenda(await decodeState(row.state), today) }; agendas.set(uid, plan);
      }
      const due = plan.items.filter(i => i.due <= now && now - i.due <= (i.kind === 'focus' ? 10 * 60000 : WINDOW));
      if (!due.length) continue;
      // Data as it is right now: the task may have been ticked or edited a moment ago.
      const row = await db().prepare('SELECT state FROM spaces WHERE uid=?').bind(uid).first<{ state: string }>();
      if (!row) continue; const fresh = await decodeState(row.state);
      for (const item of due) {
        if (item.kind === 'focus') {
          sent += await deliver(uid, uid + ':focus:' + item.key, now, async token => {
            const cur = fresh.focus.active; if (!cur || cur.id !== item.key || cur.pausedAt !== null) return 'skip';
            const f = fresh.focus; const after = { ...f, cycle: f.cycle + (cur.mode === 'focus' ? 1 : 0) };
            return sendPush(token, { ...focusEndMessage(cur, f.settings[nextBreak(after)], fresh.settings.reminderTitle), url: '/?focus=1', tag: 'mihu-focus' }, 600);
          });
          continue;
        }
        const date = item.key.slice(-10);
        sent += await deliver(uid, uid + ':' + item.key + ':' + item.due, now, async token => {
          const current = tasksOn(fresh, date).find(t => t.key === item.key);
          if (!current || current.done || current.reminder < 0 || !current.time || dueAt(current) !== item.due) return 'skip';
          // Say how long is really left, even when the send runs a little late.
          const left = Math.round((startsAt(current) - Date.now()) / 60000);
          const ttl = Math.max(300, Math.round((item.due + WINDOW - Date.now()) / 1000));
          return sendPush(token, { ...reminderMessage(current, fresh.settings.reminderTitle, left), url: '/?day=' + date, tag: current.key }, ttl);
        });
      }
    } catch (e) { console.error('Reminders failed for one account', e instanceof Error ? e.name : 'unknown'); }
  }
  return { enabled: true, sent };
}
