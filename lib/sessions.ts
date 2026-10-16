import { headers } from 'next/headers';
import { db } from './server';
import { DomainError, dayVN } from './domain';

/**
 * One row per signed-in browser (the `mihu_device` cookie). Only the local admin
 * (`npm run admin`) reads this table; it can end a session, which signs that device out.
 */
const SCHEMA = "CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY NOT NULL, uid TEXT NOT NULL, account TEXT NOT NULL, created INTEGER NOT NULL, seen INTEGER NOT NULL, agent TEXT NOT NULL DEFAULT '', ip TEXT NOT NULL DEFAULT '', place TEXT NOT NULL DEFAULT '', ended INTEGER, reason TEXT)";
/** One row per account per day: the first time the web was opened that day (Vietnam time). */
const VISITS = 'CREATE TABLE IF NOT EXISTS visits (uid TEXT NOT NULL, day TEXT NOT NULL, account TEXT NOT NULL, first INTEGER NOT NULL, agent TEXT NOT NULL DEFAULT \'\', ip TEXT NOT NULL DEFAULT \'\', place TEXT NOT NULL DEFAULT \'\', PRIMARY KEY (uid, day))';
/** Last-seen is refreshed at most this often, so normal use costs one read per request, not a write. */
const TOUCH_MS = 5 * 60 * 1000;

let ready: Promise<unknown> | null = null;
/** The table is created on first use, so no manual SQL is needed in the D1 console. */
export function ensureSessions() {
  return ready ??= db().batch([db().prepare(SCHEMA), db().prepare(VISITS)]).catch(error => { ready = null; throw error; });
}

export class SessionEnded extends DomainError {
  constructor() { super('Phiên đăng nhập này đã được đăng xuất. Mihu đăng nhập lại nhé.', 401); }
}

async function client() {
  try {
    const h = await headers();
    const place = [h.get('cf-ipcity'), h.get('cf-region'), h.get('cf-ipcountry')].filter(Boolean).map(v => decodeURIComponent(v!)).join(', ');
    return { agent: (h.get('user-agent') || '').slice(0, 400), ip: h.get('cf-connecting-ip') || '', place: place.slice(0, 120) };
  } catch {
    return { agent: '', ip: '', place: '' };
  }
}

/**
 * Records or refreshes this browser's session. Throws SessionEnded when the admin signed it out.
 * Any storage problem is swallowed: tracking must never lock Mihu out of her own corner.
 */
export async function trackSession(uid: string, account: string, id: string, now = Date.now()) {
  if (!id) return;
  let row: { uid: string; seen: number; ended: number | null } | null;
  try {
    await ensureSessions();
    row = await db().prepare('SELECT uid, seen, ended FROM sessions WHERE id=?').bind(id).first();
  } catch { return; }
  if (row?.ended && row.uid === uid) throw new SessionEnded();
  const same = !!row && row.uid === uid;
  const firstToday = !same || dayVN(row!.seen) !== dayVN(now);
  if (same && !firstToday && now - row!.seen < TOUCH_MS) return;
  const c = await client();
  try {
    if (same) await db().prepare('UPDATE sessions SET seen=?, agent=?, ip=?, place=? WHERE id=?').bind(now, c.agent, c.ip, c.place, id).run();
    else await db().prepare('INSERT INTO sessions (id, uid, account, created, seen, agent, ip, place, ended, reason) VALUES (?,?,?,?,?,?,?,?,NULL,NULL) ON CONFLICT(id) DO UPDATE SET uid=excluded.uid, account=excluded.account, created=excluded.created, seen=excluded.seen, agent=excluded.agent, ip=excluded.ip, place=excluded.place, ended=NULL, reason=NULL').bind(id, uid, account, now, now, c.agent, c.ip, c.place).run();
    // At most one visit write per browser per day; the first open of the day wins.
    if (firstToday) await db().prepare('INSERT OR IGNORE INTO visits (uid, day, account, first, agent, ip, place) VALUES (?,?,?,?,?,?,?)').bind(uid, dayVN(now), account, now, c.agent, c.ip, c.place).run();
  } catch { /* best effort */ }
}

export async function endSession(id: string, reason: 'logout' | 'revoked', now = Date.now()) {
  if (!id) return;
  try {
    await ensureSessions();
    await db().prepare('UPDATE sessions SET ended=?, reason=? WHERE id=? AND ended IS NULL').bind(now, reason, id).run();
  } catch { /* best effort */ }
}

/** Ended sessions are kept 30 days for the admin history; idle ones and daily visits disappear after a year. */
export async function pruneSessions(now = Date.now()) {
  await ensureSessions();
  await db().prepare('DELETE FROM sessions WHERE (ended IS NOT NULL AND ended<?) OR seen<?').bind(now - 30 * 86400000, now - 400 * 86400000).run();
  await db().prepare('DELETE FROM visits WHERE day<?').bind(dayVN(now - 365 * 86400000)).run();
}
