// Rust owns calculations; this adapter owns membership and user notes.
import {ensureJourney,selectedDay,journeyDays,validTripDate,addTripDay,chooseTripDay,dayHasContent} from './trip-days-state.mjs?v=27';
import {validServiceVisit,serviceVisitRows} from './trip-service-visits-contract.mjs?v=1';
export {serviceVisitRows,serviceVisitContext,serviceVisitImportIssue} from './trip-service-visits-contract.mjs?v=1';
function dayFor(trip,id){
 const day=id?trip.itinerary.days.find(d=>d.id===id):selectedDay(trip);
 if(!day)throw Error('День поездки не найден.');
 if(Object.hasOwn(day,'service_visits')&&!Array.isArray(day.service_visits))throw Error('Посещения этого дня сохранены в другой версии.');
 return day;
}
function choice(prepared){
 if(prepared?.version!==1||!validServiceVisit(prepared.visit)||prepared.assessment?.version!==1||prepared.assessment.service_id!==prepared.visit.identity.service_id||prepared.assessment.activity_id!==prepared.visit.selection.activity_id)throw Error('Не удалось прочитать выбранное посещение.');
 return structuredClone(prepared.visit);
}
export function addServiceVisit(trip,prepared,dayId){
 const visit=choice(prepared),next=ensureJourney(trip),day=dayFor(next,dayId),rows=serviceVisitRows(day);
 visit.id=nextServiceVisitId(day);day.service_visits=[...rows,visit];return next;
}
// Removed visits can still have paid expenses or selected roads. Reusing their
// identity would silently attach that history to an unrelated new visit.
export function nextServiceVisitId(day){
 const ids=new Set(serviceVisitRows(day).map(v=>v?.id));
 for(const cost of Object.values(day.costs||{}))for(const item of cost.items||[])ids.add(item.service_visit?.snapshot?.id);
 const roads=day.transfer_connections?.choices;
 for(const road of Array.isArray(roads)?roads:[])for(const end of [road?.from,road?.to])if(end?.kind==='service')ids.add(end.id);
 let number=1;while(ids.has(`visit-${number}`))number++;
 return `visit-${number}`;
}
export function serviceVisitTargets(trip,date){
 if(!validTripDate(date))throw Error('Выберите дату посещения.');
 return journeyDays(trip).flatMap((day,index)=>day.date===date?[{id:day.id,number:index+1}]:[]);
}
// Explicit target; never redates another day. Allocation runs on the latest draft.
export function addServiceVisitToDate(trip,prepared,target){
 const visit=choice(prepared),date=visit.selection.visit.input.date;
 if(!validTripDate(date))throw Error('Выберите дату посещения.');
 let next=ensureJourney(trip);
 if(target){
  const day=dayFor(next,target);
  if(day.date!==date)throw Error('У дня изменилась дата. Выберите день заново.');
  next=chooseTripDay(next,target);
 }else{
  if(!(next.itinerary.days.length===1&&!selectedDay(next).date&&!dayHasContent(next)))next=addTripDay(next);
  const day=selectedDay(next);day.date=date;
  next={...next,date,month:Number(date.slice(5,7))};
 }
 return addServiceVisit(next,prepared);
}
export function replaceServiceVisit(trip,prepared,id,dayId){
 const visit=choice(prepared),next=ensureJourney(trip),day=dayFor(next,dayId),rows=serviceVisitRows(day),index=rows.findIndex(v=>v?.id===id);
 if(index<0)throw Error('Посещение не найдено.');
 if(!validServiceVisit(rows[index]))throw Error('Посещение сохранено в другой версии.');
 visit.id=id;day.service_visits[index]=visit;return next;
}
export function changeServiceVisitNote(trip,id,note,dayId){
 if(typeof note!=='string')throw Error('Не удалось прочитать заметку.');
 const next=ensureJourney(trip),day=dayFor(next,dayId),visit=serviceVisitRows(day).find(v=>v?.id===id);
 if(!visit)throw Error('Посещение не найдено.');
 if(!validServiceVisit(visit))throw Error('Посещение сохранено в другой версии.');
 visit.note=note;return next;
}
export function removeServiceVisit(trip,id,dayId){
 const next=ensureJourney(trip),day=dayFor(next,dayId);
 day.service_visits=serviceVisitRows(day).filter(v=>v?.id!==id);return next;
}
