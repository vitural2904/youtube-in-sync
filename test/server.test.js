import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createCoordinator } from '../server/index.js';
const origin = 'chrome-extension://' + 'a'.repeat(32);
const contentId = 'abcdefghijk';
async function setup(t, options) {
  const app = createCoordinator(options);
  const address = await app.listen(0);
  t.after(() => app.close());
  return `ws://127.0.0.1:${address.port}/ws`;
}
async function client(url, auth) {
  const ws = new WebSocket(url, { origin });
  const queue = [], waiting = [];
  ws.on('error', () => {});
  ws.on('message', raw => {
    const m = JSON.parse(raw);
    const index = waiting.findIndex(w => w.type === m.type);
    if (index < 0) queue.push(m);
    else { const [wait] = waiting.splice(index, 1); clearTimeout(wait.timer); wait.resolve(m); }
  });
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  const next = type => {
    const index = queue.findIndex(m => m.type === type);
    if (index >= 0) return Promise.resolve(queue.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error(`Timeout waiting ${type}`)), 2000);
      waiting.push({ type, resolve, timer });
    });
  };
  const send = msg => ws.send(JSON.stringify(msg));
  if (auth) send(auth);
  return { ws, next, send };
}
async function host(url) {
  const h = await client(url, { type: 'create', contentId });
  h.welcome = await h.next('welcome'); await h.next('state'); return h;
}
async function timeline(h, seq = 1) {
  h.send({ type: 'ping', t1: 0 }); const pong = await h.next('pong');
  h.send({ type: 'timeline', contentId, timelineId: `youtube:${contentId}:vod`, seq, position: 100, rate: 1, at: pong.t3 });
}
test('create/join and host timeline; guests cannot write the room', async t => {
  const url = await setup(t), h = await host(url);
  const g = await client(url, { type: 'join', roomId: h.welcome.roomId, contentId });
  assert.equal((await g.next('welcome')).role, 'guest');
  await g.next('state'); await h.next('state');
  await timeline(h);
  assert.equal((await g.next('state')).timeline.position, 100);
  g.send({ type: 'timeline', roomId: h.welcome.roomId, seq: 9, position: 0, rate: 0, at: 0 });
  assert.equal((await g.next('error')).code, 'forbidden');
});
test('replayed revision is rejected', async t => {
  const h = await host(await setup(t)); await timeline(h); await h.next('state');
  await timeline(h);
  assert.equal((await h.next('error')).code, 'stale_revision');
});
test('room token cannot resume a different member or room', async t => {
  const url = await setup(t), h1 = await host(url), h2 = await host(url);
  const bad = await client(url, { type: 'resume', roomId: h2.welcome.roomId,
    memberId: h2.welcome.memberId, token: h1.welcome.token });
  assert.equal((await bad.next('error')).code, 'unauthorized');
});
test('resume restores role and revision without consuming a member slot', async t => {
  const url = await setup(t), h = await host(url); await timeline(h); await h.next('state');
  h.ws.close(); await new Promise(resolve => h.ws.once('close', resolve));
  const r = await client(url, { ...h.welcome, type: 'resume' });
  assert.equal((await r.next('welcome')).seq, 1);
  assert.equal((await r.next('state')).members.length, 1);
});
test('wrong video cannot join', async t => {
  const url = await setup(t), h = await host(url);
  const g = await client(url, { type: 'join', roomId: h.welcome.roomId, contentId: '12345678901' });
  assert.equal((await g.next('error')).code, 'invalid_invite');
});
test('host must identify the matching canonical timeline and live origin', async t => {
  const h = await host(await setup(t));
  h.send({ type: 'ping', t1: 0 }); const pong = await h.next('pong');
  h.send({ type: 'timeline', contentId, timelineId: 'youtube:12345678901:live', origin: 1793728806,
    seq: 1, position: 100, rate: 1, at: pong.t3 });
  assert.equal((await h.next('error')).code, 'invalid_timeline');
  h.send({ type: 'timeline', contentId, timelineId: `youtube:${contentId}:live`,
    seq: 1, position: 100, rate: 1, at: pong.t3 });
  assert.equal((await h.next('error')).code, 'invalid_timeline');
});
test('untrusted browser origins denied', async t => {
  const url = await setup(t);
  const ws = new WebSocket(url, { origin: 'https://evil.example' });
  const error = await new Promise(resolve => ws.once('error', resolve));
  assert.match(error.message, /403/);
});
test('rejected origins cannot exhaust address buckets and block existing clients', async t => {
  const app = createCoordinator();
  const address = await app.listen(0); t.after(() => app.close());
  const url = `ws://127.0.0.1:${address.port}/ws`;
  await host(url);
  for (let i = 0; i < 10005; i++) {
    app.httpServer.emit('upgrade', { url: '/ws', headers: { origin: 'https://evil.example' },
      socket: { remoteAddress: `rejected-address-${i}` } }, { end() {} }, Buffer.alloc(0));
  }
  assert.equal((await host(url)).welcome.role, 'host');
});
test('oversized payload closes connection; flood is bounded', async t => {
  const url = await setup(t), h = await host(url);
  const closed = new Promise(resolve => h.ws.once('close', code => resolve(code)));
  h.ws.send('x'.repeat(5000)); assert.equal(await closed, 1009);
  const flood = await host(url);
  const limited = new Promise(resolve => flood.ws.once('close', code => resolve(code)));
  for (let i = 0; i < 40; i++) flood.send({ type: 'ping', t1: i });
  assert.equal(await limited, 1008);
});
test('expired room cannot be joined', async t => {
  const url = await setup(t, { ttl: 20 }), h = await host(url);
  await new Promise(resolve => setTimeout(resolve, 30));
  const g = await client(url, { type: 'join', roomId: h.welcome.roomId, contentId });
  assert.equal((await g.next('error')).code, 'invalid_invite');
});
