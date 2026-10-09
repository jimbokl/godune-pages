import {selectedDay} from './trip-days-state.mjs?v=25';
import {cleanTrip} from './trip-state.mjs?v=28';
import {addServiceVisit} from './trip-service-visits-state.mjs';
import {timelineOrder} from './trip-service-timeline-state.mjs';
import {selectedInput} from './service-selection-state.mjs';
import {alongAreas,insertionStart} from './along-route-state.mjs?v=2';
import {serviceDayInput} from './trip-service-day-state.mjs?v=6';

export const serviceTypeNames={bike_rental:'Велопрокат',bath:'Баня',pool:'Бассейн',gym:'Спорт',market:'Рынок',workshop:'Мастерская',dining:'Еда',water_activity:'На воде'};
export function alongServiceCandidates(trip,catalog,entries,type){
 const categories=type==='food'?['dining']:type==='services'?Object.keys(serviceTypeNames).filter(k=>k!=='dining'):type==='all'?Object.keys(serviceTypeNames):[];
 const areas=alongAreas(trip,catalog,entries),saved=new Set((selectedDay(trip).service_visits||[]).map(v=>v.identity?.service_id));
 return entries.filter(e=>categories.includes(e.category)&&!saved.has(e.id)&&(!areas.size||areas.has(e.area)));
}
// Only the newly proposed visit gets an arrival from Rust's directed prefix.
// Existing selected times remain fixed. An unknown road still stays unknown in
// the final whole-day assessment; its lower bound is not a confirmed arrival.
export function scheduleServiceInsertion(engine,row,catalog,matrix=null){
 const result=engine.serviceDay(serviceDayInput(engine,row.trip,catalog,matrix));
 const entry=result.itinerary?.order.find(e=>e.kind==='service'&&e.id===row.visitId);
 const stop=result.places.stops.find(s=>s.id===entry?.schedule_id);
 if(!stop||!Number.isSafeInteger(stop.earliest_arrival))throw Error('Не удалось определить позицию посещения.');
 // There is no same-date slot after midnight. Keep the native conflict rather
 // than passing an invalid service arrival or wrapping it to the next day.
 if(stop.earliest_arrival>=1440)return row;
 const next=structuredClone(row.trip),visit=selectedDay(next).service_visits.find(v=>v.id===row.visitId);
 visit.selection.visit.input.arrival=stop.earliest_arrival;
 const checked=engine.serviceTrip(visit);
 selectedDay(next).service_visits=selectedDay(next).service_visits.map(v=>v.id===row.visitId?checked.visit:v);
 return {...row,trip:cleanTrip(next,catalog)};
}
export function serviceInsertionVariants(engine,trip,entry,catalog,{visit,people,units},savedAt=new Date().toISOString(),matrix=null){
 if(![visit,people,units].every(v=>Number.isSafeInteger(v)&&v>0)||visit>1440)throw Error('Проверьте время, число гостей и инвентаря.');
 const day=selectedDay(trip),order=timelineOrder(day),from=insertionStart(day,order);
 const selection=selectedInput(entry.selection,{date:day.date,arrival:day.schedule.start,finish_by:day.schedule.end,
  duration_minutes:visit,people,units,paid_minutes:visit,cost_limit:null,upfront_limit:null});
 const prepared=engine.serviceTrip({version:1,id:'visit-1',...structuredClone(entry.metadata),selection,note:'',saved_at:savedAt});
 return Array.from({length:order.length-from+1},(_,offset)=>{
  const next=addServiceVisit(trip,prepared),active=selectedDay(next),added=active.service_visits.at(-1),position=from+offset;
  const sequence=structuredClone(order);sequence.splice(position,0,{kind:'service',id:added.id});
  active.timeline={version:1,order:sequence};
  return scheduleServiceInsertion(engine,{id:`${entry.id}:${position}`,candidate:entry.id,position,visitId:added.id,service:entry,trip:cleanTrip(next,catalog)},catalog,matrix);
 });
}
