// Reminder runner with a fake FCM: right text, sent once, skipped when ticked, one bad account isolated.
import assert from 'node:assert/strict';
process.env.MIHU_TEST_MODE='1';
await import('./local-backend.mjs');
const {env}=await import('./local-bindings.mjs');
const {generateKeyPair,exportPKCS8}=await import('jose');
const {privateKey}=await generateKeyPair('RS256',{extractable:true});
Object.assign(env,{FIREBASE_API_KEY:'test',REMINDERS_ENABLED:'true',FIREBASE_SERVICE_ACCOUNT:JSON.stringify({client_email:'svc@test.iam',private_key:await exportPKCS8(privateKey)})});
const sent=[];const nativeFetch=globalThis.fetch;
globalThis.fetch=async(url,opts)=>{url=String(url);if(url.startsWith('https://oauth2.googleapis.com/'))return Response.json({access_token:'t'});if(url.startsWith('https://fcm.googleapis.com/')){sent.push(JSON.parse(opts.body).message);return Response.json({name:'ok'});}throw new Error('Unexpected request '+url);};
const {sendDueReminders}=await import('../lib/reminders.ts');const {encodeState}=await import('../lib/server.ts');
const D=await import('../lib/domain.ts');
let count=0;const check=n=>{count++;console.log('PASS',n);};
const vn=ms=>new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(ms));
const today=D.todayVN();const now=Date.now();
const task=(id,ms,reminder)=>({id,title:'Ôn bài '+id,date:D.dayVN(ms),time:vn(ms),endTime:'',note:'',category:'Học',priority:'high',repeat:'none',weekdays:[],until:'',reminder});
const uids=['rem_bad','rem_a'];for(const u of uids){await env.DB.prepare('DELETE FROM spaces WHERE uid=?').bind(u).run();await env.DB.prepare('DELETE FROM devices WHERE uid=?').bind(u).run();}
await env.DB.prepare("DELETE FROM deliveries WHERE key LIKE 'rem_%'").run();
let s=D.emptyState();s=D.applyCommand(s,{type:'task.save',task:task('now',now,0)},today);s=D.applyCommand(s,{type:'task.save',task:task('soon',now+4*60000,15)},today);
s.settings.reminderTitle=true;
await env.DB.prepare('INSERT INTO spaces(uid,version,state,updated) VALUES(?,?,?,?)').bind('rem_bad',1,'gz1:not-really-gzip',now).run();
await env.DB.prepare('INSERT INTO spaces(uid,version,state,updated) VALUES(?,?,?,?)').bind('rem_a',1,await encodeState(s),now).run();
for(const u of uids)await env.DB.prepare('INSERT INTO devices(token,uid,session,updated) VALUES(?,?,?,?)').bind('token-'+u+'-0123456789abcdef',u,'dev',now).run();
let r=await sendDueReminders();
assert.equal(r.sent,2,JSON.stringify(sent));const byTag=Object.fromEntries(sent.map(m=>[m.data.tag.split('_')[0],m.data]));
assert.equal(byTag.now.title,'Đến giờ rồi Mihu ơi 🌻');assert.match(byTag.now.body,/Ôn bài now/);
assert.match(byTag.soon.title,/^Còn [34] phút nữa nhé/,'late send states the real time left, not 15');check('Due reminders sent with accurate text; a broken account does not stop the other');
r=await sendDueReminders();assert.equal(r.sent,0);check('Each reminder is sent once per device');
s=D.applyCommand(s,{type:'focus.start',mode:'focus'},today,now-26*60000);s=D.applyCommand(s,{type:'task.save',task:task('ticked',now,0)},today);s=D.applyCommand(s,{type:'task.toggle',id:'ticked',on:today,done:true},today);
await env.DB.prepare('UPDATE spaces SET state=?,version=2 WHERE uid=?').bind(await encodeState(s),'rem_a').run();sent.length=0;
r=await sendDueReminders();assert.equal(sent.length,1);assert.equal(sent[0].data.title,'Hết giờ tập trung rồi 🌻');check('Ticked tasks are skipped; a finished focus timer is announced');
for(const u of uids){await env.DB.prepare('DELETE FROM spaces WHERE uid=?').bind(u).run();await env.DB.prepare('DELETE FROM devices WHERE uid=?').bind(u).run();}
globalThis.fetch=nativeFetch;console.log(`${count} reminder checks passed; FCM was mocked.`);
