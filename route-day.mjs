import {selectedDay,chooseTripDay,ensureJourney,addTripDay,dayHasContent,validTripDate,validJourneyProjection} from './trip-days-state.mjs?v=2026101706';
import {defaultSchedule} from './trip-schedule-state.mjs?v=2026101305';
import {resolveTripDayLink} from './trip-day-link.mjs?v=2026101706';
import {waveStopSettings} from './day-wave.mjs?v=2026101305';

const placesFor=route=>route.stops.map(stop=>stop.poi);
export function routeDayTarget(trip,route,id=null){
 const matches=day=>day.source_route===route.slug||!day.source_route&&JSON.stringify(day.places)===JSON.stringify(placesFor(route));
 if(id!==null){
  const target=resolveTripDayLink(trip,id);
  return target.state!=='ready'?target:matches(target.day)?target:{state:'different_route'};
 }
 const day=selectedDay(trip);
 return matches(day)?{state:'ready',day}:null;
}
export function routeDaySettings(day){
 const start=day?.schedule?.start??600;
 return {date:day?.date??null,time:`${String(Math.floor(start/60)).padStart(2,'0')}:${String(start%60).padStart(2,'0')}`};
}
// A route is a starting draft. Reopening it must preserve the traveller's day.
export function saveRouteDay(trip,route,catalog,{id=null,date=null,time='10:00',edit=false}={}){
 if(date!==null&&!validTripDate(date))throw Error('invalid_date');
 if(typeof time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('invalid_time');
 const places=placesFor(route);
 if(!catalog.routes.some(row=>row.slug===route.slug)||!places.length||places.some(id=>!catalog.poi.some(p=>p.slug===id)))throw Error('unknown_route');
 const target=routeDayTarget(trip,route,id);
 if(target&&target.state!=='ready')throw Error('linked_day_missing');
 const start=Number(time.slice(0,2))*60+Number(time.slice(3));
 if(target){
  const next=chooseTripDay(trip,target.day.id);
  if(!edit)return next;
  const day=selectedDay(next),before=day.schedule||defaultSchedule();
  const schedule={...structuredClone(before),start,end:Math.min(1440,start+before.end-before.start)};
  Object.assign(day,{date,schedule});
  Object.assign(next,{date,month:date?Number(date.slice(5,7)):null,schedule:structuredClone(schedule)});
  if(!validJourneyProjection(next))throw Error('invalid_route_day');
  return next;
 }
 const next=dayHasContent(trip)||trip.routes.length?addTripDay(trip):ensureJourney(trip),day=selectedDay(next);
 // A route's approximate duration is not the traveller's hard return deadline.
 // Keep the planner's default day window so visits, walks and reserves can fit.
 const defaults=defaultSchedule();
 const schedule={...defaults,mode:'foot',start,end:Math.min(1440,start+Math.max(defaults.end-defaults.start,route.minutes||0,places.length*30)),stops:waveStopSettings(route,catalog)};
 // A ready route starts at its first stop. The generic new-day action inherits
 // the previous overnight base, but that base may belong to another city.
 // Seed both anchors only for a new draft; reopening keeps personal choices.
 Object.assign(day,{source_route:route.slug,name:route.name,date,places:[...places],schedule,start_at:null,night_at:route.return_to||null});
 Object.assign(next,{date,month:date?Number(date.slice(5,7)):null,places:[...places],schedule:structuredClone(schedule),routes:[...new Set([...next.routes,route.slug])]});
 if(!validJourneyProjection(next))throw Error('invalid_route_day');
 return next;
}
