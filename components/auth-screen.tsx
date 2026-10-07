'use client';
import { useEffect,useState } from 'react';
import { ArrowLeft,Mail,Link as LinkIcon } from 'lucide-react';
import { api } from '@/lib/client';
import { emailLinkCode } from '@/lib/email-link';
export type User={uid:string;identity:'Mnhat'|'Mihu';name:string;phone:string;email:string};
export function Flower({className=''}:{className?:string}){return <span aria-hidden="true" className={'sunflower '+className}>🌻</span>;}
export function AuthScreen({configured,onLogin}:{configured:boolean;onLogin:(u:User)=>void}){
 const [code]=useState(()=>typeof window==='undefined'?'':emailLinkCode(window.location.href));
 const [mode,setMode]=useState<'send'|'finish'|'paste'>(code?'finish':'send');
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [message,setMessage]=useState('');
 const [email,setEmail]=useState('');const [cooldown,setCooldown]=useState(0);
 useEffect(()=>{if(code)history.replaceState(null,'','/');},[code]);
 useEffect(()=>{if(!cooldown)return;const timer=setTimeout(()=>setCooldown(cooldown-1),1000);return ()=>clearTimeout(timer);},[cooldown]);
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);setError('');setMessage('');
  const form=new FormData(event.currentTarget);
  try{
   if(mode==='send'){
    const result=await api<{message:string}>('/api/auth',{action:'send-link',email});
    setMessage(result.message);setCooldown(60);
   }else{
    const selectedCode=mode==='finish'?code:emailLinkCode(String(form.get('link')||''));
    if(!selectedCode)throw new Error('Liên kết chưa đúng. Mihu sao chép đầy đủ liên kết đăng nhập trong email nhé.');
    const result=await api<{user:User}>('/api/auth',{action:'email-link',email,code:selectedCode});
    history.replaceState(null,'','/');onLogin(result.user);
   }
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 function changeMode(next:typeof mode){setMode(next);setError('');setMessage('');}
 return <main className="auth-page"><div className="auth-brand"><Flower/><span>Mihu’s Corner</span></div><div className="auth-layout"><section className="auth-story"><span className="eyebrow">MỘT GÓC NHỎ, THẬT NHIỀU NẮNG</span><h1>Chào Mihu,<br/>về góc nhỏ thôi.</h1><p>Một nơi để sắp xếp ngày mới, ghi lại điều nhỏ xinh và chăm chút cho cuộc sống mỗi ngày.</p><div className="flower-garden"><Flower/><Flower/><Flower/></div><div className="handwritten">Mỗi ngày một chút, Mihu nhé.</div></section><section className="auth-card"><Flower className="small-flower"/><h2>{mode==='send'?'Một lá thư mở góc nhỏ':mode==='finish'?'Chỉ một bước nữa, Mihu ơi':'Mở góc nhỏ tại đây'}</h2><p>{mode==='send'?'Nhận liên kết qua email để đăng nhập, không cần mật khẩu.':'Nhập đúng email đã nhận liên kết để mở tài khoản của Mihu trên thiết bị này.'}</p><form onSubmit={submit}><label className="field"><span><Mail size={15}/> Email đăng nhập</span><input name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email đã đăng ký của Mihu" required maxLength={254}/></label>{mode==='paste'&&<label className="field"><span><LinkIcon size={15}/> Liên kết trong email</span><textarea name="link" rows={3} autoComplete="off" spellCheck={false} required maxLength={12000} placeholder="Dán đầy đủ liên kết đăng nhập tại đây"/></label>}{error&&<p role="alert" className="error-banner">{error}</p>}{message&&<p role="status" className="success-banner">{message}</p>}{!configured&&<p className="notice">Góc nhỏ đang được kết nối. Đăng nhập sẽ sẵn sàng khi hoàn tất cấu hình tài khoản.</p>}<button className="button primary full" disabled={busy||!configured||(mode==='send'&&cooldown>0)}><Mail size={18}/>{busy?'Đang xử lý…':mode!=='send'?'Đăng nhập vào góc nhỏ':cooldown>0?'Có thể gửi lại sau '+cooldown+' giây':'Gửi liên kết đăng nhập'}</button></form>{mode==='send'?<div className="auth-bottom"><button className="text-button" onClick={()=>changeMode('paste')}>Đã có liên kết? Dán để đăng nhập</button><p className="support-line">Trên iPhone, Mihu có thể sao chép liên kết từ email rồi dán vào ứng dụng trên màn hình chính. Mỗi liên kết chỉ dùng một lần.</p></div>:<button className="text-button back" onClick={()=>changeMode('send')}><ArrowLeft size={16}/> Yêu cầu liên kết mới</button>}<p className="auth-footnote">Chỉ dành cho hai tài khoản đã đăng ký. Không chia sẻ liên kết đăng nhập.</p></section></div><footer>Chậm một chút, Mihu vẫn đang tiến lên. <Flower/></footer></main>;
}
