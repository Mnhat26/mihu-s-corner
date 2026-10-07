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

let version=1;
async function mutate(command) {
 const response=await call(stateRoute.POST,'test_mnhat',{version,operation:crypto.randomUUID(),command});
 const result=await response.json(); assert.equal(response.status,200,JSON.stringify(result)); version=result.version; return result.state;
}
const task={id:'audit-task',title:'Audit',date:'2026-01-01',time:'',endTime:'',note:'',category:'Cá nhân',priority:'high',repeat:'none',weekdays:[],until:'',reminder:-1};
const badReminder=await call(stateRoute.POST,'test_mnhat',{version,operation:crypto.randomUUID(),command:{type:'task.save',task:{...task,reminder:5}}});
assert.equal(badReminder.status,400);assert.match((await badReminder.json()).error,/Cần có giờ/);check('Reminder without time returns actionable error');
let audited=await mutate({type:'task.save',task});assert.equal(audited.tasks[0].priority,'high');
audited=await mutate({type:'task.save',task:{...task,time:'09:00',reminder:5},scope:'one',on:task.date});
audited=await mutate({type:'task.toggle',id:task.id,on:task.date,done:true});assert.equal(audited.overrides['audit-task_2026-01-01'].done,true);check('Task create, edit and complete persist through API');
audited=await mutate({type:'entry.save',entry:{id:'audit-expense',date:task.date,kind:'expense',amount:45000,category:'Ăn uống',note:''}});assert.equal(audited.entries[0].amount,45000);
await mutate({type:'entry.save',entry:{id:'audit-add',date:task.date,kind:'addition',amount:100000,category:'',note:''}});
audited=await mutate({type:'entry.delete',id:'audit-expense'});assert.equal(audited.entries.length,1);check('Expense, additional money and deletion persist');
await mutate({type:'goal.save',goal:{id:'audit-goal',title:'Goal',note:'',period:'week',start:task.date,end:'2026-01-07',milestones:[],taskIds:[task.id],done:false}});
await mutate({type:'journal.save',date:task.date,mood:'Vui',text:'Audit journal'});
audited=await mutate({type:'settings.save',settings:{...audited.settings,theme:'dark',accent:'yellow'}});assert.equal(audited.settings.theme,'dark');
const persisted=await (await call(stateRoute.GET,'test_mnhat')).json();assert.equal(persisted.state.journals[task.date].text,'Audit journal');assert.equal(persisted.state.goals.length,1);check('Goals, journal and personalization survive reload');
const isolated=await (await call(stateRoute.GET,'test_mihu')).json();assert.equal(isolated.state.tasks.length,0);assert.equal(Object.keys(isolated.state.journals).length,0);check('All audited data remains isolated from second account');
await mutate({type:'journal.delete',date:task.date});await mutate({type:'goal.delete',id:'audit-goal'});await mutate({type:'task.delete',id:task.id,on:task.date,scope:'one'});check('Journal, goal and task removal accepted');
for(const name of names){await env.DB.prepare('DELETE FROM spaces WHERE uid=?').bind(name).run();await env.DB.prepare('DELETE FROM operations WHERE uid=?').bind(name).run();}
globalThis.fetch=nativeFetch;
console.log(`${count} API checks passed; Firebase transport was mocked, local SQLite was real.`);
