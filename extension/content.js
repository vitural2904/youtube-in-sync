(() => {
  if (globalThis.__syncDuoInstalled) return;
  globalThis.__syncDuoInstalled = true;
  let binding = null, target = null, player = null, source = null, mapping = null;
  let mappedAt = 0, correcting = false, lastSeek = -Infinity, lastTarget = 0;
  let correctionBase = null, appliedRate = null;
  let status = 'Chưa gắn video';
  const videoId = () => {
    const u = new URL(location.href);
    return u.origin === 'https://www.youtube.com' && u.pathname === '/watch' ? u.searchParams.get('v') : null;
  };
  function resetRate() {
    if (player && correctionBase !== null && Math.abs(player.playbackRate - appliedRate) < 1e-6) player.playbackRate = correctionBase;
    correctionBase = appliedRate = null;
  }
  function invalidate() { resetRate(); mapping = null; target = null; correcting = false; }
  function stop() { invalidate(); binding = null; status = 'Đã ngừng đồng bộ'; }
  function sample() {
    if (!binding) return { ready: false, status };
    if (videoId() !== binding.contentId) { stop(); return { ready: false, status: 'Video đã đổi. Gắn lại tab.' }; }
    const v = document.querySelector('#movie_player video.html5-main-video');
    if (!v) { invalidate(); status = 'Chưa tìm thấy player'; return { ready: false, status }; }
    if (v !== player || v.currentSrc !== source) { invalidate(); player = v; source = v.currentSrc; }
    if (document.querySelector('#movie_player.ad-showing, #movie_player.ad-interrupting')) {
      invalidate(); status = 'Đang quảng cáo. Sẽ tự đồng bộ lại.'; return { ready: false, status };
    }
    if (!mapping || performance.now() - mappedAt > 2500) {
      invalidate(); status = 'Đang tự tìm mốc thời gian YouTube'; return { ready: false, status };
    }
    const ranges = [];
    for (let i = 0; i < Math.min(v.seekable.length, 12); i++) ranges.push([v.seekable.start(i), v.seekable.end(i)]);
    const ready = v.readyState >= 3 && !v.seeking && Number.isFinite(v.currentTime) && ranges.length > 0;
    if (!ready) status = 'Đang tải video';
    return { ready, position: v.currentTime + mapping.offset, mediaPosition: v.currentTime,
      paused: v.paused, rate: v.paused ? 0 : v.playbackRate, live: mapping.live,
      timelineId: mapping.timelineId, origin: mapping.origin, ranges, status, contentId: binding.contentId,
      observedAt: performance.timeOrigin + performance.now() };
  }
  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (sender.id !== chrome.runtime.id) return;
    try {
      if (msg.type === 'bind') {
        if (binding?.id === msg.bindingId && binding.contentId === msg.contentId && videoId() === msg.contentId) {
          binding.role = msg.role; reply(sample()); return;
        }
        stop();
        if (videoId() !== msg.contentId || !/^[\w-]{11}$/.test(msg.contentId)) throw Error('Mở trang YouTube /watch trước.');
        binding = { id: msg.bindingId, contentId: msg.contentId, role: msg.role };
        player = null; status = 'Đang tự tìm mốc thời gian YouTube'; reply(sample()); return;
      }
      if (!binding || msg.bindingId !== binding.id) throw Error('Liên kết tab không còn hợp lệ.');
      if (msg.type === 'stop') { stop(); reply({ ok: true }); return; }
      if (msg.type === 'sample') { reply(sample()); return; }
      if (msg.type === 'suspend') { target = null; resetRate(); status = 'Mất nhịp phòng. Video tiếp tục.'; reply({ ok: true }); return; }
      if (msg.type === 'mapping') {
        sample();
        if (!binding) throw Error('Liên kết tab không còn hợp lệ.');
        const id = `youtube:${binding.contentId}:${msg.live ? 'live' : 'vod'}`;
        if (msg.valid !== true || msg.contentId !== binding.contentId || msg.source !== source || msg.timelineId !== id
          || !Number.isFinite(msg.offset) || Math.abs(msg.offset) > 1e9
          || (msg.live && (!Number.isFinite(msg.origin) || msg.origin < 1e9 || msg.origin > 1e11))) {
          invalidate(); status = 'Chưa đọc được mốc YouTube. Đang tự thử lại.'; reply({ ok: false }); return;
        }
        if (mapping && (mapping.offset !== msg.offset || mapping.timelineId !== id || Math.abs(mapping.origin - msg.origin) > 2)) invalidate();
        mapping = { offset: msg.offset, timelineId: id, origin: msg.origin, live: Boolean(msg.live) };
        mappedAt = performance.now(); reply({ ok: true }); return;
      }
      if (msg.type === 'target') {
        if (!Number.isFinite(msg.position) || !Number.isFinite(msg.rate) || msg.rate < 0 || msg.rate > 2) throw Error('Mốc phát không hợp lệ.');
        if (!mapping || mapping.timelineId !== msg.timelineId || (mapping.live && (!Number.isFinite(msg.origin) || Math.abs(mapping.origin - msg.origin) > 2))) {
          target = null; resetRate(); status = 'Đang chờ mốc cùng luồng phát'; reply({ ok: false }); return;
        }
        const sentAt = msg.at - performance.timeOrigin;
        if (!Number.isFinite(sentAt) || sentAt > performance.now() + 5 || performance.now() - sentAt > 3500) throw Error('Mốc phát đã cũ.');
        target = { position: msg.position, rate: msg.rate }; lastTarget = sentAt; reply({ ok: true }); return;
      }
      throw Error('Lệnh không hợp lệ.');
    } catch (e) { reply({ error: e.message }); }
  });
  setInterval(() => {
    if (!binding || binding.role !== 'guest') return;
    const s = sample();
    if (!s.ready || !target || performance.now() - lastTarget > 3500) {
      resetRate(); if (s.ready && target) status = 'Mất nhịp phòng. Video tiếp tục.'; return;
    }
    const wanted = target.position + target.rate * (performance.now() - lastTarget) / 1000 - mapping.offset;
    if (!s.ranges.some(([a, b]) => wanted >= a && wanted <= b - 0.1)) {
      resetRate(); status = 'Mốc chung ngoài vùng tua. Đang tự thử lại.'; return;
    }
    const error = wanted - player.currentTime;
    if (target.rate === 0) {
      player.pause(); resetRate();
      if (Math.abs(error) > 0.06) {
        if (performance.now() - lastSeek > 3000) { player.currentTime = wanted; lastSeek = performance.now(); }
        status = 'Đang đồng bộ vị trí dừng';
      } else status = 'Đã đồng bộ · Phòng đang dừng';
      return;
    }
    if (player.paused) {
      player.play().catch(() => { status = 'Trình duyệt chặn tự phát. Bấm phát video.'; });
      status = 'Đang chờ video phát'; return;
    }
    const fix = SyncMath.correction(error, correcting);
    if (fix.action === 'seek' && performance.now() - lastSeek > 3000) {
      player.currentTime = wanted; lastSeek = performance.now(); correcting = false; resetRate(); status = 'Đang đồng bộ';
    } else if (performance.now() - lastSeek > 1200) {
      correctionBase = Math.max(0.25, Math.min(2, target.rate));
      appliedRate = Math.max(0.25, Math.min(2, target.rate * fix.rate));
      player.playbackRate = appliedRate; correcting = fix.action === 'rate';
      status = correcting ? `Đang chỉnh (${error.toFixed(2)} giây)` : fix.action === 'hold' ? 'Đã đồng bộ' : 'Đang đồng bộ';
    }
  }, 100);
})();
