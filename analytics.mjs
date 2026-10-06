// Visit counts and explicit useful actions. Never read the local trip or forms.
export const COUNTER_ID = 113479863;
const goals = new Set(['plan_saved', 'trip_file_ready', 'guide_download_click']);

export function publicPageUrl(document, location) {
  const canonical = document.querySelector('link[rel="canonical"]')?.href;
  const url = new URL(canonical || location.href, location.href);
  url.search = ''; url.hash = '';
  return url.href;
}

export function referrerOrigin(referrer) {
  try { const url = new URL(referrer); return /^https?:$/.test(url.protocol) ? url.origin + '/' : ''; }
  catch { return ''; }
}

export function startAnalytics(env = globalThis) {
  const {document, location, navigator} = env;
  if (!document || location?.hostname !== 'godune.ru' || location.protocol !== 'https:' || env.__goduneAnalyticsStarted) return;
  env.__goduneAnalyticsStarted = true;
  const pageUrl = publicPageUrl(document, location), referrer = referrerOrigin(document.referrer);
  let started = false;
  const pending = [];
  const goal = name => {
    if (!goals.has(name)) return;
    if (started) env.ym(COUNTER_ID, 'reachGoal', name);
    else if (pending.length < 20) pending.push(name);
  };
  document.addEventListener('godune:useful-action', event => goal(event.detail));
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href]');
    if (!link || event.defaultPrevented) return;
    const url = new URL(link.href, location.href);
    if (url.origin === location.origin && /^\/guides\/[^/]+\.pdf$/.test(url.pathname)) goal('guide_download_click');
  });
  function load() {
    if (started || navigator?.onLine === false || document.visibilityState === 'hidden') return;
    started = true;
    env.ym = env.ym || function (...args) { (env.ym.a = env.ym.a || []).push(args); };
    env.ym.l = Date.now();
    env.ym(COUNTER_ID, 'init', {defer: true, url: pageUrl, referrer, accurateTrackBounce: true,
      clickmap: false, trackLinks: false, trackHash: false, webvisor: false, ecommerce: false,
      disableYtm: true, sendTitle: false});
    env.ym(COUNTER_ID, 'hit', pageUrl, {referer: referrer});
    pending.splice(0).forEach(name => env.ym(COUNTER_ID, 'reachGoal', name));
    const script = document.createElement('script');
    script.async = true; script.src = 'https://mc.yandex.ru/metrika/tag.js?id=' + COUNTER_ID;
    document.head.append(script);
  }
  function schedule() {
    if (env.requestIdleCallback) env.requestIdleCallback(load, {timeout: 2000});
    else env.setTimeout(load, 250);
  }
  if (document.readyState === 'complete') schedule();
  else env.addEventListener('load', schedule, {once: true});
  env.addEventListener('online', schedule);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule(); });
}

if (typeof window !== 'undefined') startAnalytics(window);
