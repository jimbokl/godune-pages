// URL state is the shareable plan. The SSR cards remain usable without JavaScript.
const root = document.querySelector('.project-transport-page');
if (root) {
  const state = JSON.parse(document.querySelector('#project-transport-state').textContent);
  const origins = new Map(state.origins.map(row => [row.id, row]));
  const read = () => {
    const query = new URL(location.href).searchParams;
    return { from: origins.has(query.get('from')) ? query.get('from') : 'kaliningrad', mode: query.get('mode') === 'bus' ? 'bus' : 'car' };
  };
  let selected = read();
  const render = () => {
    const { from, mode } = selected;
    const origin = origins.get(from);
    root.dataset.accessEnhanced = 'true';
    root.dataset.accessCurrentMode = mode;
    root.querySelector('[data-access-modes]').hidden = false;
    for (const el of root.querySelectorAll('[data-access-origin]')) {
      const active = el.dataset.accessOrigin === from;
      if (active) el.setAttribute('aria-current', 'true'); else el.removeAttribute('aria-current');
      el.setAttribute('href', `?from=${el.dataset.accessOrigin}&mode=${mode}#origin-${el.dataset.accessOrigin}`);
    }
    for (const button of root.querySelectorAll('[data-access-mode]')) button.setAttribute('aria-pressed', String(button.dataset.accessMode === mode));
    for (const card of root.querySelectorAll('[data-access-card]')) {
      card.hidden = card.dataset.accessCard !== from;
      card.open = !card.hidden;
      for (const panel of card.querySelectorAll('[data-access-mode-panel]')) panel.hidden = panel.dataset.accessModePanel !== mode;
    }
    for (const road of root.querySelectorAll('[data-access-road]')) road.toggleAttribute('hidden', mode !== 'car' || road.dataset.accessRoad !== from);
    root.querySelector('[data-access-map-caption]').textContent = mode === 'car' ? 'Автомобильный путь до центра Поваровки' : 'Точки отправления · автобусные направления в карточке';
    root.querySelector('#access-map-desc').textContent = mode === 'car' ? `${origin.name} → Поваровка. Синяя линия — автомобильный путь по существующим дорогам.` : 'Точки отправления и центр Поваровки. Автобусные направления приведены в карточке; автомобильная линия скрыта.';
    const distance = (origin.distance_m / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
    root.querySelector('[data-access-status]').textContent = `${origin.name} → Поваровка. ${mode === 'car' ? `На машине, около ${distance} км.` : 'Общественный транспорт.'}`;
  };
  const select = (next) => {
    if (selected.from === next.from && selected.mode === next.mode) return;
    selected = next;
    const url = new URL(location.href);
    url.searchParams.set('from', selected.from);
    url.searchParams.set('mode', selected.mode);
    url.hash = 'journey';
    history.pushState(null, '', url);
    render();
  };
  root.addEventListener('click', event => {
    const origin = event.target.closest('[data-access-origin]');
    if (origin && !event.metaKey && !event.ctrlKey && !event.shiftKey && event.button === 0) {
      event.preventDefault();
      select({ ...selected, from: origin.dataset.accessOrigin });
    }
    const mode = event.target.closest('button[data-access-mode]');
    if (mode) select({ ...selected, mode: mode.dataset.accessMode });
  });
  addEventListener('popstate', () => { selected = read(); render(); });
  render();
}
