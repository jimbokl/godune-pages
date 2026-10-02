import {loadWalkProgress} from './walk.mjs?v=2';
import {TRIP_KEY, emptyTrip as empty, cleanTrip} from './trip-state.mjs?v=2';
import {initTripSharing} from './trip-link.mjs?v=4';
import {createTripMemory, removeLocalMemory} from './trip-memory.mjs?v=1';
import {initMemoryControls} from './trip-memory-ui.mjs?v=1';
import {reorderTripPlace, addRouteStops, initTripReorder} from './trip-order.mjs?v=1';
import {initTripSchedule} from './trip-schedule-ui.mjs?v=1';
export {TRIP_KEY, cleanTrip} from './trip-state.mjs?v=2';

export function loadTrip(storage, catalog) {
  try {
    const raw = storage.getItem(TRIP_KEY);
    if (raw !== null) {
      try { return {state: cleanTrip(JSON.parse(raw), catalog), available: true}; }
      catch { return {state: empty(), available: true}; }
    }
    // Read the earlier saved-route list once. Future writes use a single record.
    let routes = [];
    try { routes = JSON.parse(storage.getItem('godune-routes') || '[]'); } catch { /* damaged legacy record */ }
    return {state: cleanTrip({...empty(), routes}, catalog), available: true};
  } catch { return {state: empty(), available: false}; }
}

export function saveTrip(storage, state, catalog) {
  try { storage.setItem(TRIP_KEY, JSON.stringify(cleanTrip(state, catalog))); return true; }
  catch { return false; }
}

export function toggleTripItem(state, kind, id, catalog) {
  const next = cleanTrip(state, catalog);
  if (!['places', 'routes'].includes(kind)) return next;
  const rows = kind === 'places' ? catalog.poi : catalog.routes;
  if (!rows.some(row => row.slug === id)) return next;
  next[kind] = next[kind].includes(id) ? next[kind].filter(value => value !== id) : [...next[kind], id];
  return next;
}

export function moveTripPlace(state, id, direction, catalog) {
  const next = cleanTrip(state, catalog), index = next.places.indexOf(id), target = index + direction;
  if (index < 0 || ![-1, 1].includes(direction) || target < 0 || target >= next.places.length) return next;
  [next.places[index], next.places[target]] = [next.places[target], next.places[index]];
  return next;
}

