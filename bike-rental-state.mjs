// Catalogue choices bind the prepared ride to the shared rental cycle.
// All clocks, prices, eligibility and conflicts are calculated by Rust.
import {selectedDay} from './trip-days-state.mjs?v=27';
import {selectedInput} from './service-selection-state.mjs';
import {rentalActivityTrip} from './trip-rental-activity-state.mjs?v=1';
import {inspectTripServiceDay} from './trip-service-day-state.mjs?v=8';
import {rentalActivityStops} from './trip-rental-view.mjs?v=1';

export function bikeRentalChoices(data,row){
 return (data?.entries||[]).filter(entry=>entry?.category==='bike_rental'&&entry.area===row.ride.area&&entry.selection?.visit.kind==='rental');
}

export function prepareBikeRental(row,entry,units,catalog,matrix,engine){
 if(!bikeRentalChoices({entries:[entry]},row).length)throw Error('Выберите прокат в городе прогулки.');
 if(!Number.isSafeInteger(units)||units<1)throw Error('Укажите количество велосипедов целым числом от 1.');
 const trip=structuredClone(row.trip),day=selectedDay(trip),people=day.party.adults+day.party.children;
 const selection=selectedInput(entry.selection,{date:day.date,arrival:row.input.start,finish_by:row.input.end,
  duration_minutes:null,people,units,paid_minutes:null,cost_limit:null,upfront_limit:null});
 const input=selection.visit.input;
 // A catalogue page's suggested appointment/destination is not this ride.
 input.pickup_at=null;input.finish_buffer=0;
 const landmark=slug=>{
  const p=catalog.poi.find(p=>p.slug===slug);if(!p)throw Error('Места прогулки изменились. Повторите подбор.');
  const anchor={id:`__timeline_place_${p.slug}`,name:p.name,kind:'landmark',revision:`catalog:${p.slug}:${p.lat},${p.lon}`,
   location:{kind:'catalog',reference_kind:'poi',id:p.slug},source:null};
  const existing=input.graph.anchors.find(a=>a.id===anchor.id);
  if(existing&&(existing.name!==anchor.name||existing.kind!==anchor.kind||existing.revision!==anchor.revision||existing.source!==null
   ||existing.location?.kind!=='catalog'||existing.location.reference_kind!=='poi'||existing.location.id!==p.slug))throw Error('Точка проката требует повторной проверки.');
  if(!existing)input.graph.anchors.push(anchor);
  return anchor.id;
 };
 input.selection.use_end=landmark(day.places.at(-1));
 if(day.start_at)input.selection.from=landmark(day.start_at);
 if(row.returning)input.selection.back_to=landmark(row.returning.at);
 day.note=day.note.replace('Прокат добавляется отдельно.','Велосипед — из выбранного проката.');
 const visit={version:1,id:'visit-1',...structuredClone(entry.metadata),selection,note:'',saved_at:new Date().toISOString()};
 let held=rentalActivityTrip(engine,trip,visit,catalog,matrix),check=inspectTripServiceDay(engine,held.trip,catalog,matrix);
 // This picker has no fixed collection appointment. Bind its arrival to the
 // outer engine's road/reserve result, rather than presenting the start of
 // the day as an appointment that is already missed after that reserve.
 const scheduledId=check.itinerary?.order.find(s=>s.kind==='service'&&s.id===visit.id)?.schedule_id;
 const scheduled=check.places.stops.find(s=>s.id===scheduledId);
 if(scheduled?.arrival!=null&&scheduled.arrival!==input.arrival){
  input.arrival=scheduled.arrival;
  held=rentalActivityTrip(engine,trip,visit,catalog,matrix);check=inspectTripServiceDay(engine,held.trip,catalog,matrix);
 }
 const stopId=check.itinerary?.order.find(s=>s.kind==='destination')?.schedule_id;
 const arrival=stopId?check.places.stops.find(s=>s.id===stopId)?.begins??null:held.assessment.rental.timeline.departure;
 const returning=row.returning?{...row.returning,arrival,slack:arrival==null?null:row.returning.by-row.returning.buffer-arrival}:null;
 const fail=row.state==='does_not_fit'||check.state==='conflict'||held.assessment.state==='does_not_fit';
 const state=fail?'does_not_fit':row.state==='needs_info'||check.state!=='fits'||held.assessment.state!=='fits'?'needs_info':'fits';
 return {...row,trip:held.trip,state,distance_m:null,duration_minutes:check.places.finish==null?null:check.places.finish-row.input.start,
  returning,rental:{entry,units,visit:held.visit,assessment:held.assessment,check,stops:rentalActivityStops(held.visit,held.assessment,catalog)}};
}
