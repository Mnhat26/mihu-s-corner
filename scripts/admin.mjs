// Local admin: shows where the two accounts are signed in, and can sign a single browser out.
// Run with `npm run admin` (one-time setup: `npx wrangler login`). Listens on 127.0.0.1 only.
// It reads the real D1 database through Wrangler, so no Cloudflare key is stored in this project.
import http from 'node:http';
import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';

try { loadEnvFile('.env.admin'); } catch { /* optional: CLOUDFLARE_ACCOUNT_ID=... when the login has several accounts */ }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.ADMIN_PORT || 4545);
const DEMO = process.argv.includes('--demo');
const wrangler = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const configFile = path.join(root, 'scripts', 'admin-wrangler.json');

class AdminError extends Error {}

function d1(sql) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [wrangler, 'd1', 'execute', 'site-creator-d1', '--remote', '--json', '--yes', '--config', configFile, '--command', sql], { cwd: root, timeout: 60000, maxBuffer: 16 * 1024 * 1024, windowsHide: true, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } }, (error, stdout, stderr) => {
      const text = String(stdout || '') + String(stderr || '');
      if (error) {
        if (/no such table: (sessions|visits)/i.test(text)) return resolve([{ results: [] }, { results: [] }]);
        if (/not logged in|wrangler login|Authentication error|CLOUDFLARE_API_TOKEN/i.test(text)) return reject(new AdminError('Chưa đăng nhập Cloudflare. Mở terminal, chạy: npx wrangler login, rồi bấm Tải lại.'));
        if (/more than one account/i.test(text)) return reject(new AdminError('Tài khoản Cloudflare có nhiều account. Tạo file .env.admin với dòng CLOUDFLARE_ACCOUNT_ID=<id account chứa web>, rồi chạy lại npm run admin.'));
        if (/ENOENT|Cannot find module/i.test(text + error.message)) return reject(new AdminError('Không tìm thấy Wrangler. Chạy npm install trong thư mục dự án trước.'));
        const detail = text.match(/"text":\s*"([^"]+)"/)?.[1] || text.split('\n').find(l => /error/i.test(l)) || error.message;
        return reject(new AdminError('Wrangler báo lỗi: ' + detail.trim().slice(0, 300)));
      }
      try { const out = String(stdout); resolve(JSON.parse(out.slice(Math.max(0, out.search(/^\s*\[/m)))));  } catch { reject(new AdminError('Không đọc được kết quả từ Wrangler.')); }
    });
  });
}

