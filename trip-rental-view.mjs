// Presentation of the Rust cycle, shared by the day, saved visit and PDF.
import {clock} from './day-stop-view.mjs?v=1';

export function rentalActivityStops(visit,assessment,catalog={}){
 const input=visit?.selection?.visit?.input,activity=assessment?.rental?.activity;
 if(!input?.activity||!activity)return [];
 return input.activity.itinerary.order.filter(e=>e.kind==='place').map(entry=>{
  const stop=input.activity.plan.stops.find(s=>s.id===entry.id),scheduled=activity.places.stops.find(s=>s.id===entry.id);
  const anchor=input.activity.itinerary.graph.anchors.find(a=>a.id===entry.arrival_anchor);
  const point=catalog.poi?.find(p=>p.slug===entry.id);
  return {id:entry.id,name:point?.name||anchor?.name||entry.id,anchor,visit:stop?.visit,pause:stop?.pause,
   begins:activity.context==='ready'?scheduled?.begins:null,leaves:activity.context==='ready'?scheduled?.leaves:null};
 });
}

export function rentalMapPoints(visit,assessment,catalog={}){
 const cycle=assessment?.rental;if(!cycle)return [];
 const anchors=visit.selection.visit.input.graph.anchors;
 const stops=cycle.stops.map(stop=>({kind:stop.kind,anchor:anchors.find(a=>a.id===stop.point.anchor_id),label:stop.kind==='rental_pickup'?'Выдача':'Возврат'}));
 stops.splice(1,0,...rentalActivityStops(visit,assessment,catalog).map(stop=>({...stop,kind:'rental_activity',label:stop.name})));
 return stops.flatMap(stop=>{
  const {anchor}=stop,reference=anchor?.location;
  const list=reference?.reference_kind==='poi'?catalog.poi:reference?.reference_kind==='dining'?catalog.dining:null;
  const point=reference?.kind==='point'?reference:reference?.kind==='catalog'?list?.find(p=>(p.slug||p.id)===reference.id):null;
  if(!point||!Number.isFinite(point.lat)||!Number.isFinite(point.lon))return [];
  if(reference.kind==='catalog'&&anchor.revision?.startsWith('catalog:')&&anchor.revision!==`catalog:${reference.id}:${point.lat},${point.lon}`)return [];
  return [{kind:stop.kind,name:stop.name||anchor.name,label:stop.label,lat:point.lat,lon:point.lon,source:anchor.source}];
 });
}

export function rentalDetails(visit,assessment,catalog={}){
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
 rows.splice(2,0,...rentalActivityStops(visit,assessment,catalog).map(stop=>({kind:'rental_activity',label:stop.name,
  value:`${time(stop.begins)}${stop.leaves==null?'':`–${clock(stop.leaves)}`} · ${stop.visit} мин${stop.pause?` + пауза ${stop.pause} мин`:''}`})));
 const terms=cycle.issues.filter(v=>v.phase==='terms');
 rows.push({label:'Возврат в выбранном пункте',value:terms.some(v=>v.status==='fail')?'Условия не разрешают':terms.length?'Условия нужно уточнить':'Разрешён по выбранным условиям'});
 for(const point of rentalMapPoints(visit,assessment,catalog))rows.push({label:`${point.label} · GPS`,value:`${point.lat.toFixed(6)}, ${point.lon.toFixed(6)}`});
 return rows;
}

export function rentalFactsElement(visit,assessment,catalog={}){
 const rows=rentalDetails(visit,assessment,catalog);if(!rows.length)return null;
 const wrap=document.createElement('div'),primary=new Set(['Получить велосипед','Вернуть велосипед','Вернуться к базе','Время по тарифу']);
 const list=(values,cls)=>{
  const facts=document.createElement('dl');facts.className=cls;
  for(const row of values){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=row.label;dd.textContent=row.value;facts.append(dt,dd);}
  return facts;
 };
 wrap.append(list(rows.filter(r=>primary.has(r.label)||r.kind==='rental_activity'),'visit-rental-facts'));
 const more=document.createElement('details');more.className='visit-rental-more';
 const title=document.createElement('summary');title.textContent='Подготовка, возврат и координаты';
 more.append(title,list(rows.filter(r=>!primary.has(r.label)&&r.kind!=='rental_activity'),'visit-rental-extra'));wrap.append(more);
 return wrap;
}
