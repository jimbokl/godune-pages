/* A complete first-screen cascade is inline. Enable the rest in one batch. */
(() => {
  'use strict';
  const links = Array.from(document.querySelectorAll('link[data-deferred-style]'));
  if (!links.length) return;
  const persistentFonts = document.currentScript?.hasAttribute('data-persistent-fonts')
    ? document.querySelector('#page-critical')?.sheet : null;
  const root = document.documentElement;
  root.dataset.fullStyles = 'loading';
  const firstPaint = new Promise(resolve => {
    if (document.hidden) setTimeout(resolve, 0);
    else {
      const photo = document.querySelector('#top.hero .hero-picture img, img[data-critical-image]');
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
  // A same-URL hint releases the catalogue's queued print sheet only after
  // its first screen. Changing an already requested link's priority does not.
  firstPaint.then(() => {
    if (!persistentFonts) return;
    links.forEach(link => {
      if (link.dataset.styleState) return;
      const hint = document.createElement('link');
      hint.rel = 'preload';
      hint.as = 'style';
      hint.href = link.href;
      hint.fetchPriority = 'high';
      document.head.append(hint);
    });
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
    // Preserve the catalogue's active font objects when enabling the full cascade.
    // Only exact top-level duplicates are redundant; conditional or distinct faces stay.
    if (persistentFonts) {
      try {
        const faces = new Set(Array.from(persistentFonts.cssRules)
          .filter(rule => rule.type === CSSRule.FONT_FACE_RULE).map(rule => rule.cssText));
        links.forEach(link => {
          if (link.dataset.styleState !== 'loaded') return;
          try {
            const sheet = link.sheet;
            for (let index = sheet.cssRules.length - 1; index >= 0; index--) {
              const rule = sheet.cssRules[index];
              if (rule.type === CSSRule.FONT_FACE_RULE && faces.has(rule.cssText)) sheet.deleteRule(index);
            }
          } catch { /* Unreadable CSSOM keeps ordinary stylesheet promotion. */ }
        });
      } catch { /* Inline CSSOM is optional; full styles still become available. */ }
    }
    links.forEach(link => { if (link.dataset.styleState === 'loaded') link.media = 'all'; });
    root.dataset.fullStyles = results.includes('error') ? 'degraded' : 'ready';
    try { performance.mark('godune:full-styles-ready'); } catch { /* optional measurement */ }
    window.dispatchEvent(new CustomEvent('godune:full-styles-ready', {detail:{errors:results.filter(state => state === 'error').length}}));
  });
})();
