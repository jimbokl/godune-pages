// Undated choices are bookmarks, not booked visits or copied price facts.
const prefixFor = dataset => `godune:service-favorites:${dataset}:v1:`;
export const serviceFavoriteKey = (dataset, id) => prefixFor(dataset) + encodeURIComponent(id);
const localHref = href => {
  if (typeof href !== 'string' || !href.startsWith('/') || href.startsWith('//') || href.includes('\\')) return false;
  try { return new URL(href, 'https://godune.invalid').origin === 'https://godune.invalid'; } catch { return false; }
};
function validRecord(record) {
  return record && record.version === 1 && typeof record.id === 'string' && record.id.length > 0
    && typeof record.name === 'string' && record.name.length > 0 && localHref(record.href);
}
export function readServiceFavorites(storage, dataset) {
  const prefix = prefixFor(dataset), items = []; let unreadable = 0;
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(prefix)) continue;
    try {
      const record = JSON.parse(storage.getItem(key));
      if (!validRecord(record) || key !== serviceFavoriteKey(dataset, record.id)) throw Error('Invalid favorite');
      items.push(record);
    } catch { unreadable++; }
  }
  return {items, unreadable};
}
export function writeServiceFavorite(storage, dataset, id, entry) {
  const key = serviceFavoriteKey(dataset, id), previous = storage.getItem(key);
  if (previous !== null) {
    let record;
    try { record = JSON.parse(previous); } catch { throw Error('Unreadable favorite'); }
    if (!validRecord(record) || record.id !== id) throw Error('Unsupported favorite');
  }
  if (entry === null) { storage.removeItem(key); return; }
  const record = {version: 1, id, name: entry.name, href: entry.href};
  if (!validRecord(record)) throw Error('Invalid favorite');
  storage.setItem(key, JSON.stringify(record));
}
export function serviceFavoriteRows(items, registry, knownIds) {
  const entries = new Map(registry.map(entry => [entry.id, entry]));
  return items.map(saved => {
    const current = entries.get(saved.id);
    return {...saved, ...current, available: knownIds.has(saved.id)};
  }).sort((a, b) => a.name.localeCompare(b.name, 'ru') || a.id.localeCompare(b.id));
}

