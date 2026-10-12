'use client';
import { useEffect,useState } from 'react';
import { AuthScreen,Flower,type User } from '@/components/auth-screen';
import { api } from '@/lib/client';
import { emailLinkCode } from '@/lib/email-link';
import { Corner } from '@/components/corner';
export default function Page(){const [user,setUser]=useState<User|null>(null);const [ready,setReady]=useState(false);const [configured,setConfigured]=useState(false);const [preview,setPreview]=useState(false);const [reset,setReset]=useState(false);const [error,setError]=useState('');useEffect(()=>{const params=new URLSearchParams(location.search);setPreview(params.get('preview')==='1');setReset(!!emailLinkCode(location.href));api<{user:User|null;configured:boolean}>('/api/auth').then(r=>{setUser(r.user);setConfigured(r.configured);}).catch(e=>setError(e.message)).finally(()=>setReady(true));},[]);if(!ready)return <div className="loading"><Flower/><p>Đang mở góc nhỏ…</p></div>;if(!reset&&(user||preview))return <Corner user={user} preview={preview&&!user} onLogout={()=>{setUser(null);setPreview(false);history.replaceState(null,'','/');}}/>;if(error&&!user)return <div className="loading"><Flower/><p role="alert">{error}</p><button className="button primary" onClick={()=>location.reload()}>Thử lại</button></div>;return <><AuthScreen configured={configured} onLogin={u=>{setUser(u);setReset(false);}}/></>;}
