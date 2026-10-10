// A held route is part of a rental, not a second visit after its return.
// This adapter binds existing catalogue/calendar/road inputs; Rust owns all
// times, conflicts, rounded tariffs and unknown facts.
import {selectedDay} from './trip-days-state.mjs?v=27';
import {planInput} from './trip-schedule-state.mjs?v=19';
import {serviceItineraryInput} from './trip-service-itinerary-input.mjs?v=9';
import {cleanTrip} from './trip-state.mjs';
import {activateTimeline} from './trip-service-timeline-state.mjs';

export function rentalActivityInput(original,trip,catalog,matrix){
 const day=selectedDay(trip),input=structuredClone(original);
 if(day.date!==input.date)throw Error('rental_activity_date_mismatch');
 const anchor=id=>input.graph.anchors.find(a=>a.id===id);
 const plan=planInput(trip,catalog,matrix);
 const bound=serviceItineraryInput(trip,day,plan,[],catalog,matrix,{
  origin:anchor(input.pickup.point.anchor_id),destination:anchor(input.selection.use_end),graph:input.graph,
 });
 input.timing.use_minutes=null;
 input.activity={date:day.date,plan,itinerary:bound.itinerary};
 return input;
}

export function rentalActivityTrip(engine,trip,visit,catalog,matrix){
 // This operation wraps a prepared ride. Existing independently selected
 // services must be kept outside it rather than silently discarded.
 const day=selectedDay(trip);
 if(day.service_visits?.length)throw Error('rental_activity_existing_services');
 const nextVisit=structuredClone(visit);
 if(nextVisit.selection?.visit.kind!=='rental')throw Error('rental_activity_requires_rental');
 nextVisit.selection.visit.input=rentalActivityInput(nextVisit.selection.visit.input,trip,catalog,matrix);
 const prepared=engine.serviceTrip(nextVisit),next=structuredClone(trip),target=selectedDay(next);
 target.places=[];target.schedule.stops={};target.service_visits=[prepared.visit];
 // The bicycle belongs to the held itinerary. Roads before collection and
 // after handover use the outer day; they must not become bicycle rides.
 target.schedule.mode='foot';
 target.timeline={version:1,order:[{kind:'service',id:prepared.visit.id}]};
 next.places=[];next.schedule.stops={};next.schedule.mode='foot';
 const cleaned=cleanTrip(next,catalog);
 return {trip:activateTimeline(cleaned,JSON.stringify(cleaned)),visit:prepared.visit,assessment:prepared.assessment};
}
