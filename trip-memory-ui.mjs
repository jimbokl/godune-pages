import {offlineAction} from './offline.mjs?v=6';

export function initMemoryControls(catalog, base, workshop) {
  const historyButton = document.querySelector('#trip-history'), clearButton = document.querySelector('#trip-clear');
  if (!historyButton || !clearButton) return;
  historyButton.disabled = clearButton.disabled = false;
  const dialog = document.createElement('dialog'); dialog.id = 'trip-memory-dialog'; dialog.className = 'trip-link-dialog';
  dialog.setAttribute('aria-labelledby', 'trip-memory-title');
  dialog.innerHTML = `<div class="dialog-top"><p class="eyebrow">Ваш черновик на месте</p><button type="button" class="icon-button" id="trip-memory-close" aria-label="Закрыть память поездки">×</button></div>
    <h2 id="trip-memory-title"></h2><p id="trip-memory-intro"></p><div id="trip-history-list"></div>
    <div id="trip-revision-preview" hidden><h3>В этой версии</h3><p id="trip-revision-date"></p><ol id="trip-revision-places"></ol><ul id="trip-revision-routes"></ul><button id="trip-revision-restore" type="button" class="button button-dark">Восстановить эту версию</button></div>
    <details id="trip-planning-progress" class="wizard-evidence"><summary>Что уже получилось</summary><p id="trip-progress-count"></p><p id="trip-progress-time"></p><p>Здесь только планы, начатые Вами в мастере или на странице Куршской косы в этом браузере. Обычный просмотр страницы не считается. Расчёт по карте и расписанию ещё не означает проверку на месте.</p><button id="trip-progress-export" type="button" class="button button-outline">Скачать сводку</button><p>Сводка хранится здесь: без названий мест, маршрутов и личных записей. Удаление памяти сайта удалит и её.</p></details>
    <div id="trip-clear-confirm" hidden><p>Исчезнут черновик и его предыдущие версии, личные точки, дата и настройки поездки, отметки на остановках, выбор города для погоды, загруженные прогулки и дорожные графы.</p><p>Скачанные вами файлы поездки и отправленные ссылки останутся у вас и у получателей. Другие устройства это действие не затронет.</p><button id="trip-clear-do" type="button" class="button button-dark">Удалить данные в этом браузере</button></div>
    <p id="trip-memory-result" role="status" aria-live="polite"></p>`;
  document.body.append(dialog);
  const $ = selector => dialog.querySelector(selector);
  let focus, selected, openedRevision, request = 0;
  const count = (value, forms) => value + ' ' + forms[value % 100 >= 11 && value % 100 <= 14 ? 2 : value % 10 === 1 ? 0 : value % 10 >= 2 && value % 10 <= 4 ? 1 : 2];
  function progress() {
    const summary=workshop.progress?.summary();if(!summary)return;
    $('#trip-progress-count').textContent=summary.started?`В ${summary.usable} из ${summary.started} начатых планов есть рассчитанный и сохранённый день. Ещё требуют уточнения: ${summary.incomplete}. Браузер не сохранил: ${summary.not_saved}.`:'Пока нет записанных попыток планирования. Начните с мастера или дня на Куршской косе.';
    $('#trip-progress-time').textContent=summary.mean_time_ms===null?'':`В среднем до первого рассчитанного и сохранённого дня — ${summary.mean_time_ms<60000?'меньше минуты':`${Math.ceil(summary.mean_time_ms/60000)} мин.`}`;
  }
  workshop.progress?.subscribe(progress);progress();
  $('#trip-progress-export').addEventListener('click',()=>{
    const link=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(workshop.progress.export(),null,2)],{type:'application/json'}));
    link.href=url;link.download='godune-planning-summary.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  function open(title, intro) {
    request++; focus = document.activeElement; selected = null; openedRevision = workshop.getRevision();
    $('#trip-memory-title').textContent = title; $('#trip-memory-intro').textContent = intro;
    $('#trip-memory-result').textContent = ''; $('#trip-history-list').replaceChildren();
    $('#trip-revision-preview').hidden = $('#trip-clear-confirm').hidden = true;
    $('#trip-planning-progress').hidden=false;$('#trip-planning-progress').open=false;progress();
    document.querySelectorAll('dialog[open]').forEach(node => node.close());
    dialog.showModal(); $('#trip-memory-close').focus();
  }
  $('#trip-memory-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => focus?.focus({preventScroll: true}));
  window.addEventListener('godune:memory-cleared', () => {
    request++; selected = null;
    $('#trip-history-list').replaceChildren(); $('#trip-revision-places').replaceChildren(); $('#trip-revision-routes').replaceChildren();
    $('#trip-revision-date').textContent = ''; $('#trip-revision-preview').hidden = true;
    $('#trip-revision-restore').disabled = true;
    if (dialog.open && $('#trip-clear-confirm').hidden) dialog.close();
    window.dispatchEvent(new Event('godune:offline-change'));
  });
  historyButton.addEventListener('click', async () => {
    open('Предыдущие версии поездки', 'Можно вернуться к прежнему выбору. Текущий черновик тоже останется среди версий.');
    const token = request;
    const rows = await workshop.history();
    if (!dialog.open || token !== request) return;
    if (!rows.length) {
      $('#trip-memory-result').textContent = workshop.memoryMode() === 'indexeddb' ? 'Предыдущих версий пока нет. Они появятся после изменения черновика.' : 'Браузер не открыл хранилище версий. Текущий выбор можно сохранить в файл.';
      return;
    }
    for (const row of rows) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'trip-revision-choice';
      const time = document.createElement('strong'), note = document.createElement('span');
      time.textContent = new Intl.DateTimeFormat('ru-RU', {day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Kaliningrad'}).format(new Date(row.savedAt));
      note.textContent = count(row.state.places.length, ['точка','точки','точек']) + ' · ' + count(row.state.routes.length, ['прогулка','прогулки','прогулок']);
      button.append(time, note);
      button.addEventListener('click', () => {
        selected = row; $('#trip-revision-preview').hidden = false;
        $('#trip-revision-date').textContent = row.state.date ? 'Дата поездки: ' + new Intl.DateTimeFormat('ru-RU', {day:'numeric', month:'long', year:'numeric', timeZone:'UTC'}).format(new Date(row.state.date+'T12:00:00Z')) : row.state.month ? 'Месяц поездки: ' + new Intl.DateTimeFormat('ru-RU', {month:'long'}).format(new Date(2027,row.state.month-1,1)) : 'Дата пока не выбрана';
        for (const kind of ['places','routes']) {
          const list = $('#trip-revision-'+kind), items = kind==='places' ? catalog.poi : catalog.routes;
          list.replaceChildren(...row.state[kind].map(id => {
            const li = document.createElement('li'); li.textContent = items.find(item=>item.slug===id)?.name || 'Место больше не входит в каталог'; return li;
          }));
        }
        $('#trip-revision-restore').disabled = false; $('#trip-memory-result').textContent = '';
      });
      $('#trip-history-list').append(button);
    }
  });
  $('#trip-revision-restore').addEventListener('click', async () => {
    if (!selected) return;
    const button = $('#trip-revision-restore'); button.disabled = true;
    const result = await workshop.setState(selected.state, 'Предыдущая версия поездки восстановлена.', {expectedRevision: openedRevision});
    $('#trip-memory-result').textContent = result.conflict ? 'Черновик изменился, пока вы смотрели версии. Закройте окно и откройте версии снова — свежий выбор сохранён.' : result.saved ? 'Эта версия стала вашим черновиком. Прежний выбор сохранён среди версий.' : 'Версия открыта в этой вкладке. Браузер не разрешил запись; сохраните поездку в файл.';
  });
  clearButton.addEventListener('click', () => {
    open('Удалить память сайта?', 'Удаление касается только этого браузера. Перед ним можно закрыть окно и сохранить поездку в файл.');
    $('#trip-clear-confirm').hidden = false; $('#trip-clear-do').disabled = false;$('#trip-planning-progress').hidden=true;
  });
  $('#trip-clear-do').addEventListener('click', async () => {
    $('#trip-clear-do').disabled = true;
    window.dispatchEvent(new Event('godune:memory-clearing'));
    let packagesRemoved = true;
    try {
      const registration = await navigator.serviceWorker?.getRegistration(new URL('.',base).href);
      if (registration?.active) await offlineAction(base, {type:'CLEAR'});
      else if ('caches' in window) for (const name of (await caches.keys()).filter(name=>name.startsWith('godune-walk-offline:')||name.startsWith('godune-routing:'))) await caches.delete(name);
    } catch { packagesRemoved = false; }
    const result = await workshop.clearMemory();
    selected = null; $('#trip-history-list').replaceChildren(); $('#trip-revision-places').replaceChildren(); $('#trip-revision-routes').replaceChildren();
    window.dispatchEvent(new Event('godune:offline-change'));
    const complete = result.fullyCleared && result.localRemoved && packagesRemoved;
    $('#trip-memory-result').textContent = complete ? 'Черновик, версии, отметки и загруженные прогулки удалены из этого браузера. Можно начать новую поездку.' : 'Не всю память удалось удалить. Браузер отказал в доступе к части данных. Попробуйте ещё раз или удалите данные godune.ru в настройках браузера.';
    $('#trip-clear-do').disabled = complete;
  });
}
