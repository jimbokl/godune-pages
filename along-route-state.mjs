import {emptyTrip,cleanTrip} from './trip-state.mjs?v=30';
import {ensureJourney,selectedDay,chooseTripDay,addTripDay,journeyDays,validTripDate,dayHasContent} from './trip-days-state.mjs?v=27';
import {addRouteStops} from './trip-order.mjs';
import {defaultSchedule} from './trip-schedule-state.mjs?v=19';
import {timelineOrder} from './trip-service-timeline-state.mjs';
import {serviceDayInput} from './trip-service-day-state.mjs?v=9';

export const alongGuard=trip=>JSON.stringify(trip);
export const stopTypes={all:['landmark','restaurant','museum','nature','park','viewpoint','beach'],
 food:['restaurant'],museum:['museum'],walk:['nature','park','beach'],view:['viewpoint','landmark']};

// Route previews are isolated. Saving one appends a day to the existing journey.
export function alongContext(trip,catalog,{context,date}){
 if(!validTripDate(date))throw Error('Укажите дату поездки.');
 if(context.startsWith('day:')){
  const id=context.slice(4);
  if(!journeyDays(ensureJourney(trip)).some(day=>day.id===id))throw Error('День удалён. Выберите другой.');
  const next=chooseTripDay(trip,id),day=selectedDay(next);
  if(day.kosa_plan)throw Error('Для этого автобусного дня измените остановки в транспортном планировщике.');
  if(day.date&&day.date!==date)throw Error('Дата дня изменилась. Обновите выбор.');
  next.date=day.date=date;next.month=Number(date.slice(5,7));
  return cleanTrip(next,catalog);
 }
 const slug=context.startsWith('route:')?context.slice(6):'';
 const route=catalog.routes.find(row=>row.slug===slug);
 if(!route)throw Error('Выберите прогулку или сохранённый день.');
 let next=addRouteStops(ensureJourney({...emptyTrip(),date,month:Number(date.slice(5,7))}),slug,catalog);
 next.routes=[slug];
 // The form labels ready routes as exterior walks. Admission stays separate.
 next.schedule||=defaultSchedule();
 next.schedule.mode={walking:'foot',cycling:'bike',driving:'car'}[route.mode]||'foot';
 // The published walk starts at its first point; an inserted place must include
 // the road from that start, even if it becomes the first visit in the list.
 selectedDay(next).start_at=route.stops[0]?.poi||null;
 for(const id of next.places)next.schedule.stops[id]={...next.schedule.stops[id],visit:next.schedule.stops[id]?.visit??30,pause:0,leg:null,window:null,visit_scope:'outside'};
 return cleanTrip(next,catalog);
}
export function alongAreas(trip,catalog,services=[]){
 const branches=new Set((selectedDay(trip).service_visits||[]).map(v=>v.identity?.branch_id));
 return new Set([...trip.places.map(id=>catalog.poi.find(p=>p.slug===id)?.area),
  ...services.filter(e=>branches.has(e.metadata.identity.branch_id)).map(e=>e.area)].filter(Boolean));
}
export function alongCandidates(trip,catalog,type,services=[]){
 const categories=stopTypes[type];if(!categories)throw Error('Выберите тип остановки.');
 const areas=alongAreas(trip,catalog,services);
 return catalog.poi.filter(p=>categories.includes(p.category)&&!trip.places.includes(p.slug)&&(!areas.size||areas.has(p.area)));
}
export function insertionStart(day,order){
 const checkpoint=day.schedule?.progress?.after,completed=new Set([...(day.visited||[]),...(checkpoint?[checkpoint]:[])]);
 return order.reduce((index,row,i)=>completed.has(row.id)?i+1:index,0);
}
export function insertionVariants(trip,point,catalog,{visit,scope}){
 if(!Number.isSafeInteger(visit)||visit<1||visit>1440||!['outside','inside'].includes(scope))throw Error('Проверьте время посещения.');
 if(trip.places.includes(point.slug)||!catalog.poi.some(p=>p.slug===point.slug))return [];
 const day=selectedDay(trip),order=timelineOrder(day),from=insertionStart(day,order);
 return Array.from({length:order.length-from+1},(_,offset)=>{
  const position=from+offset,next=structuredClone(trip),active=selectedDay(next),sequence=structuredClone(order);
  sequence.splice(position,0,{kind:'place',id:point.slug});
  next.places=sequence.filter(row=>row.kind==='place').map(row=>row.id);active.places=[...next.places];
  next.schedule||=defaultSchedule();next.schedule.stops[point.slug]={visit,pause:0,leg:null,window:null,...(scope==='outside'?{visit_scope:'outside'}:{})};
  active.schedule=structuredClone(next.schedule);
  if(day.timeline||sequence.some(row=>row.kind==='service'))active.timeline={version:1,order:sequence};
  return {id:`${point.slug}:${position}`,candidate:point.slug,position,trip:cleanTrip(next,catalog)};
 });
}
export function alongInput(engine,before,variants,catalog,matrix,available){
 return {version:1,available_minutes:available,before:serviceDayInput(engine,before,catalog,matrix),
  variants:variants.map(row=>({id:row.id,candidate:row.candidate,after:serviceDayInput(engine,row.trip,catalog,row.matrix??matrix)}))};
}
export function confirmAlong(original,preview,catalog){
 if(preview.guard!==alongGuard(original))throw Error('Поездка изменилась. Повторите подбор перед добавлением.');
 if(preview.context.startsWith('day:')){
  const active=ensureJourney(original).itinerary.active,target=selectedDay(preview.trip).id;
  if(target!==preview.context.slice(4))throw Error('Неверный день для остановки.');
  return chooseTripDay(cleanTrip(preview.trip,catalog),active);
 }
 const current=ensureJourney(original);
 const next=current.itinerary.days.length===1&&!dayHasContent(current)?current:addTripDay(original);
 const source=selectedDay(preview.trip),id=selectedDay(next).id;
 const target={...structuredClone(source),id};
 next.itinerary.days[next.itinerary.days.findIndex(day=>day.id===id)]=target;
 next.routes=[...new Set([...(original.routes||[]),...preview.trip.routes])];
 next.places=[...target.places];next.date=target.date;next.month=Number(target.date.slice(5,7));
 next.schedule=structuredClone(target.schedule);
 return cleanTrip(next,catalog);
}
