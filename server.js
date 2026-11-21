// 룬 진형 체스 — 게임 서버
// 정적 파일(public/) 제공 + WebSocket 방(room) 중계
// 실행: npm install && npm start   (기본 포트 3000, PORT 환경변수로 변경)

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.json':'application/json', '.ico':'image/x-icon' };

// ---------- 정적 파일 ----------
const server = http.createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200, {'content-type':'text/plain'}); return res.end('ok'); }
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

// ---------- 방 중계 ----------
// 클라이언트마다 presence(상태 객체)를 갖고, 같은 방 사람들에게 전체 목록을 다시 보냄.
// 게임 진행 기록(행동 목록)도 presence 안에 들어 있어서, 새로 들어오거나 재접속한 사람도 바로 따라잡음.
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
const rooms = new Map(); // name -> Set<client>
let nextId = 1;
const ROOM_RE = /^[a-z0-9][a-z0-9_.-]{0,47}$/;
const MAX_PER_ROOM = 8;

function broadcast(name) {
  const set = rooms.get(name); if (!set) return;
  const msg = JSON.stringify({ t:'peers', peers:[...set].map(c => ({ id:c.id, presence:c.presence })) });
  for (const c of set) if (c.ws.readyState === 1) c.ws.send(msg);
}
function leave(c) {
  if (!c.room) return;
  const set = rooms.get(c.room);
  if (set) { set.delete(c); if (!set.size) rooms.delete(c.room); else broadcast(c.room); }
  c.room = null;
}

wss.on('connection', ws => {
  const c = { id:'p' + (nextId++).toString(36) + Math.random().toString(36).slice(2,6), ws, room:null, presence:{} };
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', raw => {
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
    } else if (d.t === 'presence' && c.room) {
      if (d.presence && typeof d.presence === 'object') { c.presence = d.presence; broadcast(c.room); }
    }
  });
  ws.on('close', () => leave(c));
});

// 끊긴 연결 정리
setInterval(() => {
  for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); }
}, 30000);

server.listen(PORT, () => console.log(`룬 진형 체스 서버 실행 중 → http://localhost:${PORT}`));