export function bindServiceFavorites(page, cards, base) {
  const panel = document.querySelector('[data-service-favorites]');
  if (!panel || !page.favorites) return;
  const dataset = page.dataset || 'editorial', registry = page.favorites.entries;
  const knownIds = new Set(page.favorites.known_ids), entries = new Map(registry.map(entry => [entry.id, entry]));
  const list = panel.querySelector('[data-favorites-list]'), empty = panel.querySelector('[data-favorites-empty]');
  const notice = panel.querySelector('[data-favorites-notice]'), retry = panel.querySelector('[data-favorites-retry]');
  const jump = document.querySelector('[data-open-favorites]'), announcement = document.querySelector('[data-favorite-status]');
  let saved = new Map(), unreadable = 0, readingFailed = false;
  const pending = new Map();
  const selected = () => {
    const result = new Map(saved);
    for (const [id, value] of pending) { if (value === null) result.delete(id); else result.set(id, value); }
    return result;
  };
  function refresh() {
    try {
      const state = readServiceFavorites(localStorage, dataset);
      saved = new Map(state.items.map(record => [record.id, record])); unreadable = state.unreadable; readingFailed = false;
    } catch { readingFailed = true; }
  }
  function render() {
    const current = selected(), focused = document.activeElement?.dataset.favoriteRemove;
    panel.hidden = current.size === 0 && pending.size === 0 && unreadable === 0 && !readingFailed;
    jump.textContent = `Избранное${current.size ? ` (${current.size})` : ''}`;
    panel.querySelector('[data-favorites-count]').textContent = String(current.size);
    empty.hidden = current.size > 0;
    retry.hidden = pending.size === 0;
    notice.textContent = pending.size ? 'Изменения пока только в этой вкладке. Браузер не сохранил выбор.'
      : readingFailed ? 'Не удалось прочитать избранное в браузере. Вы можете выбирать места в этой вкладке.'
      : unreadable ? 'Некоторые сохранённые записи не удалось прочитать. Они оставлены в памяти без изменений.' : '';
    for (const [id, card] of cards) {
      const button = card.querySelector('[data-favorite-service]'); if (!button) continue;
      const on = current.has(id);
      button.hidden = false; button.setAttribute('aria-pressed', String(on));
      button.textContent = on ? pending.has(id) ? 'Выбрано в этой вкладке' : 'В избранном' : 'В избранное';
      button.setAttribute('aria-label', `${on ? 'Убрать из избранного' : 'В избранное'}: ${entries.get(id)?.name || id}`);
    }
    list.replaceChildren(...serviceFavoriteRows([...current.values()], registry, knownIds).map(row => {
      const li = document.createElement('li'), copy = document.createElement('div');
      if (row.available) {
        const link = document.createElement('a'); link.href = new URL(row.href.slice(1), base); link.textContent = row.name; copy.append(link);
        if (row.area_name) { const area = document.createElement('span'); area.textContent = row.area_name; copy.append(area); }
        if (cards.get(row.id)?.hidden) { const note = document.createElement('span'); note.textContent = 'Вне текущего подбора'; copy.append(note); }
      } else {
        const name = document.createElement('strong'), note = document.createElement('span');
        name.textContent = row.name; note.textContent = 'Услуга больше не входит в каталог'; copy.append(name, note);
      }
      const remove = document.createElement('button'); remove.type = 'button'; remove.dataset.favoriteRemove = row.id;
      remove.textContent = 'Убрать'; remove.setAttribute('aria-label', `Убрать из избранного: ${row.name}`);
      li.append(copy, remove); return li;
    }));
    if (focused) ([...list.querySelectorAll('[data-favorite-remove]')].find(button => button.dataset.favoriteRemove === focused)
      || list.querySelector('a,button') || jump)?.focus({preventScroll: true});
  }
  function change(id, value) {
    refresh();
    try {
      writeServiceFavorite(localStorage, dataset, id, value); pending.delete(id); refresh();
      announcement.textContent = value ? 'Место сохранено в избранном.' : 'Место убрано из избранного.';
    } catch {
      pending.set(id, value);
      announcement.textContent = 'Изменение только в этой вкладке. Браузер не сохранил выбор.';
    }
    render();
  }
  for (const [id, card] of cards) {
    card.querySelector('[data-favorite-service]')?.addEventListener('click', () => {
      refresh(); const current = selected();
      change(id, current.has(id) ? null : entries.get(id));
    });
  }
  panel.addEventListener('click', event => {
    const remove = event.target.closest('[data-favorite-remove]'); if (remove) change(remove.dataset.favoriteRemove, null);
  });
  retry.addEventListener('click', () => {
    for (const [id, value] of [...pending]) {
      try { writeServiceFavorite(localStorage, dataset, id, value); pending.delete(id); } catch { /* Keep the explicit temporary choice. */ }
    }
    refresh(); render();
    announcement.textContent = pending.size ? 'Браузер пока не сохранил выбор. Изменения остаются в этой вкладке.' : 'Избранное сохранено.';
    if (retry.hidden) (panel.hidden ? jump : panel.querySelector('summary'))?.focus({preventScroll: true});
  });
  jump.hidden = false;
  jump.addEventListener('click', () => {
    panel.hidden = false; panel.open = true; panel.scrollIntoView({block: 'nearest', behavior: 'auto'});
    panel.querySelector('summary').focus({preventScroll: true});
  });
  window.addEventListener('storage', event => {
    if (event.key === null || event.key.startsWith(prefixFor(dataset))) { refresh(); render(); }
  });
  refresh(); render();
  return {update: render};
}
