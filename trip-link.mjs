import {cleanTrip, mergeTrips, validTripDate, TRIP_AREAS, TRIP_TIMES} from './trip-state.mjs?v=1';

export function tripLink(state, catalog, base = 'https://godune.ru/') {
  const trip = cleanTrip(state, catalog);
  const payload = [1, trip.places, trip.routes, trip.month, trip.date, trip.filters.area, trip.filters.minutes];
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const encoded = btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''))
    .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  const link = new URL('.', base); link.hash = 'trip=' + encoded;
  return link.href;
}

export function readTripLink(hash, catalog) {
  if (!hash.startsWith('#trip=')) return null;
  try {
    const encoded = hash.slice(6);
    // A valid snapshot cannot be larger than the complete current catalog plus
    // IDs removed since it was shared. Bound decoding before allocating bytes.
    if (!encoded || encoded.length > 65536 || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw Error();
    const bytes = Uint8Array.from(atob(encoded.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0));
    const data = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
    if (!Array.isArray(data) || data[0] !== 1) return {error: 'Эта ссылка создана в другой версии маршрута. Попросите новую ссылку.'};
    const [version, places, routes, month, date, area, minutes] = data;
    if (data.length !== 7 || ![places, routes].every(list => Array.isArray(list) && list.every(id => typeof id === 'string'))
      || !(month === null || Number.isInteger(month) && month >= 1 && month <= 12)
      || !(date === null || validTripDate(date)) || (date && Number(date.slice(5, 7)) !== month)
      || !TRIP_AREAS.includes(area) || !TRIP_TIMES.includes(minutes)) throw Error();
    const state = cleanTrip({version, places, routes, month, date, filters: {area, minutes}}, catalog);
    const missing = new Set(places.filter(id => !state.places.includes(id))).size
      + new Set(routes.filter(id => !state.routes.includes(id))).size;
    if (!state.places.length && !state.routes.length) return {error: missing ? 'Мест из этой поездки уже нет в каталоге. Ваш черновик на месте.' : 'В этой ссылке пока нет мест или прогулок.'};
    return {state, missing};
  } catch { return {error: 'Не удалось прочитать маршрут. Возможно, ссылка скопировалась не целиком. Ваш черновик на месте.'}; }
}

export function initTripSharing(catalog, base, workshop) {
  const trigger = document.querySelector('#trip-share');
  if (!trigger && !location.hash.startsWith('#trip=')) return;
  const dialog = document.createElement('dialog'); dialog.id = 'trip-link-dialog'; dialog.className = 'trip-link-dialog';
  dialog.setAttribute('aria-labelledby', 'trip-link-title');
  dialog.innerHTML = `<div class="dialog-top"><p class="eyebrow">Ваша Балтика рядом</p><button type="button" class="icon-button" id="trip-link-close" aria-label="Закрыть поездку">×</button></div>
    <h2 id="trip-link-title">Возьмите маршрут с собой</h2><p id="trip-link-intro"></p>
    <div id="trip-link-preview"><p id="trip-link-date" class="trip-link-date"></p><p id="trip-link-filters"></p>
    <div id="trip-link-places"><h3>Точки по порядку</h3><ol></ol></div><div id="trip-link-routes"><h3>Готовые прогулки</h3><ul></ul></div>
    <p id="trip-link-missing" hidden></p></div>
    <div id="trip-link-export"><label for="trip-link-url">Ссылка на эту поездку</label><input id="trip-link-url" type="url" readonly spellcheck="false">
    <div class="trip-link-actions"><button type="button" id="trip-link-copy" class="button button-dark">Скопировать ссылку</button><button type="button" id="trip-link-send" class="button button-light" hidden>Отправить</button></div>
    <p class="trip-link-note">В ссылке — выбранные места и настройки поездки. Любой, у кого она есть, увидит эту поездку. Ссылка останется такой, какой вы её отправили.</p></div>
    <div id="trip-link-import" hidden><div class="trip-link-actions"><button type="button" id="trip-link-merge" class="button button-dark">Добавить к моему</button><button type="button" id="trip-link-replace" class="button button-light">Заменить мой маршрут</button></div>
    <p class="trip-link-note" id="trip-link-import-note"></p></div>
    <p id="trip-link-status" role="status" aria-live="polite"></p><button type="button" id="trip-link-undo" class="save-item" hidden>Вернуть мой черновик</button>`;
  document.body.append(dialog);
  const $ = selector => dialog.querySelector(selector);
  let snapshot, received = false, lastFocus, backup, imported;
  const message = text => { $('#trip-link-status').textContent = text; };
  const names = {all: 'Вся Балтика', kaliningrad: 'Калининград', 'kurshskaya-kosa': 'Куршская коса'};
  function show(result, incoming) {
    received = incoming; backup = imported = null;
    snapshot = result.state;
    $('#trip-link-undo').hidden = true; message('');
    $('#trip-link-title').textContent = result.error ? 'Маршрут не открылся' : incoming ? 'Поездка по этой ссылке' : 'Возьмите маршрут с собой';
    $('#trip-link-intro').textContent = result.error || (incoming ? 'Посмотрите места. Затем добавьте их к своему черновику или возьмите эту поездку целиком.' : 'Откройте её на другом телефоне или отправьте тем, с кем едете.');
    $('#trip-link-preview').hidden = Boolean(result.error);
    $('#trip-link-export').hidden = Boolean(result.error) || incoming;
    $('#trip-link-import').hidden = Boolean(result.error) || !incoming;
    if (snapshot) {
      const month = snapshot.month ? new Intl.DateTimeFormat('ru-RU', {month: 'long'}).format(new Date(2027, snapshot.month - 1, 1)) : null;
      $('#trip-link-date').textContent = snapshot.date ? 'Дата поездки: ' + new Intl.DateTimeFormat('ru-RU', {day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'}).format(new Date(snapshot.date + 'T12:00:00Z')) : month ? 'Месяц поездки: ' + month : 'Дата пока не выбрана';
      $('#trip-link-filters').textContent = 'Подбор прогулок: ' + names[snapshot.filters.area] + ' · ' + (snapshot.filters.minutes === 'all' ? 'без спешки' : 'до ' + (Number(snapshot.filters.minutes) / 60) + ' часов');
      for (const kind of ['places', 'routes']) {
        const group = $('#trip-link-' + kind), rows = kind === 'places' ? catalog.poi : catalog.routes;
        group.hidden = !snapshot[kind].length;
        group.querySelector('ol, ul').replaceChildren(...snapshot[kind].map(id => {
          const item = rows.find(row => row.slug === id), li = document.createElement('li'), link = document.createElement('a');
          link.href = new URL(`${kind === 'places' ? 'poi' : 'routes'}/${id}/`, base).href;
          link.textContent = item.name; li.append(link); return li;
        }));
      }
      $('#trip-link-missing').hidden = !result.missing;
      $('#trip-link-missing').textContent = result.missing ? `Часть мест уже убрана из каталога (${result.missing}). Показаны доступные точки этой поездки.` : '';
      $('#trip-link-url').value = tripLink(snapshot, catalog, base);
      $('#trip-link-send').hidden = typeof navigator.share !== 'function';
      $('#trip-link-import-note').textContent = '«Добавить к моему» оставит ваши точки первыми. «Заменить мой маршрут» возьмёт эту поездку целиком. В обоих случаях дата и подбор прогулок будут из этой поездки. Изменение можно отменить здесь.';
    }
    if (!dialog.open) {
      lastFocus = document.activeElement;
      document.querySelectorAll('dialog[open]').forEach(node => node.close());
      dialog.showModal();
    }
    $('#trip-link-close').focus();
  }
  function close() {
    // Update the address synchronously. A delayed native close event must not
    // remove a new trip hash opened immediately after the previous dialog.
    if (received && location.hash.startsWith('#trip=')) history.replaceState(null, '', location.pathname + location.search + '#my-trip');
    dialog.close();
  }
  $('#trip-link-close').addEventListener('click', close);
  dialog.addEventListener('cancel', event => {event.preventDefault(); close();});
  dialog.addEventListener('click', event => {
    const box = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) close();
  });
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    if (received && document.querySelector('#my-trip-title')) {
      const heading = document.querySelector('#my-trip-title'); heading.tabIndex = -1;
      heading.focus({preventScroll: true}); document.querySelector('#my-trip').scrollIntoView({block: 'start'});
    } else lastFocus?.focus({preventScroll: true});
  });
  trigger?.addEventListener('click', () => show({state: workshop.getState(), missing: 0}, false));
  function fromHash() { const result = readTripLink(location.hash, catalog); if (result) show(result, true); }
  window.addEventListener('hashchange', fromHash); fromHash();
  $('#trip-link-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('#trip-link-url').value);
      message('Ссылка скопирована. Можно отправлять.');
    } catch {
      const input = $('#trip-link-url'); input.focus(); input.select(); input.setSelectionRange(0, input.value.length);
      message('Ссылка выделена. Нажмите «Копировать» в меню телефона или браузера.');
    }
  });
  $('#trip-link-send').addEventListener('click', async () => {
    try { await navigator.share({title: 'Моя поездка — Маршруты Балтики', url: $('#trip-link-url').value}); message('Поездка отправлена.'); }
    catch (error) { if (error.name !== 'AbortError') message('Не получилось открыть отправку. Скопируйте ссылку.'); }
  });
  function importTrip(replace) {
    if (!snapshot) return;
    backup = workshop.getState();
    const next = replace ? snapshot : mergeTrips(backup, snapshot, catalog);
    const result = workshop.setState(next, replace ? 'Эта поездка стала вашим маршрутом.' : 'Точки добавлены к вашему маршруту.');
    imported = JSON.stringify(workshop.getState());
    $('#trip-link-import').hidden = true; $('#trip-link-undo').hidden = false;
    message(result.saved ? 'Поездка в вашем черновике. Здесь можно вернуть прежний выбор.' : 'Поездка открыта в этой вкладке. Браузер не разрешил сохранение; ссылка поможет открыть её снова.');
  }
  $('#trip-link-merge').addEventListener('click', () => importTrip(false));
  $('#trip-link-replace').addEventListener('click', () => importTrip(true));
  $('#trip-link-undo').addEventListener('click', () => {
    if (JSON.stringify(workshop.getState()) !== imported) {
      message('Черновик уже изменился в другой вкладке. Прежний выбор не восстановлен, чтобы сохранить эти изменения.'); return;
    }
    workshop.setState(backup, 'Ваш прежний черновик восстановлен.');
    backup = imported = null; $('#trip-link-undo').hidden = true; $('#trip-link-import').hidden = false;
    message('Ваш прежний черновик на месте.');
  });
}
