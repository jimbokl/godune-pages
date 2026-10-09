import {selectedDay,changeDayDetails} from './trip-days-state.mjs?v=26';
import {dayPeople} from './trip-party.mjs?v=1';
import {putExpense} from './trip-expenses-state.mjs?v=13';
import {validServiceVisit,serviceVisitContext} from './trip-service-visits-contract.mjs?v=1';
import {linkedServiceExpense} from './trip-service-expenses-contract.mjs?v=1';
const categories={bike_rental:'travel',dining:'food',bath:'tickets',pool:'tickets',gym:'tickets',workshop:'tickets',market:'other',water_activity:'tickets'};
// Serde writes absent optional fields as null and orders object keys itself.
// Compare the choice, not the serialization format; array order still matters.
const choiceValue=value=>Array.isArray(value)?value.map(choiceValue):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==null).map(key=>[key,choiceValue(value[key])])):value;
export function recordServiceExpense(trip,visitId,prepared,guard){
 if(JSON.stringify(trip)!==guard)return trip;
 const day=selectedDay(trip),visit=Array.isArray(day.service_visits)?day.service_visits.find(v=>v?.id===visitId):null;
 if(!validServiceVisit(visit)||serviceVisitContext(visit,day)!=='ready'||prepared?.version!==1||JSON.stringify(choiceValue(prepared.visit))!==JSON.stringify(choiceValue(visit))||linkedServiceExpense(day,visitId))return trip;
 const ids=new Set(Object.values(day.costs).flatMap(cost=>(cost.items||[]).map(item=>item.id)));
 let number=1;while(ids.has(`cost-service-${number}`))number++;
 const total=prepared.assessment?.quote?.cost_total??null;
 const item={id:`cost-service-${number}`,label:visit.name,poi:null,amount:total,quantity:1,scope:'group',paid:null,source:{label:`${visit.name} · выбранный тариф`,href:null,observed_at:null,quoted_amount:total,catalog_id:null},service_visit:{version:1,snapshot:structuredClone(visit),date:day.date,people:dayPeople(day,trip.itinerary?.people||1)}};
 return changeDayDetails(trip,{costs:putExpense(day.costs,categories[visit.category],item)});
}
