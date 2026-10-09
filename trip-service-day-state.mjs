import {selectedDay} from './trip-days-state.mjs?v=27';
import {planInput} from './trip-schedule-state.mjs?v=19';
import {validServiceVisit,serviceVisitRows} from './trip-service-visits-contract.mjs?v=1';
import {serviceItineraryInput} from './trip-service-itinerary-input.mjs?v=8';
import {dayJourneyBoundaries,usesJourneyBoundaries} from './day-journey-boundaries.mjs?v=4';

// Compare the original whole day, rather than treating finished visits as
// future appointments after a progress checkpoint. Never mutate the draft.
export function serviceDayInput(engine,trip,catalog,matrix){
 const day=selectedDay(trip);
 if(day.kosa_plan)throw Error('service_day_generated_unresolved');
 const whole=structuredClone(trip);
 if(whole.schedule)delete whole.schedule.progress;
 const plan=planInput(whole,catalog,matrix);
 // A stale/unavailable rail snapshot must not disappear into a fits claim.
 if(whole.schedule?.rail&&!plan.rail)throw Error('service_day_rail_unresolved');
 const visits=[];
 let unresolved=day.service_visits!=null&&!Array.isArray(day.service_visits)?1:0;
 for(const visit of serviceVisitRows(day)){
  if(!validServiceVisit(visit)){unresolved++;continue;}
  try{engine.serviceTrip(visit);visits.push(visit);}catch{unresolved++;}
 }
 const mixed=Object.hasOwn(day,'timeline')||Object.hasOwn(day,'transfer_connections')||usesJourneyBoundaries(day,catalog)?serviceItineraryInput(whole,day,plan,visits,catalog,matrix):null;
 return {version:1,date:day.date,plan,visits:mixed?.visits||visits,unresolved_visits:unresolved,...(mixed?{itinerary:mixed.itinerary}:{})};
}
export function inspectTripServiceDay(engine,trip,catalog,matrix){
 const input=serviceDayInput(engine,trip,catalog,matrix),result=engine.serviceDay(input);
 // Selected bounds are display context; all fit/conflict decisions stay in Rust.
 return {...result,day_window:{start:input.plan.start,end:input.plan.end}};
}
