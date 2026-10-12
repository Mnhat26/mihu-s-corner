import { env } from 'cloudflare:workers';
import { emptyState, normalizeState, DomainError, type State } from './domain';
import { firebasePublic } from './firebase-public';
export const runtime=env as unknown as Record<string,string> & {DB:D1Database;BUCKET:R2Bucket};
export function config(key:string) { return runtime[key] || process.env[key] || firebasePublic[key] || ''; }
export function db(){if(!runtime.DB)throw new DomainError('Kho dữ liệu chưa được kết nối. Vui lòng thử lại sau.',503);return runtime.DB;}
export async function readState(uid:string) {const row=await db().prepare('SELECT state,version FROM spaces WHERE uid=?').bind(uid).first<{state:string;version:number}>();return row?{state:await decodeState(row.state),version:row.version}:{state:emptyState(),version:0};}
/*
 * Saved data is gzip-compressed (Vietnamese text and JSON shrink 4-6x), so one database row
 * holds years of journal and spending. Older uncompressed rows are still read and get
 * compressed on their next save.
 */
const GZ='gz1:';
export const ROW_LIMIT=1_900_000; // D1 rejects rows over 2 MB
function toBase64(bytes:Uint8Array){let out='';for(let i=0;i<bytes.length;i+=0x8000)out+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(out);}
function fromBase64(text:string){const bin=atob(text);const out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out;}
export async function encodeState(state:State){const zipped=await new Response(new Blob([JSON.stringify(state)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();const text=GZ+toBase64(new Uint8Array(zipped));if(text.length>ROW_LIMIT)throw new DomainError('Bộ nhớ của góc nhỏ đã đầy. Mihu xóa bớt nhật ký, khoản chi hoặc việc cũ để lưu tiếp nhé.',413);return text;}
export async function decodeState(text:string):Promise<State>{if(!text.startsWith(GZ))return normalizeState(JSON.parse(text));const json=await new Response(new Blob([fromBase64(text.slice(GZ.length))]).stream().pipeThrough(new DecompressionStream('gzip'))).text();return normalizeState(JSON.parse(json));}
export async function rateLimit(key:string,max:number,seconds=600) { const now=Math.floor(Date.now()/1000);const bucket=Math.floor(now/seconds);const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key));const k=Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('')+':'+bucket;
 const row=await db().prepare('INSERT INTO rate_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(k,now+seconds).first<{count:number}>();if(!row||row.count>max)throw new DomainError('Thao tác hơi nhanh. Mihu chờ một lát rồi thử lại nhé.',429);
}
export function sameOrigin(request:Request){const origin=request.headers.get('origin');if(!origin||origin!==new URL(request.url).origin)throw new DomainError('Yêu cầu không hợp lệ.',403);}
export async function jsonBody(request:Request){const body=await request.text();if(body.length>100_000)throw new DomainError('Nội dung quá lớn',413);try{return JSON.parse(body);}catch{throw new DomainError('Nội dung không hợp lệ');}}
export const privateHeaders={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'};
export function failure(e:unknown){if(e instanceof DomainError)return Response.json({error:e.message,details:e.details},{status:e.status,headers:privateHeaders});if(e && typeof e==='object' && 'issues'in e)return Response.json({error:(e as {issues:{message:string}[]}).issues.map(i=>i.message).join(' · ') || 'Kiểm tra lại các thông tin đã nhập.',details:(e as {issues:unknown}).issues},{status:400,headers:privateHeaders});console.error('Request failed',e instanceof Error?e.name:'unknown');return Response.json({error:'Chưa thể lưu lúc này. Nội dung vẫn được giữ để Mihu thử lại.'},{status:500,headers:privateHeaders});}
