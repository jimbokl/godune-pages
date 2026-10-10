const STATUSES = new Set(['announced', 'bidding', 'awarded', 'contracted', 'completed', 'cancelled']);
const KINDS = new Set(['construction', 'works', 'services', 'supply', 'supplies', 'design', 'repair', 'other']);
const FILTER_KEYS = ['q', 'kind', 'status', 'infrastructure', 'min', 'max', 'from', 'to'];

function field(record, ...names) {
  for (const name of names) {
    const value = record?.[name] ?? record?.dataset?.[name];
    if (value !== undefined && value !== null) return value;
  }
  return '';
}

function canonicalStatus(value) {
  const status = String(value ?? '').trim().toLocaleLowerCase('en');
  if (status === 'open') return 'bidding';
  return STATUSES.has(status) ? status : null;
}

function validIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function rublesToMinor(value) {
  if (value === '' || value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const [rubles,kopecks=''] = text.split('.');
  const amount = BigInt(rubles)*100n+BigInt(kopecks.padEnd(2,'0'));
  return amount <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(amount) : null;
}

function priceMinor(tender) {
  const canonical = tender?.price_rule?.amount_minor ?? field(tender,'priceMinor');
  if (canonical !== '') {
    const text=String(canonical);
    const amount=/^\d+$/.test(text)?Number(text):NaN;
    return Number.isSafeInteger(amount) && amount>=0 ? amount : null;
  }
  return rublesToMinor(field(tender,'price','price_rub'));
}

function deadlineDate(tender) {
  if (Array.isArray(tender?.calendar_rules)) return String(tender.calendar_rules.find(c=>c.kind==='submission_deadline')?.date??'');
  return String(field(tender,'deadline')??'');
}

function safeSlug(value) {
  const text = String(value ?? '').trim().toLocaleLowerCase('ru');
  return /^[\p{L}\p{N}_-]{1,80}$/u.test(text) ? text : '';
}

function safeInfrastructureReference(value) {
  const text = String(value ?? '').trim().toLocaleLowerCase('ru');
  return /^[\p{L}\p{N}_-]+(?::[\p{L}\p{N}_-]+)?$/u.test(text) && text.length <= 120 ? text : '';
}

/** Parse a URL query into a fixed, safe filter object. Invalid bounds are ignored. */
export function validateFilters(params) {
  const get = key => params instanceof URLSearchParams ? params.get(key) : '';
  let q = String(get('q') ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  q = [...q].slice(0, 200).join('');
  const requestedKind = safeSlug(get('kind'));
  const kind = KINDS.has(requestedKind) ? requestedKind : '';
  const requestedStatus = String(get('status') ?? '').trim().toLocaleLowerCase('en');
  const status = STATUSES.has(requestedStatus) ? requestedStatus : '';
  const infrastructure = safeInfrastructureReference(get('infrastructure'));
  const minMinor = rublesToMinor(get('min')), maxMinor = rublesToMinor(get('max'));
  let min = minMinor === null ? null : minMinor/100;
  let max = maxMinor === null ? null : maxMinor/100;
  if (min !== null && max !== null && min > max) [min, max] = [null, null];
  let from = String(get('from') ?? '');
  let to = String(get('to') ?? '');
  if (!validIsoDate(from)) from = '';
  if (!validIsoDate(to)) to = '';
  if (from && to && from > to) [from, to] = ['', ''];
  return {q, kind, status, infrastructure, min, max, from, to};
}

/** Return the factual registry status and whether a bidding deadline has passed. */
export function tenderStatus(tender, today) {
  const status = canonicalStatus(field(tender, 'status'));
  const deadline = deadlineDate(tender);
  const deadlinePassed = status === 'bidding' && validIsoDate(deadline) && validIsoDate(today) && today > deadline;
  return {status, deadlinePassed};
}

function normalizedFilters(filters = {}) {
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = filters[key];
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  return validateFilters(params);
}

function tokens(value) {
  if (Array.isArray(value)) return value.map(v => String(v).trim().toLocaleLowerCase('ru')).filter(Boolean);
  return String(value ?? '').split(/[\s,;|]+/).map(v => v.trim().toLocaleLowerCase('ru')).filter(Boolean);
}

/** Match a registry object or an SSR card's dataset against validated filters. */
export function matchesTender(tender, filters = {}) {
  const f = normalizedFilters(filters);
  const status = canonicalStatus(field(tender, 'status'));
  const kind = String(field(tender, 'kind') ?? '').trim().toLocaleLowerCase('ru');
  const infrastructure = tokens(field(tender, 'infrastructure_id', 'infrastructure'));
  const price = priceMinor(tender);
  const deadline = deadlineDate(tender);
  const searchValue = field(tender, 'search', 'title', 'name');
  const searchText = [searchValue, field(tender, 'description'), field(tender, 'registry_number'), field(tender, 'id')]
    .flatMap(tokens).join(' ').toLocaleLowerCase('ru');

  if (f.q && !searchText.includes(f.q.toLocaleLowerCase('ru'))) return false;
  if (f.kind && kind !== f.kind) return false;
  if (f.status && status !== f.status) return false;
  if (f.infrastructure && !infrastructure.includes(f.infrastructure)) return false;
  if ((f.min !== null || f.max !== null) && price === null) return false;
  if (f.min !== null && price < rublesToMinor(f.min)) return false;
  if (f.max !== null && price > rublesToMinor(f.max)) return false;
  if ((f.from || f.to) && !validIsoDate(deadline)) return false;
  if (f.from && deadline < f.from) return false;
  if (f.to && deadline > f.to) return false;
  return true;
}

function currentDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Kaliningrad', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function queryFilters(search) {
  return validateFilters(new URLSearchParams(search));
}

function syncForm(form, filters) {
  for (const key of FILTER_KEYS) {
    const control = form.elements.namedItem(key);
    if (control) control.value = filters[key] ?? '';
  }
  if (['infrastructure','min','max','from','to'].some(key => filters[key] !== '' && filters[key] !== null)) {
    const advanced = form.querySelector('[data-tender-advanced]');
    if (advanced) advanced.open = true;
  }
}

function filtersFromForm(form) {
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const control = form.elements.namedItem(key);
    if (control && control.value !== '') params.set(key, control.value);
  }
  return validateFilters(params);
}

