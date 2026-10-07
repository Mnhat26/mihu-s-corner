import { authReady, loginWithEmailLink, logout, session, accountConfig, firebase } from '@/lib/auth';
import { config, failure, jsonBody, privateHeaders, rateLimit, sameOrigin } from '@/lib/server';
import { DomainError } from '@/lib/domain';
import { z } from 'zod';
export async function GET(){try{const s=await session();return Response.json({user:{uid:s.uid,identity:s.identity,phone:s.phone,name:s.name,email:s.email},configured:authReady()},{headers:privateHeaders});}catch(e){if(!authReady())return Response.json({user:null,configured:false},{headers:privateHeaders});if(e instanceof DomainError&&e.status===401)return Response.json({user:null,configured:true},{headers:privateHeaders});return failure(e);}}
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
  await rateLimit('send-link:'+email,1,60);
  await rateLimit('send-link-hour:'+email,3,3600);
  const account=accountConfig().find(a=>a.email===email);
  if(account){
   const origin=new URL(config('APP_ORIGIN'));
   if(origin.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(origin.hostname))throw new DomainError('Tên miền đăng nhập chưa được cấu hình.',503);
   await firebase('sendOobCode',{requestType:'EMAIL_SIGNIN',email:account.email,continueUrl:origin.origin+'/',canHandleCodeInApp:true});
  }
  return Response.json({message:'Nếu email thuộc tài khoản đã đăng ký, Firebase sẽ gửi liên kết đăng nhập. Mihu kiểm tra cả thư mục Spam nhé.'},{headers:privateHeaders});
 }
 await rateLimit('email-link:'+email,10);
 const code=z.string().min(1).max(2000).parse(body.code);
 const user=await loginWithEmailLink(email,code);
 return Response.json({user},{headers:privateHeaders});
 }catch(e){return failure(e);}}
