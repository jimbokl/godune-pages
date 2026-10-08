// Presentation of the Rust cycle, shared by the day, saved visit and PDF.
import {clock} from './day-stop-view.mjs?v=1';

export function rentalMapPoints(visit,assessment){
 const cycle=assessment?.rental;if(!cycle)return [];
 const anchors=visit.selection.visit.input.graph.anchors;
 return cycle.stops.flatMap(stop=>{
  const anchor=anchors.find(a=>a.id===stop.point.anchor_id),point=anchor?.location;
  if(point?.kind!=='point')return [];
  return [{kind:stop.kind,name:anchor.name,label:stop.kind==='rental_pickup'?'Выдача':'Возврат',lat:point.lat,lon:point.lon,source:anchor.source}];
 });
}

export function rentalDetails(visit,assessment){
 const cycle=assessment?.rental;if(!cycle)return [];
 const input=visit.selection.visit.input;
 const anchor=id=>input.graph.anchors.find(a=>a.id===id);
 const name=(id,fallback)=>anchor(id)?.name||fallback;
 const time=value=>value==null?'Время нужно уточнить':clock(value);
 const t=cycle.timeline,pickup=cycle.stops.find(s=>s.kind==='rental_pickup'),back=cycle.stops.find(s=>s.kind==='rental_return');
 const rows=[
  {label:'Получить велосипед',value:`${time(t.pickup_arrival)} · ${name(pickup?.point.anchor_id,'Пункт выдачи')}`},
  {label:'Можно ехать',value:time(t.pickup_complete)},
  {label:'Вернуть велосипед',value:`${time(t.return_arrival)} · ${name(back?.point.anchor_id,'Пункт возврата')}`},
  {label:'Сдача завершена',value:time(t.return_complete)},
  {label:'Вернуться к базе',value:`${time(t.departure)} · ${name(input.selection.back_to,'Конец дня')}`},
  {label:'Время по тарифу',value:cycle.billing.minutes==null?'Нужно уточнить':`${cycle.billing.minutes} мин`},
 ];
 const terms=cycle.issues.filter(v=>v.phase==='terms');
 rows.push({label:'Возврат в выбранном пункте',value:terms.some(v=>v.status==='fail')?'Условия не разрешают':terms.length?'Условия нужно уточнить':'Разрешён по выбранным условиям'});
 for(const point of rentalMapPoints(visit,assessment))rows.push({label:`${point.label} · GPS`,value:`${point.lat.toFixed(6)}, ${point.lon.toFixed(6)}`});
 return rows;
}

export function rentalFactsElement(visit,assessment){
 const rows=rentalDetails(visit,assessment);if(!rows.length)return null;
 const wrap=document.createElement('div'),primary=new Set(['Получить велосипед','Вернуть велосипед','Вернуться к базе','Время по тарифу']);
 const list=(values,cls)=>{
  const facts=document.createElement('dl');facts.className=cls;
  for(const row of values){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=row.label;dd.textContent=row.value;facts.append(dt,dd);}
  return facts;
 };
 wrap.append(list(rows.filter(r=>primary.has(r.label)),'visit-rental-facts'));
 const more=document.createElement('details');more.className='visit-rental-more';
 const title=document.createElement('summary');title.textContent='Подготовка, возврат и координаты';
 more.append(title,list(rows.filter(r=>!primary.has(r.label)),'visit-rental-extra'));wrap.append(more);
 return wrap;
}
