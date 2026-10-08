import {serviceVisitRows} from './trip-service-visits-contract.mjs?v=1';
import {timelineOrder} from './trip-service-timeline-state.mjs';
import {serviceExpenseButton} from './trip-service-expenses-ui.mjs';
import {rentalFactsElement} from './trip-rental-view.mjs';
import {selectedConnectionRows,unusedConnectionRows,transferClock} from './trip-service-transfer-view.mjs';
import {decorateStop} from './wave-stop-ui.mjs?v=4';
import {dayJourneyBoundaries,boundaryForEntry} from './day-journey-boundaries.mjs?v=3';
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const clock=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
const roadNames={unknown:'Время дороги пока неизвестно',stale:'Сведения о дороге нужно обновить',changed_point:'Точка пути изменилась — дорогу нужно проверить',conflict:'Источники по дороге расходятся',blocked:'Этот переход недоступен'};
export function serviceTimelineView({result,day,trip,catalog,base,onMove,onSettings,onExpense}){
 const wave=document.body.classList.contains('day-planner');
 const list=node('ol',undefined,'visit-timeline');list.setAttribute('aria-label','Остановки дня по порядку');
 const boundaries=dayJourneyBoundaries(day,catalog),editable=timelineOrder(day),visits=serviceVisitRows(day),scheduled=result.itinerary.order.filter(v=>boundaryForEntry(boundaries,v)||(v.kind!=='origin'&&(v.kind!=='destination'||result.itinerary.connections.some(c=>c.to===v.schedule_id&&c.selection))));let number=0;
 // Unsupported visits stay visible at the user's chosen position, even when
 // Rust cannot calculate their nested selection in this version.
 for(let i=0;i<editable.length;i++){
  const entry=editable[i];if(scheduled.some(v=>v.kind===entry.kind&&v.id===entry.id))continue;
  const next=editable.slice(i+1).find(v=>scheduled.some(row=>row.kind===v.kind&&row.id===v.id));
  const index=next?scheduled.findIndex(v=>v.kind===next.kind&&v.id===next.id):scheduled.length;
  scheduled.splice(index,0,{...entry,schedule_id:null});
 }
 for(const entry of scheduled){
  const boundary=boundaryForEntry(boundaries,entry),point=catalog.poi.find(p=>p.slug===entry.id),visit=entry.kind==='service'?visits.find(v=>v.id===entry.id):null;
  const name=boundary?`${entry.kind==='origin'?'Начало':entry.kind==='destination'&&boundaries.bookings.end?'Отъезд':'Возвращение'} · ${boundary.anchor?.name||'Точка поездки'}`:visit?.name||point?.name||(entry.kind==='destination'?'Возвращение':({__day_origin:'Начало дня',__day_night:'Ночёвка',__day_departure:'Отъезд'}[entry.id]||'Остановка'));
  const item=node('li',undefined,'visit-timeline-item');item.dataset.timelineKind=entry.kind;item.dataset.timelineId=entry.id;
  const connection=result.itinerary.connections.find(v=>v.to===entry.schedule_id),minutes=connection?.leg?.minutes;
  if(connection){
   const road=node('div',undefined,'visit-timeline-road');road.dataset.timelineRoad=connection.status;
   const transferRows=selectedConnectionRows(connection,{title:`Дорога к «${name}»`});
   if(transferRows){
    for(const row of transferRows){
     const part=node('div');part.dataset.transferStatus=row.status||row.state;
     part.append(node('p',`${row.time==null?'Время уточним':transferClock(row.time)} · ${row.title}`),node('p',row.text));
     if(row.sources.length){const details=node('details');details.append(node('summary','Откуда время и условия'));for(const source of row.sources)details.append(node('p',`${source.name} · ${source.name==='Ваша оценка времени'?'записано':'проверено'} ${source.checked_at}`));part.append(details);}
     road.append(part);
    }
   }else{
   const startsHere=result.itinerary.order.some(v=>v.kind==='origin'&&v.schedule_id===connection.from);
   road.append(node('p',minutes===0?(startsHere?'Начало здесь':'Тот же ориентир'):minutes!=null?`Переход · ${minutes} мин`:roadNames[connection.status]||roadNames.unknown));
   if(connection.leg?.candidates?.length){
    const sources=node('details');sources.append(node('summary','Откуда время дороги'));
    for(const candidate of connection.leg.candidates){const {reference,checked_at}=candidate.link.source;sources.append(node('p',`${candidate.link.basis==='map_estimate'?'Оценка по карте':'Источник'} · ${reference} · проверено ${checked_at}`));}
    road.append(sources);
   }
   }
   item.append(road);
  }
  const card=node('div',undefined,'visit-timeline-card'),stop=result.places.stops.find(v=>v.id===entry.schedule_id);
  const assessment=visit?result.visits.find(v=>v.id===visit.id):null,header=node('div',undefined,'visit-timeline-header');
  const time=visit&&assessment?.assessment?`Выбрано ${clock(assessment.assessment.visit.timeline.arrival)}`:stop?.begins!=null?clock(stop.begins):'Время уточним после дороги';
  header.append(node('p',time,'visit-timeline-time'));
  if(visit)header.append(node('span',assessment?.context==='date_changed'?'Другая дата':assessment?.assessment?'Фиксированное время':'Выбор сохранён','visit-timeline-badge'));
  const title=node('h5',name);title.tabIndex=-1;title.dataset.timelineTitle=entry.id;card.append(header,title);
  if(visit){
   if(!assessment?.assessment)card.append(node('p','Полный расчёт этого посещения пока недоступен. Выбор остаётся в поездке.','visit-timeline-warning'));
   card.append(node('p','Перестановка не меняет выбранное время.','visit-timeline-detail'));
   const rental=rentalFactsElement(visit,assessment?.assessment);if(rental)card.append(rental);
   if(assessment?.context==='date_changed')card.append(node('p','Пересчитайте посещение на дату этого дня.','visit-timeline-warning'));
   if(visit.note)card.append(node('p',visit.note,'visit-timeline-note'));
  }else if(stop)card.append(node('p',boundary?(entry.kind==='origin'?'Выходим отсюда':boundaries.bookings.end&&entry.kind==='destination'?'К выбранному отъезду':'Здесь завершаем день'):entry.kind==='destination'?'Конец выбранного пути':`На месте · ${stop.visit_minutes} мин`,'visit-timeline-detail'));
  if(stop?.issues?.some(v=>v.code==='fixed_visit_missed'))card.append(node('p','На выбранное время не успеваем. Переставьте остановки или измените посещение.','visit-timeline-warning'));
  const controls=node('div',undefined,'visit-timeline-controls'),index=editable.findIndex(v=>v.id===entry.id&&v.kind===entry.kind);
  if(index>=0){
   number++;card.dataset.timelineNumber=String(number).padStart(2,'0');
   const arrows=node('div',undefined,'visit-timeline-arrows');
   for(const [direction,label,icon] of [[-1,'Поднять','↑'],[1,'Опустить','↓']]){
    const button=node('button',icon,'visit-secondary');button.type='button';button.setAttribute('aria-label',`${label}: ${name}`);
    button.dataset.timelineMove=String(direction);button.disabled=index+direction<0||index+direction>=editable.length;
    button.addEventListener('click',()=>onMove({kind:entry.kind,id:entry.id},direction));arrows.append(button);
   }
   controls.append(arrows);
   if(visit){const expense=serviceExpenseButton({day,visit,onExpense});if(expense)controls.append(expense);}
   const settings=node('button',visit?'Заметка и условия':'Время и пауза','visit-secondary');settings.type='button';settings.addEventListener('click',()=>onSettings(entry));controls.append(settings);
   if(point){const link=node('a','О месте ↗','visit-timeline-link');link.href=new URL(`poi/${entry.id}/`,base);controls.append(link);}
  }
  card.append(controls);
  if(wave&&point&&entry.kind==='place'){
   header.classList.add('trip-timeline-heading');header.querySelector('p').classList.add('trip-timeline-time');title.classList.add('day-stop-name');header.append(title);
   card.dataset.planConflict=String(stop?.issues?.some(v=>v.code==='fixed_visit_missed')||false);
   decorateStop(card,point,number,trip,catalog,base);
   const focus=card.querySelector('.wave-stop-summary h4');focus.tabIndex=-1;focus.dataset.timelineTitle=entry.id;
   const controlsDetails=node('details',undefined,'wave-mixed-controls');controlsDetails.append(node('summary','Изменить остановку'),controls);card.querySelector('[data-wave-panel="place"]').append(controlsDetails);
   card.querySelector('.wave-stop-card').addEventListener('toggle',event=>{if(event.target.open)for(const other of list.querySelectorAll('.wave-stop-card[open]'))if(other!==event.target)other.open=false;});
  }
  item.append(card);list.append(item);
 }
 for(const row of unusedConnectionRows(result.itinerary)){const item=node('li',undefined,'visit-timeline-item');item.append(node('p',`${row.title}. ${row.text}`,'visit-timeline-warning'));list.append(item);}
 return list;
}
