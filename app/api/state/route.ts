import { session } from '@/lib/auth';
import { db, failure, jsonBody, privateHeaders, readState, sameOrigin } from '@/lib/server';
import { applyCommand, DomainError } from '@/lib/domain';
import { z } from 'zod';
export async function GET(){try{const s=await session();return Response.json(await readState(s.uid),{headers:privateHeaders});}catch(e){return failure(e);}}
export async function POST(request:Request){try{sameOrigin(request);const s=await session();const body=await jsonBody(request);const expected=z.number().int().min(0).parse(body.version);const op=z.string().uuid().parse(body.operation);const existing=await db().prepare('SELECT version FROM operations WHERE uid=? AND id=?').bind(s.uid,op).first();if(existing)return Response.json(await readState(s.uid),{headers:privateHeaders});
 const current=await readState(s.uid);if(current.version!==expected)throw new DomainError('Dữ liệu vừa thay đổi trên thiết bị khác. Đã tải bản mới; hãy kiểm tra rồi lưu lại.',409,{reload:true});const next=applyCommand(current.state,body.command);
 if(body.command.type==='settings.save'){const ids=[next.settings.avatar,next.settings.cover,...next.settings.photos].filter(Boolean);for(const id of ids){const asset=await db().prepare('SELECT id FROM assets WHERE id=? AND uid=?').bind(id,s.uid).first();if(!asset)throw new DomainError('Ảnh không thuộc tài khoản này',403);}}
 await db().prepare('INSERT OR IGNORE INTO spaces(uid,version,state,updated) VALUES(?,0,?,?)').bind(s.uid,JSON.stringify(current.state),Date.now()).run();
 const results=await db().batch([
  db().prepare('UPDATE spaces SET state=?,version=version+1,updated=? WHERE uid=? AND version=?').bind(JSON.stringify(next),Date.now(),s.uid,expected),
  db().prepare('INSERT INTO operations(uid,id,version) SELECT ?,?,? WHERE changes()=1').bind(s.uid,op,expected+1),
 ]);if(!results[0].meta.changes)throw new DomainError('Dữ liệu vừa thay đổi. Hãy tải lại trước khi lưu.',409,{reload:true});return Response.json({state:next,version:expected+1},{headers:privateHeaders});
 }catch(e){return failure(e);}}
