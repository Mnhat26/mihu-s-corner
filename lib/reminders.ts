import { importPKCS8, SignJWT } from 'jose';
import { config, db } from './server';
import { todayVN, addDays, tasksOn, normalizeState, type Occurrence } from './domain';
import { reminderMessage } from './reminder-text';

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
const sha256 = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))).map(n => n.toString(16).padStart(2, '0')).join('');

/** Runs every minute. Each (task occurrence, device) is sent at most once, within 15 minutes of its time. */
export async function sendDueReminders() {
  if (pushMissing().length) return { enabled: false, sent: 0 };
  const now = Date.now(); const today = todayVN(); let sent = 0;
  const spaces = await db().prepare('SELECT uid,state FROM spaces').all<{ uid: string; state: string }>();
  for (const space of spaces.results) {
    const state = normalizeState(JSON.parse(space.state));
    const tasks = [addDays(today, -1), today, addDays(today, 1)].flatMap(d => tasksOn(state, d));
    for (const t of tasks) {
      if (t.done || t.reminder < 0 || !t.time) continue;
      const due = dueAt(t); if (due > now || now - due > 15 * 60000) continue;
      const devices = await db().prepare('SELECT token FROM devices WHERE uid=?').bind(space.uid).all<{ token: string }>();
      for (const d of devices.results) {
        const key = space.uid + ':' + t.key + ':' + due + ':' + await sha256(d.token);
        const lock = await db().prepare("INSERT INTO deliveries(key,status,updated) VALUES(?,'sending',?) ON CONFLICT(key) DO UPDATE SET status='sending',updated=excluded.updated WHERE deliveries.status='retry' OR (deliveries.status='sending' AND deliveries.updated<?) RETURNING key").bind(key, now, now - 120000).first();
        if (!lock) continue;
        try {
          // Re-read: the task may have been ticked, edited or the device turned off a moment ago.
          const latest = await db().prepare('SELECT state FROM spaces WHERE uid=?').bind(space.uid).first<{ state: string }>();
          const fresh = latest ? normalizeState(JSON.parse(latest.state)) : null;
          const current = fresh ? tasksOn(fresh, t.occurrenceDate).find(item => item.key === t.key) : undefined;
          const stillRegistered = await db().prepare('SELECT token FROM devices WHERE uid=? AND token=?').bind(space.uid, d.token).first();
          if (!fresh || !current || current.done || current.reminder < 0 || !current.time || dueAt(current) !== due || !stillRegistered) {
            await db().prepare("UPDATE deliveries SET status='cancelled',updated=? WHERE key=?").bind(Date.now(), key).run(); continue;
          }
          const text = reminderMessage(current, fresh.settings.reminderTitle);
          // Expire the push once the reminder is no longer useful (but give at least 5 minutes).
          const ttl = Math.max(300, Math.round((due + 15 * 60000 - Date.now()) / 1000));
          if (await sendPush(d.token, { ...text, url: '/?day=' + t.occurrenceDate, tag: t.key }, ttl) === 'sent') sent++;
          await db().prepare("UPDATE deliveries SET status='sent',updated=? WHERE key=?").bind(Date.now(), key).run();
        } catch {
          await db().prepare("UPDATE deliveries SET status='retry',updated=? WHERE key=?").bind(Date.now(), key).run();
        }
      }
    }
  }
  await db().batch([db().prepare('DELETE FROM rate_limits WHERE expires<?').bind(Math.floor(now / 1000)), db().prepare('DELETE FROM deliveries WHERE updated<?').bind(now - 30 * 86400000)]);
  return { enabled: true, sent };
}