export function kaliningradDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone: 'Europe/Kaliningrad', year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(date);
  const part = type => parts.find(value => value.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function dailyDiscovery(items, catalog, date = new Date()) {
  const choices = items.filter(item => catalog.poi.some(place => place.slug === item.poi));
  if (!choices.length) return null;
  const day = Math.floor(Date.parse(kaliningradDay(date) + 'T00:00:00Z') / 86400000);
  return choices[((day % choices.length) + choices.length) % choices.length];
}

export async function initWorkshop(catalog, base) {
  const $ = selector => document.querySelector(selector);
  const url = path => new URL(path, base).href;
  let storage;
  try { storage = window.localStorage; } catch { storage = null; }
  const restored = loadTrip(storage, catalog);
  const memory = createTripMemory(catalog, restored, storage);
  await memory.ready;
  let state = memory.get(), available = memory.saved, writes = 0;
  const status = document.createElement('p');
  status.className = 'save-feedback'; status.setAttribute('role', 'status'); status.hidden = true;
  document.body.append(status);
  let timer;
  const announce = text => {
    status.textContent = text; status.hidden = false; clearTimeout(timer);
    timer = setTimeout(() => { status.hidden = true; }, 5000);
  };
  const button = (text, label, action, kind, id) => {
    const node = document.createElement('button'); node.type = 'button'; node.textContent = text;
    node.setAttribute('aria-label', label); node.dataset.tripAction = action; node.dataset.tripKind = kind; node.dataset.tripId = id;
    return node;
  };
  const reorder = initTripReorder($('#my-places'), {announce, move: (id, anchor, side) =>
    commit(current => reorderTripPlace(current, id, anchor, side, catalog), 'Порядок точек сохранён.')});
  const schedule = initTripSchedule({mount:$('#my-trip'),read:()=>state,commit,base,catalog});
  const routeSave = document.body.dataset.route && document.querySelector('[data-save-route]');
  if (routeSave) {
    const add = document.createElement('button'); add.type = 'button'; add.className = 'save-item';
    add.dataset.routeStops = document.body.dataset.route; routeSave.parentElement.append(add);
  }
  function renderList(kind) {
    const list = $(kind === 'places' ? '#my-places' : '#my-routes');
    if (!list) return;
    const rows = kind === 'places' ? catalog.poi : catalog.routes;
    if (kind === 'places') reorder.cancel();
    list.replaceChildren(...state[kind].map((id, index) => {
      const item = rows.find(row => row.slug === id), li = document.createElement('li'), copy = document.createElement('div');
      const link = document.createElement('a'); link.href = url(`${kind === 'places' ? 'poi' : 'routes'}/${id}/`); link.textContent = item.name;
      if (kind === 'places') {
        li.dataset.tripPlace = id; copy.className = 'trip-place-copy';
        const number = document.createElement('span'); number.className = 'trip-point-number';
        number.textContent = String(index + 1).padStart(2, '0'); number.setAttribute('aria-hidden', 'true'); copy.append(number);
      }
      const meta = document.createElement('small');
      if (kind === 'routes') {
        const progress = loadWalkProgress(storage, id, item.stops.map(stop => stop.poi));
        meta.textContent = `${item.area_name} · ≈ ${item.minutes} минут` + (progress.completed.length ? ` · пройдено ${progress.completed.length} из ${item.stops.length}` : '');
      } else meta.textContent = `${item.area_name} · ${item.category_name}`;
      copy.append(link, meta); li.append(copy);
      if (kind === 'routes') {
        const add = document.createElement('button'); add.type = 'button'; add.className = 'save-item trip-add-stops';
        add.dataset.routeStops = id; copy.append(add);
      }
      const controls = document.createElement('div'); controls.className = 'trip-item-actions';
      if (kind === 'places') {
        const drag = document.createElement('button'); drag.type = 'button'; drag.className = 'trip-reorder-handle';
        drag.dataset.tripReorder = id; drag.setAttribute('aria-label', `Переставить: ${item.name}`);
        drag.setAttribute('aria-pressed', 'false'); drag.setAttribute('aria-describedby', 'trip-order-note');
        drag.title = 'Потяните за ручку или нажмите, чтобы выбрать место стрелками'; drag.textContent = '⠿';
        const up = button('↑', `Поднять: ${item.name}`, 'up', kind, id);
        const down = button('↓', `Опустить: ${item.name}`, 'down', kind, id);
        up.disabled = index === 0; down.disabled = index === state.places.length - 1;
        controls.append(drag, up, down);
      }
      controls.append(button('×', `Убрать: ${item.name}`, 'remove', kind, id)); li.append(controls); return li;
    }));
    $(kind === 'places' ? '#my-places-empty' : '#my-routes-empty').hidden = state[kind].length > 0;
  }
  function refresh() {
    schedule.render();
    window.dispatchEvent(new CustomEvent('godune:trip-change'));
    document.querySelectorAll('[data-save-place], [data-save-route]').forEach(node => {
      const kind = node.hasAttribute('data-save-place') ? 'places' : 'routes';
      const id = kind === 'places' ? node.dataset.savePlace : node.dataset.saveRoute, on = state[kind].includes(id);
      node.setAttribute('aria-pressed', String(on));
      node.textContent = on ? (kind === 'places' ? 'В моём маршруте ✓' : 'Маршрут сохранён ✓') : (kind === 'places' ? 'В мой маршрут +' : 'Сохранить маршрут +');
    });
    const month = $('#trip-month'); if (month) month.value = state.month === null ? '' : String(state.month);
    const date = $('#trip-date'); if (date) date.value = state.date || '';
    const share = $('#trip-share'); if (share) share.disabled = !state.places.length && !state.routes.length;
    const notice = $('#trip-storage'); if (notice) notice.hidden = available;
    document.querySelectorAll('[data-my-trip]').forEach(link => {
      link.textContent = 'Мой маршрут' + (state.places.length + state.routes.length ? ` · ${state.places.length + state.routes.length}` : '');
    });
    renderList('places'); renderList('routes');
    document.querySelectorAll('[data-route-stops]').forEach(node => {
      const route = catalog.routes.find(row => row.slug === node.dataset.routeStops);
      const done = route?.stops.every(stop => state.places.includes(stop.poi));
      node.disabled = !route || done;
      node.textContent = done ? 'Остановки добавлены ✓' : 'Добавить остановки в мой маршрут';
    });
    const summary = $('#my-trip-summary');
    if (summary) summary.textContent = state.places.length || state.routes.length ? 'Ваш черновик на месте. Продолжим?' : 'Начните с одного места. Остальное сложится по дороге.';
  }
  async function commit(next, message, options = {}) {
    writes++; document.documentElement.dataset.tripWriting = 'true';
    try {
      const result = await memory.change(current => typeof next === 'function' ? next(current) : next, {...options, label: message});
      announce(result.conflict ? 'Черновик уже изменился. Показан свежий выбор.' : result.saved ? message : 'Выбор останется в этой вкладке. Браузер не разрешил сохранение.');
      return result;
    } finally {
      writes--; document.documentElement.dataset.tripWriting = String(writes > 0);
    }
  }
  memory.subscribe(result => {
    state = result.state; available = result.saved;
    if (result.cleared) window.dispatchEvent(new Event('godune:memory-cleared'));
    refresh();
  });
  document.addEventListener('click', async event => {
    const add = event.target.closest('[data-route-stops]');
    if (add && !add.disabled) {
      const id = add.dataset.routeStops;
      await commit(current => addRouteStops(current, id, catalog), 'Остановки добавлены. Уже выбранные точки остались на своих местах.');
      ([...document.querySelectorAll('[data-route-stops]')].find(node => node.dataset.routeStops === id && !node.disabled)
        || $('#my-places a') || routeSave)?.focus({preventScroll: true}); return;
    }
    const save = event.target.closest('[data-save-place], [data-save-route]');
    if (save) {
      const kind = save.hasAttribute('data-save-place') ? 'places' : 'routes', id = kind === 'places' ? save.dataset.savePlace : save.dataset.saveRoute;
      await commit(current => toggleTripItem(current, kind, id, catalog), 'Ваш маршрут обновлён.'); return;
    }
    const control = event.target.closest('[data-trip-action]'); if (!control) return;
    const {tripKind: kind, tripId: id, tripAction: action} = control.dataset;
    await commit(current => action === 'remove' ? {...current, [kind]: current[kind].filter(value => value !== id)} : moveTripPlace(current, id, action === 'up' ? -1 : 1, catalog), action === 'remove' ? 'Убрано из «Моего маршрута».' : 'Порядок точек изменён.');
    const remaining = [...document.querySelectorAll('[data-trip-action]')];
    const focus = remaining.find(node => node.dataset.tripId === id && node.dataset.tripAction === action && !node.disabled)
      || remaining.find(node => node.dataset.tripId === id && !node.disabled)
      || remaining.find(node => node.dataset.tripKind === kind && !node.disabled) || $('#trip-month');
    focus?.focus({preventScroll: true});
  });
  $('#trip-month')?.addEventListener('change', event => {
    const month = event.target.value ? Number(event.target.value) : null;
    commit(current => ({...current, month, date: month === current.month ? current.date : null}), 'Месяц поездки сохранён.');
  });
  $('#trip-date')?.addEventListener('change', event => { const date = event.target.value || null; commit(current => ({...current, date}), 'Дата поездки сохранена.'); });
  window.addEventListener('storage', event => {
    if (event.key === TRIP_KEY || event.key === 'godune-memory-clock' || event.key === null) memory.sync();
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) memory.sync(); });
  refresh();
  const workshop = {getState: () => structuredClone(state), isSaved: () => available, setState: commit,
    getRevision: () => memory.revision, history: () => memory.history(), memoryMode: () => memory.mode,
    async clearMemory() {
      const result = await memory.clear();
      const localRemoved = result.saved && removeLocalMemory(storage);
      window.dispatchEvent(new Event('godune:memory-cleared'));
      refresh();
      return {...result, localRemoved};
    },
    setFilters: (area, minutes) => commit(current => ({...current, filters: {area, minutes}}), 'Настройки прогулки сохранены.'), showDiscovery(items) {
    let lastDay;
    function update() {
      const day = kaliningradDay(); if (day === lastDay) return; lastDay = day;
      const selection = dailyDiscovery(items, catalog); if (!selection || !$('#discovery-name')) return;
      const place = catalog.poi.find(item => item.slug === selection.poi);
      $('#discovery-name').textContent = place.name; $('#discovery-name').href = url(`poi/${place.slug}/`);
      $('#discovery-note').textContent = selection.note;
      $('#discovery-area').textContent = place.area_name;
      $('#discovery-save').dataset.savePlace = place.slug;
      refresh();
    }
    update(); document.addEventListener('visibilitychange', () => { if (!document.hidden) update(); });
    // Re-evaluate on an open page, including a tab left open past midnight.
    setInterval(update, 60000);
  }};
  initTripSharing(catalog, base, workshop);
  initMemoryControls(catalog, base, workshop);
  return workshop;
}
