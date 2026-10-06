import {loadWalkProgress} from './walk.mjs?v=3';
import {TRIP_KEY, emptyTrip as empty, cleanTrip} from './trip-state.mjs?v=27';
import {initTripSharing} from './trip-link.mjs?v=40';
import {createTripMemory, removeLocalMemory} from './trip-memory.mjs?v=22';
import {initMemoryControls} from './trip-memory-ui.mjs?v=6';
import {createPlanningProgress} from './planning-progress.mjs?v=2';
import {reorderTripPlace, addRouteStops, initTripReorder} from './trip-order.mjs?v=23';
import {initTripSchedule} from './trip-schedule-ui.mjs?v=38';
import {initTripDays} from './trip-days-ui.mjs?v=30';
import {initDayWorkspace} from './day-workspace.mjs?v=12';
import {addTripStarter} from './trip-starters.mjs?v=22';
import {tripHasPlaces,tripHasDraft,journeyDays} from './trip-days-state.mjs?v=23';
import {initTripCancellation} from './trip-cancellation-ui.mjs?v=16';
import {initTripReplacement} from './trip-replacement-ui.mjs?v=19';
import {initTripRail} from './trip-rail-ui.mjs?v=15';
export {TRIP_KEY, cleanTrip} from './trip-state.mjs?v=27';

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

