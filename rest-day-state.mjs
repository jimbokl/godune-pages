// Composition is shared by both entrances. Rust owns time, cost and feasibility.
import {emptyTrip,cleanTrip} from './trip-state.mjs?v=30';
import {selectedDay,ensureJourney,validTripDate} from './trip-days-state.mjs?v=27';
import {alongContext,alongAreas,alongInput,insertionVariants,insertionStart,confirmAlong} from './along-route-state.mjs?v=5';
import {timelineOrder} from './trip-service-timeline-state.mjs';
import {addServiceVisit} from './trip-service-visits-state.mjs';
import {selectedInput} from './service-selection-state.mjs?v=4';
import {scheduleServiceInsertion} from './along-route-services-state.mjs?v=1';
import {transferEditorPairs,buildTransferChoice,setJourneyBoundary} from './trip-transfer-editor-state.mjs?v=10';
import {saveTransferConnection} from './trip-transfer-connections-state.mjs';
import {defaultSchedule} from './trip-schedule-state.mjs?v=19';
import {bookingEffects} from './trip-bookings-state.mjs?v=3';

export const restModes=['rain','after'];
export function restContext(original,catalog,{context,date,returnTo}){
 if(!validTripDate(date))throw Error('Укажите дату дня.');
 let next;
 if(context.startsWith('city:')){
  const area=context.slice(5),point=catalog.poi.find(p=>p.area===area);
  if(!point)throw Error('Выберите город.');
  next=cleanTrip(ensureJourney({...emptyTrip(),date,month:Number(date.slice(5,7)),schedule:defaultSchedule()}),catalog);
  const day=selectedDay(next);day.start_at=point.slug;day.night_at=point.slug;
 }else{
  next=alongContext(original,catalog,{context,date});
  if(context.startsWith('route:'))selectedDay(next).night_at=selectedDay(next).start_at;
 }
 next.schedule=selectedDay(next).schedule||defaultSchedule();
 selectedDay(next).schedule=next.schedule;
 if(returnTo){if(!catalog.poi.some(p=>p.slug===returnTo))throw Error('Выберите точку возвращения.');next=setJourneyBoundary(next,'night_at',returnTo,JSON.stringify(next));}
 return cleanTrip(next,catalog);
}
export function rainStops(trip,catalog){
 const day=selectedDay(trip),order=timelineOrder(day),from=insertionStart(day,order),bookings=bookingEffects(trip);
 return order.flatMap((entry,i)=>{
  const point=entry.kind==='place'&&catalog.poi.find(p=>p.slug===entry.id),stop=day.schedule?.stops?.[entry.id];
  // A museum with unknown admission is not automatically an outdoor walk.
  return i>=from&&point&&!stop?.window&&!stop?.excursion&&!bookings.stops[entry.id]&&(stop?.visit_scope==='outside'||['park','beach','nature','viewpoint'].includes(point.category))?[point]:[];
 });
}
export function restCandidates(trip,catalog,entries){
 const areas=alongAreas(trip,catalog,entries);
 if(!areas.size){const start=selectedDay(trip).start_at;if(typeof start==='string')areas.add(catalog.poi.find(p=>p.slug===start)?.area);}
 const used=new Set((selectedDay(trip).service_visits||[]).map(v=>v.identity.service_id));
 const inArea=e=>areas.has(e.area);
 return {activities:entries.filter(e=>['bath','pool','gym'].includes(e.category)&&inArea(e)&&!used.has(e.id)),
  meals:[...entries.filter(e=>e.category==='dining'&&inArea(e)&&!used.has(e.id)).map(service=>({id:service.id,name:service.name,area:service.area,service})),
   ...catalog.poi.filter(p=>p.category==='restaurant'&&inArea(p)&&!trip.places.includes(p.slug)).map(point=>({id:point.slug,name:point.name,area:point.area,point}))]};
}
function addVisit(engine,trip,entry,catalog,position,minutes,settings,savedAt){
 const day=selectedDay(trip),order=timelineOrder(day);
 const selection=selectedInput(entry.selection,{date:day.date,arrival:day.schedule.start,finish_by:day.schedule.end,
  duration_minutes:minutes,paid_minutes:minutes,people:settings.people,units:1,cost_limit:null,upfront_limit:null,
  ...(settings.visit_timing?{visit_timing:settings.visit_timing}:{})});
 const prepared=engine.serviceTrip({version:1,id:'visit-1',...structuredClone(entry.metadata),selection,note:'',saved_at:savedAt});
 let next=addServiceVisit(trip,prepared);const visitId=selectedDay(next).service_visits.at(-1).id;
 order.splice(position,0,{kind:'service',id:visitId});selectedDay(next).timeline={version:1,order};
 return {trip:cleanTrip(next,catalog),visitId};
}
export function restVariants(engine,before,catalog,entries,settings,matrix=null,savedAt=new Date().toISOString()){
 const {mode,people,activityMinutes,mealMinutes}=settings;
 if(!restModes.includes(mode)||![people,activityMinutes,mealMinutes].every(v=>Number.isSafeInteger(v)&&v>0)||activityMinutes>1440||mealMinutes>1440)throw Error('Проверьте число гостей и время посещения.');
 const candidates=restCandidates(before,catalog,entries),order=timelineOrder(selectedDay(before));
 const removable=new Set(rainStops(before,catalog).map(p=>p.slug)),remove=new Set(mode==='rain'?(settings.remove||[]):[]);
 if([...remove].some(id=>!removable.has(id)))throw Error('Остановка уже изменилась или привязана ко времени. Повторите подбор.');
 const first=order.findIndex(e=>e.kind==='place'&&remove.has(e.id));
 const base=structuredClone(before),day=selectedDay(base),sequence=order.filter(e=>e.kind!=='place'||!remove.has(e.id));
 day.places=base.places=sequence.filter(e=>e.kind==='place').map(e=>e.id);
 day.timeline={version:1,order:sequence};
 const position=first<0?sequence.length:first;
 const activities=settings.activityId?candidates.activities.filter(e=>e.id===settings.activityId):candidates.activities;
 const meals=settings.mealId?candidates.meals.filter(e=>e.id===settings.mealId):candidates.meals;
 return activities.flatMap(activity=>meals.filter(meal=>meal.area===activity.area).map(meal=>{
  const a=addVisit(engine,base,activity,catalog,position,activityMinutes,settings,savedAt);
  let next=a.trip,mealVisitId=null;
  if(meal.service){const m=addVisit(engine,next,meal.service,catalog,position+1,mealMinutes,{people,visit_timing:settings.meal_timing},savedAt);next=m.trip;mealVisitId=m.visitId;}
  else next=insertionVariants(next,meal.point,catalog,{visit:mealMinutes,scope:'inside'}).find(v=>v.position===position+1).trip;
  // Three optional personal estimates describe only the new connections.
  // Their unknown physical endpoints remain unknown map points.
  const newIds=[a.visitId,mealVisitId||meal.id],pairs=transferEditorPairs(next,catalog);
  const chosen=[pairs.find(p=>p.to.kind==='service'&&p.to.id===a.visitId),
   pairs.find(p=>p.from.id===a.visitId&&p.to.id===newIds[1]),pairs.find(p=>p.from.id===newIds[1])];
  for(const [i,pair] of chosen.entries())if(pair&&settings.roads?.[i]!=null){
   const minutes=settings.roads[i];if(!Number.isSafeInteger(minutes)||minutes<0||minutes>1440)throw Error('Проверьте своё время на дорогу.');
   const choice=buildTransferChoice({trip:next,catalog,pair,mode:next.schedule.mode,minutes,now:savedAt});
   next=saveTransferConnection(next,choice,engine,JSON.stringify(next));
  }
  for(const visitId of [a.visitId,mealVisitId].filter(Boolean))next=scheduleServiceInsertion(engine,{trip:next,visitId},catalog,matrix).trip;
  return {id:`${mode}:${activity.id}:${meal.id}`,candidate:`${activity.id}:${meal.id}`,trip:next,activity,meal,
   visitIds:[a.visitId,mealVisitId].filter(Boolean),removed:[...remove],position};
 }));
}
export function restInput(engine,before,variants,catalog,matrix){
 const schedule=selectedDay(before).schedule;
 return alongInput(engine,before,variants,catalog,matrix,Math.max(0,schedule.end-schedule.start));
}
export const confirmRest=confirmAlong;
