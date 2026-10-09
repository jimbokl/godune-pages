import {loadScheduler} from './trip-scheduler.mjs?v=42';
import {selectedDay} from './trip-days-state.mjs?v=27';
import {hasServiceVisits,serviceVisitRows} from './trip-service-visits-contract.mjs?v=1';
import {loadTripTravelMatrix} from './travel-estimates.mjs?v=13';
import {inspectTripServiceDay} from './trip-service-day-state.mjs?v=8';
import {formatKopecks as money} from './trip-money.mjs';
import {activateTimeline,moveTimelineEntry,timelineGuard,validTimeline} from './trip-service-timeline-state.mjs';
import {serviceTimelineView} from './trip-service-timeline-ui.mjs?v=8';
import {initWaveMenuPicker} from './wave-menu-picker.mjs?v=3';
import {selectTab} from './wave-stop-ui.mjs?v=4';
import {dayJourneyBoundaries,boundaryForEntry,usesJourneyBoundaries} from './day-journey-boundaries.mjs?v=4';
import {dayOutcome} from './day-outcome.mjs?v=1';

const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const clock=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
const errors={service_day_generated_unresolved:'Посещения пока не сверены с поездкой на косу. Они остаются в вашем дне.',service_day_rail_unresolved:'Выбранные электрички нужно проверить заново. Посещения пока не сверены с возвращением.',arrival_after_day:'Прибытие позже конца дня. Проверьте время дня.',departure_before_day:'Срок возвращения раньше начала дня. Проверьте время дня.'};
Object.assign(errors,{service_timeline_unsupported:'Порядок сохранён в другой версии. Он остаётся в файле поездки.',service_timeline_anchor_conflict:'У двух посещений расходятся точки пути. Дорогу нужно уточнить; ваш выбор на месте.'});
errors.service_transfer_connections_unsupported='Дорога сохранена в другой версии или не прочитана. Ваш выбор остаётся в файле поездки.';

