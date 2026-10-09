import {ensureJourney,chooseTripDay,validTripDate} from './trip-days-state.mjs?v=27';
import {serviceVisitRows,validServiceVisit} from './trip-service-visits-contract.mjs?v=1';
import {nextServiceVisitId} from './trip-service-visits-state.mjs?v=5';
import {validServiceExpenseLink} from './trip-service-expenses-contract.mjs?v=1';
import {validTimeline,timelineOrder} from './trip-service-timeline-state.mjs';
import {inspectTripServiceDay} from './trip-service-day-state.mjs?v=8';
import {emptyCost} from './trip-expenses-state.mjs?v=14';

export const serviceMoveGuard=trip=>JSON.stringify(trip);
export function serviceMoveTargets(trip,sourceId){
 return (trip.itinerary?.days||[]).flatMap((day,index)=>day.id!==sourceId?[{id:day.id,number:index+1,date:day.date}]:[]);
}
function dayFor(trip,id){
 const day=trip.itinerary.days.find(d=>d.id===id);
 if(!day)throw Error('День поездки не найден.');
 if(Object.hasOwn(day,'timeline')&&!validTimeline(day.timeline))throw Error('Порядок дня сохранён в другой версии. Он остаётся в файле поездки.');
 if(Object.hasOwn(day,'service_visits')&&!Array.isArray(day.service_visits))throw Error('Посещения этого дня сохранены в другой версии.');
 return day;
}
// This is a pure preview. Rust recalculates the saved offer on the new date;
// no write or catalog refresh happens until the author confirms this snapshot.
export function prepareServiceMove(engine,trip,visitId,sourceId,targetId){
 const guard=serviceMoveGuard(trip),next=ensureJourney(trip);
 if(sourceId===targetId)throw Error('Выберите другой день.');
 const source=dayFor(next,sourceId),target=dayFor(next,targetId);
 if(!validTripDate(target.date))throw Error('Сначала укажите дату выбранного дня.');
 const original=serviceVisitRows(source).find(v=>v?.id===visitId);
 if(!validServiceVisit(original))throw Error('Не удалось прочитать выбранное посещение. Оно остаётся в исходном дне.');
 const moved=structuredClone(original),dateChanged=moved.selection.visit.input.date!==target.date;
 moved.id=nextServiceVisitId(target);moved.selection.visit.input.date=target.date;
 if(dateChanged)moved.selection.participants.booking={status:'not_booked',notice_minutes:null};
 const prepared=engine.serviceTrip(moved);
 if(!validServiceVisit(prepared.visit)||prepared.visit.id!==moved.id)throw Error('Не удалось пересчитать посещение.');
 // Materialize the target's current effective order before adding the visit.
 const order=Object.hasOwn(target,'timeline')?timelineOrder(target):null;
 source.service_visits=serviceVisitRows(source).filter(v=>v.id!==visitId);
 target.service_visits=[...serviceVisitRows(target),structuredClone(prepared.visit)];
 if(source.timeline)source.timeline.order=source.timeline.order.filter(row=>row.kind!=='service'||row.id!==visitId);
 if(order)target.timeline={version:1,order:[...order,{kind:'service',id:moved.id}]};
 let expenses=0,unresolvedExpenses=0;
 const itemIds=new Set(Object.values(target.costs||{}).flatMap(cost=>(cost.items||[]).map(item=>item.id)));
 const refundIds=new Set(Object.values(target.costs||{}).flatMap(cost=>(cost.items||[]).flatMap(item=>(item.refunds||[]).map(row=>row.id))));
 const allocate=(ids,prefix)=>{let n=1;while(ids.has(`${prefix}-${n}`))n++;const id=`${prefix}-${n}`;ids.add(id);return id;};
 for(const [kind,cost] of Object.entries(source.costs||{})){
  const retained=[];
  for(const item of cost.items||[]){
   const link=item.service_visit;
   if(link?.snapshot?.id!==visitId){retained.push(item);continue;}
   // Future opaque bindings are kept intact in their original day.
   if(link.version!==1||!validServiceExpenseLink(link)){retained.push(item);unresolvedExpenses++;continue;}
   // Summary budgets intentionally ignore their item history. Do not activate
   // that history or move an active payment into an ignored list implicitly.
   const destination=target.costs[kind];
   if(cost.basis!=='items'||destination?.basis!=='items'&&destination?.items?.length){retained.push(item);unresolvedExpenses++;continue;}
   const copy=structuredClone(item);
   if(itemIds.has(copy.id))copy.id=allocate(itemIds,'cost-service');
   itemIds.add(copy.id);copy.service_visit.snapshot.id=moved.id;
   for(const refund of copy.refunds||[]){if(refundIds.has(refund.id))refund.id=allocate(refundIds,'refund-move');refundIds.add(refund.id);}
   // The money and its original confirmation date remain historical facts.
   // Rust reports date/party changes instead of silently repricing paid items.
   const row=target.costs[kind]??=emptyCost();
   if(row.basis!=='items'&&(row.amount!==null||row.paid!=null)){
    const summary={id:allocate(itemIds,'cost-summary'),label:'Ранее запланированный расход',poi:null,amount:row.amount,quantity:row.quantity,scope:row.scope,paid:row.paid??null,source:null};
    row.items=[...(row.items||[]),summary];
   }
   row.items=[...(row.items||[]),copy];row.basis='items';expenses++;
  }
  if(cost.items)cost.items=retained;
 }
 for(const day of [source,target])if(day.schedule)delete day.schedule.progress;
 const connections=source.transfer_connections?.choices;
 const roads=(Array.isArray(connections)?connections:[]).filter(road=>[road?.from,road?.to].some(end=>end?.kind==='service'&&end.id===visitId)).length;
 return {version:1,guard,sourceId,targetId,visitId,newVisitId:moved.id,trip:chooseTripDay(next,targetId),visit:prepared.visit,assessment:prepared.assessment,dateChanged,bookingReset:dateChanged&&original.selection.participants.booking?.status==='confirmed',expenses,unresolvedExpenses,roads};
}
export function confirmServiceMove(trip,preview){
 if(preview?.version!==1||serviceMoveGuard(trip)!==preview.guard)throw Error('Поездка изменилась. Выберите день и проверьте перенос заново.');
 return structuredClone(preview.trip);
}
export function inspectServiceMoveDay(engine,preview,catalog,matrix){
 return inspectTripServiceDay(engine,preview.trip,catalog,matrix);
}
