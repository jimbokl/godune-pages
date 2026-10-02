(() => {
  'use strict';
  const base = new URL('.', document.currentScript.src);
  const url = path => new URL(path.replace(/^\//, ''), base).href;
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const normalize = s => s.toLocaleLowerCase('ru').replaceAll('ё', 'е').trim();
  const catalog = fetch(url('data/catalog.json')).then(r => {
    if (!r.ok) throw new Error('Каталог временно недоступен');
    return r.json();
  });
  // Observe the rejection even when the visitor never opens an interactive tool.
  catalog.catch(() => {});
  let lastFocus, activeRoute, map, mapReady, workshop, tripMap = false, markers = [], routeFilter = 'all', timeFilter = 'all';
  function open(dialog) {
    lastFocus = document.activeElement;
    $$('dialog[open]').forEach(d => d.close());
    dialog.showModal();
  }
  $$('[data-close-dialog]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
  $$('dialog').forEach(d => {
    d.addEventListener('close', () => lastFocus?.focus());
    d.addEventListener('click', e => {
      const r = d.getBoundingClientRect();
      if (e.target === d && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) d.close();
    });
  });
  const menu = $('.menu-button'), mobile = $('#mobile-nav');
  function closeMenu() { if (mobile) mobile.hidden = true; menu?.setAttribute('aria-expanded', 'false'); }
  menu?.addEventListener('click', () => { mobile.hidden = !mobile.hidden; menu.setAttribute('aria-expanded', String(!mobile.hidden)); });
  mobile?.addEventListener('click', e => { if (e.target.closest('a')) closeMenu(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
  function applyFilters() {
    let count = 0;
    $$('.route-row[data-area]').forEach(row => {
      row.hidden = (routeFilter !== 'all' && row.dataset.area !== routeFilter) || (timeFilter !== 'all' && +row.dataset.minutes > +timeFilter);
      if (!row.hidden) count++;
    });
    if ($('#route-count')) $('#route-count').textContent = count ? `Подходит маршрутов: ${count}` : 'Таких прогулок пока нет. Выберите больше времени или другой район.';
    $$('[data-route-filter]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.routeFilter === routeFilter)));
  }
  $$('[data-route-filter]').forEach(b => b.addEventListener('click', () => {
    routeFilter = b.dataset.routeFilter;
    if ($('#trip-area')) $('#trip-area').value = routeFilter;
    applyFilters();
  }));
  $('#trip-picker')?.addEventListener('submit', e => {
    e.preventDefault(); routeFilter = $('#trip-area').value; timeFilter = $('#trip-time').value; applyFilters();
    $('#route-count').scrollIntoView({block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
  });

  let wasmScore, wasmAttempt;
  const fallbackScore = (text, query) => {
    const terms = query.split(/\s+/).filter(Boolean);
    if (!terms.length) return 1;
    if (!terms.every(t => text.includes(t))) return 0;
    return text.startsWith(query) ? 100 : text.includes(query) ? 60 : 20;
  };
  function loadWasm() {
    if (wasmAttempt) return wasmAttempt;
    wasmAttempt = (async () => {
      const response = await fetch(url('assets/search.wasm'));
      if (!response.ok) throw new Error('WASM unavailable');
      const {instance} = await WebAssembly.instantiate(await response.arrayBuffer());
      const e = instance.exports, enc = new TextEncoder();
      wasmScore = (text, query) => {
        const a = enc.encode(text), b = enc.encode(query);
        const ap = e.alloc(a.length), bp = e.alloc(b.length);
        try {
          // alloc can grow linear memory, so take a fresh view after both calls.
          const mem = new Uint8Array(e.memory.buffer); mem.set(a, ap); mem.set(b, bp);
          return e.text_score(ap, a.length, bp, b.length);
        } finally { e.dealloc(ap, a.length); e.dealloc(bp, b.length); }
      };
    })().catch(() => { wasmScore = fallbackScore; });
    return wasmAttempt;
  }
  let searchVersion = 0;
  async function search() {
    const version = ++searchVersion, query = normalize($('#search-input').value);
    try {
      const data = await catalog;
      if (version !== searchVersion) return;
      const entries = [
        ...data.routes.map(r => ({title: r.name, description: 'Пеший маршрут · ' + r.area_name, path: `routes/${r.slug}/`, text: `${r.name} ${r.area_name} ${r.description}`})),
        ...data.poi.map(p => ({title: p.name, description: p.area_name + ' · ' + p.category_name, path: `poi/${p.slug}/`, text: `${p.name} ${p.area_name} ${p.category_name} ${p.tags.join(' ')}`})),
        ...data.collections.map(c => ({title: c.name, description: 'Места и остановки на карте', path: c.path, text: `${c.name} ${c.intro}`})),
        {title: 'Куршская коса: билет, въезд и пограничная зона', description: 'Что проверить перед поездкой', path: 'kurshskaya-kosa/propusk/', text: 'пропуск билет въезд национальный парк куршская коса пограничная зона документы'}
      ];
      const ranked = entries.map((entry, index) => ({...entry, index, score: (wasmScore || fallbackScore)(normalize(entry.text), query)})).filter(e => e.score).sort((a,b) => b.score-a.score || a.index-b.index);
      $('#search-results').replaceChildren(...ranked.slice(0, 12).map(e => {
        const li = document.createElement('li'), a = document.createElement('a'), small = document.createElement('small');
        a.href = url(e.path); a.textContent = e.title; small.textContent = e.description; a.append(small); li.append(a); return li;
      }));
      $('#search-status').textContent = query ? ranked.length ? `Найдено: ${ranked.length}. Показаны первые ${Math.min(12, ranked.length)}.` : 'Ничего не нашли. Попробуйте «Кант», «дюны» или название города.' : 'Места и маршруты для первого знакомства';
    } catch { $('#search-status').textContent = 'Не удалось загрузить поиск. Разделы сайта доступны через меню.'; }
  }
  $$('[data-open-search]').forEach(b => b.addEventListener('click', () => { open($('#search-dialog')); $('#search-input').focus(); loadWasm().then(search); search(); }));
  $('#search-input')?.addEventListener('input', search);

  Promise.all([catalog, import(url('workshop.mjs?v=2'))]).then(([data, {initWorkshop}]) => {
    workshop = initWorkshop(data, base);
    if ($('#discovery-name')) workshop.showDiscovery(data.discoveries || []);
    if ($('#trip-weather')) import(url('live-weather.mjs?v=1')).then(({initWeather}) => initWeather(base, workshop)).catch(() => {
      $('#weather-status').textContent = 'Прогноз пока не загрузился. Ваш маршрут на месте.';
    });
  }).catch(() => {
    $$('[data-save-place], [data-save-route]').forEach(button => { button.disabled = true; button.textContent = 'Сохранение пока недоступно'; });
    const notice = $('#trip-storage');
    if (notice) { notice.hidden = false; notice.textContent = 'Не удалось загрузить вашу поездку. Сохранённые данные не изменены. Попробуйте обновить страницу.'; }
  });
  if (document.body.dataset.route) {
    import(url('walk.mjs?v=1')).then(({initWalk}) => initWalk()).catch(() => {
      const notice = $('#walk-storage');
      if (notice) {
        notice.hidden = false;
        notice.textContent = 'Отметки пока не сохраняются. Обновите страницу, чтобы загрузить прогулку.';
      }
    });
  }
  function navigatorLink(p) { return `https://yandex.ru/maps/?pt=${p.lon},${p.lat}&z=17&l=map`; }
  function loadMapLibrary() {
    if (window.maplibregl) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = url('assets/vendor/maplibre/maplibre-gl.css'); document.head.append(css);
      const js = document.createElement('script'); js.src = url('assets/vendor/maplibre/maplibre-gl.js'); js.onload = resolve; js.onerror = reject; document.head.append(js);
    });
  }
  const russianMap = {'NavigationControl.ZoomIn':'Приблизить','NavigationControl.ZoomOut':'Отдалить','NavigationControl.ResetBearing':'Север наверху','AttributionControl.ToggleAttribution':'Источники карты','GeolocateControl.FindMyLocation':'Моё местоположение','GeolocateControl.LocationNotAvailable':'Местоположение недоступно','LogoControl.Title':'Открытая карта','Map.Title':'Карта маршрутов Балтики','Marker.Title':'Остановка маршрута','Popup.Close':'Закрыть'};
  async function initializeMap() {
    if (mapReady) return mapReady;
    mapReady = (async () => {
      await loadMapLibrary();
      map = new maplibregl.Map({container:'interactive-map', center:[20.57,54.99], zoom:8, locale:russianMap, attributionControl:false,
        style:{version:8, sources:{shore:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© <a href="https://www.openstreetmap.org/copyright">Участники открытой карты</a>'}},layers:[{id:'shore',type:'raster',source:'shore',paint:{'raster-saturation':-.76,'raster-contrast':-.08}}]}});
      map.addControl(new maplibregl.NavigationControl({showCompass:false}), 'top-right');
      map.addControl(new maplibregl.AttributionControl({compact:false}), 'bottom-right');
      map.on('error', () => { $('#map-status').textContent = 'Подложка карты не загрузилась. Список остановок и ссылки в навигатор доступны ниже.'; });
      await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Карта загружается дольше обычного')), 20000); map.once('load', () => { clearTimeout(timer); resolve(); }); });
      map.addSource('walk',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      map.addLayer({id:'walk-line',type:'line',source:'walk',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#986339','line-width':4,'line-opacity':.92}});
      return map;
    })();
    mapReady.catch(() => { mapReady = undefined; map?.remove(); map = undefined; });
    return mapReady;
  }
  let mapSelection = 'all', mapVersion = 0;
  async function renderMap() {
    const version = ++mapVersion;
    const data = await catalog;
    const route = tripMap ? null : data.routes.find(r => r.slug === activeRoute);
    const collection = data.collections.find(c => c.path === document.body.dataset.collection);
    const here = data.poi.find(p => p.slug === document.body.dataset.poi);
    const chosen = tripMap ? (workshop?.getState().places || []).map(id => data.poi.find(p => p.slug === id)) : route ? route.stops.map(s => data.poi.find(p => p.slug === s.poi)) : collection ? collection.poi.map(slug => data.poi.find(p => p.slug === slug)) : here ? data.poi.filter(p => p.area === here.area) : data.poi;
    const points = chosen.filter(p => mapSelection === 'all' || (mapSelection === 'nature' ? p.area === 'kurshskaya-kosa' || ['beach','nature','park','viewpoint'].includes(p.category) : p.area !== 'kurshskaya-kosa' && !['beach','nature','park','viewpoint'].includes(p.category)));
    $('#map-dialog-title').textContent = tripMap ? 'Ваши точки' : route ? route.name : collection ? collection.name : here ? here.name : 'Карта маршрутов';
    $('#map-places').replaceChildren(...points.map(p => { const li = document.createElement('li'), a = document.createElement('a'); a.href = navigatorLink(p); a.target = '_blank'; a.rel = 'noopener'; a.textContent = p.name; li.append(a); return li; }));
    try {
      const m = await initializeMap(); if (version !== mapVersion) return;
      m.resize(); markers.forEach(marker => marker.remove()); markers = [];
      points.forEach((p,i) => {
        const btn = document.createElement('button'); btn.className = 'map-dot'; btn.type = 'button'; btn.textContent = route || tripMap ? String(chosen.indexOf(p)+1) : ''; btn.setAttribute('aria-label', p.name);
        const popup = document.createElement('div'), title = document.createElement('strong'), link = document.createElement('a');
        title.textContent = p.name; link.href = url(`poi/${p.slug}/`); link.textContent = 'Посмотреть место'; popup.append(title, document.createElement('br'), link);
        const save = document.createElement('button'), on = workshop?.getState().places.includes(p.slug);
        save.type = 'button'; save.className = 'save-item'; save.dataset.savePlace = p.slug;
        save.setAttribute('aria-pressed', String(Boolean(on))); save.textContent = on ? 'В моём маршруте ✓' : 'В мой маршрут +'; popup.append(document.createElement('br'), save);
        markers.push(new maplibregl.Marker({element:btn}).setLngLat([p.lon,p.lat]).setPopup(new maplibregl.Popup({offset:18}).setDOMContent(popup)).addTo(m));
      });
      m.getSource('walk').setData(route ? {type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:route.geometry}]} : {type:'FeatureCollection',features:[]});
      if (points.length) { const bounds = new maplibregl.LngLatBounds(); points.forEach(p => bounds.extend([p.lon,p.lat])); route?.geometry.coordinates.forEach(c => bounds.extend(c)); m.fitBounds(bounds,{padding:50,maxZoom:15,duration:0}); }
      $('#map-status').textContent = tripMap && !points.length ? 'Здесь появятся ваши точки. Добавьте первое место в «Мой маршрут».' : route ? `${points.length} остановок · Пеший путь по открытой карте` : `На карте мест: ${points.length}. Выберите точку, чтобы открыть карточку.`;
    } catch { $('#map-status').textContent = 'Интерактивная карта сейчас недоступна. Откройте остановку в навигаторе из списка ниже.'; }
  }
  $$('[data-open-map]').forEach(b => b.addEventListener('click', e => {
    e.preventDefault(); tripMap = b.hasAttribute('data-trip-map'); activeRoute = b.dataset.routeMap || document.body.dataset.route || null; mapSelection = 'all';
    $$('[data-map-filter]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.mapFilter === 'all')));
    open($('#map-dialog')); $('#map-status').textContent = 'Загружаем карту…'; renderMap().catch(() => { $('#map-status').textContent = 'Каталог недоступен. Попробуйте позже.'; });
  }));
  $$('[data-map-filter]').forEach(b => b.addEventListener('click', () => {
    mapSelection = b.dataset.mapFilter; $$('[data-map-filter]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); renderMap().catch(() => {});
  }));
})();
