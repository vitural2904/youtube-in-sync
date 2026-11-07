import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

const id = () => randomBytes(24).toString('base64url');
const now = () => performance.now();
const finite = (n, min, max) => Number.isFinite(n) && n >= min && n <= max;
const contentId = v => typeof v === 'string' && /^[\w-]{11}$/.test(v);
const secretMatches = (a, b) => typeof b === 'string' && /^[\w-]{32}$/.test(b) && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function createCoordinator({ allowedOrigins = [], maxRooms = 100, ttl = 2 * 60 * 60 * 1000 } = {}) {
  const rooms = new Map();
  const sockets = new Set();
  const attempts = new Map();
  const serverEpoch = id();
  const httpServer = http.createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.writeHead(req.url === '/health' ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(req.url === '/health' ? { ok: true, version: '0.1.0' } : { error: 'not_found' }));
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
  const send = (ws, payload) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > 32768) return ws.close(1008, 'slow_consumer');
    ws.send(JSON.stringify(payload));
  };
  function snapshot(room) {
    return { type: 'state', serverEpoch, roomId: room.id, contentId: room.contentId,
      timeline: room.timeline, hostOnline: Boolean(room.members.get(room.hostId)?.ws),
      members: [...room.members.values()].map(m => ({ id: m.id, role: m.id === room.hostId ? 'host' : 'guest', online: Boolean(m.ws) })) };
  }
  function broadcast(room) {
    const state = snapshot(room);
    for (const member of room.members.values()) if (member.ws) send(member.ws, state);
  }
  function destroy(room) {
    rooms.delete(room.id);
    for (const m of room.members.values()) m.ws?.close(1000, 'room_closed');
  }
  function authorize(ws) {
    const room = rooms.get(ws.auth?.roomId);
    const member = room?.members.get(ws.auth?.memberId);
    if (!room || room.expires <= Date.now() || member?.ws !== ws) throw Error('unauthorized');
    return { room, member };
  }
  httpServer.on('upgrade', (req, socket, head) => {
    const origin = req.headers.origin;
    const permitted = allowedOrigins.length ? allowedOrigins.includes(origin)
      : /^chrome-extension:\/\/[a-p]{32}$/.test(origin ?? '');
    const address = req.socket.remoteAddress;
    let bucket = attempts.get(address);
    if (!bucket || Date.now() - bucket.at > 60000) {
      bucket = { at: Date.now(), count: 0 }; attempts.set(address, bucket);
    }
    if (attempts.size > 10000 || ++bucket.count > 60 || sockets.size >= 200 || req.url !== '/ws' || !permitted) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;
    }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
  });
  wss.on('connection', ws => {
    sockets.add(ws);
    ws.alive = true;
    ws.on('pong', () => { ws.alive = true; });
    const authTimeout = setTimeout(() => { if (!ws.auth) ws.close(1008, 'auth_timeout'); }, 5000);
    let credits = 12, lastCredit = now(), failures = 0;
    ws.on('message', (raw, binary) => {
      try {
        const tick = now();
        credits = Math.min(12, credits + (tick - lastCredit) * 0.006); lastCredit = tick;
        if (--credits < 0) return ws.close(1008, 'rate_limit');
        if (binary) throw Error('invalid_message');
        const msg = JSON.parse(raw.toString());
        if (!msg || typeof msg !== 'object' || Array.isArray(msg)) throw Error('invalid_message');
        if (!ws.auth) {
          let room, member;
          if (msg.type === 'create') {
            if (!contentId(msg.contentId)) throw Error('invalid_content');
            if (rooms.size >= maxRooms) throw Error('capacity');
            room = { id: id(), contentId: msg.contentId, hostId: id(), members: new Map(), timeline: null, expires: Date.now() + ttl };
            member = { id: room.hostId, token: id(), ws, seq: -1, lastTimeline: -Infinity };
            room.members.set(member.id, member); rooms.set(room.id, room);
          } else if (msg.type === 'join') {
            room = rooms.get(msg.roomId);
            if (!room || room.expires <= Date.now() || room.contentId !== msg.contentId) throw Error('invalid_invite');
            if (room.members.size >= 8) throw Error('room_full');
            member = { id: id(), token: id(), ws, seq: -1, lastTimeline: -Infinity };
            room.members.set(member.id, member);
          } else if (msg.type === 'resume') {
            room = rooms.get(msg.roomId); member = room?.members.get(msg.memberId);
            if (!member || room.expires <= Date.now() || !secretMatches(member.token, msg.token)) throw Error('unauthorized');
            member.ws?.close(1000, 'replaced'); member.ws = ws;
          } else throw Error('authenticate_first');
          ws.auth = { roomId: room.id, memberId: member.id }; clearTimeout(authTimeout);
          send(ws, { type: 'welcome', roomId: room.id, memberId: member.id, token: member.token,
            role: member.id === room.hostId ? 'host' : 'guest', serverEpoch, seq: member.seq });
          broadcast(room); return;
        }
        const { room, member } = authorize(ws);
        if (msg.type === 'ping') {
          if (!finite(msg.t1, 0, 1e15)) throw Error('invalid_time');
          const t2 = now(); send(ws, { type: 'pong', t1: msg.t1, t2, t3: now() }); return;
        }
        if (msg.type === 'leave') {
          if (member.id === room.hostId) destroy(room);
          else { room.members.delete(member.id); ws.auth = null; ws.close(1000, 'left'); broadcast(room); }
          return;
        }
        if (msg.type !== 'timeline') throw Error('unknown_action');
        if (member.id !== room.hostId) throw Error('forbidden');
        if (!Number.isSafeInteger(msg.seq) || msg.seq <= member.seq) throw Error('stale_revision');
        const liveId = `youtube:${room.contentId}:live`, vodId = `youtube:${room.contentId}:vod`;
        if (![liveId, vodId].includes(msg.timelineId) || (msg.timelineId === liveId && !finite(msg.origin, 1e9, 1e11))) throw Error('invalid_timeline');
        if (msg.contentId !== room.contentId || !finite(msg.position, 0, 1e9) || !finite(msg.rate, 0, 2)
          || !finite(msg.at, now() - 3000, now() + 1000)) throw Error('invalid_timeline');
        if (now() - member.lastTimeline < 400) throw Error('timeline_rate_limit');
        member.seq = msg.seq; member.lastTimeline = now();
        room.timeline = { position: msg.position, rate: msg.rate, at: msg.at, timelineId: msg.timelineId,
          origin: msg.timelineId === liveId ? msg.origin : null, revision: msg.seq, epoch: serverEpoch };
        broadcast(room);
      } catch (error) {
        send(ws, { type: 'error', code: error instanceof SyntaxError ? 'invalid_json' : error.message });
        if (++failures >= 5) ws.close(1008, 'too_many_errors');
      }
    });
    ws.on('error', () => {});
    ws.on('close', () => {
      clearTimeout(authTimeout); sockets.delete(ws);
      const room = rooms.get(ws.auth?.roomId), member = room?.members.get(ws.auth?.memberId);
      if (member?.ws === ws) { member.ws = null; member.disconnectedAt = Date.now(); broadcast(room); }
    });
  });
  const cleanup = setInterval(() => {
    for (const [address, b] of attempts) if (Date.now() - b.at > 60000) attempts.delete(address);
    for (const room of rooms.values()) {
      if (room.expires <= Date.now()) { destroy(room); continue; }
      let changed = false;
      for (const member of room.members.values()) {
        if (!member.ws && member.id !== room.hostId && Date.now() - member.disconnectedAt > 60000) {
          room.members.delete(member.id); changed = true;
        }
      }
      const host = room.members.get(room.hostId);
      if (!host.ws && Date.now() - host.disconnectedAt > 60000) { destroy(room); continue; }
      if (changed) broadcast(room);
    }
    for (const ws of sockets) {
      if (!ws.alive) { ws.terminate(); continue; }
      ws.alive = false; ws.ping();
    }
  }, 15000);
  cleanup.unref();
  return {
    httpServer,
    async listen(port = 8787, host = '127.0.0.1') {
      await new Promise(resolve => httpServer.listen(port, host, resolve));
      return httpServer.address();
    },
    async close() {
      clearInterval(cleanup);
      for (const ws of sockets) ws.terminate();
      await new Promise(resolve => wss.close(resolve));
      await new Promise(resolve => httpServer.close(resolve));
    }
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '').split(',').map(v => v.trim()).filter(Boolean);
  const host = process.env.HOST ?? '127.0.0.1';
  if (host !== '127.0.0.1' && !allowedOrigins.length) throw Error('Set ALLOWED_ORIGINS before remote deployment');
  const app = createCoordinator({ allowedOrigins });
  const address = await app.listen(Number(process.env.PORT ?? 8787), host);
  console.log(`YouTube In Sync coordinator: http://${address.address}:${address.port}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => app.close().then(() => process.exit(0)));
}
