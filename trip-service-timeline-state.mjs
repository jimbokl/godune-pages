// User order only. Computed times, roads and quotes are never stored here.
import {ensureJourney,selectedDay} from './trip-days-state.mjs?v=27';
import {serviceVisitRows} from './trip-service-visits-contract.mjs?v=1';
const key=entry=>JSON.stringify([entry.kind,entry.id]);
export function validTimeline(value){
 if(!value||value.version!==1||!Array.isArray(value.order))return false;
 const seen=new Set();
 return value.order.every(entry=>{
  if(!entry||!['place','service'].includes(entry.kind)||typeof entry.id!=='string'||!entry.id||Object.keys(entry).some(k=>!['kind','id'].includes(k)))return false;
  const id=key(entry);if(seen.has(id))return false;seen.add(id);return true;
 })&&Object.keys(value).every(k=>['version','order'].includes(k));
}
export const timelineGuard=trip=>JSON.stringify(trip);
function editable(trip,guard){
 if(guard!==timelineGuard(trip))throw Error('День уже изменился. Попробуйте ещё раз с новым порядком.');
 const next=ensureJourney(trip),day=selectedDay(next);
 if(Object.hasOwn(day,'timeline')&&!validTimeline(day.timeline))throw Error('Порядок сохранён в другой версии. Он остаётся в файле поездки.');
 if(day.service_visits!=null&&!Array.isArray(day.service_visits))throw Error('Посещения сохранены в другой версии.');
 return {next,day};
}
export function timelineOrder(day){
 const places=(day.places||[]).map(id=>({kind:'place',id}));
 const services=serviceVisitRows(day).filter(v=>typeof v?.id==='string').map(v=>({kind:'service',id:v.id}));
 if(!Object.hasOwn(day,'timeline'))return [...places,...services];
 if(!validTimeline(day.timeline))throw Error('service_timeline_unsupported');
 const current=new Set([...places,...services].map(key)),seen=new Set(),order=[];let placeIndex=0;
 // Legacy arrows replace place slots without moving interleaved visits.
 for(const saved of day.timeline.order){
  if(!current.has(key(saved)))continue;
  const entry=saved.kind==='place'?places[placeIndex++]:saved;
  if(entry&&!seen.has(key(entry))){order.push({...entry});seen.add(key(entry));}
 }
 for(const entry of [...places,...services])if(!seen.has(key(entry))){order.push({...entry});seen.add(key(entry));}
 return order;
}
export function activateTimeline(trip,guard){
 const {next,day}=editable(trip,guard);day.timeline={version:1,order:timelineOrder(day)};return next;
}
export function moveTimelineEntry(trip,entry,direction,guard){
 const {next,day}=editable(trip,guard);
 if(!validTimeline(day.timeline)||![-1,1].includes(direction))throw Error('Сначала соберите день по порядку.');
 const order=timelineOrder(day),index=order.findIndex(row=>key(row)===key(entry)),target=index+direction;
 if(index<0)throw Error('Остановка уже удалена.');
 if(target<0||target>=order.length)return next;
 [order[index],order[target]]=[order[target],order[index]];
 day.timeline={version:1,order};day.places=order.filter(row=>row.kind==='place').map(row=>row.id);
 next.places=[...day.places];return next;
}
