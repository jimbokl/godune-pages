import {cleanTrip} from './trip-state.mjs?v=11';

// Apply an intent to the latest draft, rather than saving the order seen at drag start.
export function reorderTripPlace(state, id, anchor, side, catalog) {
  const next = cleanTrip(state, catalog);
  if (id === anchor || !['before', 'after'].includes(side) || !next.places.includes(id) || !next.places.includes(anchor)) return next;
  next.places = next.places.filter(value => value !== id);
  next.places.splice(next.places.indexOf(anchor) + (side === 'after' ? 1 : 0), 0, id);
  return next;
}

export function addRouteStops(state, slug, catalog) {
  const next = cleanTrip(state, catalog), route = catalog.routes.find(row => row.slug === slug);
  if (!route) return next;
  return cleanTrip({...next, places: [...next.places, ...route.stops.map(stop => stop.poi)]}, catalog);
}

export function initTripReorder(list, {move, announce}) {
  if (!list) return {cancel() {}};
  let gesture = null, frame = null, suppressClick = false;
  const rows = () => [...list.children].filter(row => row.dataset.tripPlace);
  const handleFor = id => [...list.querySelectorAll('[data-trip-reorder]')].find(node => node.dataset.tripReorder === id);
  function cleanMarks() {
    list.querySelectorAll('[data-drop-side]').forEach(row => delete row.dataset.dropSide);
  }
  function cancel(message) {
    if (!gesture) return;
    const before = gesture; gesture = null;
    cancelAnimationFrame(frame); frame = null;
    cleanMarks(); delete list.dataset.reordering;
    before.row.classList.remove('is-reordering'); before.handle.setAttribute('aria-pressed', 'false');
    if (before.pointer !== undefined && before.handle.hasPointerCapture?.(before.pointer)) before.handle.releasePointerCapture(before.pointer);
    if (message) announce(message);
  }
  function mark(anchor, side) {
    const target = rows().find(row => row.dataset.tripPlace === anchor);
    if (!target || anchor === gesture.id) return;
    const changed = gesture.anchor !== anchor || gesture.side !== side;
    cleanMarks(); target.dataset.dropSide = side;
    gesture.anchor = anchor; gesture.side = side;
    if (changed && gesture.keyboard) announce(`${side === 'before' ? 'Перед' : 'После'}: ${target.querySelector('a').textContent}. Нажмите Enter, чтобы поставить здесь.`);
  }
  function start() {
    gesture.started = true; list.dataset.reordering = 'true';
    gesture.row.classList.add('is-reordering'); gesture.handle.setAttribute('aria-pressed', 'true');
  }
  function targetAt(y) {
    const other = rows().filter(row => row.dataset.tripPlace !== gesture.id);
    if (!other.length) return;
    // Whitespace between rows still has a clear insertion point.
    const target = other.find(row => y < row.getBoundingClientRect().bottom) || other.at(-1);
    const rect = target.getBoundingClientRect();
    mark(target.dataset.tripPlace, y < rect.top + rect.height / 2 ? 'before' : 'after');
  }
  function scrollFrame() {
    if (!gesture || gesture.keyboard || !gesture.started) return;
    const y = gesture.y, height = window.innerHeight;
    const amount = y < 70 ? -Math.min(14, (70 - y) / 4) : y > height - 70 ? Math.min(14, (y - height + 70) / 4) : 0;
    if (amount) { window.scrollBy(0, amount); targetAt(y); }
    frame = requestAnimationFrame(scrollFrame);
  }
  async function finish() {
    if (!gesture) return;
    const {id, anchor, side} = gesture;
    cancel();
    if (anchor) await move(id, anchor, side);
    handleFor(id)?.focus({preventScroll: true});
  }
  list.addEventListener('pointerdown', event => {
    const handle = event.target.closest('[data-trip-reorder]');
    if (!handle || !event.isPrimary || event.button !== 0 || handle.disabled) return;
    cancel();
    gesture = {id: handle.dataset.tripReorder, row: handle.closest('li'), handle, pointer: event.pointerId, x: event.clientX, y: event.clientY, initialY: event.clientY};
    handle.setPointerCapture(event.pointerId);
  });
  list.addEventListener('pointermove', event => {
    if (!gesture || gesture.pointer !== event.pointerId) return;
    gesture.y = event.clientY;
    if (!gesture.started && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.initialY) < 6) return;
    if (!gesture.started) { start(); frame = requestAnimationFrame(scrollFrame); }
    event.preventDefault(); targetAt(event.clientY);
  });
  list.addEventListener('pointerup', event => {
    if (!gesture || gesture.pointer !== event.pointerId) return;
    if (!gesture.started) { cancel(); return; }
    // Releasing outside the list cancels instead of unexpectedly moving to an edge.
    const rect = list.getBoundingClientRect();
    suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) cancel('Перестановка отменена.');
    else finish().catch(() => announce('Не удалось переставить точку. Ваш черновик на месте.'));
  });
  list.addEventListener('pointercancel', () => cancel('Перестановка отменена.'));
  list.addEventListener('lostpointercapture', () => { if (gesture && !gesture.keyboard) cancel('Перестановка отменена.'); });
  list.addEventListener('click', event => {
    const handle = event.target.closest('[data-trip-reorder]'); if (!handle) return;
    if (suppressClick && event.detail > 0) { event.preventDefault(); return; }
    if (gesture?.keyboard && gesture.id === handle.dataset.tripReorder) { finish().catch(() => {}); return; }
    cancel();
    gesture = {id: handle.dataset.tripReorder, row: handle.closest('li'), handle, keyboard: true}; start();
    announce('Выберите место стрелками вверх и вниз. Enter — поставить, Escape — отменить.');
  });
  list.addEventListener('keydown', event => {
    if (!gesture?.keyboard || !event.target.closest('[data-trip-reorder]')) return;
    if (event.key === 'Escape') { event.preventDefault(); cancel('Перестановка отменена.'); }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); finish().catch(() => {}); }
    else if (['ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      const all = rows().map(row => row.dataset.tripPlace), source = all.indexOf(gesture.id);
      const previous = gesture.anchor ? all.indexOf(gesture.anchor) : source;
      const target = Math.max(0, Math.min(all.length - 1, previous + (event.key === 'ArrowUp' ? -1 : 1)));
      if (target === source) { cleanMarks(); gesture.anchor = null; }
      else mark(all[target], target < source ? 'before' : 'after');
    }
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && gesture) { event.preventDefault(); cancel('Перестановка отменена.'); } });
  window.addEventListener('blur', () => cancel());
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });
  return {cancel};
}
