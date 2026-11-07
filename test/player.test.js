import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

// Exercise the extension's message boundary with a controlled media player.
function browser(live = false) {
  let listener, loop, time = 10000, ads = false;
  const v = { currentTime: 100, currentSrc: 'blob:test', duration: live ? Infinity : 600,
    readyState: 4, seeking: false, paused: false, playbackRate: 1,
    seekable: { length: 1, start: () => 0, end: () => 600 },
    pause() { this.paused = true; }, async play() { this.paused = false; } };
  const context = vm.createContext({ URL, console, performance: { now: () => time, timeOrigin: 1000000 },
    location: { href: 'https://www.youtube.com/watch?v=abcdefghijk' },
    document: { querySelector(selector) {
      if (selector.includes('ad-showing')) return ads ? {} : null;
      if (selector === '.ytp-live-badge') return live ? { getClientRects: () => [1] } : null;
      return v;
    } },
    chrome: { runtime: { id: 'extension', onMessage: { addListener: fn => { listener = fn; } } } },
    setInterval: fn => { loop = fn; } });
  vm.runInContext(readFileSync('extension/sync.js', 'utf8'), context);
  vm.runInContext(readFileSync('extension/content.js', 'utf8'), context);
  const send = (type, extra = {}, sender = 'extension') => {
    let response;
    listener({ type, bindingId: 'binding', ...extra }, { id: sender }, r => { response = r; });
    return response;
  };
  send('bind', { contentId: 'abcdefghijk', role: 'guest' });
  const map = (extra = {}) => send('mapping', { valid: true, contentId: 'abcdefghijk', source: v.currentSrc,
    offset: 0, live, timelineId: `youtube:abcdefghijk:${live ? 'live' : 'vod'}`, origin: live ? 1793728806.9 : null, ...extra });
  const target = (extra = {}) => send('target', { position: 101, rate: 1,
    timelineId: `youtube:abcdefghijk:${live ? 'live' : 'vod'}`, origin: live ? 1793728806.95 : null, at: 1000000 + time, ...extra });
  map();
  return { v, context, send, map, target, tick(ms = 250) { time += ms; loop(); }, ad(value) { ads = value; } };
}
test('bound VOD player follows target; stale target stops rate corrections', () => {
  const b = browser(); b.target(); b.tick();
  assert.ok(b.v.playbackRate > 1.029 && b.v.playbackRate <= 1.03);
  b.tick(4000); assert.equal(b.v.playbackRate, 1);
});
test('live follows a paused host automatically and reports success only after reaching it', () => {
  const b = browser(true); b.target({ position: 110, rate: 0 }); b.tick();
  assert.equal(b.v.currentTime, 110);
  assert.equal(b.send('sample').status.includes('Đã đồng bộ'), false);
  b.tick(); assert.match(b.send('sample').status, /Đã đồng bộ/);
});
test('ads invalidate mappings; live automatically reacquires mapping after ads', () => {
  const b = browser(true);
  b.ad(true); b.target({ position: 120 }); b.tick();
  assert.equal(b.v.currentTime, 100);
  b.ad(false); assert.equal(b.send('sample').ready, false);
  b.map(); b.target({ position: 120, rate: 0 }); b.tick();
  assert.equal(b.v.currentTime, 120);
});
test('navigation and wrong binding cannot retain control', () => {
  const b = browser();
  b.target({ position: 150, bindingId: 'other' }); b.tick();
  assert.equal(b.v.currentTime, 100);
  b.context.location.href = 'https://www.youtube.com/watch?v=12345678901';
  b.target({ position: 150 }); b.tick();
  assert.equal(b.v.currentTime, 100);
  assert.match(b.send('sample').error, /Liên kết/);
});
test('stop and suspend immediately restore normal playback speed', () => {
  const b = browser(); b.target(); b.tick();
  b.send('suspend'); assert.equal(b.v.playbackRate, 1);
  b.send('stop'); assert.match(b.send('sample').error, /Liên kết/);
});
test('reconnecting the same binding automatically resumes a valid mapping', () => {
  const b = browser(true); b.send('suspend');
  b.send('bind', { contentId: 'abcdefghijk', role: 'guest' });
  assert.equal(b.send('sample').ready, true);
});
test('live joins automatically despite a different local media origin', () => {
  const b = browser(true);
  b.map({ offset: 1000 });
  b.target({ position: 1110, rate: 0 });
  b.tick();
  assert.equal(b.v.currentTime, 110);
});
test('unknown mapping, other live epoch and expired mapping never report synchronized', () => {
  const b = browser(true);
  b.target({ position: 110, origin: 1793720000 }); b.tick();
  assert.equal(b.v.currentTime, 100);
  b.send('mapping', { valid: false }); b.target({ position: 110 }); b.tick();
  assert.equal(b.v.currentTime, 100);
  assert.equal(b.send('sample').status.includes('Đã đồng bộ'), false);
  b.map(); b.target({ position: 110, rate: 0 }); b.tick(3000);
  assert.equal(b.v.currentTime, 100);
});
test('manual alignment command is removed', () => {
  assert.match(browser(true).send('calibrate', { position: 100 }).error, /Lệnh không hợp lệ/);
});
test('target compensates time spent in worker-to-player delivery', () => {
  const b = browser(); b.target({ position: 110, at: 1009000 }); b.tick();
  assert.equal(b.v.currentTime, 111.25);
});
