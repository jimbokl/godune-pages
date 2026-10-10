import {transportDate,transportTotal} from './trip-transport-plans-view.mjs';
import {publicBookingTrip} from './trip-bookings-state.mjs?v=3';
import {baseName} from './personal-points.mjs?v=3';
import {validJourneyProjection,tripHasDraft,journeyDays,tripPlaceIds} from './trip-days-state.mjs?v=27';
import {cleanTrip, mergeTrips, validTripDate, TRIP_AREAS, TRIP_TIMES} from './trip-state.mjs?v=30';
import {downloadTripFile, readTripFile, TRIP_FILE_BYTES, persistentStorage} from './trip-file.mjs?v=31';
import {validSchedule} from './trip-schedule-state.mjs?v=19';
import {serviceVisitImportIssue} from './trip-service-visits-contract.mjs?v=1';
import {transferConnectionImportIssue} from './trip-transfer-connections-contract.mjs';

export function tripLink(state, catalog, base = 'https://godune.ru/') {
  const trip = publicBookingTrip(cleanTrip(state, catalog));
  const payload = [1, trip.places, trip.routes, trip.month, trip.date, trip.filters.area, trip.filters.minutes];
  if (trip.schedule || trip.itinerary || trip.dreams) payload.push(trip.schedule || null);
  if (trip.itinerary || trip.dreams) payload.push(trip.itinerary || null);
  if (trip.dreams) payload.push(trip.dreams);
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
    // Use the existing trip-file byte budget; repeated places in distinct days are valid.
    if (!encoded || encoded.length > Math.ceil(TRIP_FILE_BYTES*4/3) || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw Error();
    const bytes = Uint8Array.from(atob(encoded.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0));
    if(bytes.length>TRIP_FILE_BYTES)throw Error();
    const data = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
    if (!Array.isArray(data) || data[0] !== 1) return {error: 'Эта ссылка создана в другой версии маршрута. Попросите новую ссылку.'};
    const [version, places, routes, month, date, area, minutes, schedule, itinerary, dreams] = data;
    if (![7,8,9,10].includes(data.length) || data.length === 8 && !validSchedule(schedule) || data.length >= 9 && schedule!==null && !validSchedule(schedule)
      || data.length === 10 && !(Array.isArray(dreams) && dreams.every(id => typeof id === 'string'))
      || ![places, routes].every(list => Array.isArray(list) && list.every(id => typeof id === 'string'))
      || !(month === null || Number.isInteger(month) && month >= 1 && month <= 12)
      || !(date === null || validTripDate(date)) || (date && Number(date.slice(5, 7)) !== month)
      || !TRIP_AREAS.includes(area) || !TRIP_TIMES.includes(minutes)) throw Error();
    if((data.length===9 || data.length===10 && itinerary!==null) && !validJourneyProjection({places,date,schedule,itinerary}))throw Error();
    const serviceIssue=serviceVisitImportIssue({itinerary});
    if(serviceIssue)return {error:serviceIssue};
    const transferIssue=transferConnectionImportIssue({itinerary});
    if(transferIssue)return {error:transferIssue};
    const state = cleanTrip({version, places, routes, month, date, filters: {area, minutes}, schedule,...(itinerary?{itinerary}:{}),...(dreams?{dreams}:{})}, catalog);
    const original={places,date,schedule,itinerary,routes};
    const missing = tripPlaceIds(original).filter(id => !tripPlaceIds(state).includes(id)).length
      + new Set(routes.filter(id => !state.routes.includes(id))).size
      + new Set((dreams || []).filter(id => !state.dreams?.includes(id))).size;
    if (!tripHasDraft(state) && !state.dreams?.length) return {error: missing ? 'Мест из этой поездки уже нет в каталоге. Ваш черновик на месте.' : 'В этой ссылке пока нет мест или прогулок.'};
    return {state:publicBookingTrip(state), missing};
  } catch { return {error: 'Не удалось прочитать маршрут. Возможно, ссылка скопировалась не целиком. Ваш черновик на месте.'}; }
}

