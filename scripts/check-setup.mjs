import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
process.env.MIHU_TEST_MODE = '1';
await import('./local-backend.mjs');
const { env, requestContext } = await import('./local-bindings.mjs');
env.MNHAT_UID = 'test_mnhat'; env.MIHU_UID = 'test_mihu'; env.MNHAT_EMAIL = 'mnhat@example.test'; env.MIHU_EMAIL = 'mihu@example.test';
env.FIREBASE_API_KEY = 'test'; env.APP_ORIGIN = 'https://mihu.example.test';
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ private_key: privateKey, client_email: 'svc@test.iam.gserviceaccount.com' });

// Firebase mock: custom-token sign-in, lookup, update. `mihuEmail` starts empty to simulate a brand-new account.
let mihuEmail = '';
const fakeToken = (uid, authTime = Date.now()) => Buffer.from('{}').toString('base64url') + '.' + Buffer.from(JSON.stringify({ auth_time: Math.floor(authTime / 1000), sub: uid })).toString('base64url') + '.sig';
globalThis.fetch = async (url, opts) => {
  const u = String(url); const b = JSON.parse(opts.body);
  if (u.includes('accounts:signInWithCustomToken')) { const claims = JSON.parse(Buffer.from(b.token.split('.')[1], 'base64url')); return Response.json({ idToken: fakeToken(claims.uid), refreshToken: 'refresh_' + claims.uid, localId: claims.uid }); }
  if (u.includes('accounts:lookup')) { const uid = JSON.parse(Buffer.from(b.idToken.split('.')[1], 'base64url')).sub; const email = uid === 'test_mnhat' ? 'mnhat@example.test' : uid === 'test_mihu' ? mihuEmail : 'other@example.test'; return Response.json({ users: [{ localId: uid, email, validSince: '0' }] }); }
  if (u.includes('accounts:update')) { const uid = JSON.parse(Buffer.from(b.idToken.split('.')[1], 'base64url')).sub; if (uid === 'test_mihu' && b.email) mihuEmail = String(b.email).toLowerCase(); return Response.json({ idToken: fakeToken(uid), refreshToken: 'refresh2_' + uid }); }
  throw new Error('Unmocked Firebase call: ' + u);
};

const authRoute = await import('../app/api/auth/route.ts');
const setup = await import('../lib/setup-login.ts');
await env.DB.prepare('DELETE FROM setup_tokens').run().catch(() => {});
await env.DB.prepare('DELETE FROM sessions').run().catch(() => {});

function runReq(cookies, url, init = {}) { return requestContext.run({ cookies: new Map(cookies), setCookies: [], headers: { 'cf-connecting-ip': '203.0.113.9' } }, () => authRoute.GET(new Request(url, init))); }
// Parse Set-Cookie from the local backend's ctx; emulate by reading cookies the handler set.
async function enter(token) { const ctx = { cookies: new Map(), setCookies: [], headers: { 'cf-connecting-ip': '203.0.113.9' } }; const res = await requestContext.run(ctx, () => authRoute.GET(new Request('https://mihu.example.test/api/auth?setup=' + token))); return { res, jar: ctx.cookies }; }

let n = 0; const ok = s => { n++; console.log('PASS', s); };

// 1. Admin creates a token
const token = await setup.createSetupToken('Mihu');
assert.match(token, /^[0-9a-f]{64}$/); ok('Admin creates a 256-bit one-time token');

// 2. Opening the link signs in as Mihu and sets cookies
const { res, jar } = await enter(token);
assert.equal(res.status, 200); assert.match(await res.text(), /Đang mở góc nhỏ/);
assert.ok(jar.get('mihu_id') && jar.get('mihu_refresh') && jar.get('mihu_device')); ok('Setup link logs in and sets session cookies');
assert.equal(mihuEmail, 'mihu@example.test'); ok('Brand-new account gets its email set so session checks pass');

// 3. The resulting session is a valid Mihu session
const sess = await runReq([['mihu_id', jar.get('mihu_id')], ['mihu_device', jar.get('mihu_device')]], 'https://mihu.example.test/api/auth');
const sj = await sess.json(); assert.equal(sess.status, 200); assert.equal(sj.user.uid, 'test_mihu'); assert.equal(sj.user.identity, 'Mihu'); ok('Session resolves to the Mihu account');

// 4. The browser is recorded in the admin sessions table
const row = await env.DB.prepare('SELECT uid, account FROM sessions WHERE id=?').bind(jar.get('mihu_device')).first();
assert.equal(row?.uid, 'test_mihu'); assert.equal(row?.account, 'Mihu'); ok('The setup login shows up in admin as a Mihu device');

// 5. One-time: the same token cannot be used again
const again = await enter(token); assert.equal(again.res.status, 401); assert.match(await again.res.text(), /đã được dùng|không tồn tại/); ok('A used link cannot log in again');

// 6. Expired token is rejected
const expired = Array.from(crypto.getRandomValues(new Uint8Array(32)), x => x.toString(16).padStart(2, '0')).join('');
await env.DB.prepare('INSERT INTO setup_tokens (token, account, expires) VALUES (?,?,?)').bind(expired, 'Mihu', Date.now() - 1000).run();
const exp = await enter(expired); assert.equal(exp.res.status, 401); assert.match(await exp.res.text(), /hết hạn/); ok('An expired link is rejected');

// 7. Garbage token shape rejected without touching the DB
const bad = await enter('not-a-valid-token'); assert.equal(bad.res.status, 400); ok('A malformed token is rejected');

// 8. Pruning removes expired tokens only
await env.DB.prepare('INSERT INTO setup_tokens (token, account, expires) VALUES (?,?,?)').bind('f'.repeat(64), 'Mihu', Date.now() - 1).run();
const fresh = await setup.createSetupToken('Mnhat');
await setup.pruneSetupTokens();
const left = await env.DB.prepare('SELECT token FROM setup_tokens').all();
assert.deepEqual(left.results.map(r => r.token), [fresh]); ok('Pruning clears expired tokens, keeps fresh ones');

// 9. Unknown account name rejected
await assert.rejects(() => setup.createSetupToken('Someone'), /Không tìm thấy/); ok('Unknown account name is rejected');

// 10. GET without ?setup still does the normal session check (returns 401 when not logged in)
const normal = await runReq([], 'https://mihu.example.test/api/auth'); assert.equal((await normal.json()).user, null); ok('GET /api/auth without setup still works as before');

await env.DB.prepare('DELETE FROM setup_tokens').run(); await env.DB.prepare('DELETE FROM sessions').run();
console.log(`\n${n} setup-login checks passed; Firebase mocked, local SQLite real, custom token really signed.`);
