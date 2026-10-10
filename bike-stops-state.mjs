import {assessBikeRide,bikeGuard} from './bike-rides-state.mjs?v=4';
import {insertionVariants} from './along-route-state.mjs?v=5';
import {cleanTrip} from './trip-state.mjs?v=30';
import {selectedDay,validTripDate} from './trip-days-state.mjs?v=27';

export const bikeStopKinds={water:{name:'Вода',minutes:10},rest:{name:'Отдых',minutes:20},
 food:{name:'Еда',minutes:60},toilet:{name:'Туалет',minutes:10},repair:{name:'Ремонт',minutes:30}};
const sourced=s=>typeof s?.url==='string'&&/^https:\/\//.test(s.url)&&validTripDate(s.checked_at);
const units={water:'water_collection',toilet:'toilet_use',repair:'bicycle_repair'};

// Facilities are facts, never guesses from a place name or proximity to water.
// New facility types use the same sourced visit-condition units as water.
export function bikeStopCapability(point,kind){
 if(!bikeStopKinds[kind])throw Error('Выберите тип остановки.');
 if(units[kind]){
  const fact=(point.visit_conditions||[]).find(c=>c.unit===units[kind]&&sourced(c.source));
  return fact?{scope:'inside',source:fact.source,text:fact.text}:null;
 }
 const source={name:point.name,url:point.source_url,checked_at:point.verified_at};
 if(!sourced(source))return null;
 if(kind==='food'&&point.category==='restaurant')return {scope:'inside',source,text:'Остановка на еду. Часы заведения и кухни учитываются отдельно.'};
 // A paid attraction is not an exterior rest stop merely because it is a park.
 if(kind==='rest'&&['park','nature','beach'].includes(point.category)&&!point.price)
  return {scope:'outside',source,text:'Пауза на открытом воздухе.'};
 return null;
}
const rank=row=>({fits:0,needs_info:1,does_not_fit:2}[row.state]);
const compare=(a,b)=>rank(a.preview)-rank(b.preview)
 ||(a.preview.duration_minutes??Infinity)-(b.preview.duration_minutes??Infinity)
 ||(a.preview.distance_m??Infinity)-(b.preview.distance_m??Infinity)||a.position-b.position;

export function selectBikeStops(before,settings,catalog,matrix,engine,{kind,visit=bikeStopKinds[kind]?.minutes}={}){
 if(!bikeStopKinds[kind]||!Number.isSafeInteger(visit)||visit<1||visit>240)throw Error('Укажите остановку и время от 1 до 240 минут.');
 const areas=new Set(before.trip.places.map(id=>catalog.poi.find(p=>p.slug===id)?.area));
 const guard=bikeGuard(before.trip),result=[];
 for(const point of catalog.poi){
  if(!areas.has(point.area)||before.trip.places.includes(point.slug))continue;
  const capability=bikeStopCapability(point,kind);if(!capability)continue;
  const variants=insertionVariants(before.trip,point,catalog,{visit,scope:capability.scope})
   // Preserve the published departure when it is the first place, not a base.
   .filter(v=>v.position>0||selectedDay(before.trip).start_at)
   .map(v=>({...v,point,kind,visit,capability,guard,
    preview:assessBikeRide(before.ride,settings,catalog,matrix,engine,v.trip)}));
  variants.sort(compare);const best=variants[0];if(!best)continue;
  best.extra_minutes=best.preview.duration_minutes==null||before.duration_minutes==null?null:best.preview.duration_minutes-before.duration_minutes;
  best.extra_distance_m=best.preview.distance_m==null||before.distance_m==null?null:best.preview.distance_m-before.distance_m;
  result.push(best);
 }
 return result.sort(compare);
}
export function addBikeStop(before,candidate){
 if(candidate.guard!==bikeGuard(before.trip))throw Error('Прогулка изменилась. Выберите остановку заново.');
 return candidate.preview;
}
export function removeBikeStop(before,id,settings,catalog,matrix,engine){
 if(before.ride.stops.some(s=>s.poi===id)||!before.trip.places.includes(id))throw Error('Эту остановку нельзя убрать из готовой прогулки.');
 const next=structuredClone(before.trip),day=selectedDay(next);
 next.places=next.places.filter(p=>p!==id);day.places=[...next.places];
 delete next.schedule.stops[id];day.schedule=structuredClone(next.schedule);
 if(day.timeline)day.timeline.order=day.timeline.order.filter(p=>p.kind!=='place'||p.id!==id);
 return assessBikeRide(before.ride,settings,catalog,matrix,engine,cleanTrip(next,catalog));
}
