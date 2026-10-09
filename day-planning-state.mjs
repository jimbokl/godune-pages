import {selectedDay} from './trip-days-state.mjs?v=25';
import {tripSignature} from './trip-light.mjs?v=13';
import {inspectTripServiceDay} from './trip-service-day-state.mjs?v=6';
import {hasServiceVisits} from './trip-service-visits-contract.mjs?v=1';
import {usesJourneyBoundaries} from './day-journey-boundaries.mjs?v=3';

// Trial changes must reach the same selected-day projection as a saved Trip.
// Keep the original selections and every other day; never persist a trial.
export function projectPlanningTrip(trip){
 const copy=structuredClone(trip),day=copy.itinerary?.days.find(d=>d.id===copy.itinerary.active);
 if(day){day.date=copy.date;day.places=[...copy.places];if(copy.schedule)day.schedule=structuredClone(copy.schedule);else delete day.schedule;}
 return copy;
}
const withoutNote=value=>{if(!value||typeof value!=='object')return value;const {note,...rest}=value;return rest;};
export function planningSignature(trip){
 const day=selectedDay(trip);
 return JSON.stringify([tripSignature(trip),day.timeline??null,
  Array.isArray(day.service_visits)?day.service_visits.map(withoutNote):day.service_visits??null,
  day.transfer_connections?{...day.transfer_connections,choices:Array.isArray(day.transfer_connections.choices)?day.transfer_connections.choices.map(withoutNote):day.transfer_connections.choices}:null]);
}
export function planningDay(trip,catalog,matrix,engine,result){
 const projected=projectPlanningTrip(trip),day=selectedDay(projected);
 const common=hasServiceVisits(day)||Object.hasOwn(day,'timeline')||Object.hasOwn(day,'transfer_connections')||usesJourneyBoundaries(day,catalog);
 if(!common)return {trip:projected,result,check:null};
 // The common whole-day check cannot yet reconstruct actual progress times.
 // Do not offer an old place-only shortcut as a complete continuation.
 if(projected.schedule?.progress)throw Error('continuation_unresolved');
 const check=inspectTripServiceDay(engine,projected,catalog,matrix);
 return {trip:projected,result:check.places,check};
}
const unknownCodes=new Set(['unknown_travel','unknown_approach','unknown_return','unknown_opening','unknown_kitchen','transport_incomplete','appointment_needs_check']);
export function planningUnknownKeys(day){
 const keys=day.result.stops.flatMap(s=>s.issues.filter(i=>unknownCodes.has(i.code)).map(i=>`${s.id}:${i.code}`));
 if(day.check){
  keys.push(...day.check.issues.map(i=>JSON.stringify(['day',i.code,i.entry??null])));
  for(const visit of day.check.visits)if(visit.context!=='ready'||visit.assessment?.state!=='fits')keys.push(JSON.stringify(['service',visit.id,visit.context,visit.assessment?.state??null]));
 }
 return new Set(keys);
}
export function completePlanningCandidate(before,after){
 const check=after.check;
 if(check){
  if(check.state==='conflict'||check.state==='empty'||check.visits.length&&!check.itinerary)return false;
  if(check.itinerary?.unused_connections?.length)return false;
  if(check.issues.some(i=>['date_changed','date_missing','service_time_unknown','service_connections_unknown','unresolved_visits'].includes(i.code)))return false;
 }
 const missing=planningUnknownKeys(before);
 return [...planningUnknownKeys(after)].every(key=>missing.has(key));
}
export function planningWalkingMinutes(result,check){
 if(!check?.itinerary)return null;
 let minutes=result.access_minutes;
 for(const c of check.itinerary.connections){
  if(c.journey){for(const t of c.journey.transfers)if(t.road?.mode==='foot')minutes+=t.road.minutes??0;}
  else if(c.leg?.mode==='foot')minutes+=c.leg.minutes??0;
 }
 return minutes;
}
