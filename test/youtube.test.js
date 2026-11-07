import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
function player({ offset = 291215, current = 338019, live = true, origin = '1793728806.9', ads = false, id = 'abcdefghijk' } = {}) {
  const media = { currentTime: 46804, currentSrc: 'blob:test', readyState: 4, seeking: false, duration: live ? Infinity : 600 };
  const p = { querySelector: () => media, classList: { contains: () => ads },
    getVideoData: () => ({ video_id: id, isLive: live }), getCurrentTime: () => current,
    getProgressState: () => ({ offset }), getVideoStats: () => ({ lio: origin, secret: 'must-not-cross' }) };
  const ctx = vm.createContext({ URL, location: { href: 'https://www.youtube.com/watch?v=abcdefghijk' }, document: { querySelector: () => p } });
  vm.runInContext(readFileSync('extension/youtube.js', 'utf8'), ctx);
  return { read: () => ctx.readYouTubeTimeline('abcdefghijk'), media };
}
test('YouTube adapter returns canonical offset instead of treating media time as shared time', () => {
  const result = player().read();
  assert.equal(result.valid, true); assert.equal(result.offset, 291215);
  assert.equal(result.timelineId, 'youtube:abcdefghijk:live');
  assert.equal(JSON.stringify(result).includes('must-not-cross'), false);
});
test('inconsistent, missing and ad timestamps are rejected', () => {
  assert.equal(player({ offset: 10 }).read().valid, false);
  assert.equal(player({ origin: 'not-a-time' }).read().valid, false);
  assert.equal(player({ ads: true }).read().valid, false);
  assert.equal(player({ id: '12345678901' }).read().valid, false);
});
test('VOD uses its verified zero-based player timeline', () => {
  const result = player({ live: false, current: 46804 }).read();
  assert.equal(result.valid, true); assert.equal(result.offset, 0);
  assert.equal(result.origin, null);
});
