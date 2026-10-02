import {defaultSchedule, planInput, updateSchedule} from './trip-schedule-state.mjs?v=1';
import {loadScheduler} from './trip-scheduler.mjs?v=1';

export const clock = minute => `${minute >= 1440 ? `+${Math.floor(minute/1440)} дн. ` : ''}${String(Math.floor(minute/60)%24).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
const timeInput = minute => minute === null ? '' : clock(minute%1440);
const minutes = text => /^\d{2}:\d{2}$/.test(text) ? Number(text.slice(0,2))*60+Number(text.slice(3)) : null;

export function initTripSchedule({mount, read, commit, base, catalog}) {
  if (!mount) return {render(){}};
  const section = document.createElement('section'); section.className='trip-schedule'; section.setAttribute('aria-labelledby','trip-plan-title');
  section.innerHTML=`<div class="trip-plan-heading"><div><p class="eyebrow">Оставьте время морю</p><h3 id="trip-plan-title">Ваш день, без спешки</h3><p>Осмотр, дорога и пауза у воды. Соберите день, в котором не придётся всё время спешить.</p></div><button type="button" class="button button-light" id="trip-plan-open" aria-expanded="false" aria-controls="trip-plan-body">Рассчитать время</button></div>
  <div id="trip-plan-body" hidden><p class="trip-plan-note">Время дороги и окно посещения задаёте вы. Перед поездкой сверьте их с картой, билетом и расписанием. Если дорога неизвестна, точного времени дальше не будет.</p><form id="trip-day-settings" class="trip-day-settings"></form><p id="trip-plan-summary" role="status"></p><ol id="trip-plan-stops" class="trip-plan-stops"></ol><p id="trip-plan-feedback" role="status"></p></div>`;
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
      timing.textContent=`${value.visit} мин на осмотр`+(value.pause ? ` · ${value.pause} мин пауза` : '')
        +(item.wait ? ` · ${item.wait} мин ожидание` : '')
        +(index>0 && value.leg?.from===trip.places[index-1] ? ` · ${value.leg.minutes} мин дорога + ${settings.reserve} мин запас` : '');
      li.append(timing);
      if(item.issues.length) {
        const issues=document.createElement('ul');issues.className='trip-plan-issues';
        for(const issue of item.issues) {
          const line=document.createElement('li');line.dataset.planIssue=issue.code;
          line.textContent={unknown_travel:'Сколько займёт дорога от предыдущей точки?',unknown_opening:'Время входа ещё нужно сверить.',
            closed:'В этот день место закрыто.',window_missed:'Осмотр целиком не помещается в окно посещения.',
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
    const expanded=[...section.querySelectorAll('details[open]')].map(node=>node.dataset.planEditor);
    section.dataset.scheduleReady='false';
    $('#trip-plan-summary').textContent='Раскладываем день…';
    try {
      const calculate=await loadScheduler(base);if(ticket!==sequence)return;
      const result=calculate(planInput(trip));
      renderSettings(settings);renderStops(trip,result);
      const summary=$('#trip-plan-summary');summary.dataset.planStatus=result.status;
      const intro={empty:'Сначала добавьте точки в свой маршрут.',fits:'По вашим оценкам, день складывается.',needs_check:'Время посчитано. Осталось сверить вход в выбранные места.',
        incomplete:'Для точного плана нужно время дороги.',overrun:'Этот день не вмещает все остановки.',conflict:'Есть остановки, которые не помещаются в окно посещения.'}[result.status];
      summary.textContent=intro+(result.stops.length ? ` ${result.finish === null ? 'Закончите не раньше' : 'Ориентир окончания:'} ${clock(result.earliest_finish)}.` : '')
        +(result.slack!==null && result.slack>=0 && result.stops.length ? ` До конца дня остаётся ${result.slack} мин.` : '');
      section.dataset.scheduleReady='true';
      for(const details of section.querySelectorAll('details')) details.open=expanded.includes(details.dataset.planEditor);
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
