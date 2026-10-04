/* A complete first-screen cascade is inline. Enable the rest in one batch. */
(() => {
  'use strict';
  const links = Array.from(document.querySelectorAll('link[data-deferred-style]'));
  if (!links.length) return;
  const root = document.documentElement;
  root.dataset.fullStyles = 'loading';
  const firstPaint = new Promise(resolve => {
    if (document.hidden) setTimeout(resolve, 0);
    else {
      const photo = document.querySelector('#top.hero .hero-picture img');
      let settled = false;
      const events = ['pointerdown', 'keydown', 'scroll'];
      const painted = () => {
        if (settled) return;
        settled = true;
        events.forEach(name => window.removeEventListener(name, painted));
        requestAnimationFrame(() => requestAnimationFrame(() => {
          try { performance.mark('godune:critical-screen-painted'); } catch { /* optional measurement */ }
          resolve();
        }));
      };
      // Preserve the critical photo's first frame before another full layout.
      // A visitor can reach the rest of the page while that photo is in flight.
      if (photo) {
        events.forEach(name => window.addEventListener(name, painted, {once:true, passive:true}));
        photo.decode().catch(() => {}).then(painted);
      } else painted();
    }
  });
  const hasLoadedSheet = link => {
    if (!link.sheet) return false;
    // Canonical links are same-origin. Chrome may retain an unreadable sheet
    // object after a failed fetch; its presence alone is not a loaded state.
    try { void link.sheet.cssRules; return true; } catch { return false; }
  };
  const states = links.map(link => new Promise(resolve => {
    let settled = false;
    const done = state => {
      if (settled) return;
      settled = true;
      link.dataset.styleState = state;
      link.removeEventListener('load', loaded);
      link.removeEventListener('error', failed);
      window.removeEventListener('load', afterLoad);
      resolve(state);
    };
    const loaded = () => done('loaded');
    const failed = () => done('error');
    // Cached print styles may finish before this deferred script executes.
    const afterLoad = () => hasLoadedSheet(link) ? loaded() : failed();
    link.addEventListener('load', loaded);
    link.addEventListener('error', failed);
    window.addEventListener('load', afterLoad, {once:true});
    if (hasLoadedSheet(link)) loaded();
    else if (document.readyState === 'complete') afterLoad();
  }));
  Promise.all([firstPaint, Promise.all(states)]).then(([, results]) => {
    links.forEach(link => { if (link.dataset.styleState === 'loaded') link.media = 'all'; });
    root.dataset.fullStyles = results.includes('error') ? 'degraded' : 'ready';
    try { performance.mark('godune:full-styles-ready'); } catch { /* optional measurement */ }
    window.dispatchEvent(new CustomEvent('godune:full-styles-ready', {detail:{errors:results.filter(state => state === 'error').length}}));
  });
})();
