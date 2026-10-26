import { importPKCS8, SignJWT } from 'jose';
import { accountConfig, authReady, firebase, saveSession } from './auth';
import { config, db } from './server';
import { DomainError } from './domain';
import { trackSession } from './sessions';

/**
 * One-time setup links. The owner creates one from the local admin (which has Cloudflare
 * access) to sign in to a still-empty account — to set up photos and the theme — without
 * going through that account's email. Email-link login stays the normal way in.
 *
 * A token is 256 bits of randomness, expires in 15 minutes, and is deleted the first time
 * it is used. Only someone who can run the admin (i.e. with D1 access) can create one.
 */
const SCHEMA = 'CREATE TABLE IF NOT EXISTS setup_tokens (token TEXT PRIMARY KEY NOT NULL, account TEXT NOT NULL, expires INTEGER NOT NULL)';
const TTL_MS = 15 * 60 * 1000;
const CUSTOM_TOKEN_AUD = 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';

type Tokens = { idToken: string; refreshToken: string; localId: string; email: string };

let ready: Promise<unknown> | null = null;
function ensureSetupTokens() {
  return ready ??= db().prepare(SCHEMA).run().catch(error => { ready = null; throw error; });
}

export async function pruneSetupTokens(now = Date.now()) {
  await ensureSetupTokens();
  await db().prepare('DELETE FROM setup_tokens WHERE expires<?').bind(now).run();
}

/** Admin-only: stores a fresh token for an account name ('Mnhat' | 'Mihu'). Returns the token. */
export async function createSetupToken(accountName: string, now = Date.now()) {
  if (!authReady()) throw new DomainError('Hai tài khoản chưa được cấu hình.', 503);
  const account = accountConfig().find(a => a.name === accountName);
  if (!account) throw new DomainError('Không tìm thấy tài khoản này.', 404);
  await ensureSetupTokens();
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
  await db().prepare('INSERT INTO setup_tokens (token, account, expires) VALUES (?,?,?)').bind(token, account.name, now + TTL_MS).run();
  return token;
}

/** A Firebase custom token for a uid, signed with the service account. Used once, valid 5 minutes. */
async function customToken(uid: string) {
  const raw = config('FIREBASE_SERVICE_ACCOUNT');
  if (!raw) throw new DomainError('Chưa cấu hình khoá dịch vụ Firebase.', 503);
  const sa = JSON.parse(raw) as { private_key: string; client_email: string };
  const key = await importPKCS8(sa.private_key, 'RS256');
  return new SignJWT({ uid }).setProtectedHeader({ alg: 'RS256' }).setIssuer(sa.client_email).setSubject(sa.client_email).setAudience(CUSTOM_TOKEN_AUD).setIssuedAt().setExpirationTime('5m').sign(key);
}

/**
 * Consumes a one-time token and signs this browser in to that account, the same way the
 * email link does: it mints a real Firebase session, so the normal session checks all apply
 * afterwards. The account's email is set the first time, so `session()`'s email check passes.
 */
export async function enterWithSetupToken(token: string, now = Date.now()) {
  if (!authReady()) throw new DomainError('Hai tài khoản chưa được cấu hình.', 503);
  if (!/^[0-9a-f]{64}$/.test(token)) throw new DomainError('Liên kết thiết lập không hợp lệ.', 400);
  await ensureSetupTokens();
  // One-time: delete and read back in a single statement so a reused link can never log in twice.
  const row = await db().prepare('DELETE FROM setup_tokens WHERE token=? RETURNING account, expires').bind(token).first<{ account: string; expires: number }>();
  if (!row) throw new DomainError('Liên kết thiết lập đã được dùng hoặc không tồn tại. Hãy tạo liên kết mới.', 401);
  if (row.expires < now) throw new DomainError('Liên kết thiết lập đã hết hạn. Hãy tạo liên kết mới.', 401);
  const account = accountConfig().find(a => a.name === row.account);
  if (!account) throw new DomainError('Không tìm thấy tài khoản này.', 404);

  const signed = await firebase<{ idToken: string; refreshToken: string }>('signInWithCustomToken', { token: await customToken(account.uid), returnSecureToken: true });
  const tokens: Tokens = { idToken: signed.idToken, refreshToken: signed.refreshToken, localId: account.uid, email: account.email };
  // A brand-new account has no email yet; set it so the account stays the one the email link maps to.
  const look = await firebase<{ users?: { email?: string }[] }>('lookup', { idToken: signed.idToken });
  if (look.users?.[0]?.email?.toLowerCase() !== account.email) {
    const updated = await firebase<{ idToken?: string; refreshToken?: string }>('update', { idToken: signed.idToken, email: account.email, returnSecureToken: true });
    if (updated.idToken) tokens.idToken = updated.idToken;
    if (updated.refreshToken) tokens.refreshToken = updated.refreshToken;
  }
  const device = await saveSession(tokens);
  await trackSession(account.uid, account.name, device);
  return { uid: account.uid, name: account.name };
}
