import { cookies } from 'next/headers';
import { decodeJwt } from 'jose';
import { config, db } from './server';
import { DomainError, identities } from './domain';
type FirebaseUser={localId:string;email:string;disabled?:boolean;validSince?:string};
type Tokens={idToken:string;refreshToken:string;localId:string;email:string};
export function accountConfig() {return identities.map((a,i)=>({...a,email:config(i===0?'MNHAT_EMAIL':'MIHU_EMAIL').trim().toLowerCase(),uid:config(i===0?'MNHAT_UID':'MIHU_UID')}));}
export function authReady(){const a=accountConfig();return !!config('FIREBASE_API_KEY') && a.every(a=>a.email&&a.uid) && a[0].email!==a[1].email && a[0].uid!==a[1].uid;}
export function normalizedPhone(phone:string){return phone.replace(/[\s().-]/g,'').replace(/^\+84/,'0');}
export async function firebase<T>(method:string,data:unknown):Promise<T>{const key=config('FIREBASE_API_KEY');if(!key)throw new DomainError('Đăng nhập chưa được kết nối với Firebase.',503);const response=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:'+method+'?key='+encodeURIComponent(key),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await response.json() as T & {error?:{message:string}};
 if(!response.ok){const reason=result.error?.message||'';if(reason.includes('QUOTA_EXCEEDED'))throw new DomainError('Firebase đã hết lượt gửi email hôm nay. Mihu thử lại sau nhé.',429);if(reason.includes('OPERATION_NOT_ALLOWED')||reason.includes('UNAUTHORIZED_DOMAIN')||reason.includes('INVALID_CONTINUE_URI'))throw new DomainError('Cần bật đăng nhập bằng link email và cấu hình tên miền trong Firebase.',503);if(reason.includes('TOO_MANY'))throw new DomainError('Mihu chờ một lát rồi thử lại nhé.',429);if(reason.includes('EXPIRED_OOB_CODE')||reason.includes('INVALID_OOB_CODE'))throw new DomainError('Liên kết đã hết hạn hoặc đã được sử dụng. Hãy yêu cầu email mới.');throw new DomainError('Thông tin đăng nhập hoặc liên kết không hợp lệ.',401);}return result;}
export async function saveSession(tokens:Tokens,sameDevice=false){const jar=await cookies();const opts={httpOnly:true,secure:config('APP_ORIGIN').startsWith('https://')||process.env.NODE_ENV==='production',sameSite:'lax' as const,path:'/'};jar.set('mihu_id',tokens.idToken,{...opts,maxAge:3500});jar.set('mihu_refresh',tokens.refreshToken,{...opts,maxAge:60*60*24*365});if(!sameDevice||!jar.get('mihu_device'))jar.set('mihu_device',crypto.randomUUID(),{...opts,maxAge:60*60*24*365});}
export async function clearSession(){const jar=await cookies();for(const key of ['mihu_id','mihu_refresh','mihu_device'])jar.delete(key);}
export async function loginWithEmailLink(email:string,code:string){
 if(!authReady())throw new DomainError('Hai tài khoản chưa được cấu hình.',503);
 const account=accountConfig().find(a=>a.email===email.trim().toLowerCase());
 if(!account)throw new DomainError('Email hoặc liên kết đăng nhập không hợp lệ.',401);
 const tokens=await firebase<Tokens>('signInWithEmailLink',{email:account.email,oobCode:code});
 if(tokens.localId!==account.uid||tokens.email?.toLowerCase()!==account.email||!tokens.idToken||!tokens.refreshToken)throw new DomainError('Tài khoản chưa được cấp quyền.',403);
 await saveSession(tokens);
 return {uid:account.uid,identity:account.name,phone:account.phone,name:'Mihu',email:account.email};
}
export async function session(){let token=(await cookies()).get('mihu_id')?.value;const refresh=(await cookies()).get('mihu_refresh')?.value;if(!token&&refresh){const response=await fetch('https://securetoken.googleapis.com/v1/token?key='+encodeURIComponent(config('FIREBASE_API_KEY')),{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:refresh})});if(response.ok){const t=await response.json() as {id_token:string;refresh_token:string;user_id:string};token=t.id_token;await saveSession({idToken:t.id_token,refreshToken:t.refresh_token,localId:t.user_id,email:''},true);}}
 if(!token)throw new DomainError('Mihu đăng nhập để mở góc nhỏ nhé.',401);
 const result=await firebase<{users:FirebaseUser[]}>('lookup',{idToken:token});const user=result.users?.[0];const account=accountConfig().find(a=>a.uid===user?.localId && a.email===user?.email?.toLowerCase());const claims=decodeJwt(token);
 if(!user||user.disabled||!account||Number(claims.auth_time??0)<Number(user.validSince??0))throw new DomainError('Phiên đăng nhập đã hết hiệu lực. Mihu đăng nhập lại nhé.',401);
 return {uid:account.uid,identity:account.name,phone:account.phone,name:'Mihu',email:account.email,token,device:(await cookies()).get('mihu_device')?.value||''};}
export async function logout(){const device=(await cookies()).get('mihu_device')?.value;if(device)await db().prepare('DELETE FROM devices WHERE session=?').bind(device).run();await clearSession();}
