// A real, silent shore panorama. Network and motion start only on an explicit click.
export function initAuthorVideo(root = document) {
  for (const scene of root.querySelectorAll('[data-author-video]')) {
    if (scene.dataset.videoReady) continue;
    const video = scene.querySelector('video');
    const button = scene.querySelector('[data-video-toggle]');
    const fallback = scene.querySelector('[data-video-fallback]');
    const label = scene.querySelector('[data-video-label]');
    const icon = scene.querySelector('[data-video-icon]');
    const status = scene.querySelector('[data-video-status]');
    if (!video || !button || !video.dataset.videoSrc) continue;
    const sync = () => {
      const playing = !video.paused && !video.ended;
      button.setAttribute('aria-pressed', String(playing));
      label.textContent = playing ? 'Пауза' : video.ended ? 'Смотреть ещё раз' : 'Смотреть берег';
      icon.textContent = playing ? 'Ⅱ' : '▶';
    };
    const fail = () => {
      video.pause();
      status.textContent = navigator.onLine
        ? 'Ролик сейчас не открылся. Можно посмотреть фотографию или открыть видео отдельно.'
        : 'Для этого ролика нужна сохранённая копия или связь. Фотография берега остаётся здесь.';
      fallback.hidden = false;
      sync();
    };
    button.addEventListener('click', () => {
      if (!video.paused && !video.ended) {video.pause(); return;}
      if (!video.hasAttribute('src')) video.src = video.dataset.videoSrc;
      if (video.ended) video.currentTime = 0;
      video.controls = true;
      // Keep play inside the gesture, including Safari. An error keeps the poster and link.
      video.play().then(() => {
        status.textContent = 'Тихая панорама с пирса. Съёмка 3 октября 2026.';
      }).catch(fail);
    });
    for (const event of ['play', 'pause', 'ended']) video.addEventListener(event, sync);
    video.addEventListener('error', fail);
    document.addEventListener('visibilitychange', () => {if (document.hidden) video.pause();});
    window.addEventListener('pagehide', () => video.pause());
    window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener('change', () => video.pause());
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(entries => {
        if (!entries[0].isIntersecting) video.pause();
      }, {threshold: 0}).observe(video);
    }
    scene.dataset.videoReady = 'true';
    button.hidden = false;
    fallback.hidden = true;
    sync();
  }
}
