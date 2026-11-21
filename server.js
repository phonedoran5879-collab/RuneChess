// 룬 진형 체스 — 게임 서버 (외부 라이브러리 없음, npm install 불필요)
// 실행: node server.js        (기본 포트 3000, PORT 환경변수로 변경)

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.json':'application/json', '.ico':'image/x-icon' };

// index.html 위치 찾기 (public 폴더 안 또는 같은 폴더)
const PUBLIC = fs.existsSync(path.join(ROOT, 'public', 'index.html')) ? path.join(ROOT, 'public') : ROOT;
if (!fs.existsSync(path.join(PUBLIC, 'index.html'))) {
  console.error('❌ index.html 을 찾을 수 없어요. server.js 와 같은 폴더(또는 public 폴더)에 index.html 이 있어야 합니다.');
  process.exit(1);
}

// ---------- 정적 파일 ----------
const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(req.url.split('?')[0]); } catch { p = '/'; }
  if (p === '/health') { res.writeHead(200, {'content-type':'text/plain'}); return res.end('ok'); }
  if (p === '/' || p === '') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC) || path.basename(file) === 'server.js') { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) {   // 모르는 주소는 게임 화면으로
      return fs.readFile(path.join(PUBLIC, 'index.html'), (e2, d2) => { res.writeHead(200, {'content-type':MIME['.html']}); res.end(d2); });
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

// ---------- 최소 WebSocket 구현 (RFC 6455) ----------
function wsAccept(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return null; }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  socket.setNoDelay(true);
  const conn = { socket, open:true, onmessage:null, onclose:null, alive:true, buf:Buffer.alloc(0), frag:[] };
  conn.send = (text) => {
    if (!conn.open) return;
    const payload = Buffer.from(text);
    const len = payload.length;
    let head;
    if (len < 126) { head = Buffer.from([0x81, len]); }
    else if (len < 65536) { head = Buffer.alloc(4); head[0]=0x81; head[1]=126; head.writeUInt16BE(len,2); }
    else { head = Buffer.alloc(10); head[0]=0x81; head[1]=127; head.writeBigUInt64BE(BigInt(len),2); }
    socket.write(Buffer.concat([head, payload]));
  };
  conn.control = (op, data=Buffer.alloc(0)) => { if (conn.open) socket.write(Buffer.concat([Buffer.from([0x80|op, data.length]), data])); };
  conn.close = () => { if (!conn.open) return; conn.open=false; try { conn.control(0x8); socket.end(); } catch {} conn.onclose && conn.onclose(); };
  socket.on('data', chunk => {
    conn.buf = Buffer.concat([conn.buf, chunk]);
    while (conn.buf.length >= 2) {
      const b0 = conn.buf[0], b1 = conn.buf[1];
      const fin = (b0 & 0x80) !== 0, op = b0 & 0x0f, masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (conn.buf.length < 4) return; len = conn.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (conn.buf.length < 10) return; len = Number(conn.buf.readBigUInt64BE(2)); off = 10; }
      if (len > 64*1024) { conn.close(); return; }
      const need = off + (masked?4:0) + len;
      if (conn.buf.length < need) return;
      let payload = conn.buf.slice(off + (masked?4:0), need);
      if (masked) { const m = conn.buf.slice(off, off+4); payload = Buffer.from(payload); for (let i=0;i<payload.length;i++) payload[i] ^= m[i&3]; }
      conn.buf = conn.buf.slice(need);
      if (op === 0x8) { conn.close(); return; }
      if (op === 0x9) { conn.control(0xA, payload); continue; }
      if (op === 0xA) { conn.alive = true; continue; }
      if (op === 0x1 || op === 0x0) {
        conn.frag.push(payload);
        if (fin) { const text = Buffer.concat(conn.frag).toString('utf8'); conn.frag = []; conn.onmessage && conn.onmessage(text); }
      }
    }
  });
  socket.on('close', () => { if (conn.open) { conn.open=false; conn.onclose && conn.onclose(); } });
  socket.on('error', () => { if (conn.open) { conn.open=false; conn.onclose && conn.onclose(); } });
  return conn;
}

// ---------- 방 중계 ----------
// 각 접속자의 presence(상태 객체: 편성, 준비 여부, 행동 기록)를 같은 방 전원에게 전달.
const rooms = new Map();
const conns = new Set();
let nextId = 1;
const ROOM_RE = /^[a-z0-9][a-z0-9_.-]{0,47}$/;
const MAX_PER_ROOM = 8;

function broadcast(name) {
  const set = rooms.get(name); if (!set) return;
  const msg = JSON.stringify({ t:'peers', peers:[...set].map(c => ({ id:c.id, presence:c.presence })) });
  for (const c of set) c.ws.send(msg);
}
function leave(c) {
  if (!c.room) return;
  const set = rooms.get(c.room);
  if (set) { set.delete(c); if (!set.size) rooms.delete(c.room); else broadcast(c.room); }
  c.room = null;
}

server.on('upgrade', (req, socket) => {
  if (!req.url.startsWith('/ws')) { socket.destroy(); return; }
  const ws = wsAccept(req, socket); if (!ws) return;
  const c = { id:'p' + (nextId++).toString(36) + Math.random().toString(36).slice(2,6), ws, room:null, presence:{} };
  conns.add(c);
  ws.onmessage = raw => {
    let d; try { d = JSON.parse(raw); } catch { return; }
    if (d.t === 'join') {
      if (typeof d.room !== 'string' || !ROOM_RE.test(d.room)) return ws.send(JSON.stringify({ t:'error', message:'잘못된 방 코드' }));
      leave(c);
      const set = rooms.get(d.room) || new Set();
      if (set.size >= MAX_PER_ROOM) return ws.send(JSON.stringify({ t:'error', message:'방이 가득 찼어요' }));
      set.add(c); rooms.set(d.room, set); c.room = d.room;
      if (d.presence && typeof d.presence === 'object') c.presence = d.presence;
      ws.send(JSON.stringify({ t:'joined', id:c.id }));
      broadcast(c.room);
    } else if (d.t === 'presence' && c.room && d.presence && typeof d.presence === 'object') {
      c.presence = d.presence; broadcast(c.room);
    }
  };
  ws.onclose = () => { leave(c); conns.delete(c); };
});

// 끊긴 연결 정리
setInterval(() => {
  for (const c of conns) {
    if (!c.ws.alive) { c.ws.close(); try { c.ws.socket.destroy(); } catch {} continue; }
    c.ws.alive = false; c.ws.control(0x9);
  }
}, 30000);

server.on('error', e => {
  if (e.code === 'EADDRINUSE') console.error(`❌ ${PORT}번 포트를 이미 다른 프로그램이 쓰고 있어요. 예: PORT=3001 node server.js`);
  else console.error('❌ 서버 오류:', e.message);
  process.exit(1);
});
server.listen(PORT, '0.0.0.0', () => {
  console.log('==========================================');
  console.log('  룬 진형 체스 서버 실행 중');
  console.log(`  → 브라우저에서 http://localhost:${PORT} 열기`);
  console.log('  (종료: 이 창에서 Ctrl + C)');
  console.log('==========================================');
});
