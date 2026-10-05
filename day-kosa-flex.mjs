import {selectedDay,chooseTripDay} from './trip-days-state.mjs?v=17';
import {tripSignature} from './trip-light.mjs?v=9';
import {currentProgress} from './day-progress.mjs?v=2';
import {kosaInput,kosaBusSnapshot,kosaRailSnapshot} from './kosa-plan-state.mjs?v=16';
import {kosaRoadbook} from './kosa-roadbook.mjs?v=14';
import {kosaProgressInput} from './day-kosa-progress.mjs?v=1';

const forest='tancuyushchiy-les';
const sameRide=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const outside=(result,progress)=>{
  const start=progress?.at??result.outward.arrival;
  return (result.transfer?result.transfer.departure:result.inward.departure)-start
    +(result.transfer?result.inward.via-result.transfer.via:0);
};
const signature=trip=>tripSignature(trip);
export function previewKosaFlex(trip,reason,catalog,engine,context){
  const record=selectedDay(trip),saved=record.kosa_plan;
  if(!['rain','fatigue'].includes(reason)||!saved||saved.date!==trip.date||context?.plan!==JSON.stringify(saved))return {error:'stale',options:[]};
  if(saved.walks!=='two')return {state:'one_walk',options:[]};
  if(record.visited?.includes(forest))return {state:'completed',options:[]};
  if(record.bookings?.some(row=>row.status!=='cancelled'&&(row.target===forest||row.location===forest)))return {state:'booked',options:[]};
  try {
    const progress=currentProgress(trip);
    if(record.visited?.length && !progress)return {state:'observation_needed',options:[]};
    const original=engine.transitDay(kosaProgressInput(trip,context));
    if(original.state!=='candidate'||original.continuation?.state==='conflict')return {state:'missed',options:[]};
    if(progress?.after!==undefined && progress.after!=='vysota-efa')return {state:'completed',options:[]};
    const prior=kosaRoadbook(saved,original,context.table,catalog,context.maps);
    const trail=prior.walking.checks.find(row=>row.field==='second_visit');
    if(prior.walking.status!=='within_estimate'||!trail?.trail)return {state:'unknown_walk',options:[]};
    const plan={...saved,walks:'one',fixed_transport:true,bus_snapshot:JSON.stringify([original.outward,null,original.transfer]),rail_snapshot:kosaRailSnapshot(original)};
    let input=kosaInput(plan,context.table,catalog);
    if(progress)input={...input,progress:{after:'first',at:progress.at}};
    const result=engine.transitDay(input);
    if(result.state!=='candidate'||result.continuation?.state==='conflict'||result.light?.daylight===false
      ||!sameRide(result.outward,original.outward)||!sameRide(result.inward,original.transfer)
      ||kosaRailSnapshot(result)!==kosaRailSnapshot(original))return {state:'unavailable',options:[]};
    const outdoorSaved=outside(original,progress)-outside(result,progress);
    const walkingSaved=trail.approach_minutes+trail.trail.walking_minutes;
    if(outdoorSaved<=0||walkingSaved<=0)return {state:'unavailable',options:[]};
    plan.bus_snapshot=kosaBusSnapshot(result);
    const book=kosaRoadbook(plan,result,context.table,catalog,context.maps);
    const waiting=day=>day.rail?day.rail.inward.departure-day.finish-day.rail.to_train:0;
    return {state:'ready',options:[{reason,signature:signature(trip),plan,result,book,removed:forest,
      outdoorSaved,walkingSaved,spitSaved:original.finish-result.finish,
      returnBefore:prior.return,returnAfter:book.return,railWait:waiting(result),railWaitBefore:waiting(original),
      progress:progress?structuredClone(progress):null,source:structuredClone(book.publication)}]};
  }catch {return {state:'unavailable',options:[]};}
}
export function applyKosaFlex(trip,option){
  if(!option?.result||signature(trip)!==option.signature)return {trip,error:'stale'};
  const record=selectedDay(trip),next={...record,kosa_plan:structuredClone(option.plan)};
  if(option.progress){
    const progress={...option.progress,kosa_snapshot:JSON.stringify(next.kosa_plan)};
    next.schedule={...trip.schedule,progress};
  }
  const changed={...trip,dreams:[...new Set([...(trip.dreams||[]),option.removed])],
    itinerary:{...trip.itinerary,days:trip.itinerary.days.map(day=>day.id===record.id?next:day)}};
  return {trip:chooseTripDay(changed,record.id)};
}
