(function (root) {
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  function targetAt(timeline, now) {
    return timeline.position + timeline.rate * (now - timeline.at) / 1000;
  }
  function correction(error, correcting = false) {
    if (Math.abs(error) > 2) return { action: 'seek', rate: 1 };
    if (Math.abs(error) < (correcting ? 0.025 : 0.06)) return { action: 'hold', rate: 1 };
    // Smooth saturation: strong catch-up for audible drift, gentle near the target.
    return { action: 'rate', rate: clamp(1 + 0.03 * Math.tanh(0.35 * error / 0.03), 0.97, 1.03) };
  }
  function clockSample(t1, t2, t3, t4) {
    return { offset: ((t2 - t1) + (t3 - t4)) / 2, rtt: (t4 - t1) - (t3 - t2) };
  }
  function selectClock(samples) {
    return samples.filter(s => Number.isFinite(s.rtt) && s.rtt >= 0 && s.rtt < 3000)
      .sort((a, b) => a.rtt - b.rtt)[0] ?? null;
  }
  const api = { targetAt, correction, clockSample, selectClock };
  root.SyncMath = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
