// Build portable selections from published tables and explicitly entered estimates.
// Rust remains the only calculator of waits, missed boardings and day feasibility.
import {selectedDay,changeDayDetails} from './trip-days-state.mjs?v=24';
import {bookingEffects,saveBooking} from './trip-bookings-state.mjs?v=2';
import {validBase} from './personal-points.mjs?v=3';
import {timelineOrder} from './trip-service-timeline-state.mjs';
import {serviceVisitRows} from './trip-service-visits-contract.mjs';
import {serviceDay,validServiceDate} from './service-calendar.mjs?v=1';
import {connectionKey,transferChoices} from './trip-transfer-connections-contract.mjs';
import {dayJourneyBoundaries,boundaryForEntry,usesJourneyBoundaries,canConfigureJourneyBoundaries} from './day-journey-boundaries.mjs?v=3';
const copy=structuredClone;
const minute=v=>v===null||Number.isInteger(v)&&v>=0&&v<=1440;
const time=v=>typeof v==='number'?v:Number(v.slice(0,2))*60+Number(v.slice(3));
const evidence=(source,from=null,until=null)=>({reference:source.url,checked_at:source.checked_at,valid_from:from,valid_until:until});
const point=(id,name,poi=null,source=null)=>poi?{id,name,kind:'landmark',revision:`catalog:${poi.slug}:${poi.lat},${poi.lon}`,location:{kind:'catalog',reference_kind:'poi',id:poi.slug},source}:{id,name,kind:'transit_stop',revision:`publication:${id}`,location:{kind:'unknown'},source};
export function setJourneyBoundary(trip,field,value,guard){
 if(JSON.stringify(trip)!==guard)throw Error('День изменился. Откройте дорогу заново.');
 if(!canConfigureJourneyBoundaries(selectedDay(trip)))throw Error('Начало и возвращение этого дня задаются в его настройках транспорта.');
 if(!['start_at','night_at'].includes(field)||!validBase(value))throw Error('Выберите точку дня.');
 const row=bookingEffects(trip)[field==='start_at'?'start':'night'];
 let next=changeDayDetails(trip,{[field]:copy(value)});
 if(row)next=saveBooking(next,{...copy(row),...(value===null?{binding:'none'}:{location:copy(value)})});
 return next;
}
export function transferEndpoint(entry,day,catalog,side){
 const boundary=boundaryForEntry(dayJourneyBoundaries(day,catalog),entry);
 if(boundary)return copy(boundary.anchor);
 if(entry.kind==='place'){
  const poi=catalog.poi.find(p=>p.slug===entry.id);
  return poi?point(entry.id,poi.name,poi):null;
 }
 const visit=serviceVisitRows(day).find(v=>v.id===entry.id),input=visit?.selection?.visit?.input;
 if(!['directed','rental'].includes(visit?.selection?.visit?.kind))return null;
 const id=input.selection[side==='from'?'back_to':'from'];
 return copy(input.graph.anchors.find(a=>a.id===id)||null);
}
export function transferEditorPairs(trip,catalog){
 const day=selectedDay(trip),boundaries=dayJourneyBoundaries(day,catalog),order=[...timelineOrder(day)];
 // Legacy vehicle and train access retain their own physical anchors until
 // explicitly converted; an internal connection must not replace that journey.
 if(order.length&&canConfigureJourneyBoundaries(day)&&usesJourneyBoundaries(day,catalog)){if(boundaries.origin)order.unshift(boundaries.origin);if(boundaries.checkpoint)order.push(boundaries.checkpoint);if(boundaries.destination)order.push(boundaries.destination);}
 const name=e=>boundaryForEntry(boundaries,e)?.anchor?.name||(e.kind==='place'?catalog.poi.find(p=>p.slug===e.id)?.name:serviceVisitRows(day).find(v=>v.id===e.id)?.name);
 return order.slice(1).map((to,index)=>{const from=order[index],key=connectionKey({from,to});return {from,to,key,name:`${name(from)||'Остановка'} → ${name(to)||'Остановка'}`,available:!!transferEndpoint(from,day,catalog,'from')&&!!transferEndpoint(to,day,catalog,'to'),saved:transferChoices(day).find(c=>connectionKey(c)===key)||null};});
}
export function publishedTransferRoutes(catalog,date,bus=null){
 if(!validServiceDate(date))return [];
 const routes=[];
 for(const service of catalog.rail_services||[]){
  const table=serviceDay(service,date);if(table.reason)continue;
  for(const direction of ['outward','inbound']){
   const rows=table[direction];if(!Array.isArray(rows)||!rows.length)continue;
   const reverse=direction==='inbound',source=evidence(table.source,table.exception?date:service.valid_from,table.exception?date:service.valid_until);
   const home=point(`station:${service.from}`,service.from,null,source),away=point(`station:${service.to}`,service.to,null,source);
   routes.push({id:`rail:${service.id}:${direction}`,name:`Поезд · ${reverse?service.to:service.from} → ${reverse?service.from:service.to}`,mode:'rail',from:reverse?away:home,to:reverse?home:away,source,state:'scheduled',rides:rows.map(row=>({id:`rail:${service.id}:${direction}:${date}:${row.id}`,departure:time(row.departure),arrival:time(row.arrival)}))});
  }
 }
 // Rule-based transport uses explicit physical stops, never attached sightseeing POI.
 for(const service of catalog.transport_services||[]){
  if(!['ferry','bus','rail'].includes(service.mode)||!service.from||!service.to)continue;
  const table=serviceDay(service,date);if(table.reason)continue;
  const source=evidence(table.source,table.exception?date:service.valid_from,table.exception?date:service.valid_until);
  const home=point(`${service.mode}:${service.id}:from`,service.from,null,source),away=point(`${service.mode}:${service.id}:to`,service.to,null,source);
  for(const direction of ['outward','inbound']){
   const selected=table[direction];if(!selected?.departures?.length)continue;
   const reverse=direction==='inbound',other=reverse?'outward':'inbound',id=`${service.mode}:${service.id}:${direction}`;
   const note=[service[direction].note,table[other]?.departures===null?service[other].note:null].filter(Boolean).join(' ');
   routes.push({id,name:`${{ferry:'Паром',bus:'Автобус',rail:'Поезд'}[service.mode]} · ${reverse?service.to:service.from} → ${reverse?service.from:service.to}`,mode:service.mode,from:reverse?away:home,to:reverse?home:away,source,state:'scheduled',note,
    rides:selected.departures.map(value=>({id:`${id}:${date}:${value}`,departure:time(value),arrival:selected.duration===null?null:time(value)+selected.duration}))});
  }
 }
 // The bus publication has no dated operating calendar. Preserve that uncertainty.
 if(bus&&(!bus.valid_from||date>=bus.valid_from)&&(!bus.valid_until||date<=bus.valid_until)){
  const source={reference:bus.source_url,checked_at:bus.checked_at,valid_from:bus.valid_from,valid_until:bus.valid_until};
  const stations={zelenogradsk:'Зеленоградск · автобус №210',efa:'Дюна «Эфа» · автобус №210',forest:'Танцующий лес · автобус №210'};
  for(const [direction,from,to,dep,arr] of [['outward','zelenogradsk','efa','departure','arrival'],['inward','efa','zelenogradsk','departure','arrival'],['inward','forest','zelenogradsk','via','arrival'],['inward','efa','forest','departure','via']]){
   const rows=(bus[direction]||[]).filter(r=>Number.isInteger(r[dep])&&Number.isInteger(r[arr]));if(!rows.length)continue;
   const id=`bus:210:${from}:${to}`;
   routes.push({id,name:`Автобус №210 · ${stations[from]} → ${stations[to]}`,mode:'bus',from:point(`bus:210:${from}`,stations[from],null,source),to:point(`bus:210:${to}`,stations[to],null,source),source,state:'unknown',rides:rows.map(r=>({id:`${id}:${date}:${r.id}`,departure:r[dep],arrival:r[arr]}))});
  }
 }
 return routes;
}
export function buildTransferChoice({trip,catalog,pair,mode='foot',minutes=null,rides=[],walks=[],boarding=[],now=new Date().toISOString(),note=''}){
 const day=selectedDay(trip);
 if(!validServiceDate(day.date))throw Error('Сначала укажите дату дня.');
 const current=transferEditorPairs(trip,catalog).find(v=>v.key===pair.key);
 if(!current)throw Error('Порядок остановок изменился. Откройте дорогу заново.');
 const start=transferEndpoint(current.from,day,catalog,'from'),end=transferEndpoint(current.to,day,catalog,'to');
 if(!start||!end)throw Error('У посещения пока не выбрана точка входа или выхода.');
 if(!['foot','bike','car'].includes(mode)||!minute(minutes)||!validServiceDate(now.slice(0,10)))throw Error('Проверьте время дороги.');
 const graph={version:1,anchors:[],links:[]},steps=[];
 const addAnchor=(a,id)=>{const value={...copy(a),id};graph.anchors.push(value);return value;};
 const first=addAnchor(start,'start'),last=addAnchor(end,'end');
 const source={reference:'Ваша оценка времени',checked_at:now.slice(0,10),valid_from:day.date,valid_until:day.date};
 const road=(from,to,value,roadMode='foot')=>{
  if(!minute(value))throw Error('Введите целое число минут или оставьте поле пустым.');
  graph.links.push({id:`road-${steps.length}`,from:from.id,to:to.id,from_revision:from.revision,to_revision:to.revision,mode:roadMode,claim:value===null?{kind:'unknown'}:{kind:'minutes',minutes:value},basis:'user_estimate',source:copy(source)});
  steps.push({kind:'road',from:from.id,to:to.id,mode:roadMode});
 };
 if(!rides.length)road(first,last,minutes,mode);
 else{
  if(walks.length!==rides.length+1||boarding.length!==rides.length)throw Error('Проверьте подходы и время посадки.');
  let previous=first;const ids=new Set();
  for(const [index,{route,ride}] of rides.entries()){
   if(!route?.rides?.some(r=>r.id===ride?.id&&r.departure===ride.departure&&r.arrival===ride.arrival)||ids.has(ride.id)||!minute(boarding[index])||boarding[index]===null)throw Error('Выберите рейс и запас на посадку.');
   ids.add(ride.id);
   const from=addAnchor(route.from,`ride-${index}-from`),to=addAnchor(route.to,`ride-${index}-to`);
   road(previous,from,walks[index]);
   steps.push({kind:'ride',ride:{...copy(ride),from:from.id,to:to.id,from_revision:from.revision,to_revision:to.revision,mode:route.mode,date:day.date,boarding_minutes:boarding[index],state:route.state,source:copy(route.source)}});
   previous=to;
  }
  road(previous,last,walks.at(-1));
 }
 return {version:1,id:current.saved?.id||'connection-1',name:rides.length?rides.map(r=>r.route.name).join(' · '):({foot:'Пешком',bike:'На велосипеде',car:'На машине'}[mode]),date:day.date,from:copy(current.from),to:copy(current.to),graph,steps,note,saved_at:now};
}
