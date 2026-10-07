// Development adapters only. Production uses the real D1 and R2 bindings.
import {DatabaseSync} from 'node:sqlite';
import {AsyncLocalStorage} from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';
export const requestContext=new AsyncLocalStorage();
const root=path.resolve(process.env.MIHU_TEST_MODE==='1'?'.sites-runtime/test-data':'.sites-runtime/local-data');fs.mkdirSync(root,{recursive:true});
const sqlite=new DatabaseSync(path.join(root,'mihu.sqlite'));sqlite.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS _local_migrations (name TEXT PRIMARY KEY);');
const journal=JSON.parse(fs.readFileSync('drizzle/meta/_journal.json','utf8'));for(const entry of journal.entries){if(!sqlite.prepare('SELECT name FROM _local_migrations WHERE name=?').get(entry.tag)){sqlite.exec('BEGIN');try{sqlite.exec(fs.readFileSync('drizzle/'+entry.tag+'.sql','utf8'));sqlite.prepare('INSERT INTO _local_migrations VALUES(?)').run(entry.tag);sqlite.exec('COMMIT');}catch(e){sqlite.exec('ROLLBACK');throw e;}}}
function prepare(sql){let values=[];return {bind(...v){values=v;return this;},execute(){const stmt=sqlite.prepare(sql);const result=stmt.run(...values);return {success:true,meta:{changes:Number(result.changes)},results:[]};},async run(){return this.execute();},async first(){return sqlite.prepare(sql).get(...values)||null;},async all(){return {results:sqlite.prepare(sql).all(...values),success:true};}};}
const DB={prepare,async batch(statements){sqlite.exec('BEGIN IMMEDIATE');try{const results=statements.map(s=>s.execute());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
const blobPath=key=>path.join(root,'blobs',Buffer.from(key).toString('base64url'));
const BUCKET={async put(key,bytes){fs.mkdirSync(path.join(root,'blobs'),{recursive:true});fs.writeFileSync(blobPath(key),Buffer.from(bytes));},async get(key){try{return {body:fs.readFileSync(blobPath(key))};}catch{return null;}},async delete(key){try{fs.unlinkSync(blobPath(key));}catch{}}};
export const env={...process.env,DB,BUCKET};
export async function cookies(){const ctx=requestContext.getStore();if(!ctx)throw new Error('No request context');return {get(name){const value=ctx.cookies.get(name);return value?{name,value}:undefined;},set(name,value,options={}){ctx.cookies.set(name,value);let result=name+'='+encodeURIComponent(value)+'; Path='+(options.path||'/');if(options.httpOnly)result+='; HttpOnly';if(options.secure)result+='; Secure';if(options.sameSite)result+='; SameSite='+options.sameSite;if(options.maxAge!==undefined)result+='; Max-Age='+options.maxAge;ctx.setCookies.push(result);},delete(name){ctx.cookies.delete(name);ctx.setCookies.push(name+'=; Path=/; HttpOnly; SameSite=lax; Max-Age=0');}};}
