// Service snapshots are separate from personal walk/boarding allowances.
import {serviceDay,validServiceDate} from './service-calendar.mjs?v=1';
const object=v=>v && typeof v==='object' && !Array.isArray(v);
const date=validServiceDate;
const minute=v=>Number.isInteger(v) && v>=0 && v<=1440;
const ride=v=>object(v) && Object.keys(v).length===3 && typeof v.id==='string' && /^[a-z0-9][a-z0-9-]*$/.test(v.id) && minute(v.departure) && minute(v.arrival) && v.departure<v.arrival && v.arrival<1440;
export function validRail(v) {
  return object(v) && Object.keys(v).length===7 && typeof v.service==='string' && /^[a-z0-9][a-z0-9-]*$/.test(v.service)
    && (v.date===null || date(v.date)) && ride(v.outward) && ride(v.inbound) && minute(v.boarding)
    && [v.after_arrival,v.before_return].every(n=>n===null || minute(n));
}
const toMinute=v=>Number(v.slice(0,2))*60+Number(v.slice(3));
export const rideSnapshot=v=>({id:v.id,departure:toMinute(v.departure),arrival:toMinute(v.arrival)});
export function railTable(catalog,id,day) {
  const service=catalog?.rail_services?.find(s=>s.id===id);
  return serviceDay(service,day);
}
export function resolveRail(trip,catalog) {
  const saved=trip.schedule?.rail;if(!saved)return null;
  const table=railTable(catalog,saved.service,trip.date),result={...table,saved,input:null};
  if(!date(trip.date))return {...result,reason:'choose_date'};
  if(saved.date!==trip.date)return {...result,reason:'stale_date'};
  if(table.reason)return result;
  for(const direction of ['outward','inbound']) {
    if(table[direction]===null)return {...result,reason:'unknown_timetable'};
    if(!table[direction].length)return {...result,reason:'cancelled'};
    const current=table[direction].find(r=>r.id===saved[direction].id);
    if(!current || JSON.stringify(rideSnapshot(current))!==JSON.stringify(saved[direction]))return {...result,reason:'changed_timetable'};
  }
  return {...result,input:{outward:{departure:saved.outward.departure,arrival:saved.outward.arrival},inbound:{departure:saved.inbound.departure,arrival:saved.inbound.arrival},after_arrival:saved.after_arrival,before_return:saved.before_return,boarding:saved.boarding,needs_check:true}};
}
export function saveRail(trip,value) {
  if(value!==null && !validRail(value))return trip;
  const next=structuredClone(trip);next.schedule ||= {start:540,end:1080,reserve:10,stops:{}};
  if(value===null)delete next.schedule.rail;else next.schedule.rail=structuredClone(value);
  return next;
}
// Include all time/geography bindings: an old form cannot change another tab's day.
export const railContext=trip=>JSON.stringify([trip.itinerary?.active,trip.date,trip.places,trip.schedule,trip.itinerary?.days.find(d=>d.id===trip.itinerary.active)?.start_at,trip.itinerary?.days.find(d=>d.id===trip.itinerary.active)?.night_at,trip.itinerary?.days.find(d=>d.id===trip.itinerary.active)?.bookings]);
