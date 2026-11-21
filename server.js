// 룬 진형 체스 — Render용 게임 서버
// - index.html 제공 (정적 파일)
// - /ws : 방 코드 기반 실시간 대전 (presence 동기화)
//   클라이언트 → {t:'join', room, presence, cid} / {t:'presence', presence}
//   서버 → {t:'joined', id} / {t:'peers', peers:[{id, presence}]} / {t:'error', message}
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 10000;
const ROOT = __dirname;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  let file = url === '/' ? '/index.html' : url;
  const full = path.normalize(path.join(ROOT, file));
  if (!full.startsWith(ROOT) || path.basename(full).startsWith('.') || /server\.js$|package(-lock)?\.json$/.test(full)) {
    res.writeHead(404); return res.end('not found');
  }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// rooms: code -> Map(id -> {ws, presence})
const rooms = new Map();
const MAX_PER_ROOM = 8;
const MAX_MSG = 64 * 1024;
const ROOM_RE = /^[a-z0-9][a-z0-9_.-]{0,47}$/;

function broadcast(code) {
  const room = rooms.get(code);
  if (!room) return;
  const msg = JSON.stringify({ t: 'peers', peers: [...room].map(([id, m]) => ({ id, presence: m.presence })) });
  for (const m of room.values()) if (m.ws.readyState === 1) m.ws.send(msg);
}

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_MSG });
wss.on('connection', ws => {
  let code = null, id = null;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', raw => {
    let d; try { d = JSON.parse(raw); } catch (e) { return; }
    if (d.t === 'join' && !code) {
      const room = String(d.room || '').toLowerCase();
      if (!ROOM_RE.test(room)) return ws.send(JSON.stringify({ t: 'error', message: 'bad room code' }));
      if (!rooms.has(room)) rooms.set(room, new Map());
      const r = rooms.get(room);
      // 같은 탭(cid)이 재접속하면 이전 연결을 대체
      const cid = typeof d.cid === 'string' && /^[a-z0-9]{1,20}$/i.test(d.cid) ? d.cid : null;
      id = cid || ('p' + Math.random().toString(36).slice(2, 10));
      const old = r.get(id);
      if (old && old.ws !== ws) { try { old.ws.close(); } catch (e) {} }
      if (!old && r.size >= MAX_PER_ROOM) return ws.send(JSON.stringify({ t: 'error', message: 'room full' }));
      code = room;
      r.set(id, { ws, presence: d.presence && typeof d.presence === 'object' ? d.presence : {} });
      ws.send(JSON.stringify({ t: 'joined', id }));
      broadcast(code);
    } else if (d.t === 'presence' && code) {
      const m = rooms.get(code)?.get(id);
      if (m && m.ws === ws) { m.presence = d.presence && typeof d.presence === 'object' ? d.presence : {}; broadcast(code); }
    }
  });
  ws.on('close', () => {
    if (!code) return;
    const r = rooms.get(code);
    if (r && r.get(id)?.ws === ws) {
      r.delete(id);
      if (r.size === 0) rooms.delete(code); else broadcast(code);
    }
  });
});

// 끊긴 연결 정리 (Render 프록시 유휴 타임아웃 방지용 ping 겸용)
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false; ws.ping();
  }
}, 25000);

server.listen(PORT, () => console.log(`Rune Chess server on :${PORT}`));