// One choice produces a usable draft; repeated choices never remove saved work.
export function startTripRoute(state, slug, catalog) {
  if (!catalog.routes.some(route => route.slug === slug)) return cleanTrip(state, catalog);
  const next = addRouteStops(state, slug, catalog);
  return cleanTrip({...next, routes: [...next.routes, slug]}, catalog);
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
  const yieldTask = () => globalThis.scheduler?.yield?.() || new Promise(resolve => setTimeout(resolve, 0));
  let finishInitialization;
  const initialized = new Promise(resolve => { finishInitialization = resolve; });
  const $ = selector => document.querySelector(selector);
  const url = path => new URL(path, base).href;
  let starterEmpty;
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
  await yieldTask();
  const schedule = initTripSchedule({mount:$('#my-trip'),read:()=>state,commit,base,catalog});
  await yieldTask();
  const rail = initTripRail({mount:$('#my-trip'),read:()=>state,commit,base,catalog});
  await yieldTask();
  const days = initTripDays({mount:$('#my-trip'),read:()=>state,commit,base,catalog});
  await yieldTask();
  const cancellation = initTripCancellation({read:()=>state,commit,catalog});
  await yieldTask();
  const replacement = initTripReplacement({mount:$('#my-trip'),read:()=>state,commit,base,catalog});
  const workspace=initDayWorkspace({mount:$('#my-trip'),read:()=>state,base,catalog});
  await yieldTask();
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
        copy.append(replacement.control(id,item.name));
        const move=days.moveControl(id,item.name);if(move)copy.append(move);
      }
      controls.append(button('×', `Убрать: ${item.name}`, 'remove', kind, id)); li.append(controls); return li;
    }));
    $(kind === 'places' ? '#my-places-empty' : '#my-routes-empty').hidden = state[kind].length > 0;
  }
  function refresh() {
    const hasTrip = tripHasPlaces(state);
    const draft = $('#trip-draft'); if (draft) draft.hidden = !hasTrip && !state.itinerary;
    const starters = $('#trip-starters');
    if (starters && starterEmpty !== !hasTrip) { starters.open = !hasTrip; starterEmpty = !hasTrip; }
    const title = $('#my-trip-title'); if (title) title.textContent = hasTrip ? 'Ваша Балтика складывается' : 'С чего начнём?';
    const count = $('#trip-point-count'); if (count) count.textContent = `${state.places.length} ${state.places.length % 10 === 1 && state.places.length % 100 !== 11 ? 'точка' : [2,3,4].includes(state.places.length % 10) && ![12,13,14].includes(state.places.length % 100) ? 'точки' : 'точек'}`;
    const savedWalks = $('#trip-saved-walks'); if (savedWalks) savedWalks.hidden = state.routes.length === 0;
    const orderNote = $('#trip-order-note'); if (orderNote) orderNote.hidden = state.places.length < 2;
    document.querySelectorAll('[data-start-route]').forEach(node => {
      const route = catalog.routes.find(item => item.slug === node.dataset.startRoute);
      const done = state.routes.includes(route?.slug) && route?.stops.every(stop => state.places.includes(stop.poi));
      node.disabled = !!done;
      node.textContent = done ? 'Уже в маршруте ✓' : hasTrip ? 'Добавить прогулку →' : 'Выбрать прогулку →';
    });
    schedule.render();
    rail.render();
    days.render();
    replacement.render();
    cancellation.render();
    workspace.render();
    window.dispatchEvent(new CustomEvent('godune:trip-change'));
    document.querySelectorAll('[data-save-place], [data-save-route]').forEach(node => {
      const kind = node.hasAttribute('data-save-place') ? 'places' : 'routes';
      const id = kind === 'places' ? node.dataset.savePlace : node.dataset.saveRoute, on = state[kind].includes(id);
      node.setAttribute('aria-pressed', String(on));
      node.textContent = on ? (kind === 'places' ? 'В моём маршруте ✓' : 'Маршрут сохранён ✓') : (kind === 'places' ? (node.id === 'discovery-save' ? 'Добавить в маршрут +' : 'В мой маршрут +') : 'Сохранить маршрут +');
    });
    const month = $('#trip-month'); if (month) month.value = state.month === null ? '' : String(state.month);
    const date = $('#trip-date'); if (date) date.value = state.date || '';
    const share = $('#trip-share'); if (share) share.disabled = !tripHasDraft(state) && !state.dreams?.length;
    const notice = $('#trip-storage'); if (notice) notice.hidden = available;
    document.querySelectorAll('[data-my-trip]').forEach(link => {
      const count=journeyDays(state).reduce((sum,day)=>sum+day.places.length,0);
      link.textContent = 'Мой маршрут' + (count || state.routes.length ? ` · ${count || state.routes.length}` : '');
    });
    renderList('places'); renderList('routes');
    const emptyDay = $('#my-places-empty');
    if(state.itinerary && !state.places.length && emptyDay)emptyDay.textContent='Этот день ещё свободен. Добавьте места или выберите готовую прогулку.';
    document.querySelectorAll('[data-route-stops]').forEach(node => {
      const route = catalog.routes.find(row => row.slug === node.dataset.routeStops);
      const done = route?.stops.every(stop => state.places.includes(stop.poi));
      node.disabled = !route || done;
      node.textContent = done ? 'Остановки добавлены ✓' : 'Добавить остановки в мой маршрут';
    });
    const summary = $('#my-trip-summary');
    if (summary) summary.textContent = hasTrip ? `${available ? 'Ваш выбор сохранён.' : 'Ваш выбор останется в этой вкладке.'} Добавьте остановку, поменяйте порядок или разложите день по времени.` : 'Выберите прогулку — её остановки появятся в вашем маршруте. Или начните с места, к которому хочется вернуться.';
  }
  async function commit(next, message, options = {}) {
    // Controls installed in earlier tasks may receive input while later panels
    // are still being prepared. Keep that edit until every renderer exists.
    await initialized;
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
    const starter = event.target.closest('[data-start-route]');
    if (starter?.dataset.startRoute && !starter.disabled) {
      await commit(current => startTripRoute(current, starter.dataset.startRoute, catalog), 'Прогулка и её остановки сохранены. Ваш маршрут готов к изменениям.');
      const starters = $('#trip-starters'); if (starters) starters.open = false;
      const title = $('#my-trip-title'); title?.focus({preventScroll:true});
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) title?.scrollIntoView({block:'start',behavior:'smooth'});
      return;
    }
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
      if(kind==='places' && state.places.includes(id)){await cancellation.open(id);return;}
      await commit(current => toggleTripItem(current, kind, id, catalog), 'Ваш маршрут обновлён.'); return;
    }
    const control = event.target.closest('[data-trip-action]'); if (!control) return;
    const {tripKind: kind, tripId: id, tripAction: action} = control.dataset;
    if(kind==='places' && action==='remove'){await cancellation.open(id);return;}
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
  const workshop = {
    progress: createPlanningProgress(storage),
    addStarter: id => commit(current => addTripStarter(current,id,catalog),'Готовые дни добавлены в поездку.'),getState: () => structuredClone(state), isSaved: () => available, setState: commit,
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
  finishInitialization();
  return workshop;
}
