// Runs in MAIN with only a public video ID. No credentials cross into the page.
function readYouTubeTimeline(expectedContentId) {
  const unavailable = () => ({ valid: false });
  try {
    const url = new URL(location.href);
    if (url.origin !== 'https://www.youtube.com' || url.pathname !== '/watch' || url.searchParams.get('v') !== expectedContentId) return unavailable();
    const player = document.querySelector('#movie_player');
    const media = player?.querySelector('video.html5-main-video');
    if (!media || media.readyState < 2 || media.seeking || player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting')) return unavailable();
    const data = player.getVideoData?.();
    if (data?.video_id !== expectedContentId) return unavailable();
    const current = player.getCurrentTime?.(), mediaTime = media.currentTime;
    if (!Number.isFinite(current) || current < 0 || !Number.isFinite(mediaTime)) return unavailable();
    const live = data.isLive === true;
    let offset = 0, origin = null;
    if (live) {
      const progress = player.getProgressState?.();
      const liveOrigin = Number(player.getVideoStats?.()?.lio);
      if (!Number.isFinite(progress?.offset) || Math.abs(current - mediaTime - progress.offset) > 0.25
        || !Number.isFinite(liveOrigin) || liveOrigin < 1e9 || liveOrigin > 1e11) return unavailable();
      offset = progress.offset; origin = liveOrigin;
    } else if (Math.abs(current - mediaTime) > 0.25 || !Number.isFinite(media.duration)) return unavailable();
    return { valid: true, contentId: expectedContentId, timelineId: `youtube:${expectedContentId}:${live ? 'live' : 'vod'}`,
      live, offset, origin, source: media.currentSrc };
  } catch { return unavailable(); }
}
