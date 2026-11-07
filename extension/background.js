importScripts('sync.js', 'youtube.js');
let binding = null, session = null, state = null, socket = null, clock = null;
let samples = [], retry = 1000, retryTimer = null, busy = false, starting = false;
let status = 'Chưa tham gia phòng', seq = 0;
const mono = () => performance.now();
const init = (async () => {
  await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  const saved = await chrome.storage.session.get(['binding', 'session']);
  binding = saved.binding ?? null; session = saved.session ?? null;
  if (binding && session) connect({ type: 'resume', ...session });
})();
function endpoint(value) {
  const u = new URL(value);
  if (u.username || u.password || u.search || u.hash || u.pathname !== '/ws'
    || !(u.protocol === 'wss:' || u.protocol === 'ws:' && u.hostname === '127.0.0.1' && u.port === '8787')) {
    throw Error('Dùng wss://máy-chủ/ws hoặc ws://127.0.0.1:8787/ws.');
  }
  return u.href;
}
const send = msg => { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg)); };
const toPlayer = msg => chrome.tabs.sendMessage(binding.tabId, { ...msg, bindingId: binding.id }, { documentId: binding.documentId });
async function persist() { await chrome.storage.session.set({ binding, session }); }
function connect(auth) {
  clearTimeout(retryTimer); clock = null; samples = []; state = null;
  const ws = new WebSocket(binding.endpoint); socket = ws; status = 'Đang kết nối';
  const timeout = setTimeout(() => { if (socket === ws && !state) ws.close(); }, 6000);
  ws.onopen = () => ws.send(JSON.stringify(auth));
  ws.onmessage = async event => {
    if (socket !== ws) return;
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'welcome') {
        session = { roomId: msg.roomId, memberId: msg.memberId, token: msg.token };
        seq = msg.seq; binding.role = msg.role; retry = 1000; await persist();
        await toPlayer({ type: 'bind', bindingId: binding.id, contentId: binding.contentId, role: binding.role });
        send({ type: 'ping', t1: mono() });
      } else if (msg.type === 'pong') {
        samples.push(SyncMath.clockSample(msg.t1, msg.t2, msg.t3, mono()));
        samples = samples.slice(-12); clock = SyncMath.selectClock(samples);
      } else if (msg.type === 'state') {
        if (msg.roomId !== session?.roomId || msg.contentId !== binding.contentId) throw Error('Sai phòng hoặc nội dung.');
        if (state && state.serverEpoch === msg.serverEpoch && state.timeline?.revision > msg.timeline?.revision) return;
        state = msg; clearTimeout(timeout);
      } else if (msg.type === 'error') {
        status = `Máy chủ: ${msg.code}`;
        if (['unauthorized', 'invalid_invite', 'room_full', 'capacity'].includes(msg.code)) {
          session = null; await persist(); ws.close(1000, msg.code);
        }
      }
    } catch { status = 'Không dùng được trạng thái phòng'; ws.close(); }
  };
  ws.onerror = () => { status = 'Không kết nối được máy chủ'; };
  ws.onclose = async event => {
    clearTimeout(timeout); if (socket !== ws) return;
    socket = null; state = null; clock = null;
    if (binding) await toPlayer({ type: 'suspend' }).catch(() => {});
    if (['room_closed', 'left', 'replaced'].includes(event.reason)) {
      await leave(false); status = 'Phòng đã đóng hoặc phiên đã thay'; return;
    }
    if (binding && session) {
      status = 'Mất kết nối. Đang thử lại.';
      retryTimer = setTimeout(() => { if (binding && session) connect({ type: 'resume', ...session }); }, retry);
      retry = Math.min(retry * 2, 15000);
    }
  };
}
async function leave(notify = true) {
  clearTimeout(retryTimer);
  if (binding) await toPlayer({ type: 'stop' }).catch(() => {});
  if (notify) send({ type: 'leave' });
  const ws = socket; socket = null; ws?.close();
  binding = session = state = clock = null; status = 'Đã ngừng đồng bộ'; await persist();
}
setInterval(async () => {
  if (busy || !binding || !session || socket?.readyState !== WebSocket.OPEN) return;
  busy = true;
  try {
    send({ type: 'ping', t1: mono() });
    const [reading] = await chrome.scripting.executeScript({ target: { tabId: binding.tabId, documentIds: [binding.documentId] },
      world: 'MAIN', func: readYouTubeTimeline, args: [binding.contentId] });
    if (reading.documentId !== binding.documentId) throw Error('Sai trang.');
    await toPlayer({ ...reading.result, type: 'mapping' });
    const s = await toPlayer({ type: 'sample' });
    if (s?.error) throw Error(s.error);
    status = s?.status ?? 'Đang chờ player';
    if (!clock || !state) return;
    const serverNow = mono() + clock.offset;
    const browserNow = performance.timeOrigin + mono();
    const sampleAge = browserNow - s.observedAt;
    if (binding.role === 'host') {
      const position = Number.isFinite(s?.position) ? s.position : state.timeline?.position;
      if (!Number.isFinite(position)) return;
      send({ type: 'timeline', seq: ++seq, contentId: binding.contentId, position,
        timelineId: s.timelineId ?? state.timeline?.timelineId, origin: s.origin ?? state.timeline?.origin,
        rate: s.ready ? s.rate : 0, at: s.ready && Number.isFinite(sampleAge) ? serverNow - sampleAge : serverNow });
      status = s.ready ? 'Đang giữ nhịp phòng' : 'Đang giữ mốc. Chủ phòng chưa sẵn sàng.';
    } else if (s?.ready && state.hostOnline && state.timeline && serverNow - state.timeline.at < 3500) {
      await toPlayer({ type: 'target', position: SyncMath.targetAt(state.timeline, serverNow), rate: state.timeline.rate,
        timelineId: state.timeline.timelineId, origin: state.timeline.origin, at: browserNow });
    } else {
      await toPlayer({ type: 'suspend' });
      status = s?.ready ? 'Chủ phòng chưa có nhịp phát' : s?.status;
    }
  } catch { await leave(); status = 'Player đã đổi hoặc tab đã đóng. Gắn lại tab.'; }
  finally { busy = false; }
}, 1000);
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  // Page/content senders cannot invoke the privileged popup commands.
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup.html')) return;
  (async () => {
    await init;
    if (msg.type === 'status') return { status, roomId: session?.roomId, role: binding?.role,
      contentId: binding?.contentId, count: state?.members.length ?? 0, bound: Boolean(binding),
      connected: Boolean(state), endpoint: binding?.endpoint, clockRtt: clock?.rtt };
    if (msg.type === 'leave') { await leave(); return { ok: true }; }
    if (!['create', 'join'].includes(msg.type)) throw Error('Lệnh không hợp lệ.');
    if (starting) throw Error('Đang gắn video. Chờ một chút.');
    starting = true;
    try {
      if (binding) throw Error('Rời phòng hiện tại trước.');
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const u = new URL(tab?.url ?? 'about:blank');
      const contentId = u.searchParams.get('v');
      if (u.origin !== 'https://www.youtube.com' || u.pathname !== '/watch' || !/^[\w-]{11}$/.test(contentId ?? '')) throw Error('Mở video tại www.youtube.com/watch trước.');
      const url = endpoint(msg.endpoint);
      if (url.startsWith('wss:') && !(await chrome.permissions.contains({ origins: [`https://${new URL(url).host}/*`] }))) throw Error('Cần cấp quyền cho máy chủ này.');
      if (msg.type === 'join' && !/^[\w-]{32}$/.test(msg.roomId ?? '')) throw Error('Mã phòng không hợp lệ.');
      await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, files: ['sync.js', 'content.js'] });
      const [doc] = await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, func: () => true });
      binding = { id: crypto.randomUUID(), tabId: tab.id, documentId: doc.documentId, contentId,
        endpoint: url, role: msg.type === 'create' ? 'host' : 'guest' };
      await persist(); connect({ type: msg.type, contentId, ...(msg.type === 'join' ? { roomId: msg.roomId } : {}) });
      return { ok: true };
    } finally { starting = false; }
  })().then(reply, e => reply({ error: e.message }));
  return true;
});