export function initServiceDayCheck({heading,read,commit,base,catalog,onSettings,onExpense}){
 const panel=node('div',undefined,'visit-day-check');panel.hidden=true;panel.dataset.serviceDayState='empty';
 const title=node('h4','Как посещения вписываются в день'),status=node('p',undefined,'visit-day-status');status.setAttribute('role','status');
 const body=node('div');panel.append(title,status,body);heading.after(panel);
 let sequence=0,last,pending=false,focusEntry,menuPicker,waveState,renderedDayId;
 const feedback=node('p',undefined,'visit-feedback');feedback.setAttribute('aria-live','polite');panel.append(feedback);
 async function change(transform,message,focus){
  if(pending)return;pending=true;feedback.textContent='Сохраняем порядок…';
  panel.querySelectorAll('button').forEach(button=>button.disabled=true);
  try{const outcome=await commit(transform,message);feedback.textContent=outcome.conflict?'День уже изменился. Показан новый порядок.':outcome.saved?message:'Порядок остаётся в этой вкладке. Скачать файл поездки можно в «Взять с собой».';}
  catch(error){feedback.textContent=error.message;}
  finally{pending=false;focusEntry=focus||{activate:true};await render(true);}
 }
 function details(result,trip){
  const day=selectedDay(trip),names=new Map(serviceVisitRows(day).map(v=>[v?.id,typeof v?.name==='string'?v.name:'Сохранённое посещение']));
  const boundaries=dayJourneyBoundaries(day,catalog);
  const name=entry=>boundaryForEntry(boundaries,entry)?.anchor?.name||(entry?.kind==='service'?names.get(entry.id)||'Посещение':catalog.poi.find(p=>p.slug===entry?.id)?.name||({__day_origin:'Начало дня',__day_night:'Ночёвка',__day_departure:'Отъезд'}[entry?.id]||'Остановка прогулки'));
  const times=node('dl',undefined,'visit-day-times');
  const timeRow=(caption,value)=>{const row=node('div');row.append(node('dt',caption),node('dd',value));times.append(row);};
  timeRow('Время дня',`${clock(result.day_window.start)} → ${clock(result.day_window.end)}`);
  const rail=result.places.rail;
  if(rail){
   timeRow('Электричка туда',`Прибытие в ${clock(rail.outward_arrival)}`);
   timeRow('Электричка обратно',`Отправление в ${clock(rail.inbound_departure)}`);
   timeRow('Начало прогулки после электрички',rail.itinerary_start===null?'Время выхода ещё неизвестно':clock(rail.itinerary_start));
   timeRow('Возвращение к электричке',rail.itinerary_deadline===null?'Время на дорогу ещё неизвестно':`Закончить прогулку до ${clock(rail.itinerary_deadline)}`);
  }
  for(const visit of result.itinerary?[]:result.visits){
   if(!visit.assessment)continue;
   const {arrival}=visit.assessment.visit.timeline,{departure}=visit.assessment.summary;
   timeRow(names.get(visit.id)||'Посещение',`${clock(arrival)} → ${departure===null?'Конец пока неизвестен':clock(departure)}`);
  }
  body.append(times);
  if(result.itinerary){
   const guard=timelineGuard(trip);
   if(result.itinerary.connections[0]?.status==='shared')body.append(node('p','День начинается у первой остановки. Дорога от жилья сюда считается отдельно.','visit-day-footnote'));
   const list=serviceTimelineView({result,day,trip,catalog,base,onSettings,onExpense,onMove:(entry,direction)=>change(current=>moveTimelineEntry(current,entry,direction,guard),'Порядок дня сохранён.',entry)});body.append(list);
   if(document.body.classList.contains('day-planner')){
    const card=[...list.querySelectorAll('[data-wave-stop]')].find(row=>row.dataset.waveStop===waveState?.point);
    if(card){card.open=true;selectTab(card,waveState.tab);const menu=card.querySelector('[data-wave-panel="menu"]');if(menu)menu.dataset.waveMenuSearch=waveState.query;}
    menuPicker=initWaveMenuPicker({root:list,trip,catalog,base,read,commit});menuPicker.render(trip);
   }
  }else if(commit&&!Object.hasOwn(day,'timeline')&&!day.kosa_plan){
   const activate=node('button','Собрать всё по порядку','visit-primary');activate.type='button';
   activate.addEventListener('click',()=>{const guard=timelineGuard(trip);change(current=>activateTimeline(current,guard),'Места и посещения собраны в один день.');});
   body.append(node('p','Соединим места и посещения. Их выбранное время сохранится.','visit-day-footnote'),activate);
  }
  const issues=[];
  for(const row of result.overlaps)issues.push(`«${name(row.first)}» и «${name(row.second)}» пересекаются ${row.precision==='minimum'?'как минимум ':''}на ${row.minutes} мин.`);
  for(const issue of result.issues){
   const text={outside_day_window:`«${name(issue.entry)}» выходит за время дня или выбранные рейсы.`,connection_after_day:'Выбранный рейс возвращает вас позже окончания дня.',connection_after_day_risk:'По приблизительному расчёту выбранная поездка может закончиться позже времени дня.',day_end_risk:'По приблизительному расчёту день может закончиться позже выбранного времени.',selected_connections_changed:'Порядок остановок изменился. Проверьте выбранные пересадки.',date_changed:`«${name(issue.entry)}» выбрано на другую дату. Пересчитайте посещение ниже.`,date_missing:'Укажите дату дня, чтобы сверить выбранные посещения.',service_time_unknown:`У «${name(issue.entry)}» ещё неизвестна часть времени.`,service_connections_unknown:'Дорога между остановками ещё не учтена.',unresolved_visits:'Часть сохранённых посещений пока не удалось проверить. Они остаются в файле поездки.'}[issue.code];
   if(text)issues.push(text);
  }
  if(['conflict','overrun'].includes(result.places.status))issues.push(result.itinerary?'День не укладывается в выбранное время. Проверьте порядок и паузы.':'Прогулка не укладывается в выбранное время. Проверьте её таймлайн.');
  for(const visit of result.visits)if(visit.assessment?.state==='does_not_fit')issues.push(`Проверьте время и условия у «${names.get(visit.id)||'посещения'}».`);
  if(issues.length){const list=node('ul',undefined,'visit-day-issues');for(const text of new Set(issues))list.append(node('li',text));body.append(list);}
  if(!serviceVisitRows(day).length)return;
  const budget=result.services_budget,forecast=node('dl',undefined,'visit-day-budget');
  for(const [caption,value] of [
   ['Плановая стоимость услуг · на вашу группу',budget.cost_total!==null?money(budget.cost_total):budget.cost_lower_bound>0?`Не меньше ${money(budget.cost_lower_bound)} · полная сумма неизвестна`:'Пока неизвестна'],
   ['Возвратный залог',budget.deposit_total!==null?money(budget.deposit_total):budget.deposit_known>0?`Известно ${money(budget.deposit_known)} · полная сумма неизвестна`:'Пока неизвестен']
  ]){const row=node('div');row.append(node('dt',caption),node('dd',value));forecast.append(row);}
  body.append(forecast,node('p','Записанные расходы считаются отдельно.','visit-day-footnote'));
 }
 async function render(force=false){
  const trip=structuredClone(read()),day=selectedDay(trip),stamp=JSON.stringify(trip);
  if(!force&&stamp===last)return;last=stamp;const ticket=++sequence;
  const active=validTimeline(day.timeline)||usesJourneyBoundaries(day,catalog);
  const currentOpen=body.querySelector('[data-wave-stop][open]');
  if(currentOpen)waveState={dayId:renderedDayId,point:currentOpen.dataset.waveStop,tab:currentOpen.querySelector('[data-wave-tab][aria-pressed="true"]')?.dataset.waveTab||'place',query:currentOpen.querySelector('input[type="search"]')?.value||''};
  else if(body.childElementCount)waveState=null;
  if(waveState?.dayId!==day.id)waveState=null;
  panel.hidden=!hasServiceVisits(day)&&!Object.hasOwn(day,'timeline')&&!Object.hasOwn(day,'transfer_connections')&&!usesJourneyBoundaries(day,catalog);menuPicker?.cleanup();body.replaceChildren();
  title.textContent=active?'Остановки по порядку':'Как посещения вписываются в день';
  if(panel.hidden){status.textContent='';panel.dataset.serviceDayState='empty';return;}
  panel.dataset.serviceDayState='loading';status.textContent='Сверяем посещения с планом дня…';
  try{
   const [engine,matrix]=await Promise.all([loadScheduler(base),trip.places.length?loadTripTravelMatrix(base,trip,catalog).catch(()=>null):null]);
   if(ticket!==sequence||JSON.stringify(read())!==stamp)return;
   const result=inspectTripServiceDay(engine,trip,catalog,matrix);
   panel.dataset.serviceDayState=result.state;status.textContent=dayOutcome(result);details(result,trip);renderedDayId=day.id;
   if(pending)panel.querySelectorAll('button').forEach(button=>button.disabled=true);
   if(focusEntry){const item=[...panel.querySelectorAll('[data-timeline-kind]')].find(n=>n.dataset.timelineId===focusEntry.id&&n.dataset.timelineKind===focusEntry.kind);if(item)item.querySelector('[data-timeline-title]').focus({preventScroll:true});else heading.focus({preventScroll:true});focusEntry=null;}
  }catch(error){
   if(ticket!==sequence||JSON.stringify(read())!==stamp)return;
   panel.dataset.serviceDayState='error';status.textContent=errors[error.message]||'Не получилось сверить день. Ваш выбор на месте.';
   const retry=node('button','Проверить ещё раз','visit-secondary');retry.type='button';retry.addEventListener('click',()=>render(true));body.append(retry);
  }
 }
 return {render};
}
