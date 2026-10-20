import {eventTiming} from './events-engine.mjs?v=2026101707';

const views = new Set(['all', 'fresh', 'routes', 'news', 'events']);
const kinds = {routes: 'route', news: 'news', events: 'event'};
const instant = value => typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;

// This homepage lists upcoming events, using the shared calendar engine.
export function pulseEventVisible(item, now = new Date()) {
  if (item.kind !== 'event') return true;
  try {
    return eventTiming({start_time: item.start, end_time: item.end || null, status: item.status || 'scheduled'}, now).phase === 'upcoming';
  } catch {
    return false;
  }
}

export function selectPulseItems(items, {view = 'all', city = '', now = new Date()} = {}) {
  if (!views.has(view)) view = 'all';
  const selected = items.map((item, index) => ({...item, index})).filter(item =>
    pulseEventVisible(item, now) &&
    (!city || city === 'all' || String(item.city || '').split(/\s+/).includes(city)) &&
    (!kinds[view] || item.kind === kinds[view]) && (view !== 'fresh' || item.kind === 'news')
  );
  // Fresh means published news; a future concert date is not a publication time.
  if (view === 'fresh') selected.sort((a, b) => {
    const at = instant(a.published), bt = instant(b.published);
    if (at === null && bt === null) return a.index - b.index;
    if (at === null) return 1;
    if (bt === null) return -1;
    return bt - at || a.index - b.index;
  });
  if (view === 'events') selected.sort((a, b) => instant(a.start) - instant(b.start) || a.index - b.index);
  return selected;
}

export function initBalticPulse(root, {window: win = globalThis.window, document: doc = root.ownerDocument} = {}) {
  const list = root.querySelector('[data-pulse-list]');
  if (!list) return;
  const cards = [...list.querySelectorAll('[data-pulse-item]')];
  const records = cards.map((node, index) => ({id: String(index), kind: node.dataset.kind, city: node.dataset.city,
    published: node.dataset.published, start: node.dataset.start, end: node.dataset.end, status: node.dataset.status}));
  const buttons = [...root.querySelectorAll('[data-pulse-filter]')];
  const city = root.querySelector('[data-pulse-city]');
  const count = root.querySelector('[data-pulse-count]');
  const empty = root.querySelector('[data-pulse-empty]');
  const upcoming = [...root.querySelectorAll('[data-pulse-upcoming]')];
  let view = 'all', lastOrder = cards.map((_, i) => String(i)).join(',');
  const readLocation = () => {
    const params = new URL(win.location.href).searchParams;
    view = views.has(params.get('pulse')) ? params.get('pulse') : 'all';
    if (city) city.value = [...city.options].some(option => option.value === params.get('pulse_city')) ? params.get('pulse_city') : city.options[0]?.value || '';
  };
  function render() {
    const now = new Date(), selected = selectPulseItems(records, {view, city: city?.value || '', now});
    const visible = new Set(selected.map(item => item.id));
    cards.forEach((card, index) => { card.hidden = !visible.has(String(index)); });
    const ordered = [...selected.map(item => item.id), ...records.filter(item => !visible.has(item.id)).map(item => item.id)];
    const signature = ordered.join(',');
    if (signature !== lastOrder) { ordered.forEach(id => list.append(cards[Number(id)])); lastOrder = signature; }
    buttons.forEach(button => {
      const active = button.dataset.pulseFilter === view;
      if (button.tagName === 'A') {
        if (active) button.setAttribute('aria-current', 'true'); else button.removeAttribute('aria-current');
      } else button.setAttribute('aria-pressed', String(active));
    });
    if (count) count.textContent = `Материалов: ${selected.length}`;
    if (empty) empty.hidden = selected.length > 0;
    upcoming.forEach(node => { node.hidden = !pulseEventVisible({kind: 'event', start: node.dataset.start, end: node.dataset.end, status: node.dataset.status}, now); });
    const asideEmpty = root.querySelector('[data-pulse-aside-empty]');
    if (asideEmpty) asideEmpty.hidden = upcoming.some(node => !node.hidden);
  }
  function remember() {
    const url = new URL(win.location.href);
    if (view === 'all') url.searchParams.delete('pulse'); else url.searchParams.set('pulse', view);
    if (!city?.value || city.value === 'all') url.searchParams.delete('pulse_city'); else url.searchParams.set('pulse_city', city.value);
    try { win.history.replaceState(win.history.state, '', url); } catch { /* Filtering also works in a saved offline file. */ }
  }
  buttons.forEach(button => button.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button > 0) return;
    event.preventDefault();
    view = views.has(button.dataset.pulseFilter) ? button.dataset.pulseFilter : 'all';
    remember(); render();
  }));
  city?.addEventListener('change', () => { remember(); render(); });
  win.addEventListener('popstate', () => { readLocation(); render(); });
  win.addEventListener('focus', render);
  win.addEventListener('pageshow', render);
  doc.addEventListener('visibilitychange', () => { if (!doc.hidden) render(); });
  const timer = win.setInterval(() => { if (!doc.hidden) render(); }, 60000);
  win.addEventListener('pagehide', event => { if (!event.persisted) win.clearInterval(timer); });
  readLocation(); render();
  root.querySelectorAll('[data-pulse-controls]').forEach(control => { control.hidden = false; });
  root.dataset.pulseReady = 'true';
  return {render};
}

if (typeof document !== 'undefined') {
  const root = document.querySelector('[data-baltic-pulse]');
  if (root) initBalticPulse(root);
}
