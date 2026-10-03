(() => {
  'use strict';
  const base = new URL('.', document.currentScript.src);
  const url = path => new URL(path.replace(/^\//, ''), base).href;
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const normalize = s => s.toLocaleLowerCase('ru').replaceAll('ё', 'е').trim();
  const catalog = fetch(url('data/catalog.json'), {cache:'no-cache'}).then(r => {
    if (!r.ok) throw new Error('Каталог временно недоступен');
    return r.json();
  });
  // Observe the rejection even when the visitor never opens an interactive tool.
  catalog.catch(() => {});
  const offlineTools = import(url('offline.mjs?v=4'));
  offlineTools.then(({initOffline}) => initOffline(base)).catch(() => {});
  let localStyle;
  import(url('offline-map.mjs?v=6')).then(module => { localStyle=module; }).catch(() => {});
  const inlineMap = document.body.hasAttribute('data-map-page');
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
    workshop?.setFilters(routeFilter, timeFilter);
    applyFilters();
  }));
  $('#trip-picker')?.addEventListener('submit', e => {
    e.preventDefault(); routeFilter = $('#trip-area').value; timeFilter = $('#trip-time').value;
    workshop?.setFilters(routeFilter, timeFilter); applyFilters();
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
        ...data.collections.filter(c=>!['map/','routes/'].includes(c.path)).map(c => ({title: c.name, description: 'Места и остановки на карте', path: c.path, text: `${c.name} ${c.intro}`})),
        ...[
          ['Планировщик поездки','Дни, время, ночёвка и бюджет','planner/','мой маршрут планировщик собрать поездку бюджет расходы дни'],
          ['Карта мест и маршрутов','Своя карта Балтики и вашего дня','map/','карта дороги рестораны места маршрут точки'],
          ['Готовые планы на 3, 5 и 7 дней','Своя копия поездки и пешие прогулки','routes/','готовые маршруты план три пять семь неделя'],
          ['Прогулки без интернета','Скачать карты и остановки на телефон','offline/','офлайн без интернета скачать карту трек gpx'],
          ['Помощь с поездкой','Память, файл, ссылка и карты','help/','помощь как сохранить поездку файл ссылка регистрация']
        ].map(([title,description,path,text])=>({title,description,path,text})),
        {title: 'Куршская коса: билет, въезд и пограничная зона', description: 'Что проверить перед поездкой', path: 'kurshskaya-kosa/propusk/', text: 'пропуск билет въезд национальный парк куршская коса пограничная зона документы'}
      ];
      const available = navigator.onLine ? null : await offlineTools.then(({offlinePaths})=>offlinePaths(base)).catch(()=>new Set());
      if (version !== searchVersion) return;
      const ranked = entries.filter(entry=>!available || available.has(new URL(entry.path,base).pathname)).map((entry, index) => ({...entry, index, score: (wasmScore || fallbackScore)(normalize(entry.text), query)})).filter(e => e.score).sort((a,b) => b.score-a.score || a.index-b.index);
      $('#search-results').replaceChildren(...ranked.slice(0, 12).map(e => {
        const li = document.createElement('li'), a = document.createElement('a'), small = document.createElement('small');
        a.href = url(e.path); a.textContent = e.title; small.textContent = e.description; a.append(small); li.append(a); return li;
      }));
      $('#search-status').textContent = query ? ranked.length ? `Найдено: ${ranked.length}. Показаны первые ${Math.min(12, ranked.length)}.${available ? ' Только загруженные страницы.' : ''}` : available ? 'Среди загруженных мест ничего не нашли. Другие страницы появятся, когда вернётся связь.' : 'Ничего не нашли. Попробуйте «Кант», «дюны» или название города.' : available ? 'Места и прогулки, которые открываются без сети' : 'Места и маршруты для первого знакомства';
    } catch { $('#search-status').textContent = 'Не удалось загрузить поиск. Разделы сайта доступны через меню.'; }
  }
  $$('[data-open-search]').forEach(b => b.addEventListener('click', () => { open($('#search-dialog')); $('#search-input').focus(); loadWasm().then(search); search(); }));
  $('#search-input')?.addEventListener('input', search);

  let lastTripFilters;
  function restoreTripFilters() {
    if (!workshop) return;
    const filters = workshop.getState().filters;
    const signature = JSON.stringify(filters);
    if (signature === lastTripFilters) return;
    lastTripFilters = signature;
    routeFilter = filters.area; timeFilter = filters.minutes;
    if ($('#trip-area')) $('#trip-area').value = routeFilter;
    if ($('#trip-time')) $('#trip-time').value = timeFilter;
    applyFilters();
  }
  window.addEventListener('godune:trip-change', restoreTripFilters);
  window.addEventListener('godune:memory-cleared', () => { lastTripFilters = undefined; restoreTripFilters(); });
  Promise.all([catalog, import(url('workshop.mjs?v=26'))]).then(async ([data, {initWorkshop}]) => {
    workshop = await initWorkshop(data, base);
    restoreTripFilters();
    if (document.body.dataset.tool) {
      import(url('tool-pages.mjs?v=9')).then(({initToolPages})=>initToolPages(workshop,data,base)).catch(()=>{
        document.documentElement.dataset.toolReady='error';
        $$('[data-plan-starter]').forEach(button=>button.disabled=true);
        const status=$('#plan-starter-status');
        if(status)status.textContent='Готовые планы пока не загрузились. Откройте «Мой маршрут» и добавьте места сами; прежняя поездка сохранена.';
      });
    }
    if (inlineMap) {
      tripMap = new URLSearchParams(location.search).get('view') === 'trip';
      syncMapViews();
      renderMap().catch(()=>setMapStatus('Карта пока не открылась. Места доступны в списке ниже.'));
    }
    if ($('#discovery-name')) workshop.showDiscovery(data.discoveries || []);
    document.documentElement.dataset.tripReady = 'true';
    if ($('#gastro-form')) import(url('gastronomy.mjs?v=12')).then(({initGastronomy}) => initGastronomy(base,workshop)).catch(() => {
      $('#gastro-status').textContent = 'Сборка прогулки пока не загрузилась. Фотографии, меню и сохранение отдельных мест доступны ниже.';
    });
    if ($('#trip-weather')) import(url('live-weather.mjs?v=2')).then(({initWeather}) => initWeather(base, workshop)).catch(() => {
      $('#weather-status').textContent = 'Прогноз пока не загрузился. Ваш маршрут на месте.';
    });
  }).catch(() => {
    $$('[data-save-place], [data-save-route], [data-plan-starter]').forEach(button => { button.disabled = true; button.textContent = 'Сохранение пока недоступно'; });
    if (inlineMap) setMapStatus('Карта пока не открылась. Места доступны в списке ниже.');
    const notice = $('#trip-storage');
    if (notice) { notice.hidden = false; notice.textContent = 'Не удалось загрузить вашу поездку. Сохранённые данные не изменены. Попробуйте обновить страницу.'; }
  });
  if (document.body.dataset.route) {
    import(url('walk.mjs?v=2')).then(({initWalk}) => initWalk()).catch(() => {
      const notice = $('#walk-storage');
      if (notice) {
        notice.hidden = false;
        notice.textContent = 'Отметки пока не сохраняются. Обновите страницу, чтобы загрузить прогулку.';
      }
    });
  }
  let mapFocus = new URLSearchParams(location.search).get('map');
  let foodPreviewTrip = null;
  let foodPreview = (new URLSearchParams(location.search).get('foodtour') || '').split(',').filter(id=>/^[a-z0-9-]{1,128}$/.test(id)).slice(0,3);
  function loadMapLibrary() {
    if (window.maplibregl) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = url('assets/vendor/maplibre/maplibre-gl.css'); document.head.append(css);
      const js = document.createElement('script'); js.src = url('assets/vendor/maplibre/maplibre-gl.js'); js.onload = resolve; js.onerror = reject; document.head.append(js);
    });
  }
  const russianMap = {'NavigationControl.ZoomIn':'Приблизить','NavigationControl.ZoomOut':'Отдалить','NavigationControl.ResetBearing':'Север наверху','AttributionControl.ToggleAttribution':'Источники карты','GeolocateControl.FindMyLocation':'Моё местоположение','GeolocateControl.LocationNotAvailable':'Местоположение недоступно','LogoControl.Title':'Открытая карта','Map.Title':'Карта маршрутов Балтики','Marker.Title':'Остановка маршрута','Popup.Close':'Закрыть'};
  let mapNavigation;
  let mapContext, mapBaseError = false, mapStatus = '';
  function setMapStatus(message) {
    mapStatus = message;
    $('#map-status').textContent = message + (mapBaseError ? ' Подложка карты не загрузилась; линии и список остановок доступны.' : '');
  }
  async function initializeMap(local) {
    const context=local ? `${local.route}:${local.version || ''}` : 'region',vector=!local || local.kind==='region';
    if(mapReady && mapContext!==context){mapNavigation?.destroy();mapNavigation=undefined;map?.remove();map=undefined;mapReady=undefined;markers=[];}
    if (mapReady) return mapReady;
    mapContext=context;
    mapReady = (async () => {
      await loadMapLibrary();
      mapBaseError = false;
      map = new maplibregl.Map({container:'interactive-map', center:local?[(local.bbox[0]+local.bbox[2])/2,(local.bbox[1]+local.bbox[3])/2]:[20.57,54.99], zoom:8, locale:russianMap, attributionControl:false,
        maxBounds:local ? [[local.bbox[0],local.bbox[1]],[local.bbox[2],local.bbox[3]]] : undefined,
        style:vector ? (await import(url('region-map.mjs?v=4'))).regionMapStyle(base,local || {}) : localStyle.localMapStyle(local)});
      map.on('click',e=>{const feature=map.queryRenderedFeatures(e.point,{layers:!vector?['local-roads','local-building','local-green','local-water']:['region-roads','region-building','region-green','region-water']}).find(f=>f.properties.name);if(feature){const title=document.createElement('span');title.textContent=feature.properties.name;new maplibregl.Popup().setLngLat(e.lngLat).setDOMContent(title).addTo(map);}});
      map.addControl(new maplibregl.NavigationControl({showCompass:false}), 'top-right');
      map.addControl(new maplibregl.AttributionControl({compact:false}), 'bottom-right');
      map.on('error', () => { mapBaseError = true; setMapStatus(mapStatus); });
      await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Карта загружается дольше обычного')), 20000); map.once('load', () => { clearTimeout(timer); resolve(); }); });
      if(vector){
        const {mapCities}=await import(url('region-map.mjs?v=4'));
        const labels=mapCities.filter(([,lon,lat])=>!local || lon>=local.bbox[0] && lon<=local.bbox[2] && lat>=local.bbox[1] && lat<=local.bbox[3]).map(([name,lon,lat])=>{
          const el=document.createElement('span');el.className='region-city-label';el.textContent=name;
          new maplibregl.Marker({element:el}).setLngLat([lon,lat]).addTo(map);return el;
        });
        const show=()=>labels.forEach(el=>{el.hidden=map.getZoom()>12;});map.on('zoom',show);show();
      }
      map.addSource('walk',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      map.addLayer({id:'walk-line',type:'line',source:'walk',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#986339','line-width':4,'line-opacity':.92}});
      mapNavigation=(await import(url('map-navigation.mjs?v=1'))).initMapNavigation({map,root:$('#map-dialog'),bbox:local?.bbox || [19.58,54.42,22.87,55.29],local:Boolean(local)});
      return map;
    })();
    mapReady.catch(() => { mapReady = undefined; mapNavigation?.destroy();mapNavigation=undefined;map?.remove(); map = undefined; });
    return mapReady;
  }
  let mapSelection = 'all', mapVersion = 0;
  async function renderMap() {
    const version = ++mapVersion;
    const data = await catalog;
    const route = tripMap ? null : data.routes.find(r => r.slug === activeRoute);
    const collection = data.collections.find(c => c.path === document.body.dataset.collection);
    const here = data.poi.find(p => p.slug === document.body.dataset.poi);
    const trip = foodPreviewTrip || (foodPreview.length ? {places:foodPreview.filter(id=>data.poi.some(p=>p.slug===id)),schedule:{mode:'foot'}} : tripMap ? workshop?.getState() : null);
    const rawDay = trip?.itinerary?.days.find(d => d.id === trip.itinerary.active);
    const bookingState=await import(url('trip-bookings-state.mjs?v=1'));
    const day = rawDay ? bookingState.effectiveBookingDay(rawDay) : null;
    const personal=await import(url('personal-points.mjs?v=2'));
    const bases=day ? [day.start_at,day.night_at].filter(personal.isPersonalPoint).map(p=>({...p,slug:personal.baseId(p)})) : [];
    const tripPoints = trip ? [...new Set([day?.start_at,...trip.places,day?.night_at].filter(Boolean))] : [];
    const chosen = tripMap ? [...tripPoints.map(id => data.poi.find(p => p.slug === id)).filter(Boolean),...new Map(bases.map(p=>[p.slug,p])).values()] : route ? route.stops.map(s => data.poi.find(p => p.slug === s.poi)) : collection ? collection.poi.map(slug => data.poi.find(p => p.slug === slug)) : here ? data.poi.filter(p => p.area === here.area) : data.poi;
    const pointNumber = p => tripMap ? trip.places.indexOf(p.slug)+1 : chosen.indexOf(p)+1;
    const pointRole = p => [personal.baseId(day?.start_at) === p.slug ? 'Начало дня' : '',personal.baseId(day?.night_at) === p.slug ? 'Ночёвка' : ''].filter(Boolean).join(' · ');
    let points = chosen.filter(p => p.kind==='personal' || mapSelection === 'all' || (mapSelection === 'nature' ? p.area === 'kurshskaya-kosa' || ['beach','nature','park','viewpoint'].includes(p.category) : p.area !== 'kurshskaya-kosa' && !['beach','nature','park','viewpoint'].includes(p.category)));
    $('#map-dialog-title').textContent = (foodPreview.length || foodPreviewTrip) ? 'Ваша гастропрогулка' : tripMap ? 'Ваши точки' : route ? route.name : collection ? collection.name : here ? here.name : 'Карта маршрутов';
    function listPoints() {
      const focusId=document.activeElement?.dataset.savePlace;
      const rows=points.map(p=>{
        const li=document.createElement('li'),a=document.createElement('a');li.dataset.mapPlace=p.slug;
        if(p.kind==='personal'){a.href='#map-dialog';a.addEventListener('click',e=>{e.preventDefault();map?.flyTo({center:[p.lon,p.lat],zoom:16});});}else a.href=url(`poi/${p.slug}/`);a.textContent=((tripMap || route)&&pointNumber(p)?`${pointNumber(p)}. `:'')+p.name+(pointRole(p)?` · ${pointRole(p)}`:'');
        if(inlineMap && p.kind!=='personal'){
          const copy=document.createElement('div'),meta=document.createElement('small'),save=document.createElement('button');
          meta.textContent=`${p.area_name} · ${p.category_name}`;copy.append(a,meta);save.type='button';save.className='save-item';save.dataset.savePlace=p.slug;
          const on=workshop?.getState().places.includes(p.slug);save.setAttribute('aria-pressed',String(Boolean(on)));save.textContent=on?'В моём маршруте ✓':'В мой маршрут +';li.append(copy,save);
        }else li.append(a);
        return li;
      });
      if(inlineMap && !rows.length){const li=document.createElement('li');li.className='map-list-empty';li.textContent=tripMap && !chosen.length?'В этом дне пока нет мест. Выберите «Все места» и добавьте первую остановку.':!navigator.onLine?'Эти остановки не входят в скачанную карту. Откройте загруженную прогулку или вернитесь к списку своего дня.':'С выбранным фильтром мест пока нет. Покажите все места.';rows.push(li);}
      $('#map-places').replaceChildren(...rows);
      if(inlineMap && focusId)$('#map-places').querySelector(`[data-save-place="${CSS.escape(focusId)}"]`)?.focus({preventScroll:true});
    }
    listPoints();
    try {
      if(!localStyle)localStyle=await import(url('offline-map.mjs?v=6'));
      const maps=await localStyle.availableMaps(base);
      const local=await localStyle.downloadedMap(base,route?.slug,trip ? chosen : here,maps);
      if(version!==mapVersion)return;
      localStyle.mapCoverage($('#map-dialog'),base,maps,local,()=>{setMapStatus('Открываем выбранную карту…');renderMap().catch(()=>{});});
      if(!navigator.onLine && !local)throw new Error('Нет загруженной карты');
      if(version!==mapVersion)return;
      if(!navigator.onLine){
        const available=await offlineTools.then(({offlinePaths})=>offlinePaths(base));
        points=points.filter(p=>(p.kind==='personal' || available.has(new URL(`poi/${p.slug}/`,base).pathname)) && p.lon>=local.bbox[0] && p.lon<=local.bbox[2] && p.lat>=local.bbox[1] && p.lat<=local.bbox[3]);
        listPoints();
      }
      if(version!==mapVersion)return;
      const m = await initializeMap(local); if (version !== mapVersion) return;
      m.resize();mapNavigation?.setEntries([]); markers.forEach(marker => marker.remove()); markers = [];
      const mapEntries=[];
      function addMarker(point,btn,content,meta='') {
        const marker=new maplibregl.Marker({element:btn}).setLngLat([point.lon,point.lat]).addTo(m);
        markers.push(marker);mapEntries.push({id:point.slug||point.id,point,element:btn,content,meta});
      }
      points.forEach((p,i) => {
        const btn = document.createElement('button'); btn.className = 'map-dot'; btn.type = 'button'; btn.dataset.mapPlace = p.slug; btn.textContent = route || tripMap ? pointNumber(p) ? String(pointNumber(p)) : personal.baseId(day?.start_at) === p.slug ? 'С' : 'Н' : ''; btn.setAttribute('aria-label', p.name + (pointRole(p) ? ` · ${pointRole(p)}` : ''));
        if(pointRole(p))btn.dataset.mapBase = pointRole(p);
        const popup = document.createElement('div'), title = document.createElement('strong'), link = document.createElement('a');
        title.textContent = p.name; if(p.kind==='personal'){link.href='#map-dialog';link.textContent='Ваша точка · хранится с поездкой';link.addEventListener('click',e=>{e.preventDefault();m.flyTo({center:[p.lon,p.lat],zoom:16});});popup.append(title,document.createElement('br'),link);if(pointRole(p)){const role=document.createElement('p');role.textContent=pointRole(p);popup.append(role);}addMarker(p,btn,popup,pointRole(p));return;} link.href = url(`poi/${p.slug}/`); link.textContent = 'Посмотреть место'; popup.append(title, document.createElement('br'), link);
        if(pointRole(p)){const role=document.createElement('p');role.textContent=pointRole(p);popup.append(role);}
        const save = document.createElement('button'), on = workshop?.getState().places.includes(p.slug);
        save.type = 'button'; save.className = 'save-item'; save.dataset.savePlace = p.slug;
        save.setAttribute('aria-pressed', String(Boolean(on))); save.textContent = on ? 'В моём маршруте ✓' : 'В мой маршрут +'; popup.append(document.createElement('br'), save);
        addMarker(p,btn,popup,pointRole(p)||`${p.area_name} · ${p.category_name}`);
      });
      let roads={type:'FeatureCollection',features:[]},modeLabel='',arrivals=[];
      if(trip) {
        const travel=await import(url('travel-estimates.mjs?v=5'));
        const matrix=await travel.loadTripTravelMatrix(base,trip,data).catch(()=>null);
        roads=await travel.tripRoadFeatures(trip,data,matrix,base,points.map(p=>p.slug));
        modeLabel=travel.TRAVEL_MODES[travel.travelMode(trip)];
        if(version!==mapVersion)return;
        arrivals=[...new Map(points.flatMap(p=>{
          const anchor=p.arrival_points?.[travel.travelMode(trip)];
          return anchor ? [[anchor.id,anchor]] : [];
        })).values()];
        arrivals.forEach(anchor=>{
          const btn=document.createElement('button');btn.className='map-dot map-arrival';btn.type='button';
          btn.dataset.mapArrival=anchor.id;btn.textContent='П';btn.setAttribute('aria-label',anchor.name);
          const popup=document.createElement('div'),title=document.createElement('strong'),note=document.createElement('p'),link=document.createElement('a');
          title.textContent=anchor.name;note.textContent=anchor.note;link.textContent='Парковка на этой карте';
          link.href='#map-dialog';link.addEventListener('click',e=>{e.preventDefault();m.flyTo({center:[anchor.lon,anchor.lat],zoom:16});});popup.append(title,note,link);
          addMarker(anchor,btn,popup,'Парковка · начало пешего участка');
          const li=document.createElement('li'),a=document.createElement('a');li.dataset.mapArrival=anchor.id;
          a.textContent=anchor.name;a.href=link.href;a.addEventListener('click',e=>{e.preventDefault();m.flyTo({center:[anchor.lon,anchor.lat],zoom:16});});li.append(a);$('#map-places').append(li);
        });
      }
      mapNavigation?.setEntries(mapEntries);
      m.getSource('walk').setData(route ? {type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:route.geometry}]} : roads);
      $('#map-dialog').dataset.roadSegments=String(roads.features.length);
      $('#map-dialog').dataset.arrivalPoints=String(arrivals.length);
      $('#map-dialog').dataset.roadMode=trip?.schedule?.mode || 'foot';
      if (points.length) { const bounds = new maplibregl.LngLatBounds(); points.forEach(p => bounds.extend([p.lon,p.lat])); arrivals.forEach(p=>bounds.extend([p.lon,p.lat])); route?.geometry.coordinates.forEach(c => bounds.extend(c)); roads.features.forEach(f=>f.geometry.coordinates.forEach(c=>bounds.extend(c))); m.fitBounds(bounds,{padding:50,maxZoom:15,duration:0}); }
      if(mapFocus){const focus=data.poi.find(p=>p.slug===mapFocus);const anchor=data.poi.flatMap(p=>Object.values(p.arrival_points||{})).find(a=>a.id===mapFocus);const target=anchor||focus;if(target)m.jumpTo({center:[target.lon,target.lat],zoom:16});}
      const travelCount=roads.features.filter(f=>f.properties.kind==='travel').length,accessCount=roads.features.length-travelCount;
      const roadStops=trip ? [personal.baseId(day?.start_at),...trip.places,personal.baseId(day?.night_at)].filter(Boolean) : [];
      const transitions=roadStops.slice(1).filter((id,index)=>id!==roadStops[index]).length;
      setMapStatus(tripMap && !points.length ? !chosen.length?'Здесь появятся ваши точки. Добавьте первое место в «Мой маршрут».':!navigator.onLine?'Без сети: выбранные остановки вне скачанной карты. Черновик дня доступен в планировщике.':'Остановки этого дня скрыты фильтром. Выберите «Все».' : trip ? `${modeLabel} · Переходов по дорогам: ${travelCount} из ${transitions}.${accessCount?` Пеших участков у парковок: ${accessCount}.`:''} Линии — оценка по OpenStreetMap; доступ и входы нужно сверить.${!navigator.onLine?` Без сети: ${local?.kind==='region'?local.name:'окрестности загруженной прогулки'}.`:''}` : route ? `${points.length} остановок · ${local.kind==='region'?local.name:'Окрестности прогулки'} · Сверено по карте ${new Date(local.checked_at+'T12:00:00').toLocaleDateString('ru-RU')}` : local ? `${navigator.onLine?'Скачанная карта':'Без сети'} · ${local.kind==='region'?local.name:'окрестности загруженной прогулки'}. Покрытие можно сменить над картой.` : `На карте мест: ${points.length}. Выберите точку, чтобы открыть карточку.`);
    } catch { setMapStatus('Интерактивная карта сейчас недоступна. Карточки остановок доступны в списке ниже.'); }
  }
  for(const event of ['online','offline','godune:offline-change','godune:memory-cleared'])window.addEventListener(event,()=>{if(inlineMap || $('#map-dialog')?.open)renderMap().catch(()=>{});});
  window.addEventListener('godune:memory-clearing',()=>{foodPreviewTrip=null;foodPreview=[];mapVersion++;mapNavigation?.setEntries([]);markers.forEach(m=>m.remove());markers=[];map?.getSource('walk')?.setData({type:'FeatureCollection',features:[]});$('#map-places')?.replaceChildren();});
  window.addEventListener('godune:food-preview',event=>{
    foodPreviewTrip=structuredClone(event.detail);foodPreview=[];tripMap=true;mapFocus=null;activeRoute=null;mapSelection='all';
    $$('[data-map-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.mapFilter==='all')));
    if(!inlineMap)open($('#map-dialog'));setMapStatus('Загружаем вашу гастропрогулку…');renderMap().catch(()=>setMapStatus('Карта пока не открылась. Остановки доступны в списке прогулки.'));
  });
  $$('[data-open-map]').forEach(b => b.addEventListener('click', e => {
    e.preventDefault(); foodPreview=[];foodPreviewTrip=null; mapFocus = b.dataset.mapFocus || null; tripMap = b.hasAttribute('data-trip-map'); activeRoute = b.dataset.routeMap || document.body.dataset.route || null; mapSelection = 'all';
    $$('[data-map-filter]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.mapFilter === 'all')));
    if(!inlineMap)open($('#map-dialog')); setMapStatus('Загружаем карту…'); renderMap().catch(() => { setMapStatus('Каталог недоступен. Попробуйте позже.'); });
  }));
  if(!inlineMap && (mapFocus || foodPreview.length)){tripMap=foodPreview.length>0;open($('#map-dialog'));renderMap().catch(()=>setMapStatus('Карта пока не загрузилась. Карточки доступны ниже.'));}
  function syncMapViews(){
    $$('[data-map-view]').forEach(button=>button.setAttribute('aria-pressed',String((button.dataset.mapView==='trip')===tripMap)));
  }
  $$('[data-map-view]').forEach(button=>button.addEventListener('click',()=>{
    tripMap=button.dataset.mapView==='trip';activeRoute=null;foodPreview=[];foodPreviewTrip=null;mapFocus=null;syncMapViews();
    const address=new URL(location.href);if(tripMap)address.searchParams.set('view','trip');else address.searchParams.delete('view');history.replaceState(null,'',address);
    renderMap().catch(()=>setMapStatus('Карта пока не открылась. Карточки доступны в списке.'));
  }));
  $$('[data-map-filter]').forEach(b => b.addEventListener('click', () => {
    mapSelection = b.dataset.mapFilter; $$('[data-map-filter]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); renderMap().catch(() => {});
  }));
  window.addEventListener('godune:trip-change', () => {
    if ((inlineMap || $('#map-dialog')?.open) && (tripMap || inlineMap)) renderMap().catch(() => {});
  });
})();