export function initTripSharing(catalog, base, workshop) {
  const trigger = document.querySelector('#trip-share');
  if (!trigger && !location.hash.startsWith('#trip=')) return;
  const dialog = document.createElement('dialog'); dialog.id = 'trip-link-dialog'; dialog.className = 'trip-link-dialog';
  dialog.setAttribute('aria-labelledby', 'trip-link-title');
  dialog.innerHTML = `<div class="dialog-top"><p class="eyebrow">Ваша Балтика рядом</p><button type="button" class="icon-button" id="trip-link-close" aria-label="Закрыть поездку">×</button></div>
    <h2 id="trip-link-title">Возьмите маршрут с собой</h2><p id="trip-link-intro"></p>
    <details id="trip-link-preview"><summary>Что входит в поездку</summary><p id="trip-link-date" class="trip-link-date"></p><p id="trip-link-filters"></p>
    <div id="trip-link-days" hidden></div><div id="trip-link-places"><h3>Точки по порядку</h3><ol></ol></div><div id="trip-link-routes"><h3>Готовые прогулки</h3><ul></ul></div><div id="trip-link-dreams" hidden><h3>Места, куда хочется</h3><ul></ul></div>
    <p id="trip-link-missing" hidden></p></details>
    <div id="trip-link-export"><div class="trip-guide-download"><p>План по шагам, карты и заметки гида - в одном PDF. Он открывается без сети.</p>
    <div class="trip-guide-options"><label for="trip-guide-scope">Что взять<select id="trip-guide-scope"><option value="day">Выбранный день</option><option value="trip">Всю поездку</option></select></label><label for="trip-guide-format">Как читать<select id="trip-guide-format"><option value="phone">На телефоне</option><option value="print">На бумаге · A4</option></select></label></div>
    <button type="button" id="trip-guide-save" class="button button-dark">Скачать путеводитель ↓</button><button type="button" id="trip-guide-cancel" class="button button-light" hidden>Отменить сборку</button>
    <p class="trip-link-note">Ваши адреса, номера брони и заметки войдут в PDF. Сохраните файл в телефоне и откройте в авиарежиме до выхода.</p><p id="trip-guide-status" role="status" aria-live="polite"></p></div>
    <details><summary>Отправить ссылку или сохранить план для редактирования</summary><label for="trip-link-url">Ссылка на эту поездку</label><input id="trip-link-url" type="url" readonly spellcheck="false">
    <div class="trip-link-actions"><button type="button" id="trip-link-copy" class="button button-dark">Скопировать ссылку</button><button type="button" id="trip-link-send" class="button button-light" hidden>Отправить</button><button type="button" id="trip-file-save" class="button button-light">Сохранить файл поездки</button></div>
    <p class="trip-link-note">Файл сохранит все дни, места, ночёвки, заметки, план расходов, оплаты и полученные возвраты. Откройте его здесь на другом телефоне. Номера брони и личные заметки записей тоже входят в файл: передавайте его тем, кому доверяете. Карты для прогулок без сети скачиваются отдельно.</p>
    <p class="trip-link-note">В ссылке — все дни и настройки, включая ваши заметки, источники цен, оплаты и полученные возвраты. Любой, у кого она есть, увидит эту поездку. Названия записей, даты, время и адреса тоже видны. Номера брони и личные заметки записей остаются у вас. Ссылка останется такой, какой вы её отправили.</p></details></div>
    <div id="trip-link-import" hidden><div class="trip-link-actions"><button type="button" id="trip-link-merge" class="button button-dark">Добавить к моему</button><button type="button" id="trip-link-replace" class="button button-light">Заменить мой маршрут</button></div>
    <p class="trip-link-note" id="trip-link-import-note"></p></div>
    <p id="trip-link-status" role="status" aria-live="polite"></p><button type="button" id="trip-link-undo" class="save-item" hidden>Вернуть мой черновик</button>`;
  document.body.append(dialog);
  dialog.querySelector('#trip-link-preview').before(dialog.querySelector('#trip-link-export'));
  const $ = selector => dialog.querySelector(selector);
  let snapshot, received = false, receivedFile = false, lastFocus, backup, imported, importedRevision, busy = false;
  let guideController;
  const message = text => { $('#trip-link-status').textContent = text; };
  const names = {all: 'Вся Балтика', kaliningrad: 'Калининград', 'kurshskaya-kosa': 'Куршская коса'};
  function show(result, incoming, source = 'link') {
    received = incoming; receivedFile = source === 'file'; backup = imported = null;
    snapshot = result.state;
    guideController?.abort();guideController=null;$('#trip-guide-save').disabled=false;$('#trip-guide-cancel').hidden=true;$('#trip-guide-status').textContent='';$('#trip-link-preview').open=incoming;
    $('#trip-link-undo').hidden = true; message('');
    $('#trip-link-title').textContent = result.error ? 'Маршрут не открылся' : incoming ? source === 'file' ? 'Поездка из файла' : 'Поездка по этой ссылке' : 'Возьмите маршрут с собой';
    $('#trip-link-intro').textContent = result.error || (incoming ? 'Посмотрите места. Затем добавьте их к своему черновику или возьмите эту поездку целиком.' : 'Сохраните день или всю поездку в телефоне. Карты и заметки откроются без интернета.');
    $('#trip-link-preview').hidden = Boolean(result.error);
    $('#trip-link-export').hidden = Boolean(result.error) || incoming;
    $('#trip-link-import').hidden = Boolean(result.error) || !incoming;
    if (snapshot) {
      const month = snapshot.month ? new Intl.DateTimeFormat('ru-RU', {month: 'long'}).format(new Date(2027, snapshot.month - 1, 1)) : null;
      $('#trip-link-date').textContent = snapshot.date ? 'Дата поездки: ' + new Intl.DateTimeFormat('ru-RU', {day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'}).format(new Date(snapshot.date + 'T12:00:00Z')) : month ? 'Месяц поездки: ' + month : 'Дата пока не выбрана';
      $('#trip-link-filters').textContent = 'Подбор прогулок: ' + names[snapshot.filters.area] + ' · ' + (snapshot.filters.minutes === 'all' ? 'без спешки' : 'до ' + (Number(snapshot.filters.minutes) / 60) + ' часов');
      for (const kind of ['places', 'routes', 'dreams']) {
        const group = $('#trip-link-' + kind), rows = kind === 'routes' ? catalog.routes : catalog.poi;
        group.hidden = !snapshot[kind]?.length;
        group.querySelector('ol, ul').replaceChildren(...(snapshot[kind] || []).map(id => {
          const item = rows.find(row => row.slug === id), li = document.createElement('li'), link = document.createElement('a');
          link.href = new URL(`${kind === 'routes' ? 'routes' : 'poi'}/${id}/`, base).href;
          link.textContent = item.name; li.append(link); return li;
        }));
      }
      const dayGroup=$('#trip-link-days');dayGroup.hidden=!snapshot.itinerary;dayGroup.replaceChildren();
      if(snapshot.itinerary) {
        $('#trip-link-places').hidden=true;
        journeyDays(snapshot).forEach((day,index)=>{
          const block=document.createElement('section');block.className='trip-link-day';const title=document.createElement('h3');
          title.textContent=`День ${index+1}`+(day.date?` · ${new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(day.date+'T12:00:00Z'))}`:' · дата пока не выбрана');block.append(title);
          const list=document.createElement('ol');
          for(const id of day.places) {const li=document.createElement('li'),link=document.createElement('a');link.href=new URL(`poi/${id}/`,base);link.textContent=catalog.poi.find(p=>p.slug===id).name;li.append(link);list.append(li);}block.append(list);
          for(const entry of day.transport_plans?.entries||[]){const r=entry.receipt,line=document.createElement('p');line.textContent=`Транспорт: ${r.title} · расчёт на ${transportDate(r.date)} · ${r.answers.people} чел. ${transportTotal(r.price)}`;block.append(line);}
          if(day.visited){const line=document.createElement('p');line.textContent=`Посещено остановок: ${day.visited.length} из ${day.places.length}. Отметки войдут в файл и ссылку.`;block.append(line);}
          for(const [key,caption]of [['start_at','Начало'],['night_at','К ночи']])if(day[key]) {const line=document.createElement('p');line.textContent=`${caption}: ${baseName(day[key],catalog)}`;block.append(line);}
          for(const row of day.bookings||[]){const line=document.createElement('p');line.textContent=`${row.name} · ${row.date||'дата не выбрана'} · ${row.status==='cancelled'?'отменено':row.status==='booked'?'вы отметили бронь':'планируете'}`;block.append(line);}
          if(day.note) {const line=document.createElement('p');line.textContent=day.note;block.append(line);}
          if(Object.keys(day.costs).length) {const line=document.createElement('p');line.textContent='План расходов, источники цен, оплаты и полученные возвраты сохранены.';block.append(line);}dayGroup.append(block);
        });
      }
      $('#trip-link-missing').hidden = !result.missing;
      $('#trip-link-missing').textContent = result.missing ? `Часть мест уже убрана из каталога (${result.missing}). Показаны доступные точки этой поездки.` : '';
      const link=tripLink(snapshot,catalog,base),transferable=new URL(link).hash.length-6<=Math.ceil(TRIP_FILE_BYTES*4/3);
      $('#trip-link-url').value=transferable?link:'';$('#trip-link-copy').disabled=$('#trip-link-send').disabled=!transferable;
      if(!transferable)message('Поездка слишком велика для ссылки. Сохраните её в файл: он сохранит все дни.');
      $('#trip-link-send').hidden = typeof navigator.share !== 'function';
      $('#trip-link-import-note').textContent = snapshot.itinerary || workshop.getState().itinerary ? '«Добавить к моему» сохранит ваши дни и добавит дни этой поездки следом. «Заменить мой маршрут» возьмёт всю поездку целиком. Изменение можно отменить здесь.' : '«Добавить к моему» оставит ваши точки первыми. «Заменить мой маршрут» возьмёт эту поездку целиком. В обоих случаях дата и подбор прогулок будут из этой поездки. Изменение можно отменить здесь.';
    }
    if (!dialog.open) {
      lastFocus = document.activeElement;
      document.querySelectorAll('dialog[open]').forEach(node => node.close());
      dialog.showModal();
    }
    $('#trip-link-close').focus();
  }
  function close() {
    guideController?.abort();
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
    if (received && !receivedFile && document.querySelector('#my-trip-title')) {
      const heading = document.querySelector('#my-trip-title'); heading.tabIndex = -1;
      heading.focus({preventScroll: true}); document.querySelector('#my-trip').scrollIntoView({block: 'start'});
    } else lastFocus?.focus({preventScroll: true});
  });
  trigger?.addEventListener('click', () => show({state: workshop.getState(), missing: 0}, false));
  $('#trip-guide-cancel').addEventListener('click',()=>guideController?.abort());
  $('#trip-guide-save').addEventListener('click',async()=>{
    if(!snapshot || guideController)return;
    const controller=new AbortController();guideController=controller;const signature=JSON.stringify(workshop.getState());
    const status=$('#trip-guide-status');$('#trip-guide-save').disabled=true;$('#trip-guide-cancel').hidden=false;
    const message=text=>{if(guideController===controller)status.textContent=text;};
    try{message('Готовим путеводитель…');const {downloadPersonalGuide}=await import('./trip-guide-ui.mjs?v=44');
      const result=await downloadPersonalGuide({trip:snapshot,catalog,base,scope:$('#trip-guide-scope').value,format:$('#trip-guide-format').value,signal:controller.signal,onProgress:message,stillCurrent:()=>JSON.stringify(workshop.getState())===signature});
      message(`PDF подготовлен: ${result.pages} стр., карты мест: ${result.map_count}. Сохраните файл в папку на телефоне.${result.warnings.length?' '+result.warnings.join(' '):''}`);
    }catch(error){message(controller.signal.aborted?'Сборка отменена. Поездка на месте.':error.message==='guide_trip_changed'?'Поездка изменилась во время сборки. Откройте «Взять с собой» заново и скачайте свежий план.':'Путеводитель не собрался целиком. Повторите при связи; ваш план на месте.');}
    finally{if(guideController===controller){guideController=null;$('#trip-guide-save').disabled=false;$('#trip-guide-cancel').hidden=true;}}
  });
  const fileOpen = document.querySelector('#trip-file-open');
  if (fileOpen) {
    const input = document.createElement('input'); input.id = 'trip-file-input'; input.type = 'file'; input.accept = '.json,application/json'; input.hidden = true;
    document.body.append(input);
    fileOpen.addEventListener('click', () => { input.value = ''; input.click(); });
    input.addEventListener('change', async () => {
      const file = input.files[0]; if (!file) return;
      let result;
      try { result = file.size > TRIP_FILE_BYTES ? {error: 'Этот файл слишком велик для поездки. Выберите файл, сохранённый на «Маршрутах Балтики». Ваш черновик на месте.'} : readTripFile(await file.text(), catalog); }
      catch { result = {error: 'Файл пока не открылся. Попробуйте ещё раз. Ваш черновик на месте.'}; }
      show(result, true, 'file'); lastFocus = fileOpen;
    });
    fileOpen.disabled = false;
  }
  $('#trip-file-save').addEventListener('click', () => {
    if (!snapshot) return;
    downloadTripFile(snapshot, catalog);
    message('Файл подготовлен. Сохраните его в папку на телефоне или компьютере.');
  });
  const persistent = document.querySelector('#trip-persist'), memoryStatus = document.querySelector('#trip-memory-status');
  if (persistent && memoryStatus) {
    let currentResult = {supported: false, granted: false}, requested = false;
    function memoryMessage(result, asked) {
      currentResult = result; requested = asked;
      persistent.hidden = !result.supported || result.granted;
      memoryStatus.textContent = !workshop.isSaved() ? 'Браузер не разрешил запись. Файл поездки сохранит ваш выбор.'
        : result.granted ? 'Браузер разрешил постоянное хранение для этого сайта. Файл поездки можно сохранить отдельно.'
        : result.failed ? 'Не получилось проверить хранение. Сохраните файл поездки, чтобы открыть её снова.'
        : asked ? 'Браузер не разрешил постоянное хранение. Сохраните файл поездки отдельно.'
        : 'Выбор хранится в этом браузере. Файл поездки поможет перенести его на другое устройство.';
    }
    persistentStorage(navigator.storage).then(result => {memoryMessage(result, false); persistent.disabled = false;});
    window.addEventListener('godune:trip-change', () => memoryMessage(currentResult, requested));
    persistent.addEventListener('click', async () => {
      persistent.disabled = true; memoryStatus.textContent = 'Проверяем, может ли браузер хранить поездку дольше…';
      memoryMessage(await persistentStorage(navigator.storage, true), true); persistent.disabled = false;
    });
  }
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
    try { await navigator.share({title: 'Моя поездка — Балтийские дюны', url: $('#trip-link-url').value}); message('Поездка отправлена.'); }
    catch (error) { if (error.name !== 'AbortError') message('Не получилось открыть отправку. Скопируйте ссылку.'); }
  });
  async function importTrip(replace) {
    if (!snapshot || busy) return;
    busy = true; $('#trip-link-merge').disabled = $('#trip-link-replace').disabled = true;
    const incoming = snapshot;
    let result;
    try { result = await workshop.setState(current => replace ? incoming : mergeTrips(current, incoming, catalog), replace ? 'Эта поездка стала вашим маршрутом.' : 'Точки добавлены к вашему маршруту.'); }
    finally {busy = false; $('#trip-link-merge').disabled = $('#trip-link-replace').disabled = false;}
    if (result.conflict) {message('Черновик изменился. Посмотрите свежий выбор и попробуйте снова.'); return;}
    backup = result.before; importedRevision = result.revision;
    imported = JSON.stringify(workshop.getState());
    $('#trip-link-import').hidden = true; $('#trip-link-undo').hidden = false;
    message(result.saved ? 'Поездка в вашем черновике. Здесь можно вернуть прежний выбор.' : receivedFile ? 'Поездка открыта в этой вкладке. Браузер не разрешил сохранение; файл поможет открыть её снова.' : 'Поездка открыта в этой вкладке. Браузер не разрешил сохранение; ссылка поможет открыть её снова.');
  }
  $('#trip-link-merge').addEventListener('click', () => importTrip(false));
  $('#trip-link-replace').addEventListener('click', () => importTrip(true));
  $('#trip-link-undo').addEventListener('click', async () => {
    if (busy || !backup) return;
    if (JSON.stringify(workshop.getState()) !== imported) {
      message('Черновик уже изменился в другой вкладке. Прежний выбор не восстановлен, чтобы сохранить эти изменения.'); return;
    }
    busy = true; $('#trip-link-undo').disabled = true;
    let result;
    try { result = await workshop.setState(backup, 'Ваш прежний черновик восстановлен.', {expectedRevision: importedRevision}); }
    finally {busy = false; $('#trip-link-undo').disabled = false;}
    if (result.conflict) {message('Черновик уже изменился в другой вкладке. Прежний выбор не восстановлен, чтобы сохранить эти изменения.'); return;}
    backup = imported = null; $('#trip-link-undo').hidden = true; $('#trip-link-import').hidden = false;
    message(result.saved ? 'Ваш прежний черновик на месте.' : 'Прежний черновик открыт в этой вкладке. Браузер не разрешил сохранение; возьмите поездку в файл.');
  });
  window.addEventListener('godune:memory-cleared', () => {
    snapshot = backup = imported = importedRevision = null; received = false;
    if (location.hash.startsWith('#trip=')) history.replaceState(null, '', location.pathname + location.search + '#my-trip');
    $('#trip-link-url').value = '';
    $('#trip-link-places ol').replaceChildren(); $('#trip-link-routes ul').replaceChildren();
    $('#trip-link-dreams ul').replaceChildren(); $('#trip-link-dreams').hidden = true;
    $('#trip-link-days').replaceChildren();
    $('#trip-link-date').textContent = $('#trip-link-filters').textContent = '';
    if (dialog.open) dialog.close();
  });
}
