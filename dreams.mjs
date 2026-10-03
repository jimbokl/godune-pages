// The photographic selection lives in the same Trip as the traveller's plan.
const knownDreams = (trip, catalog) => {
  const known = new Set(catalog.poi.map(place => place.slug));
  return [...new Set((Array.isArray(trip.dreams) ? trip.dreams : []).filter(id => known.has(id)))];
};
const withDreams = (trip, dreams) => {
  const next = {...trip};
  if (dreams.length) next.dreams = dreams;
  else delete next.dreams;
  return next;
};
export function toggleDream(trip, id, catalog) {
  if (!catalog.poi.some(place => place.slug === id)) return trip;
  const dreams = knownDreams(trip, catalog);
  return withDreams(trip, dreams.includes(id) ? dreams.filter(value => value !== id) : [...dreams, id]);
}
export function removeDream(trip, id, catalog) {
  return withDreams(trip, knownDreams(trip, catalog).filter(value => value !== id));
}
export function transferDreams(trip, catalog) {
  const dreams = knownDreams(trip, catalog);
  // A place already present in another day stays in that day.
  const planned = new Set([...(trip.places || []), ...(trip.itinerary?.days || []).flatMap(day => day.places)]);
  const added = dreams.filter(id => !planned.has(id));
  return added.length ? {...trip, places: [...trip.places, ...added]} : trip;
}
const placesText = count => `${count} ${count % 10 === 1 && count % 100 !== 11 ? 'место' : [2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100) ? 'места' : 'мест'}`;

export function initDreams({workshop, catalog, base}) {
  const page = document.querySelector('body[data-atmosphere-page]');
  if (!page || !workshop) return null;
  const $ = selector => page.querySelector(selector);
  const status = $('#dreams-status');
  const announce = text => { if (status) status.textContent = text; };
  const byId = new Map(catalog.poi.map(place => [place.slug, place]));
  let busy = false;
  function render() {
    const state = workshop.getState(), dreams = knownDreams(state, catalog);
    const saved = workshop.isSaved?.() !== false;
    page.querySelectorAll('[data-dream-mood]').forEach(button => { button.disabled = false; });
    page.querySelectorAll('[data-dream-save]').forEach(button => {
      const on = dreams.includes(button.dataset.dreamSave);
      button.setAttribute('aria-pressed', String(on));
      button.textContent = on ? saved ? 'Сохранено' : 'Выбрано в этой вкладке' : 'Хочу сюда';
      button.disabled = busy || !byId.has(button.dataset.dreamSave);
    });
    const count = $('#dreams-count'); if (count) count.textContent = placesText(dreams.length);
    const list = $('#dreams-list');
    if (list) {
      const focused = document.activeElement?.dataset.dreamRemove;
      list.replaceChildren(...dreams.map(id => {
        const li = document.createElement('li'); li.className = 'dreams-saved-item';
        const link = document.createElement('a'); link.href = new URL(`poi/${id}/`, base).href; link.textContent = byId.get(id).name;
        const remove = document.createElement('button'); remove.type = 'button'; remove.dataset.dreamRemove = id;
        remove.textContent = 'Убрать'; remove.setAttribute('aria-label', `Убрать из подборки: ${byId.get(id).name}`); remove.disabled = busy;
        li.append(link, remove); return li;
      }));
      if (focused) ([...list.querySelectorAll('[data-dream-remove]')].find(button => button.dataset.dreamRemove === focused)
        || list.querySelector('a') || $('#dreams-selection-heading'))?.focus({preventScroll: true});
    }
    const empty = $('#dreams-selection-empty'); if (empty) empty.hidden = dreams.length > 0;
    const bridge = $('#dreams-bridge'); if (bridge) bridge.hidden = dreams.length < 5;
    page.querySelectorAll('[data-dream-transfer]').forEach(button => { button.disabled = busy || dreams.length === 0; });
  }
  function mood(id, announceChange = true) {
    let count = 0;
    page.querySelectorAll('[data-dream-mood]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.dreamMood === id)));
    page.querySelectorAll('[data-dream-card]').forEach(card => {
      card.hidden = id !== 'all' && !card.dataset.dreamMoods?.split(/\s+/).includes(id);
      if (!card.hidden) count++;
    });
    const empty = $('#dreams-empty'); if (empty) empty.hidden = count > 0;
    if (announceChange) announce(`В подборке ${count} ${count === 1 ? 'снимок' : count >= 2 && count <= 4 ? 'снимка' : 'снимков'}.`);
  }
  async function click(event) {
    const filter = event.target.closest('[data-dream-mood]');
    if (filter) { mood(filter.dataset.dreamMood); return; }
    const button = event.target.closest('[data-dream-save], [data-dream-remove], [data-dream-transfer]');
    if (!button || button.disabled || busy) return;
    const revision = workshop.getRevision();
    let action, message, added;
    if (button.hasAttribute('data-dream-transfer')) {
      action = current => { const next = transferDreams(current, catalog); added = next.places.length - current.places.length; return next; };
      message = 'Выбранные места добавлены в план. Дни, записи и расходы сохранены. Порядок и переезды Вы сможете уточнить в мастере.';
    } else if (button.hasAttribute('data-dream-remove')) {
      action = current => removeDream(current, button.dataset.dreamRemove, catalog);
      message = 'Место убрано из подборки. Ваш план сохранён.';
    } else {
      const id = button.dataset.dreamSave, selected = workshop.getState().dreams?.includes(id);
      action = current => toggleDream(current, id, catalog);
      message = selected ? 'Место убрано из подборки. Ваш план сохранён.' : 'Место сохранено в подборке. Добавить его в план можно отдельно.';
    }
    busy = true; render();
    try {
      const result = await workshop.setState(action, message, {expectedRevision: revision});
      announce(result.conflict ? 'Подборка изменилась в другой вкладке. Показан свежий выбор; повторите действие.'
        : result.saved ? added === 0 ? 'Все выбранные места уже есть в Вашем плане. Дни и подборка сохранены.' : message
          : 'Выбор останется в этой вкладке. Браузер не разрешил сохранение. Сохраните файл поездки, чтобы взять подборку с собой.');
    } catch {
      announce('Сохранить выбор не удалось. Проверьте подборку и попробуйте ещё раз.');
    } finally {
      busy = false; render();
      if (button.isConnected) button.focus({preventScroll: true});
      else ($('#dreams-list [data-dream-remove]') || $('#dreams-selection-heading'))?.focus({preventScroll: true});
    }
  }
  page.addEventListener('click', click);
  window.addEventListener('godune:trip-change', render);
  mood('all', false); render(); page.dataset.dreamsReady = 'true';
  return {render, destroy() { page.removeEventListener('click', click); window.removeEventListener('godune:trip-change', render); delete page.dataset.dreamsReady; }};
}