function writeUrl(filters) {
  const url = new URL(globalThis.location.href);
  for (const key of FILTER_KEYS) url.searchParams.delete(key);
  for (const key of FILTER_KEYS) {
    const value = filters[key];
    if (value !== '' && value !== null) url.searchParams.set(key, String(value));
  }
  globalThis.history.replaceState(globalThis.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

/** Enable filtering for server-rendered cards without changing the no-JS view. */
export function mountProjectTenders(root = globalThis.document) {
  if (!root?.querySelector || root.dataset?.tendersMounted === 'true') return false;
  const form = root.querySelector('[data-tender-filters]');
  const cards = [...root.querySelectorAll('[data-tender-card]')];
  if (!form || !cards.length) return false;
  const count = root.querySelector('[data-tender-count]');
  const empty = root.querySelector('[data-tender-empty]');
  const reset = root.querySelector('[data-tender-reset]');
  let filters = queryFilters(globalThis.location?.search ?? '');

  const redraw = (updateUrl = true) => {
    filters = filtersFromForm(form);
    let visible = 0;
    for (const card of cards) {
      const matched = matchesTender(card, filters);
      card.hidden = !matched;
      if (matched) visible++;
      const badge = card.querySelector('[data-tender-status]');
      if (badge) {
        const state = tenderStatus(card, currentDate());
        if (state.deadlinePassed) badge.textContent = 'Приём заявок завершён · результат не установлен';
      }
    }
    if (count) count.textContent = `Показано ${visible} из ${cards.length}`;
    if (empty) empty.hidden = visible !== 0;
    if (updateUrl) writeUrl(filters);
  };

  syncForm(form, filters);
  if (FILTER_KEYS.some(key => filters[key])) { const drawer = form.closest('.dossier-filters'); if (drawer) drawer.open = true; }
  form.addEventListener('input', () => redraw());
  form.addEventListener('change', () => redraw());
  form.addEventListener('submit', event => { event.preventDefault(); redraw(); });
  reset?.addEventListener('click', event => {
    event.preventDefault();
    for (const key of FILTER_KEYS) {
      const control = form.elements.namedItem(key);
      if (control) control.value = '';
    }
    redraw();
  });
  globalThis.addEventListener?.('popstate', () => {
    filters = queryFilters(globalThis.location?.search ?? '');
    syncForm(form, filters);
    redraw(false);
  });
  if (root.dataset) root.dataset.tendersMounted = 'true';
  form.hidden = false;
  redraw(false);
  return true;
}

if (globalThis.document) mountProjectTenders(globalThis.document);
