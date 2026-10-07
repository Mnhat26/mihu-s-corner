// Read-only preview of the actual React components; never substitutes for API verification.
import {rolldown} from 'rolldown';
import ts from 'typescript';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
const backend=process.argv.includes('--backend')?(await import('./local-backend.mjs')).handleBackend:null;
const root=process.cwd();const dir=path.join(root,'.sites-runtime','ui-preview');await fs.mkdir(dir,{recursive:true});
await fs.writeFile(path.join(dir,'entry.tsx'),"import {createRoot} from 'react-dom/client';import Page from '../../app/page';createRoot(document.getElementById('root')!).render(<Page/>);");
const build=await rolldown({input:path.join(dir,'entry.tsx'),platform:'browser',plugins:[{name:'app-tsx',resolveId(source){if(source.startsWith('@/'))return this.resolve(path.join(root,source.slice(2)),undefined,{skipSelf:true});},transform(code,id){code=code.replaceAll('process.env.NODE_ENV',JSON.stringify('production'));if(/\.(ts|tsx)$/.test(id)&&!id.includes('node_modules'))return {code:ts.transpileModule(code,{fileName:id,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText};return {code};}}]});
await build.write({dir,format:'es',entryFileNames:'app.js'});await build.close();
let css=await fs.readFile('app/globals.css','utf8');css=css.replace("@import 'tailwindcss';",'');
// Tailwind's base reset, mirrored here only for the standalone visual preview.
css='html{line-height:1.5;-webkit-text-size-adjust:100%}button,input,select,textarea{font:inherit}button{border-style:solid}img,svg{vertical-align:middle}img{max-width:100%}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}'+css;
const types={'.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://127.0.0.1:5173');if(backend&&u.pathname.startsWith('/api/')){await backend(req,res);return;}if(u.pathname==='/api/auth'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({user:null,configured:false}));return;}if(u.pathname.startsWith('/api/')){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Bản xem giao diện chưa kết nối dịch vụ thật.'}));return;}if(u.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Mihu’s Corner · Xem giao diện</title><link rel="icon" href="/favicon.svg"><style>'+css+'</style></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>');return;}const name=u.pathname.slice(1);if(!/^[\w.-]+$/.test(name)){res.writeHead(404);res.end();return;}let file;try{file=await fs.readFile(path.join(dir,name));}catch{file=await fs.readFile(path.join(root,'public',name));}res.writeHead(200,{'Content-Type':types[path.extname(name)]||'application/octet-stream'});res.end(file);}catch{res.writeHead(404);res.end('Not found');}});
server.listen(5173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:5173 — local web preview'));
