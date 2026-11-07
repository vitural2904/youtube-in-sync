import test from 'node:test';
import assert from 'node:assert/strict';
import '../extension/sync.js';
const { targetAt, correction, clockSample, selectClock } = globalThis.SyncMath;
test('late delivery advances target, paused timeline does not advance', () => {
  assert.equal(targetAt({ position: 100, at: 1000, rate: 1 }, 4000), 103);
  assert.equal(targetAt({ position: 100, at: 1000, rate: 0 }, 4000), 100);
});
test('four timestamp exchange accounts for server processing time', () => {
  assert.deepEqual(clockSample(100, 160, 170, 130), { offset: 50, rtt: 20 });
  assert.equal(selectClock([{ offset: 1, rtt: 80 }, { offset: 50, rtt: 20 }]).offset, 50);
});
test('deadband and hysteresis avoid oscillation; large errors seek', () => {
  assert.equal(correction(0.04).action, 'hold');
  assert.equal(correction(0.04, true).action, 'rate');
  assert.ok(correction(1).rate > 1.029 && correction(1).rate <= 1.03);
  assert.ok(correction(-1).rate < 0.971 && correction(-1).rate >= 0.97);
  assert.equal(correction(3).action, 'seek');
});
test('audible 250ms drift receives bounded smooth correction', () => {
  const fix = correction(0.25);
  assert.equal(fix.action, 'rate');
  assert.ok(fix.rate > 1.029 && fix.rate <= 1.03);
  assert.ok(correction(-0.25).rate < 0.971);
  assert.equal(correction(0.02, true).action, 'hold');
});
