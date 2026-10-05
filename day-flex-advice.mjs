import {defaultSchedule,planInput} from './trip-schedule-state.mjs?v=11';
import {selectedDay} from './trip-days-state.mjs?v=14';
import {tripSignature} from './trip-light.mjs?v=7';
import {timingTrial} from './day-timing-advice.mjs?v=2';
import {resolveRail,rideSnapshot} from './trip-rail-state.mjs?v=3';

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
  // An unresolved saved train must not disappear from a proposed walking day.
  let rail=null;
  if(settings.rail) {
    try {rail=resolveRail(snapshot,catalog);}catch {}
    if(!rail?.input)return {state:'rail_unavailable',options:[]};
  }
  // An arrival record can make the requested beginning later in reality.
  // Compare the same effective beginning, not a hidden old form value.
  let previousStart;
  try {previousStart=planInput(snapshot,catalog,matrix).start;}catch {return {state:'no_option',options:[]};}
  const starts=rail && request.kind==='later'
    ?rail.outward.map(rideSnapshot).filter(ride=>ride.departure>=settings.rail.outward.departure+request.minutes && ride.arrival>settings.rail.outward.arrival)
      .map(outward=>({start:settings.start,outward}))
    :[{start:request.kind==='later'?previousStart+request.minutes:settings.start,outward:null}];
  if(!starts.length || starts.every(row=>row.start>=settings.end || row.start>=1440))return {state:'no_option',options:[]};
  const trial=timingTrial(snapshot,catalog,matrix,engine,result);
  if(trial.error)return {state:trial.error,options:[]};
  const protectedIds=protectedFlexStops(snapshot,catalog),options=[];
  let trials=0;
  async function test(change,places,omitted=null) {
    if(++trials%8===0)await new Promise(resolve=>setTimeout(resolve,0));
    if(!stillCurrent())return null;
    const candidate={...snapshot,places,schedule:{...settings,start:change.start,
      ...(change.outward?{rail:{...settings.rail,outward:change.outward}}:{})}},tested=trial.evaluate(candidate);
    if(!tested)return null;
    if(request.kind==='later' && tested.result.stops[0]?.arrival<(result.stops[0]?.arrival??previousStart)+request.minutes)return null;
    const freed=result.finish===null?null:result.finish-tested.result.finish;
    if(request.kind==='breathing_room' && freed<request.minutes)return null;
    const railChange=change.outward?{before:structuredClone(settings.rail.outward),after:structuredClone(change.outward),
      inbound:structuredClone(settings.rail.inbound),source:structuredClone(rail.source),service:rail.service.id}:null;
    return {signature,kind:request.kind,minutes:request.minutes,previousStart,start:change.start,
      displayStart:tested.scheduleStart,railChange,places:[...places],omitted,freed,...tested};
  }
  let chosen=null;
  if(request.kind==='later') {
    // Prefer keeping the whole walk; choose the earliest verified train that fits.
    for(const change of starts) {
      if(!stillCurrent())return {state:'stale',options:[]};
      const whole=await test(change,snapshot.places);
      if(whole){options.push(whole);chosen=change;break;}
    }
  }
  for(const change of chosen?[chosen]:starts) {
    const shorter=[];
    if(snapshot.places.length>1)for(const id of snapshot.places) {
      if(!stillCurrent())return {state:'stale',options:[]};
      if(protectedIds.has(id))continue;
      const candidate=await test(change,snapshot.places.filter(value=>value!==id),id);
      if(candidate)shorter.push(candidate);
    }
    shorter.sort((a,b)=>b.result.slack-a.result.slack || snapshot.places.indexOf(a.omitted)-snapshot.places.indexOf(b.omitted));
    options.push(...shorter.slice(0,2-options.length));
    if(options.length)break;
  }
  return stillCurrent()?{state:options.length?'ready':'no_option',options,trials}:{state:'stale',options:[]};
}

export function applyFlexAdvice(trip,option) {
  if(flexSignature(trip)!==option.signature)return {trip,error:'stale'};
  if(!['later','breathing_room'].includes(option.kind))return {trip,error:'unknown_option'};
  // Keep up-to-date notes, money and other days. The existing cleaner projects
  // only this day's new stop list and discards obsolete directed leg settings.
  const next={...trip,places:[...option.places],schedule:{...(trip.schedule || defaultSchedule()),start:option.start}};
  if(option.railChange)next.schedule.rail={...trip.schedule.rail,outward:structuredClone(option.railChange.after)};
  if(option.omitted)next.dreams=[...new Set([...(trip.dreams || []),option.omitted])];
  return {trip:next,error:null};
}
