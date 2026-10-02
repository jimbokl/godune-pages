import {defaultSchedule, planInput, updateSchedule} from './trip-schedule-state.mjs?v=2';
import {loadScheduler} from './trip-scheduler.mjs?v=2';
import {resolveVisitCalendar, visitFacts} from './visit-calendar.mjs?v=1';

export const clock = minute => `${minute >= 1440 ? `+${Math.floor(minute/1440)} дн. ` : ''}${String(Math.floor(minute/60)%24).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
const timeInput = minute => minute === null ? '' : clock(minute%1440);
const minutes = text => /^\d{2}:\d{2}$/.test(text) ? Number(text.slice(0,2))*60+Number(text.slice(3)) : null;

export function initTripSchedule({mount, read, commit, base, catalog}) {
  if (!mount) return {render(){}};
  const section = document.createElement('section'); section.className='trip-schedule'; section.setAttribute('aria-labelledby','trip-plan-title');
  section.innerHTML=`<div class="trip-plan-heading"><div><p class="eyebrow">Оставьте время морю</p><h3 id="trip-plan-title">Ваш день, без спешки</h3><p>Осмотр, дорога и пауза у воды. Соберите день, в котором не придётся всё время спешить.</p></div><button type="button" class="button button-light" id="trip-plan-open" aria-expanded="false" aria-controls="trip-plan-body">Рассчитать время</button></div>
  <div id="trip-plan-body" hidden><p class="trip-plan-note">Выберите дату — учтём обычные часы работы и начало сеансов. Дорогу и паузы задаёте вы. Перед поездкой сверьте расписание и наличие билетов. Если дорога неизвестна, точного времени дальше не будет.</p><form id="trip-day-settings" class="trip-day-settings"></form><p id="trip-plan-summary" role="status"></p><ol id="trip-plan-stops" class="trip-plan-stops"></ol><p id="trip-plan-feedback" role="status"></p></div>`;
  mount.insertBefore(section, mount.querySelector('#trip-weather, #trip-utilities'));
  const $=selector=>section.querySelector(selector);
  let opened=false, sequence=0;
  function input(form, caption, name, type, value, stop) {
    const label=document.createElement('label'), field=document.createElement('input');
    label.textContent=caption;field.type=type;field.name=name;field.value=value;field.dataset.planField=name;
    if (stop) field.dataset.planStop=stop;
    if (type==='number') {field.min='0';field.max='1440';field.step='1';field.required=true;}
    label.append(field);form.append(label);return field;
  }
  const applyButton = form => {
    const button=document.createElement('button');button.type='submit';button.className='save-item';button.textContent='Сохранить время';form.append(button);
  };
  function renderSettings(settings) {
    const form=$('#trip-day-settings');form.replaceChildren();
    input(form,'Начать в','start','time',timeInput(settings.start)).required=true;
    input(form,'Закончить до','end','time',timeInput(settings.end)).required=true;
    input(form,'Запас на каждый переход, мин','reserve','number',settings.reserve);
    applyButton(form);
  }
  function calendarCard(place, trip, value, manual, item) {
    const calendar=resolveVisitCalendar(place,trip.date,value.visit_fact), facts=visitFacts(place);
    const card=document.createElement('div');card.className='trip-visit-calendar';
    card.dataset.visitOrigin=manual ? 'manual' : calendar.windows!==null || calendar.sessions!==null ? 'calendar' : 'unknown';
    card.dataset.visitReason=calendar.reason || '';card.dataset.visitDate=trip.date || '';
    if(facts.length>1 || !place.hours && facts.length) {
      const label=document.createElement('label'), select=document.createElement('select');
      label.textContent='Что хотите посетить';select.dataset.planCalendar=item.id;select.dataset.planField='visit_fact';select.dataset.planStop=item.id;
      const automatic=document.createElement('option');automatic.value='';automatic.textContent=place.hours ? place.hours.label : 'Выберите посещение';select.append(automatic);
      for(const fact of facts.filter(row=>row.id!==place.hours?.id)) {
        const option=document.createElement('option');option.value=fact.id;option.textContent=fact.label;select.append(option);
      }
      if(value.visit_fact && !facts.some(row=>row.id===value.visit_fact)) {
        const missing=document.createElement('option');missing.value=value.visit_fact;missing.textContent='Прежнее расписание больше не доступно';select.append(missing);
      }
      select.value=value.visit_fact || '';label.append(select);card.append(label);
    }
    const title=document.createElement('p');title.className='trip-calendar-title';
    title.textContent=manual ? `Ваше время: ${clock(manual.open)}–${clock(manual.close)}` : calendar.fact?.label || 'Время посещения';card.append(title);
    const note=document.createElement('p');
    if(manual) note.textContent='Для этой даты расчёт использует ваше окно посещения.';
    else if(calendar.reason==='closed') note.textContent='По обычному расписанию в этот день выходной.';
    else if(calendar.windows?.length) {
      note.textContent=calendar.windows.map(window=>`${clock(window.open)}–${clock(window.close)}`+(window.last_entry!==undefined ? ` · вход до ${clock(window.last_entry)}` : '')).join('; ')
        +(calendar.rule?.cash_closes ? ` · касса до ${calendar.rule.cash_closes}` : '');
    } else if(calendar.sessions?.length) {
      note.textContent=`Сеанс занимает ${calendar.rule?.duration || calendar.sessions[0].duration} мин. Начало — строго по расписанию; наличие билетов нужно проверить.`;
      const times=document.createElement('details'), summary=document.createElement('summary'), list=document.createElement('p');
      summary.textContent='Все начала сеансов';list.textContent=calendar.sessions.map(row=>clock(row.start)).join(' · ');times.append(summary,list);card.append(times);
    } else note.textContent={choose_date:'Укажите дату поездки, чтобы сверить день недели и сезон.',outside_validity:'Это расписание не действует на выбранную дату. Уточните новое у места.',
      park_scope:'Часы территории парка не заменяют часы тропы или экскурсии.',cashdesk_scope:'Это часы кассы. Время концерта или спектакля выбирают по билету.',
      unknown_day:'Для этого дня часов пока нет. Уточните их у места.',missing_fact:'Прежнее расписание больше не доступно. Выберите другое посещение.',
      unknown_hours:'Точного окна для расчёта пока нет. Уточните его у места.'}[calendar.reason] || 'Часы на выбранную дату нужно уточнить.';
    card.append(note);
    if(calendar.fact) {
      const source=document.createElement('p');source.className='trip-calendar-source';const link=document.createElement('a');
      link.href=calendar.fact.source.url;link.target='_blank';link.rel='noopener';link.textContent=calendar.fact.source.name;
      source.append(link,` · проверено ${calendar.fact.source.checked_at.split('-').reverse().join('.')}`);card.append(source);
      if(!manual && calendar.needsCheck) {const caution=document.createElement('p');caution.className='trip-calendar-source';caution.textContent='Обычное расписание: праздники и изменения на дату поездки сверьте с местом.';card.append(caution);}
    }
    if(manual) {const reset=document.createElement('button');reset.type='button';reset.dataset.planReset=item.id;reset.className='save-item';reset.textContent='Вернуться к расписанию места';card.append(reset);}
    if(calendar.reason==='choose_date' && !manual) {const choose=document.createElement('button');choose.type='button';choose.className='save-item';choose.textContent='Указать дату';choose.addEventListener('click',()=>document.querySelector('#trip-date')?.focus());card.append(choose);}
    return card;
  }
  function renderStops(trip, result) {
    const settings=trip.schedule || defaultSchedule();
    $('#trip-plan-stops').replaceChildren(...result.stops.map((item,index)=>{
      const place=catalog.poi.find(row=>row.slug===item.id), value=settings.stops[item.id] || {visit:30,pause:0,leg:null,window:null};
      const window=value.window?.date === trip.date ? value.window : null;
      const li=document.createElement('li');li.dataset.planPoint=item.id;
      const header=document.createElement('div');header.className='trip-timeline-heading';
      const time=document.createElement('span');time.className='trip-timeline-time';
      time.textContent=item.begins === null ? `Не раньше ${clock(item.earliest_begin)}` : clock(item.begins);
      const name=document.createElement('a');name.href=new URL(`poi/${item.id}/`,base).href;name.textContent=place.name;
      header.append(time,name);li.append(header);
      const timing=document.createElement('p');timing.className='trip-timeline-detail';
      timing.textContent=`${item.visit_minutes} мин на осмотр`+(value.pause ? ` · ${value.pause} мин пауза` : '')
        +(item.wait ? ` · ${item.wait} мин ожидание` : '')
        +(index>0 && value.leg?.from===trip.places[index-1] ? ` · ${value.leg.minutes} мин дорога + ${settings.reserve} мин запас` : '');
      li.append(timing);
      li.append(calendarCard(place,trip,value,window,item));
      if(item.issues.length) {
        const issues=document.createElement('ul');issues.className='trip-plan-issues';
        for(const issue of item.issues) {
          const line=document.createElement('li');line.dataset.planIssue=issue.code;
          line.textContent={unknown_travel:'Сколько займёт дорога от предыдущей точки?',unknown_opening:'Время входа ещё нужно сверить.',
            opening_needs_check:'Часы учтены. Осталось сверить дату и билеты с местом.',
            closed:'По выбранному расписанию в этот день нет посещений.',window_missed:'Осмотр не помещается в часы работы или время последнего входа; подходящего сеанса тоже нет.',
            after_deadline:`Позже конца дня как минимум на ${issue.minutes} мин.`}[issue.code];
          if(['closed','window_missed','after_deadline'].includes(issue.code)) li.dataset.planConflict='true';
          issues.append(line);
        }li.append(issues);
      }
      const details=document.createElement('details'), summary=document.createElement('summary'), form=document.createElement('form');
      details.dataset.planEditor=item.id;summary.textContent='Настроить остановку';form.dataset.planEdit=item.id;form.dataset.planFrom=trip.places[index-1] || '';form.dataset.planDay=trip.date || '';form.className='trip-stop-settings';details.append(summary,form);
      input(form,'На осмотр, мин','visit','number',value.visit,item.id);
      input(form,'Пауза после осмотра, мин','pause','number',value.pause,item.id);
      if(index>0) {const travel=input(form,'Дорога от предыдущей точки, мин','travel','number',value.leg?.from===trip.places[index-1] ? value.leg.minutes : '',item.id);travel.required=false;travel.placeholder='Пока неизвестно';}
      input(form,'Вход не раньше, если знаете','open','time',timeInput(window?.open ?? null),item.id);
      input(form,'Закончить осмотр до, если знаете','close','time',timeInput(window?.close ?? null),item.id);
      if(value.window && !window) {const note=document.createElement('p');note.className='trip-plan-note';note.textContent='Окно посещения было задано для другой даты. Уточните его заново.';form.append(note);}
      applyButton(form);li.append(details);return li;
    }));
  }
  async function render() {
    section.hidden = read().places.length === 0;
    if(!opened) return;
    const ticket=++sequence, trip=read(), settings=trip.schedule || defaultSchedule();
    const focused=document.activeElement?.dataset.planField, focusedStop=document.activeElement?.dataset.planStop;
      const expanded=[...section.querySelectorAll('details[data-plan-editor][open]')].map(node=>node.dataset.planEditor);
    section.dataset.scheduleReady='false';
    $('#trip-plan-summary').textContent='Раскладываем день…';
    try {
      const calculate=await loadScheduler(base);if(ticket!==sequence)return;
      const result=calculate(planInput(trip,catalog));
      renderSettings(settings);renderStops(trip,result);
      const summary=$('#trip-plan-summary');summary.dataset.planStatus=result.status;
      const intro={empty:'Сначала добавьте точки в свой маршрут.',fits:'По вашим оценкам, день складывается.',needs_check:'Время посчитано. Осталось сверить вход в выбранные места.',
        incomplete:'Для точного плана нужно время дороги.',overrun:'Этот день не вмещает все остановки.',conflict:'Есть остановки, которые не помещаются в окно посещения.'}[result.status];
      summary.textContent=intro+(result.stops.length ? ` ${result.finish === null ? 'Закончите не раньше' : 'Ориентир окончания:'} ${clock(result.earliest_finish)}.` : '')
        +(result.slack!==null && result.slack>=0 && result.stops.length ? ` До конца дня остаётся ${result.slack} мин.` : '');
      section.dataset.scheduleReady='true';
      for(const details of section.querySelectorAll('details[data-plan-editor]')) details.open=expanded.includes(details.dataset.planEditor);
      if(focused) [...section.querySelectorAll('[data-plan-field]')].find(node=>node.dataset.planField===focused && node.dataset.planStop===focusedStop)?.focus({preventScroll:true});
    } catch {
      if(ticket!==sequence)return;
      $('#trip-plan-summary').textContent='Расчёт дня сейчас не открылся. Ваш маршрут сохранён; попробуйте ещё раз.';
      section.dataset.scheduleReady='error';
    }
  }
  $('#trip-plan-open').addEventListener('click',()=>{
    opened=!opened;$('#trip-plan-body').hidden=!opened;$('#trip-plan-open').setAttribute('aria-expanded',String(opened));
    $('#trip-plan-open').textContent=opened?'Свернуть план':'Рассчитать время';
    if(opened) render();else sequence++;
  });
  section.addEventListener('change',event=>{
    const id=event.target.dataset.planCalendar;if(!id)return;
    const fact=event.target.value || null;
    commit(current=>updateSchedule(current,'visit_fact',fact,id),'Посещение выбрано.');
  });
  section.addEventListener('click',event=>{
    const id=event.target.closest('[data-plan-reset]')?.dataset.planReset;if(!id)return;
    commit(current=>updateSchedule(current,'window',null,id),'Вернулись к расписанию места.');
  });
  section.addEventListener('submit',async event=>{
    event.preventDefault();const form=event.target, values=new FormData(form), id=form.dataset.planEdit;
    const feedback=$('#trip-plan-feedback');feedback.textContent='';
    let fields;
    if(id) {
      const open=minutes(values.get('open')), close=minutes(values.get('close'));
      if((open===null)!==(close===null) || open!==null && open >= (close===0 ? 1440 : close)) {feedback.textContent='Укажите обе границы окна: начало раньше конца.';return;}
      fields=[['visit',Number(values.get('visit'))],['pause',Number(values.get('pause'))],['window',open===null?null:{open,close:close===0?1440:close}]];
      if(values.has('travel'))fields.push(['travel',values.get('travel')===''?null:Number(values.get('travel'))]);
    } else {
      const start=minutes(values.get('start')), end=minutes(values.get('end'))===0?1440:minutes(values.get('end'));
      if(start===null || end===null || start>=end) {feedback.textContent='Время начала должно быть раньше конца дня.';return;}
      fields=[['start',start],['end',end],['reserve',Number(values.get('reserve'))]];
    }
    const from=form.dataset.planFrom || '', day=form.dataset.planDay || '';let changedContext=false;
    await commit(current=>{
      // Apply related fields together, so a temporarily invalid start/end cannot lose a user's edit.
      if(!id) return {...current,schedule:{...(current.schedule||defaultSchedule()),...Object.fromEntries(fields)}};
      return fields.reduce((next,[field,value])=>{
        if(field==='travel' && (current.places[current.places.indexOf(id)-1] || '')!==from || field==='window' && (current.date || '')!==day) {changedContext=true;return next;}
        return updateSchedule(next,field,value,id);
      },current);
    },'План дня сохранён.');
    if(changedContext) feedback.textContent='Порядок или дата уже изменились. Проверьте дорогу и окно посещения заново.';
  });
  return {render};
}
