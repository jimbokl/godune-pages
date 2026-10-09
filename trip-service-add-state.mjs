// A pure preview of the exact draft that the author will confirm.
import {chooseTripDay,selectedDay} from './trip-days-state.mjs?v=27';
import {serviceVisitRows,addServiceVisitToDate} from './trip-service-visits-state.mjs?v=5';
import {inspectTripServiceDay} from './trip-service-day-state.mjs?v=8';

export const serviceAddGuard=trip=>JSON.stringify(trip);
export function prepareServiceAdd(engine,trip,prepared,target){
 const guard=serviceAddGuard(trip),checked=engine.serviceTrip(prepared.visit);
 const day=trip.itinerary?.days?.find(d=>d.id===target);
 const existing=day?.date===checked.visit.selection.visit.input.date?serviceVisitRows(day).find(v=>JSON.stringify(v.identity)===JSON.stringify(checked.visit.identity)&&JSON.stringify(v.selection)===JSON.stringify(checked.visit.selection)):null;
 // An existing membership retains the author's original note and snapshot.
 const next=existing?chooseTripDay(trip,target):addServiceVisitToDate(trip,checked,target||null);
 const selected=selectedDay(next),visit=existing||serviceVisitRows(selected).at(-1);
 return {version:1,guard,targetId:selected.id,trip:next,visit:structuredClone(visit),assessment:existing?engine.serviceTrip(existing).assessment:checked.assessment,alreadyAdded:!!existing};
}
export function confirmServiceAdd(trip,preview,note){
 if(preview?.version!==1||serviceAddGuard(trip)!==preview.guard)throw Error('Поездка изменилась. Проверьте день ещё раз перед добавлением.');
 if(typeof note!=='string')throw Error('Не удалось прочитать заметку.');
 const next=structuredClone(preview.trip);
 if(!preview.alreadyAdded)serviceVisitRows(selectedDay(next)).find(v=>v.id===preview.visit.id).note=note;
 return next;
}
export function inspectServiceAddDay(engine,preview,catalog,matrix){
 return inspectTripServiceDay(engine,preview.trip,catalog,matrix);
}
