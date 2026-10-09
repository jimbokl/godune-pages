import {cleanTrip} from './trip-state.mjs?v=28';
import {ensureJourney,chooseTripDay} from './trip-days-state.mjs?v=25';
import {validTransportReceipt,transportPlansImportIssue} from './trip-transport-plans-contract.mjs';
export {transportPlanContext} from './trip-transport-plans-contract.mjs';
const check=trip=>{const issue=transportPlansImportIssue(trip);if(issue)throw Error(issue);};
export function saveTransportPlan(trip,catalog,receipt,now=new Date()){
 check(trip);
 if(!validTransportReceipt(receipt))throw Error('invalid_transport_receipt');
 const saved_at=now.toISOString(),next=ensureJourney(cleanTrip(trip,catalog)),days=next.itinerary.days;
 let day=days.find(d=>d.transport_plans?.entries.some(e=>e.receipt.profile===receipt.profile&&e.receipt.date===receipt.date));
 if(!day){
  let n=1;while(days.some(d=>d.id===`day-${n}`))n++;
  day={id:`day-${n}`,date:receipt.date,places:[],start_at:null,night_at:null,note:'',costs:{}};
  days.push(day);
 }
 const entry={id:receipt.profile,receipt:structuredClone(receipt),saved_at};
 const entries=day.transport_plans?.entries||[],index=entries.findIndex(e=>e.id===entry.id);
 if(index<0)entries.push(entry);else entries[index]=entry;
 day.transport_plans={version:1,entries};
 return cleanTrip(chooseTripDay(next,day.id),catalog);
}
export function removeTransportPlan(trip,catalog,dayId,entryId){
 check(trip);
 const next=cleanTrip(trip,catalog),day=next.itinerary?.days.find(d=>d.id===dayId);
 if(!day?.transport_plans?.entries.some(e=>e.id===entryId))return next;
 const entries=day.transport_plans.entries.filter(e=>e.id!==entryId);
 if(entries.length)day.transport_plans={version:1,entries};else delete day.transport_plans;
 return cleanTrip(next,catalog);
}
