// Explicit Event → existing SavedVisit → common service_day. No persistence here.
import {ensureJourney,selectedDay,chooseTripDay} from './trip-days-state.mjs?v=2026101707';
import {dayPeople} from './trip-party.mjs?v=2026101305';
import {defaultSchedule} from './trip-schedule-state.mjs?v=2026101305';
import {eventSnapshot,eventRegionalStart,eventSnapshotGuard} from './trip-events-contract.mjs?v=2026101707';
import {prepareServiceAdd,confirmServiceAdd,inspectServiceAddDay} from './trip-service-add-state.mjs?v=2026101707';
import {timelineOrder} from './trip-service-timeline-state.mjs?v=2026101707';
// Object key order may change when cleanJourney projects the selected schedule.
// Keep every value and array order in the stale-preview guard.
const eventTripGuard=trip=>JSON.stringify(trip,(_,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])):value);
const minutes=value=>value===null||Number.isSafeInteger(value)&&value>=0&&value<=1440;
export function eventVisit(trip,event,{venue,date,approach=null,return_walk=null,saved_at=new Date().toISOString()}={}){
 const snapshot=eventSnapshot(event,venue),start=eventRegionalStart(snapshot);
 if(snapshot.status!=='scheduled')throw Error('Событие отменено или перенесено. Проверьте новую афишу.');
 if(date&&date!==start.date)throw Error(`Событие начинается ${start.date}. Выберите эту дату: его начало не переносится вместе с днём.`);
 if(!minutes(approach)||!minutes(return_walk))throw Error('Укажите минуты подхода или оставьте поле пустым.');
 const day=selectedDay(trip),schedule=day.schedule||trip.schedule||defaultSchedule();
 const activity=snapshot.end_time===null?null:(Date.parse(snapshot.end_time)-Date.parse(snapshot.start_time))/60000;
 // A fixed session owns its latest venue arrival, rather than occupying the day
 // from schedule.start. Unknown access still remains null in timing/assessment.
 const service_id=`event:${snapshot.id}`,people=dayPeople(day,trip.itinerary?.people||1);
 // A range/from price is a source observation, never a selected ticket tariff.
 // No booking, age restriction or full bill is inferred from a poster.
 const source={reference:snapshot.source_url,checked_at:typeof snapshot.verified_at==='string'&&snapshot.verified_at.length===10?snapshot.verified_at:eventRegionalStart({start_time:snapshot.verified_at})?.date,valid_from:start.date,valid_until:start.date};
 const calendar=activity===null?null:{version:1,timezone:snapshot.timezone,source,rules:[],exceptions:[{date:start.date,source,day:{kind:'sessions',sessions:[{start:start.minute,duration:activity}]}}]};
 return {version:1,id:'visit-1',name:snapshot.title,category:'event',identity:{place_id:snapshot.place_id||`venue:${snapshot.venue_id}`,branch_id:snapshot.venue_id,service_id,offer_id:null},address:venue?.address??null,point:null,event:snapshot,selection:{version:1,service_id,activity_id:snapshot.id,visit:{kind:'manual',input:{version:1,date:start.date,arrival:Math.max(0,start.minute-(approach??0)),finish_by:schedule.end,session_start:start.minute,timing:{approach,collect:0,change_before:0,prepare:0,activity,complete:0,change_after:0,return_walk},calendar}},price:null,policy:{version:1,rules:[]},participants:{party_size:people,people:null,party_items:null,booking:{status:'not_booked',notice_minutes:null}},limits:{cost:null,upfront:null}},note:'',saved_at};
}
export function prepareEventAdd(engine,trip,event,options={}){
 const original=ensureJourney(trip),targetId=options.targetId===undefined?selectedDay(original).id:options.targetId;
 const target=targetId?chooseTripDay(original,targetId):original;
 const visit=eventVisit(target,event,options),dated=target.itinerary.days.find(d=>d.id===targetId);
 // Stable event identity prevents accidental duplicate additions after a source recheck.
 const existing=dated?.service_visits?.find(v=>v.event?.id===visit.event.id);
 if(existing){
  const checked=engine.serviceTrip(existing),chosen=chooseTripDay(original,targetId);
  return {version:1,kind:'event',guard:eventTripGuard(trip),eventGuard:eventSnapshotGuard(visit.event),targetId,trip:chosen,visit:structuredClone(existing),assessment:checked.assessment,alreadyAdded:true};
 }
 const prepared=engine.serviceTrip(visit),preview=prepareServiceAdd(engine,original,prepared,targetId);
 preview.guard=eventTripGuard(trip);preview.kind='event';preview.eventGuard=eventSnapshotGuard(visit.event);
 const day=selectedDay(preview.trip),entry={kind:'service',id:preview.visit.id},order=timelineOrder(day).filter(row=>row.kind!=='service'||row.id!==entry.id);
 // A separate event day has no selected city train. Keep the original day's
 // dated rail snapshot intact; the event's road/return remain to be selected.
 if(!targetId){if(day.schedule)delete day.schedule.rail;if(preview.trip.schedule)delete preview.trip.schedule.rail;}
 // Only the new entry moves; every existing place, dinner and return remains.
 let index=order.length;
 if(options.before){index=order.findIndex(row=>row.kind===options.before.kind&&row.id===options.before.id);if(index<0)throw Error('Выбранная остановка уже изменилась. Проверьте порядок заново.');}
 else if(options.before!==null){const start=visit.selection.visit.input.session_start;const i=order.findIndex(row=>row.kind==='service'&&day.service_visits.find(v=>v.id===row.id)?.selection?.visit?.input?.arrival>=start);if(i>=0)index=i;}
 order.splice(index,0,entry);day.timeline={version:1,order};
 return preview;
}
export function confirmEventAdd(trip,preview,note,{event,venue}={}){
 if(preview?.kind!=='event')throw Error('Откройте предпросмотр события заново.');
 if(eventTripGuard(trip)!==preview.guard)throw Error('Поездка изменилась. Проверьте день ещё раз перед добавлением.');
 if(event&&eventSnapshotGuard(eventSnapshot(event,venue))!==preview.eventGuard)throw Error('Афиша изменилась. Проверьте время и событие заново перед сохранением.');
 return confirmServiceAdd(trip,{...preview,guard:JSON.stringify(trip)},note);
}
export const inspectEventAddDay=inspectServiceAddDay;
export function selectedEventContext(trip,catalog){
 const day=selectedDay(trip),ids=[...day.places,...(day.service_visits||[]).map(v=>v.event?.place_id).filter(Boolean)],places=ids.map(id=>catalog.poi.find(p=>p.slug===id)).filter(Boolean);
 const city=places.map(p=>p.city||p.area).find(Boolean)||null;
 return {city,date:day.date,venue_ids:[...new Set((day.service_visits||[]).map(v=>v.event?.venue_id).filter(Boolean))]};
}
