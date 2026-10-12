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

const png=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);
const raw=(handler,uid,req)=>requestContext.run({cookies:new Map([['mihu_id',fakeToken(uid)],['mihu_device','test-device']]),setCookies:[]},()=>handler(req));
async function upload(){const f=new FormData();f.set('file',new File([png],'a.png',{type:'image/png'}));const r=await raw(assetsRoute.POST,'test_mnhat',new Request('http://127.0.0.1:5173/api/assets',{method:'POST',headers:{Origin:'http://127.0.0.1:5173'},body:f}));assert.equal(r.status,200);return (await r.json()).id;}
const getAsset=id=>raw(assetsRoute.GET,'test_mnhat',new Request('http://127.0.0.1:5173/api/assets?id='+id));
const photoA=await upload(),photoB=await upload();
let st=await mutate({type:'settings.save',settings:{...audited.settings,avatar:photoA}});
const cached=await getAsset(photoA);assert.equal(cached.status,200);assert.match(cached.headers.get('cache-control'),/private.*immutable/);check('Private photos are cacheable by the owner only');
st=await mutate({type:'settings.save',settings:{...st.settings,avatar:photoB}});
assert.equal((await getAsset(photoA)).status,404);assert.equal((await getAsset(photoB)).status,200);check('Replaced photo is removed from storage');
st=await mutate({type:'settings.save',settings:{...st.settings,avatar:''}});assert.equal((await getAsset(photoB)).status,404);
const {cleanup}=await import('../lib/maintenance.ts');for(let i=0;i<3;i++)await mutate({type:'budget.set',month:'2026-11',amount:i+1});
const before=(await env.DB.prepare('SELECT COUNT(*) AS n FROM operations WHERE uid=?').bind('test_mnhat').first()).n;await cleanup();const after=(await env.DB.prepare('SELECT COUNT(*) AS n FROM operations WHERE uid=?').bind('test_mnhat').first()).n;assert.equal(after,before,'recent retry records kept');
await env.DB.prepare('UPDATE spaces SET version=version+500 WHERE uid=?').bind('test_mnhat').run();await cleanup();assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM operations WHERE uid=?').bind('test_mnhat').first()).n,0);check('Old retry records are pruned, recent ones kept');

const {reminderMessage,reminderLabel}=await import('../lib/reminder-text.ts');
const sample={title:'Ôn bài kinh tế vi mô',time:'09:00',endTime:'10:30',reminder:15,priority:'high',category:'Học'};
const priv=reminderMessage(sample,false);assert.equal(priv.title,'Còn 15 phút nữa nhé 🌻');assert.ok(!priv.body.includes('Ôn bài'),'private text hides task title');assert.match(priv.body,/09:00/);
const full=reminderMessage(sample,true);assert.equal(full.body,'Ôn bài kinh tế vi mô · 09:00–10:30 · Quan trọng · Học');
assert.equal(reminderMessage({...sample,reminder:0},true).title,'Đến giờ rồi Mihu ơi 🌻');assert.equal(reminderMessage({...sample,reminder:60},false).title,'Còn 1 tiếng nữa nhé 🌻');
assert.ok(reminderMessage({...sample,title:'x'.repeat(400)},true).body.length<=160);assert.equal(reminderLabel(60),'Trước 1 giờ');assert.equal(reminderLabel(0),'Đúng giờ');check('Reminder text: private by default, detailed when allowed, fits a lock screen');
const pushRoute=await import('../app/api/push/route.ts');
const ps=await (await call(pushRoute.GET,'test_mnhat')).json();assert.equal(ps.configured,false);assert.ok(ps.missing.includes('FIREBASE_SERVICE_ACCOUNT'));assert.equal(ps.enabled,false);
const pt=await call(pushRoute.POST,'test_mnhat',{action:'test'});assert.equal(pt.status,503);check('Push status lists missing settings; test send explains what is wrong');
version=(await (await call(stateRoute.GET,'test_mnhat')).json()).version;await mutate({type:'task.save',task:{...task,id:'hour-task',time:'08:00',reminder:60}});check('One-hour reminder accepted');

const {focusToday,weekBars,focusStreak,focusByTask,clock}=await import('../lib/focus.ts');
const flog=[{date:'2026-10-10',minutes:25,full:true,label:'Ôn bài'},{date:'2026-10-10',minutes:7,full:false,label:''},{date:'2026-10-09',minutes:50,full:true,label:'Ôn bài'},{date:'2026-10-07',minutes:25,full:true,label:'Đọc sách'}];
assert.deepEqual(focusToday(flog,'2026-10-10'),{minutes:32,sessions:1});assert.equal(focusStreak(flog,'2026-10-10'),2);assert.equal(focusStreak(flog,'2026-10-11'),2,'today empty still keeps yesterday streak');
assert.equal(weekBars(flog,'2026-10-10').length,7);assert.equal(weekBars(flog,'2026-10-10')[6].minutes,32);assert.deepEqual(focusByTask(flog,'2026-10-04')[0],{label:'Ôn bài',minutes:75});assert.equal(clock(61000),'01:01');
const {focusEndMessage}=await import('../lib/reminder-text.ts');assert.match(focusEndMessage({mode:'focus',minutes:25,label:'Ôn bài'},5,true).body,/25 phút cho “Ôn bài”.*Nghỉ 5 phút/);assert.ok(!focusEndMessage({mode:'focus',minutes:25,label:'Ôn bài'},5,false).body.includes('Ôn bài'));
check('Focus stats and end-of-timer text');

const {encodeState,decodeState}=await import('../lib/server.ts');
const plain=JSON.stringify({...JSON.parse(JSON.stringify((await (await call(stateRoute.GET,'test_mihu')).json()).state)),journals:{'2026-10-01':{mood:'Vui',text:'Hôm nay trời đẹp. '.repeat(400)}}});
await env.DB.prepare('INSERT OR REPLACE INTO spaces(uid,version,state,updated) VALUES(?,?,?,?)').bind('test_mihu',7,plain,Date.now()).run();
const legacy=await (await call(stateRoute.GET,'test_mihu')).json();assert.match(legacy.state.journals['2026-10-01'].text,/trời đẹp/);assert.ok(legacy.usage.bytes>7000&&legacy.usage.limit===4000000,'usage reported');
const saved=await call(stateRoute.POST,'test_mihu',{version:7,operation:crypto.randomUUID(),command:{type:'budget.set',month:'2026-10',amount:1}});assert.equal(saved.status,200);
const row=await env.DB.prepare('SELECT state FROM spaces WHERE uid=?').bind('test_mihu').first();assert.ok(row.state.startsWith('gz1:'),'stored compressed');assert.ok(row.state.length<plain.length/4,'much smaller: '+row.state.length+' vs '+plain.length);
assert.equal((await decodeState(row.state)).budgets['2026-10'],1);assert.equal((await decodeState(await encodeState(legacy.state))).journals['2026-10-01'].text,legacy.state.journals['2026-10-01'].text);
await env.DB.prepare('DELETE FROM spaces WHERE uid=?').bind('test_mihu').run();check('Data is stored compressed; older uncompressed rows still load; usage is reported');
for(const name of names){await env.DB.prepare('DELETE FROM spaces WHERE uid=?').bind(name).run();await env.DB.prepare('DELETE FROM operations WHERE uid=?').bind(name).run();}
globalThis.fetch=nativeFetch;
console.log(`${count} API checks passed; Firebase transport was mocked, local SQLite was real.`);
