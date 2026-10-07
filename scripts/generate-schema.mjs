// Uses Drizzle's public API when its CLI cannot start a compiler subprocess.
import ts from 'typescript';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {generateSQLiteDrizzleJson,generateSQLiteMigration} from 'drizzle-kit/api';
const journalPath='drizzle/meta/_journal.json';
const journal=JSON.parse(await fs.readFile(journalPath,'utf8'));
if(journal.entries.length)throw new Error('Initial migration already exists. Use append-only migrations for further changes.');
await fs.mkdir('.sites-runtime',{recursive:true});
const file=path.resolve('.sites-runtime/schema.mjs');
await fs.writeFile(file,ts.transpileModule(await fs.readFile('db/schema.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const schema=await import(pathToFileURL(file).href);const prev=await generateSQLiteDrizzleJson({});const next=await generateSQLiteDrizzleJson(schema);const statements=await generateSQLiteMigration(prev,next);
await fs.writeFile('drizzle/0000_mihus_corner.sql',statements.join('\n--> statement-breakpoint\n')+'\n');
await fs.writeFile('drizzle/meta/0000_snapshot.json',JSON.stringify(next,null,2)+'\n');
await fs.writeFile(journalPath,JSON.stringify({version:'7',dialect:'sqlite',entries:[{idx:0,version:'6',when:Date.now(),tag:'0000_mihus_corner',breakpoints:true}]},null,2)+'\n');
console.log('Generated',statements.length,'schema statements with Drizzle.');
