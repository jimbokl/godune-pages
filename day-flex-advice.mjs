import {defaultSchedule,planInput} from './trip-schedule-state.mjs?v=11';
import {selectedDay} from './trip-days-state.mjs?v=14';
import {tripSignature} from './trip-light.mjs?v=7';
import {timingTrial} from './day-timing-advice.mjs?v=2';

// Planning proposals, not a reconstruction of time already spent on the road.
// The shared Rust calculation remains the sole clock for every candidate.
export const flexSignature=trip=>JSON.stringify([tripSignature(trip),selectedDay(trip).visited || []]);
export const canFlexDay=trip=>trip.places.length>0 && !selectedDay(trip).kosa_plan;
export function protectedFlexStops(trip,catalog) {
  const day=selectedDay(trip),ids=new Set(day.visited || []);
  for(const row of day.bookings || [])if(row.status!=='cancelled' && row.target)ids.add(row.target);
  for(const id of trip.places) {
    const place=catalog.poi.find(p=>p.slug===id);
    if(place?.gastronomy || ['restaurant','cafe','food'].includes(place?.category) || trip.schedule?.stops[id]?.excursion)ids.add(id);
  }
  // Saved station approaches refer to the existing boundary stops. Keep them.
  if(trip.schedule?.rail){ids.add(trip.places[0]);ids.add(trip.places.at(-1));}
  return ids;
}

export async function flexAdvice(trip,catalog,matrix,engine,result,request,stillCurrent=()=>true) {
  if(!canFlexDay(trip))return {state:'not_available',options:[]};
  if(!request || !['later','breathing_room'].includes(request.kind) || !Number.isInteger(request.minutes) || request.minutes<=0 || request.minutes>=1440)
    return {state:'invalid_request',options:[]};
  const snapshot=structuredClone(trip),settings=snapshot.schedule || defaultSchedule(),signature=flexSignature(snapshot);
  if(request.kind==='breathing_room' && result.finish===null)return {state:'incomplete',options:[]};
  // An arrival record can make the requested beginning later in reality.
  // Compare the same effective beginning, not a hidden old form value.
  let previousStart;
  try {previousStart=planInput(snapshot,catalog,matrix).start;}catch {return {state:'no_option',options:[]};}
  const start=request.kind==='later'?previousStart+request.minutes:settings.start;
  if(start>=settings.end || start>=1440)return {state:'no_option',options:[]};
  const trial=timingTrial(snapshot,catalog,matrix,engine,result);
  if(trial.error)return {state:trial.error,options:[]};
  const protectedIds=protectedFlexStops(snapshot,catalog),options=[];
  let trials=0;
  async function test(places,omitted=null) {
    if(++trials%8===0)await new Promise(resolve=>setTimeout(resolve,0));
    if(!stillCurrent())return null;
    const candidate={...snapshot,places,schedule:{...settings,start}},tested=trial.evaluate(candidate);
    if(!tested)return null;
    if(request.kind==='later' && tested.result.stops[0]?.arrival<(result.stops[0]?.arrival??previousStart)+request.minutes)return null;
    const freed=result.finish===null?null:result.finish-tested.result.finish;
    if(request.kind==='breathing_room' && freed<request.minutes)return null;
    return {signature,kind:request.kind,minutes:request.minutes,previousStart,start,displayStart:tested.scheduleStart,places:[...places],omitted,freed,...tested};
  }
  if(request.kind==='later') {
    const whole=await test(snapshot.places);if(whole)options.push(whole);
  }
  const shorter=[];
  if(snapshot.places.length>1)for(const id of snapshot.places) {
    if(!stillCurrent())return {state:'stale',options:[]};
    if(protectedIds.has(id))continue;
    const candidate=await test(snapshot.places.filter(value=>value!==id),id);
    if(candidate)shorter.push(candidate);
  }
  shorter.sort((a,b)=>b.result.slack-a.result.slack || snapshot.places.indexOf(a.omitted)-snapshot.places.indexOf(b.omitted));
  options.push(...shorter.slice(0,2-options.length));
  return stillCurrent()?{state:options.length?'ready':'no_option',options,trials}:{state:'stale',options:[]};
}

export function applyFlexAdvice(trip,option) {
  if(flexSignature(trip)!==option.signature)return {trip,error:'stale'};
  if(!['later','breathing_room'].includes(option.kind))return {trip,error:'unknown_option'};
  // Keep up-to-date notes, money and other days. The existing cleaner projects
  // only this day's new stop list and discards obsolete directed leg settings.
  const next={...trip,places:[...option.places],schedule:{...(trip.schedule || defaultSchedule()),start:option.start}};
  if(option.omitted)next.dreams=[...new Set([...(trip.dreams || []),option.omitted])];
  return {trip:next,error:null};
}
