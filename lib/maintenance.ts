import { db, runtime, decodeState } from './server';
import type { State } from './domain';
import { pruneSessions } from './sessions';
import { pruneSetupTokens } from './setup-login';

/** Photo ids referenced by an account's saved settings. */
export function referencedAssets(state: Pick<State, 'settings'>) {
  const s = state.settings;
  return new Set([s.avatar, s.cover, ...(s.photos || [])].filter(Boolean));
}

/** Remove photos that were referenced before a settings save and no longer are. Best effort. */
export async function removeReplacedAssets(uid: string, before: Pick<State, 'settings'>, after: Pick<State, 'settings'>) {
  const keep = referencedAssets(after);
  for (const id of referencedAssets(before)) {
    if (keep.has(id)) continue;
    try {
      await runtime.BUCKET.delete(uid + '/' + id);
      await db().prepare('DELETE FROM assets WHERE id=? AND uid=?').bind(id, uid).run();
    } catch { /* the hourly sweep retries */ }
  }
}

const GRACE_MS = 24 * 60 * 60 * 1000;
const KEEP_OPERATIONS = 200;

/**
 * Hourly housekeeping:
 * - photos uploaded but never saved (personalization cancelled) are removed after 24 hours;
 * - retry records older than the last KEEP_OPERATIONS saves of each account are dropped.
 */
export async function cleanup(now = Date.now()) {
  // Short-lived records, pruned whether or not push is set up.
  await db().batch([db().prepare('DELETE FROM rate_limits WHERE expires<?').bind(Math.floor(now / 1000)), db().prepare('DELETE FROM deliveries WHERE updated<?').bind(now - 30 * 86400000)]);
  await pruneSessions(now).catch(() => undefined);
  await pruneSetupTokens(now).catch(() => undefined);
  await db().prepare('DELETE FROM operations WHERE version < (SELECT s.version FROM spaces s WHERE s.uid = operations.uid) - ?').bind(KEEP_OPERATIONS).run();
  const bucket = runtime.BUCKET as R2Bucket & { head?: R2Bucket['head'] };
  if (typeof bucket.head !== 'function') return { removed: 0 };
  const spaces = await db().prepare('SELECT uid, state FROM spaces').all<{ uid: string; state: string }>();
  let removed = 0;
  for (const space of spaces.results) {
    const keep = referencedAssets(await decodeState(space.state));
    const rows = await db().prepare('SELECT id FROM assets WHERE uid=?').bind(space.uid).all<{ id: string }>();
    for (const { id } of rows.results) {
      if (keep.has(id) || removed >= 50) continue;
      const object = await bucket.head(space.uid + '/' + id);
      if (object && now - object.uploaded.getTime() < GRACE_MS) continue;
      // Re-check against the latest state so a photo saved a moment ago is never removed.
      const latest = await db().prepare('SELECT state FROM spaces WHERE uid=?').bind(space.uid).first<{ state: string }>();
      if (latest && referencedAssets(await decodeState(latest.state)).has(id)) continue;
      await bucket.delete(space.uid + '/' + id);
      await db().prepare('DELETE FROM assets WHERE id=? AND uid=?').bind(id, space.uid).run();
      removed++;
    }
  }
  return { removed };
}
