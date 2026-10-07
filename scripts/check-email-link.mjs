import assert from 'node:assert/strict';
process.env.MIHU_TEST_MODE='1';
await import('./local-backend.mjs');
const {env,requestContext}=await import('./local-bindings.mjs');
env.MNHAT_UID='link_mnhat';env.MIHU_UID='link_mihu';env.MNHAT_EMAIL='mnhat@example.test';env.MIHU_EMAIL='mihu@example.test';env.APP_ORIGIN='http://127.0.0.1:5173';
const {POST}=await import('../app/api/auth/route.ts');
const {emailLinkCode}=await import('../lib/email-link.ts');
const original=globalThis.fetch;const requests=[];let tokenUid='link_mnhat';const used=new Set();
globalThis.fetch=async(url,options)=>{
 assert.ok(String(url).startsWith('https://identitytoolkit.googleapis.com/'));
 const body=JSON.parse(options.body);requests.push({url:String(url),body});
 if(String(url).includes('sendOobCode'))return Response.json({email:body.email});
 if(String(url).includes('signInWithEmailLink')){
  if(body.oobCode==='expired'||used.has(body.oobCode))return Response.json({error:{message:'INVALID_OOB_CODE'}},{status:400});
  used.add(body.oobCode);
  return Response.json({localId:tokenUid,email:body.email,idToken:'test-token',refreshToken:'test-refresh'});
 }
 throw Error('Unexpected Firebase call');
};
async function call(body,origin=env.APP_ORIGIN){const context={cookies:new Map(),setCookies:[]};const response=await requestContext.run(context,()=>POST(new Request(env.APP_ORIGIN+'/api/auth',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)})));return {response,context};}
await env.DB.prepare('DELETE FROM rate_limits').run();
let count=0;function pass(name){count++;console.log('PASS',name);}
try{
 let result=await call({action:'send-link',email:' MNHAT@example.test '});assert.equal(result.response.status,200);assert.deepEqual(requests[0].body,{requestType:'EMAIL_SIGNIN',email:'mnhat@example.test',continueUrl:env.APP_ORIGIN+'/',canHandleCodeInApp:true});pass('Allowed email receives passwordless link with fixed callback');
 const before=requests.length;result=await call({action:'send-link',email:'stranger@example.test'});assert.equal(result.response.status,200);assert.equal(requests.length,before);pass('Unknown email gets generic response without email being sent');
 result=await call({action:'send-link',email:'mnhat@example.test'});assert.equal(result.response.status,429);pass('Repeated send is throttled');
 result=await call({action:'email-link',email:'mnhat@example.test',code:'valid'});assert.equal(result.response.status,200);const user=(await result.response.json()).user;assert.equal(user.identity,'Mnhat');assert.equal(user.name,'Mihu');assert.equal(user.uid,'link_mnhat');assert.equal(user.idToken,undefined);assert.ok(result.context.setCookies.some(c=>c.includes('mihu_refresh=')&&c.includes('HttpOnly')));pass('Valid link creates private cookie session without exposing tokens');
 result=await call({action:'email-link',email:'mnhat@example.test',code:'valid'});assert.equal(result.response.status,400);assert.equal(result.context.setCookies.length,0);pass('Consumed link cannot create another session');
 result=await call({action:'email-link',email:'mnhat@example.test',code:'expired'});assert.equal(result.response.status,400);pass('Expired link denied');
 tokenUid='wrong_uid';result=await call({action:'email-link',email:'mnhat@example.test',code:'wrong-uid'});assert.equal(result.response.status,403);assert.equal(result.context.setCookies.length,0);pass('Email alone cannot bypass fixed UID');
 tokenUid='link_mihu';result=await call({action:'email-link',email:'mihu@example.test',code:'mihu-valid'});assert.equal(result.response.status,200);assert.equal((await result.response.json()).user.uid,'link_mihu');pass('Mihu maps to separate account');
 result=await call({action:'email-link',email:'outsider@example.test',code:'x'});assert.equal(result.response.status,401);pass('Unlisted email cannot complete login');
 result=await call({action:'email-link',email:'mihu@example.test',code:'x'},'https://outside.test');assert.equal(result.response.status,403);pass('Cross-origin link completion blocked');
 for(const action of ['login','recover','change','reset']){result=await call({action,password:'old-password'});assert.equal(result.response.status,400);}pass('Old password endpoints removed');
 assert.equal(emailLinkCode('https://example.test/?mode=signIn&oobCode=abc'),'abc');assert.equal(emailLinkCode('https://example.test/?mode=resetPassword&oobCode=abc'),'');assert.equal(emailLinkCode('javascript:alert(1)'),'');assert.equal(emailLinkCode('https://example.test/?link='+encodeURIComponent('https://example.test/?mode=signIn&oobCode=xyz')),'xyz');pass('Direct and wrapped links parse without accepting password reset links');
}finally{globalThis.fetch=original;await env.DB.prepare('DELETE FROM rate_limits').run();}
console.log(`${count} email-link checks passed; no real emails sent.`);

