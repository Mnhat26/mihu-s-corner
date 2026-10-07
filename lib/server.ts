import { env } from 'cloudflare:workers';
import { emptyState, DomainError, type State } from './domain';
export const runtime=env as unknown as Record<string,string> & {DB:D1Database;BUCKET:R2Bucket};
export function config(key:string) { return runtime[key] || process.env[key] || ''; }
export function db(){if(!runtime.DB)throw new DomainError('Kho dữ liệu chưa được kết nối. Vui lòng thử lại sau.',503);return runtime.DB;}
export async function readState(uid:string) {const row=await db().prepare('SELECT state,version FROM spaces WHERE uid=?').bind(uid).first<{state:string;version:number}>();return row?{state:JSON.parse(row.state) as State,version:row.version}:{state:emptyState(),version:0};}
export async function rateLimit(key:string,max:number,seconds=600) { const now=Math.floor(Date.now()/1000);const bucket=Math.floor(now/seconds);const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key));const k=Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('')+':'+bucket;
 const row=await db().prepare('INSERT INTO rate_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(k,now+seconds).first<{count:number}>();if(!row||row.count>max)throw new DomainError('Thao tác hơi nhanh. Mihu chờ một lát rồi thử lại nhé.',429);
}
export function sameOrigin(request:Request){const origin=request.headers.get('origin');if(!origin||origin!==new URL(request.url).origin)throw new DomainError('Yêu cầu không hợp lệ.',403);}
export async function jsonBody(request:Request){const body=await request.text();if(body.length>100_000)throw new DomainError('Nội dung quá lớn',413);try{return JSON.parse(body);}catch{throw new DomainError('Nội dung không hợp lệ');}}
export const privateHeaders={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'};
export function failure(e:unknown){if(e instanceof DomainError)return Response.json({error:e.message,details:e.details},{status:e.status,headers:privateHeaders});if(e && typeof e==='object' && 'issues'in e)return Response.json({error:(e as {issues:{message:string}[]}).issues.map(i=>i.message).join(' · ') || 'Kiểm tra lại các thông tin đã nhập.',details:(e as {issues:unknown}).issues},{status:400,headers:privateHeaders});console.error('Request failed',e instanceof Error?e.name:'unknown');return Response.json({error:'Chưa thể lưu lúc này. Nội dung vẫn được giữ để Mihu thử lại.'},{status:500,headers:privateHeaders});}
