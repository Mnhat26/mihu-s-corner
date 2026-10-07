import assert from 'node:assert/strict';
process.env.MIHU_TEST_MODE='1';
await import('./local-backend.mjs');
const {env,requestContext}=await import('./local-bindings.mjs');
env.MNHAT_UID='test_mnhat';env.MIHU_UID='test_mihu';env.MNHAT_EMAIL='mnhat@example.test';env.MIHU_EMAIL='mihu@example.test';
const fakeToken=uid=>Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({auth_time:1000,sub:uid})).toString('base64url')+'.signature';
const nativeFetch=globalThis.fetch;
let disabled=false;let validSince='0';
globalThis.fetch=async(url,opts)=>{assert.ok(String(url).startsWith('https://identitytoolkit.googleapis.com/'),'No unexpected external requests in tests');const b=JSON.parse(opts.body);if(String(url).includes('accounts:lookup')){const claims=JSON.parse(Buffer.from(b.idToken.split('.')[1],'base64url'));const uid=claims.sub;return Response.json({users:[{localId:uid,email:uid==='test_mnhat'?'mnhat@example.test':uid==='test_mihu'?'mihu@example.test':'other@example.test',disabled,validSince}]});}throw new Error('Unmocked Firebase action');};
const stateRoute=await import('../app/api/state/route.ts');const assetsRoute=await import('../app/api/assets/route.ts');
const names=['test_mnhat','test_mihu'];for(const name of names){await env.DB.prepare('DELETE FROM spaces WHERE uid=?').bind(name).run();await env.DB.prepare('DELETE FROM operations WHERE uid=?').bind(name).run();}
async function call(handler,uid,body,origin='http://127.0.0.1:5173'){return requestContext.run({cookies:new Map(uid?[['mihu_id',fakeToken(uid)],['mihu_device','test-device']]:[]),setCookies:[]},()=>handler(new Request('http://127.0.0.1:5173/api/state',{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json',Origin:origin}:{},body:body?JSON.stringify(body):undefined})));}
let count=0;const check=(name)=>{count++;console.log('PASS',name);};
assert.equal((await call(stateRoute.GET,null)).status,401);check('Anonymous access denied');
assert.equal((await call(stateRoute.GET,'other')).status,401);check('Non-allowlisted Firebase account denied');
disabled=true;assert.equal((await call(stateRoute.GET,'test_mnhat')).status,401);disabled=false;check('Disabled Firebase account denied');
validSince='1001';assert.equal((await call(stateRoute.GET,'test_mnhat')).status,401);validSince='0';check('Revoked Firebase session denied');
assert.equal((await call(stateRoute.POST,'test_mnhat',{version:0,operation:crypto.randomUUID(),command:{type:'budget.set',month:'2026-10',amount:100}},'https://other.test')).status,403);check('Cross-origin mutation rejected');
const operation=crypto.randomUUID();const body={version:0,operation,command:{type:'budget.set',month:'2026-10',amount:100}};
const save=await call(stateRoute.POST,'test_mnhat',body);assert.equal(save.status,200);assert.equal((await save.json()).state.budgets['2026-10'],100);check('Authenticated mutation persists');
const second=await call(stateRoute.GET,'test_mihu');assert.deepEqual((await second.json()).state.budgets,{});check('Second account cannot read first account money');
const duplicate=await call(stateRoute.POST,'test_mnhat',body);assert.equal((await duplicate.json()).version,1);check('Network retry is idempotent');
const conflict=await call(stateRoute.POST,'test_mnhat',{...body,operation:crypto.randomUUID()});assert.equal(conflict.status,409);check('Stale second device cannot overwrite');
const invalid=await call(stateRoute.POST,'test_mnhat',{version:1,operation:crypto.randomUUID(),command:{type:'budget.set',month:'2026-10',amount:-1}});assert.equal(invalid.status,400);check('Invalid money rejected server-side');
assert.equal((await call(assetsRoute.GET,'test_mihu')).status,404);check('Missing private image denied');
const unchanged=await call(stateRoute.GET,'test_mnhat');assert.equal((await unchanged.json()).version,1);check('Rejected requests leave data intact');
for(const name of names){await env.DB.prepare('DELETE FROM spaces WHERE uid=?').bind(name).run();await env.DB.prepare('DELETE FROM operations WHERE uid=?').bind(name).run();}
globalThis.fetch=nativeFetch;
console.log(`${count} API checks passed; Firebase transport was mocked, local SQLite was real.`);
