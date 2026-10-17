import {journeyDays,chooseTripDay} from './trip-days-state.mjs?v=2026101706';

// A saved-day link names an identity, never the current day or a new template.
export function resolveTripDayLink(trip,id,profile=null){
 if(id===null||id===undefined)return null;
 const day=journeyDays(trip).find(day=>day.id===id);
 if(!day)return {state:'missing_day'};
 const entry=profile?day.transport_plans?.entries.find(entry=>entry.id===profile):null;
 if(profile&&!entry)return {state:'missing_plan',day};
 return {state:'ready',day,entry};
}
export function openLinkedTripDay(trip,id){
 const target=resolveTripDayLink(trip,id);
 if(target?.state!=='ready')throw Error('linked_day_missing');
 return chooseTripDay(trip,id);
}
export function plannerDayUrl(base,id){
 const url=new URL('planner/',base);
 url.searchParams.set('trip-day',id);url.hash='my-trip';return url;
}
