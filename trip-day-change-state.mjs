// This adapter projects an exact target day; all timing maths remains in WASM.
import {ensureJourney,chooseTripDay,selectedDay,journeyDays} from './trip-days-state.mjs?v=27';
import {emptyTrip} from './trip-state.mjs';
import {serviceDayInput} from './trip-service-day-state.mjs?v=8';

export function dayChangeBaseline(trip,preview,targetId){
 const journey=ensureJourney(structuredClone(trip));
 if(journeyDays(journey).some(day=>day.id===targetId))return chooseTripDay(journey,targetId);
 const after=chooseTripDay(preview,targetId),day=selectedDay(after);
 // A newly allocated day is compared with an empty day of the same date and
 // time bounds, never with the user's previously active day or its payments.
 const baseline=ensureJourney({...emptyTrip(),date:day.date,month:after.month,
  ...(day.schedule?{schedule:{...structuredClone(day.schedule),stops:{}}}:{})});
 const empty=selectedDay(baseline);empty.id=targetId;baseline.itinerary.active=targetId;
 return baseline;
}

export function inspectTripDayChange(engine,before,after,catalog,beforeMatrix,afterMatrix){
 if(selectedDay(before).id!==selectedDay(after).id)throw Error('day_change_target_mismatch');
 const input={version:1,before:serviceDayInput(engine,before,catalog,beforeMatrix),
  after:serviceDayInput(engine,after,catalog,afterMatrix)};
 const result=engine.dayChange(input);
 return {...result,after:{...result.after,day_window:{start:input.after.plan.start,end:input.after.plan.end}}};
}