const now = Date.now();
const demoRows = [
  { id: '6f0c1a52-0d3e-4c55-9a51-1b2f1e0a0001', uid: 'u1', account: 'Mihu', created: now - 9 * 86400000, seen: now - 2 * 60000, agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148', ip: '113.161.42.17', place: 'Ho Chi Minh City, SG, VN', ended: null, reason: null, push: 1 },
  { id: '6f0c1a52-0d3e-4c55-9a51-1b2f1e0a0002', uid: 'u1', account: 'Mihu', created: now - 30 * 86400000, seen: now - 3 * 86400000, agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', ip: '14.169.8.201', place: 'Ho Chi Minh City, SG, VN', ended: null, reason: null, push: 0 },
  { id: '6f0c1a52-0d3e-4c55-9a51-1b2f1e0a0003', uid: 'u0', account: 'Mnhat', created: now - 12 * 86400000, seen: now - 40 * 60000, agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0', ip: '27.72.100.9', place: 'Hanoi, HN, VN', ended: null, reason: null, push: 1 },
  { id: '6f0c1a52-0d3e-4c55-9a51-1b2f1e0a0004', uid: 'u0', account: 'Mnhat', created: now - 20 * 86400000, seen: now - 6 * 86400000, agent: 'Mozilla/5.0 (Linux; Android 15; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36', ip: '171.224.3.66', place: 'Hanoi, HN, VN', ended: now - 5 * 86400000, reason: 'logout', push: 0 },
];

const vnDay = ms => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
const demoVisits = [];
for (let i = 0; i < 70; i++) {
  const day = vnDay(now - i * 86400000), base = Date.parse(day + 'T00:00:00+07:00');
  if (i % 7 !== 3 && i % 11 !== 5) demoVisits.push({ account: 'Mihu', day, first: base + (7 * 60 + (i * 37) % 150) * 60000, agent: i % 4 ? demoRows[0].agent : demoRows[1].agent, ip: '113.161.42.17', place: 'Ho Chi Minh City, SG, VN' });
  if (i % 3 !== 1) demoVisits.push({ account: 'Mnhat', day, first: base + (8 * 60 + (i * 53) % 240) * 60000, agent: demoRows[2].agent, ip: '27.72.100.9', place: 'Hanoi, HN, VN' });
}

async function listAll() {
  if (DEMO) return { sessions: demoRows, visits: demoVisits };
  // One Wrangler call for both lists (each call takes a few seconds).
  const [sessions, visits] = await d1("SELECT s.id, s.uid, s.account, s.created, s.seen, s.agent, s.ip, s.place, s.ended, s.reason, (SELECT COUNT(*) FROM devices d WHERE d.session = s.id) AS push FROM sessions s ORDER BY s.ended IS NOT NULL, s.seen DESC LIMIT 200; SELECT account, day, first, agent, ip, place FROM visits WHERE day >= '" + vnDay(Date.now() - 120 * 86400000) + "' ORDER BY day DESC");
  return { sessions: sessions?.results || [], visits: visits?.results || [] };
}

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function revoke(id) {
  // Wrangler's --command has no parameters, so the id is strictly validated before it is placed in SQL.
  if (!SESSION_ID.test(id)) throw new AdminError('Mã phiên không hợp lệ.');
  if (DEMO) { const row = demoRows.find(r => r.id === id); if (row) { row.ended = Date.now(); row.reason = 'revoked'; } return; }
  await d1(`UPDATE sessions SET ended = ${Date.now()}, reason = 'revoked' WHERE id = '${id}' AND ended IS NULL; DELETE FROM devices WHERE session = '${id}';`);
}

const ACCOUNTS = ['Mnhat', 'Mihu'];
// Creates a one-time setup link token for a still-empty account (to set up photos/theme without the email).
// The account name is checked against the fixed list and the token is hex, so neither can inject SQL.
async function setupToken(account) {
  if (!ACCOUNTS.includes(account)) throw new AdminError('Tài khoản không hợp lệ.');
  const token = randomBytes(32).toString('hex'), expires = Date.now() + 15 * 60 * 1000;
  if (!DEMO) await d1(`CREATE TABLE IF NOT EXISTS setup_tokens (token TEXT PRIMARY KEY NOT NULL, account TEXT NOT NULL, expires INTEGER NOT NULL); INSERT INTO setup_tokens (token, account, expires) VALUES ('${token}', '${account}', ${expires});`);
  return { token, expires };
}

const allowedHosts = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:" });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  // Only this computer's browser may talk to the admin (blocks other sites and DNS rebinding).
  if (!allowedHosts.has(req.headers.host || '')) return send(res, 403, { error: 'Forbidden' });
  const url = new URL(req.url || '/', 'http://' + req.headers.host);
  try {
    if (req.method === 'GET' && url.pathname === '/') return send(res, 200, PAGE.replace('__DEMO__', DEMO ? 'true' : 'false'), 'text/html; charset=utf-8');
    if (req.method === 'GET' && url.pathname === '/api/sessions') return send(res, 200, { ...(await listAll()), at: Date.now(), today: vnDay(Date.now()) });
    if (req.method === 'POST' && url.pathname === '/api/revoke') {
      const origin = req.headers.origin || '';
      if (!allowedHosts.has(origin.replace(/^http:\/\//, '')) || !String(req.headers['content-type']).startsWith('application/json')) return send(res, 403, { error: 'Forbidden' });
      let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 2000) return send(res, 413, { error: 'Too large' }); }
      await revoke(String(JSON.parse(body || '{}').id || ''));
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/setup-link') {
      const origin = req.headers.origin || '';
      if (!allowedHosts.has(origin.replace(/^http:\/\//, '')) || !String(req.headers['content-type']).startsWith('application/json')) return send(res, 403, { error: 'Forbidden' });
      let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 2000) return send(res, 413, { error: 'Too large' }); }
      return send(res, 200, await setupToken(String(JSON.parse(body || '{}').account || '')));
    }
    send(res, 404, { error: 'Not found' });
  } catch (e) {
    send(res, e instanceof AdminError ? 400 : 500, { error: e instanceof AdminError ? e.message : 'Lỗi không xác định: ' + (e?.message || e) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const link = `http://127.0.0.1:${PORT}`;
  console.log(`Admin phiên đăng nhập${DEMO ? ' (dữ liệu mẫu)' : ''}: ${link}  ·  Ctrl+C để tắt`);
  if (!process.argv.includes('--no-open')) {
    const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', link]] : process.platform === 'darwin' ? ['open', [link]] : ['xdg-open', [link]];
    try { spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true }).on('error', () => {}).unref(); } catch { /* open it by hand */ }
  }
});
server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? `Cổng ${PORT} đang bận (admin đã mở ở cửa sổ khác?). Đặt ADMIN_PORT=4546 để dùng cổng khác.` : e.message); process.exit(1); });

const PAGE = String.raw`<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Admin · Mihu's Corner</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🌻</text></svg>">
<style>
:root{--bg:#fffbea;--paper:#fff;--ink:#3e3126;--muted:#6f636c;--line:#efe3c4;--sun:#f5c84c;--accent:#b8860b;--ok:#2f8f5b;--ok-soft:#e3f5ea;--warn:#a05a00;--warn-soft:#fff1d6;--off:#8d8590;--off-soft:#f1eef0;--danger:#b3261e;--danger-soft:#fde8e6}
@media(prefers-color-scheme:dark){:root{--bg:#1d1915;--paper:#28221d;--ink:#f3e9dc;--muted:#b9ada3;--line:#3d342c;--accent:#f5c84c;--ok:#7fd3a2;--ok-soft:#1f3a2b;--warn:#f3b866;--warn-soft:#3d2e17;--off:#a59ca6;--off-soft:#302a2e;--danger:#ff8a80;--danger-soft:#3e2120}}
*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
.wrap{max-width:1100px;margin:0 auto;padding:28px 16px 60px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:22px}
h1{margin:0;font-size:24px}header p{margin:2px 0 0;color:var(--muted);font-size:13px}
button{font:inherit;cursor:pointer;border-radius:10px;border:1px solid var(--line);background:var(--paper);color:var(--ink);padding:8px 14px}
button:hover{border-color:var(--accent)}button:disabled{opacity:.55;cursor:wait}
.primary{background:var(--sun);border-color:var(--sun);color:#3e3126;font-weight:600}
.demo{background:var(--warn-soft);color:var(--warn);padding:8px 12px;border-radius:10px;margin-bottom:16px;font-size:13px}
.error{background:var(--danger-soft);color:var(--danger);padding:12px 14px;border-radius:12px;margin-bottom:16px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:18px}@media(max-width:820px){.cols{grid-template-columns:1fr}}
.col{background:var(--paper);border:1px solid var(--line);border-radius:18px;padding:18px}
.col h2{margin:0 0 4px;font-size:18px;display:flex;align-items:center;gap:8px}.col>small{color:var(--muted)}
.card{border:1px solid var(--line);border-radius:14px;padding:12px 14px;margin-top:12px;display:grid;grid-template-columns:auto 1fr auto;gap:4px 12px;align-items:start}
.ico{font-size:24px;line-height:1;padding-top:2px}.card strong{font-size:15px}
.meta{grid-column:2/4;color:var(--muted);font-size:13px;display:flex;flex-wrap:wrap;gap:2px 14px}
.badge{font-size:12px;font-weight:600;padding:2px 9px;border-radius:999px;white-space:nowrap}
.b-live{background:var(--ok-soft);color:var(--ok)}.b-idle{background:var(--warn-soft);color:var(--warn)}.b-off{background:var(--off-soft);color:var(--off)}
.card .act{grid-column:2/4;display:flex;justify-content:flex-end}
.danger{color:var(--danger);border-color:var(--danger-soft);background:transparent;padding:5px 12px;font-size:13px}.danger:hover{background:var(--danger-soft);border-color:var(--danger)}
details{margin-top:14px}summary{cursor:pointer;color:var(--muted);font-size:13px}
.ended{opacity:.72}
.empty{color:var(--muted);font-size:14px;padding:14px 0 4px}
.note{color:var(--muted);font-size:12px;margin-top:20px}
.tabs{display:inline-flex;gap:4px;background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:4px;margin-bottom:16px}
.tabs button{border:0;background:transparent;padding:7px 14px;border-radius:9px;color:var(--muted)}.tabs button[aria-selected=true]{background:var(--sun);color:#3e3126;font-weight:600}
.sum{display:flex;gap:18px;margin:10px 0 6px;flex-wrap:wrap}.sum b{display:block;font-size:22px}.sum span{color:var(--muted);font-size:12px}
.strip{display:grid;grid-template-columns:repeat(30,1fr);gap:3px;margin:12px 0 4px}.strip i{aspect-ratio:1;border-radius:4px;background:var(--off-soft)}.strip i.on{background:var(--sun)}
.strip-cap{display:flex;justify-content:space-between;color:var(--muted);font-size:11px}
.days{margin-top:10px}.day{display:grid;grid-template-columns:92px 54px 1fr;gap:10px;padding:8px 2px;border-top:1px solid var(--line);font-size:14px;align-items:baseline}
.day .d{color:var(--muted);font-size:13px}.day .t{font-weight:600;font-variant-numeric:tabular-nums}.day .w{color:var(--muted);font-size:13px;overflow-wrap:anywhere}.day.miss .t,.day.miss .w{color:var(--off);font-weight:400}
code{background:var(--off-soft);padding:1px 6px;border-radius:6px}
.setup{background:var(--paper);border:1px solid var(--line);border-radius:18px;padding:18px;max-width:560px}
.setup h2{margin:0 0 4px;font-size:18px}
.field{display:block;margin:14px 0}.field>span{display:block;font-size:13px;color:var(--muted);margin-bottom:5px}
.field input,.field select{width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--ink);font:inherit}
.who{display:inline-flex;gap:6px;background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:4px}
.who button{border:0;background:transparent;padding:7px 16px;border-radius:7px;color:var(--muted)}.who button[aria-pressed=true]{background:var(--sun);color:#3e3126;font-weight:600}
.linkbox{margin-top:16px;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:var(--ok-soft)}
.linkbox code{display:block;word-break:break-all;background:transparent;padding:0;margin:6px 0 10px;font-size:13px}
.linkbox .row{display:flex;gap:8px;flex-wrap:wrap}.linkbox small{color:var(--muted)}
</style></head><body><div class="wrap">
<header><div><h1>🌻 Admin Mihu’s Corner</h1><p id="stamp">Đang tải…</p></div><button class="primary" id="reload">Tải lại</button></header>
<div id="demo" class="demo" hidden>Đang xem dữ liệu mẫu (--demo). Chạy <code>npm run admin</code> để xem dữ liệu thật.</div>
<div id="error" class="error" hidden></div>
<div class="tabs" role="tablist"><button role="tab" aria-selected="true" data-tab="sessions">Phiên đăng nhập</button><button role="tab" aria-selected="false" data-tab="visits">Lịch sử mở web</button><button role="tab" aria-selected="false" data-tab="setup">Thiết lập tài khoản</button></div>
<div class="cols" id="cols"></div>
<div class="cols" id="visits" hidden></div>
<p class="note" id="note-visits" hidden>Mỗi ngày ghi 1 dòng cho mỗi tài khoản: lần đầu tiên mở web trong ngày (giờ Việt Nam). Lưu 1 năm; trang này hiện 120 ngày gần nhất. Chỉ có dữ liệu từ khi bản cập nhật này lên web.</p>
<p class="note" id="note-sessions">“Đăng xuất phiên này” có hiệu lực ngay lần tiếp theo thiết bị đó gọi máy chủ (mở app, lưu, đồng bộ): thiết bị phải đăng nhập lại bằng link email, và thôi nhận nhắc việc. Phiên chỉ được ghi từ khi bản cập nhật này lên web — thiết bị cũ sẽ hiện ra sau lần mở app kế tiếp.</p>
<div id="setup" hidden><section class="setup"><h2>🔑 Link đăng nhập để thiết lập</h2>
<p class="note" style="margin-top:6px">Tạo một link dùng một lần để vào tài khoản còn trống mà cài ảnh, giao diện — không cần mail. Link sống 15 phút, mở xong là hết hiệu lực. Chỉ nên dùng cho tài khoản chưa có ai sử dụng.</p>
<label class="field"><span>Địa chỉ web (dán 1 lần, trình duyệt sẽ nhớ)</span><input id="site" type="url" inputmode="url" autocomplete="off" placeholder="https://...workers.dev"></label>
<div class="field"><span>Tài khoản</span><div class="who" id="who"><button type="button" data-acc="Mihu" aria-pressed="true">🌸 Mihu</button><button type="button" data-acc="Mnhat" aria-pressed="false">🐳 Mnhat</button></div></div>
<button class="primary" id="gen">Tạo link đăng nhập</button>
<div id="linkout"></div></section></div>
</div><script>
const DEMO=__DEMO__;document.getElementById('demo').hidden=!DEMO;
const $=s=>document.querySelector(s);const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const fmt=t=>new Date(t).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit',year:'numeric'});
function ago(t){const m=Math.round((Date.now()-t)/60000);if(m<1)return 'vừa xong';if(m<60)return m+' phút trước';const h=Math.round(m/60);if(h<24)return h+' giờ trước';const d=Math.round(h/24);return d+' ngày trước';}
function device(ua){ua=ua||'';const os=/iPhone/.test(ua)?'iPhone':/iPad/.test(ua)||(/Macintosh/.test(ua)&&/Mobile/.test(ua))?'iPad':/Android/.test(ua)?'Android':/Windows/.test(ua)?'Windows':/Mac OS X|Macintosh/.test(ua)?'Mac':/CrOS/.test(ua)?'Chromebook':/Linux/.test(ua)?'Linux':'Thiết bị lạ';
 const br=/Zalo/i.test(ua)?'Zalo':/FBAN|FBAV|Messenger/.test(ua)?'Facebook':/Edg\//.test(ua)?'Edge':/OPR\//.test(ua)?'Opera':/SamsungBrowser/.test(ua)?'Samsung Internet':/CriOS|Chrome\//.test(ua)?'Chrome':/FxiOS|Firefox\//.test(ua)?'Firefox':/Safari\//.test(ua)?'Safari':/iPhone|iPad/.test(ua)?'Ứng dụng trên Màn hình chính':'';
 const ico=/iPhone|Android/.test(os)?'📱':os==='iPad'?'📲':os==='Thiết bị lạ'?'❔':'💻';return {name:br?os+' · '+br:os,ico};}
function status(s){if(s.ended)return s.reason==='revoked'?['b-off','Admin đã đăng xuất']:['b-off','Đã tự đăng xuất'];const m=(Date.now()-s.seen)/60000;return m<10?['b-live','Đang dùng']:m<60*24*14?['b-idle','Đang đăng nhập']:['b-off','Lâu không dùng'];}
function card(s){const d=device(s.agent),[cls,label]=status(s);return '<div class="card'+(s.ended?' ended':'')+'"><span class="ico">'+d.ico+'</span><div><strong>'+esc(d.name)+'</strong>'+(s.push?' <span title="Thiết bị này đang nhận nhắc việc">🔔</span>':'')+'</div><span class="badge '+cls+'">'+label+'</span>'
 +'<div class="meta"><span>📍 '+esc(s.place||'Không rõ vị trí')+(s.ip?' · '+esc(s.ip):'')+'</span><span>Đăng nhập: '+fmt(s.created)+'</span><span>'+(s.ended?'Kết thúc: '+fmt(s.ended):'Lần cuối: '+ago(s.seen))+'</span></div>'
 +(s.ended?'':'<div class="act"><button class="danger" data-id="'+esc(s.id)+'" data-name="'+esc(d.name)+'" data-who="'+esc(s.account)+'">Đăng xuất phiên này</button></div>')+'</div>';}
function column(name,rows){const live=rows.filter(r=>!r.ended),done=rows.filter(r=>r.ended);return '<section class="col"><h2>'+(name==='Mihu'?'🌸':'🐳')+' '+esc(name)+'</h2><small>'+live.length+' thiết bị đang đăng nhập</small>'
 +(live.length?live.map(card).join(''):'<div class="empty">Chưa có phiên nào đang mở.</div>')+(done.length?'<details><summary>Đã kết thúc trong 30 ngày ('+done.length+')</summary>'+done.map(card).join('')+'</details>':'')+'</section>';}
const WD=['CN','T2','T3','T4','T5','T6','T7'];const dayLabel=d=>{const [y,m,dd]=d.split('-');return WD[new Date(d+'T12:00:00Z').getUTCDay()]+', '+dd+'/'+m;};
const hm=t=>new Date(t).toLocaleTimeString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit'});
const back=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')-n*86400000).toISOString().slice(0,10);
function visitColumn(name,rows,today){const by=new Map(rows.map(v=>[v.day,v]));const last30=[...Array(30)].map((_,i)=>back(today,29-i));const opened30=last30.filter(d=>by.has(d)).length;const opened7=last30.slice(-7).filter(d=>by.has(d)).length;
 const times=rows.filter(v=>last30.includes(v.day)).map(v=>{const [h,m]=hm(v.first).split(':').map(Number);return h*60+m;});const avg=times.length?Math.round(times.reduce((a,b)=>a+b,0)/times.length):null;
 const recent=[...Array(30)].map((_,i)=>back(today,i));const older=rows.filter(v=>v.day<back(today,29));
 const line=(d,v)=>v?'<div class="day"><span class="d">'+dayLabel(d)+'</span><span class="t">'+hm(v.first)+'</span><span class="w">'+esc(device(v.agent).name)+' · '+esc(v.place||'Không rõ vị trí')+'</span></div>':'<div class="day miss"><span class="d">'+dayLabel(d)+'</span><span class="t">—</span><span class="w">Không mở</span></div>';
 return '<section class="col"><h2>'+(name==='Mihu'?'🌸':'🐳')+' '+esc(name)+'</h2><div class="sum"><div><b>'+opened7+'/7</b><span>7 ngày qua</span></div><div><b>'+opened30+'/30</b><span>30 ngày qua</span></div><div><b>'+(avg===null?'—':String(Math.floor(avg/60)).padStart(2,'0')+':'+String(avg%60).padStart(2,'0'))+'</b><span>giờ mở đầu tiên trung bình</span></div></div>'
 +'<div class="strip">'+last30.map(d=>'<i class="'+(by.has(d)?'on':'')+'" title="'+dayLabel(d)+(by.has(d)?' · '+hm(by.get(d).first):' · không mở')+'"></i>').join('')+'</div><div class="strip-cap"><span>'+dayLabel(last30[0])+'</span><span>Hôm nay</span></div>'
 +'<div class="days">'+recent.map(d=>line(d,by.get(d))).join('')+'</div>'+(older.length?'<details><summary>Trước đó ('+older.length+' ngày có mở)</summary><div class="days">'+older.map(v=>line(v.day,v)).join('')+'</div></details>':'')+'</section>';}
function showTab(t){for(const b of document.querySelectorAll('.tabs button'))b.setAttribute('aria-selected',String(b.dataset.tab===t));$('#cols').hidden=t!=='sessions';$('#note-sessions').hidden=t!=='sessions';$('#visits').hidden=t!=='visits';$('#note-visits').hidden=t!=='visits';$('#setup').hidden=t!=='setup';try{localStorage.setItem('admin-tab',t);}catch{}}
document.querySelector('.tabs').addEventListener('click',e=>{const b=e.target.closest('button');if(b)showTab(b.dataset.tab);});
try{showTab(localStorage.getItem('admin-tab')||'sessions');}catch{}
async function load(){const btn=$('#reload');btn.disabled=true;$('#stamp').textContent='Đang tải từ Cloudflare D1…';try{const r=await fetch('/api/sessions');const j=await r.json();if(!r.ok)throw new Error(j.error);$('#error').hidden=true;
 const by={Mnhat:[],Mihu:[]};for(const s of j.sessions)(by[s.account]||(by[s.account]=[])).push(s);$('#cols').innerHTML=Object.entries(by).map(([n,rows])=>column(n,rows)).join('');
 const vb={Mnhat:[],Mihu:[]};for(const v of j.visits)(vb[v.account]||(vb[v.account]=[])).push(v);$('#visits').innerHTML=Object.entries(vb).map(([n,rows])=>visitColumn(n,rows,j.today)).join('');$('#stamp').textContent='Cập nhật lúc '+fmt(j.at);}
 catch(e){$('#error').textContent=e.message;$('#error').hidden=false;$('#stamp').textContent='Không tải được';}finally{btn.disabled=false;}}
document.addEventListener('click',async e=>{const b=e.target.closest('button.danger');if(!b)return;if(!confirm('Đăng xuất '+b.dataset.who+' trên '+b.dataset.name+'?\nThiết bị đó sẽ phải đăng nhập lại.'))return;b.disabled=true;b.textContent='Đang đăng xuất…';
 try{const r=await fetch('/api/revoke',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:b.dataset.id})});const j=await r.json();if(!r.ok)throw new Error(j.error);await load();}catch(err){alert(err.message);b.disabled=false;b.textContent='Đăng xuất phiên này';}});
// Setup-link tab
let acc='Mihu';
try{$('#site').value=localStorage.getItem('admin-site')||'';}catch{}
$('#site').addEventListener('input',()=>{try{localStorage.setItem('admin-site',$('#site').value.trim());}catch{}});
$('#who').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;acc=b.dataset.acc;for(const x of $('#who').children)x.setAttribute('aria-pressed',String(x===b));});
$('#gen').addEventListener('click',async()=>{const site=$('#site').value.trim().replace(/\/+$/,'');$('#linkout').innerHTML='';
 if(!/^https?:\/\//.test(site)){$('#linkout').innerHTML='<div class="error" style="margin-top:14px">Nhập địa chỉ web trước nhé, ví dụ https://...workers.dev</div>';return;}
 const btn=$('#gen');btn.disabled=true;btn.textContent='Đang tạo…';
 try{const r=await fetch('/api/setup-link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account:acc})});const j=await r.json();if(!r.ok)throw new Error(j.error);
  const link=site+'/api/auth?setup='+j.token;const mins=Math.round((j.expires-Date.now())/60000);
  $('#linkout').innerHTML='<div class="linkbox"><strong>Link vào tài khoản '+esc(acc)+' (dùng một lần)</strong><code id="lk">'+esc(link)+'</code><div class="row"><button class="primary" id="cp">Sao chép</button><button id="op">Mở trên máy này</button></div><small>Hết hạn sau '+mins+' phút. Mở link này trên thiết bị muốn thiết lập.</small></div>';
  $('#cp').onclick=async()=>{try{await navigator.clipboard.writeText(link);$('#cp').textContent='Đã chép ✓';}catch{const s=getSelection(),rg=document.createRange();rg.selectNode($('#lk'));s.removeAllRanges();s.addRange(rg);}};
  $('#op').onclick=()=>window.open(link,'_blank','noopener');
 }catch(err){$('#linkout').innerHTML='<div class="error" style="margin-top:14px">'+esc(err.message)+'</div>';}
 finally{btn.disabled=false;btn.textContent='Tạo link đăng nhập';}});
$('#reload').onclick=load;load();
</script></body></html>`;
