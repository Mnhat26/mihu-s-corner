import { authReady, loginWithEmailLink, logout, session, accountConfig, firebase } from '@/lib/auth';
import { config, failure, jsonBody, privateHeaders, rateLimit, sameOrigin } from '@/lib/server';
import { DomainError } from '@/lib/domain';
import { enterWithSetupToken } from '@/lib/setup-login';
import { z } from 'zod';
// A tiny server page (not the app UI) that the one-time setup link lands on before it hands off to the app.
const htmlPage=(title:string,body:string)=>`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mihu's Corner</title><style>html{color-scheme:light dark}body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#fffbea;color:#3e3126;font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;text-align:center;padding:24px}@media(prefers-color-scheme:dark){body{background:#1d1915;color:#f3e9dc}}.card{max-width:340px}a{color:inherit}</style></head><body><div class="card">${body}</div></body></html>`;
const enteringHtml=htmlPage('','<p>🌻</p><p>Đang mở góc nhỏ của Mihu…</p><script>location.replace(\'/\')</script>');
const enterErrorHtml=(message:string)=>htmlPage('',`<p>🌻</p><p>${message.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]!))}</p><p><a href="/">Về trang đăng nhập</a></p>`);
export async function GET(request:Request){
 const setup=new URL(request.url).searchParams.get('setup');
 if(setup!==null){
  const headers={'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'none'"};
  try{
   await rateLimit('setup:'+(request.headers.get('cf-connecting-ip')||'local'),20);
   await enterWithSetupToken(setup);
   return new Response(enteringHtml,{status:200,headers});
  }catch(e){return new Response(enterErrorHtml(e instanceof DomainError?e.message:'Không mở được liên kết. Hãy tạo liên kết mới.'),{status:e instanceof DomainError?e.status:500,headers});}
 }
 try{const s=await session();return Response.json({user:{uid:s.uid,identity:s.identity,phone:s.phone,name:s.name,email:s.email},configured:authReady()},{headers:privateHeaders});}catch(e){if(!authReady())return Response.json({user:null,configured:false},{headers:privateHeaders});if(e instanceof DomainError&&e.status===401)return Response.json({user:null,configured:true},{headers:privateHeaders});return failure(e);}}
export async function POST(request:Request){try{
 sameOrigin(request);
 const body=await jsonBody(request);
 const ip=request.headers.get('cf-connecting-ip')||'local';
 await rateLimit('auth:'+ip,30);
 const action=z.enum(['send-link','email-link','logout']).parse(body.action);
 if(action==='logout'){await logout();return Response.json({ok:true},{headers:privateHeaders});}
 if(!authReady())throw new DomainError('Hai tài khoản chưa được cấu hình.',503);
 const email=z.string().trim().toLowerCase().email().max(254).parse(body.email);
 if(action==='send-link'){
  // Limits are per email AND per network, so someone else spamming Mihu's address cannot lock Mihu out.
  await rateLimit('send-link:'+email+':'+ip,1,60);
  await rateLimit('send-link-hour:'+email+':'+ip,3,3600);
  const account=accountConfig().find(a=>a.email===email);
  if(account){
   const origin=new URL(config('APP_ORIGIN'));
   if(origin.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(origin.hostname))throw new DomainError('Tên miền đăng nhập chưa được cấu hình.',503);
   await firebase('sendOobCode',{requestType:'EMAIL_SIGNIN',email:account.email,continueUrl:origin.origin+'/',canHandleCodeInApp:true});
  }
  return Response.json({message:'Nếu email thuộc tài khoản đã đăng ký, Firebase sẽ gửi liên kết đăng nhập. Mihu kiểm tra cả thư mục Spam nhé.'},{headers:privateHeaders});
 }
 await rateLimit('email-link:'+ip,10);
 const code=z.string().min(1).max(2000).parse(body.code);
 const user=await loginWithEmailLink(email,code);
 return Response.json({user},{headers:privateHeaders});
 }catch(e){return failure(e);}}
