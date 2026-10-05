import {defaultSchedule, planInput} from './trip-schedule-state.mjs?v=11';
import {tripSignature, lightInput} from './trip-light.mjs?v=7';

// This is a proposal search, not a second clock. Every trial uses the shared
// Rust scheduler, including directed roads, calendars, tickets and the return.
const hard = new Set(['closed','window_missed','after_deadline','kitchen_closed','kitchen_window_missed',
  'transport_conflict','appointment_missed','appointment_venue_conflict']);
const unknown = new Set(['unknown_travel','unknown_approach','unknown_return','unknown_opening','unknown_kitchen',
  'transport_incomplete','appointment_needs_check']);
const issues = result => result.stops.flatMap(stop=>stop.issues.map(issue=>({id:stop.id,...issue})));
export const needsTimingHelp = result => ['overrun','conflict'].includes(result?.status);
const fits = result => ['fits','needs_check'].includes(result.status) && result.finish!==null && result.slack!==null && result.slack>=0
  && !issues(result).some(issue=>hard.has(issue.code));
const unknownKeys = result => new Set(issues(result).filter(issue=>unknown.has(issue.code)).map(issue=>`${issue.id}:${issue.code}`));

function daylightDoesNotWorsen(before, after) {
  if(!before)return !after || after.stops.every(row=>!row.outdoor || row.state==='daylight');
  return after && after.stops.every(row=>{
    if(!row.outdoor)return true;
    const old=before.stops.find(item=>item.id===row.id);
    if(!old || ['unknown_timing','outside_day','unavailable'].includes(row.state))return false;
    if(['unknown_timing','outside_day','unavailable'].includes(old.state))return row.state==='daylight';
    return row.dark_minutes<=old.dark_minutes && row.outside_sun_minutes<=old.outside_sun_minutes;
  });
}

// Both repair and shortening proposals use this one acceptance contract.
// A shorter list must still have known roads and must not move nature into darkness.
export function timingTrial(trip,catalog,matrix,engine,result) {
  const missing=unknownKeys(result);
  const outdoor=trip.places.some(id=>['nature','park','viewpoint','beach'].includes(catalog.poi.find(place=>place.slug===id)?.category));
  let beforeLight=null;
  if(outdoor && trip.date) {
    try {beforeLight=engine.light(lightInput(trip,catalog,result));}catch {return {error:'light_unavailable'};}
  }
  return {evaluate(candidate) {
    try {
      const input=planInput(candidate,catalog,matrix),schedule=engine(input);
      if(!fits(schedule) || [...unknownKeys(schedule)].some(key=>!missing.has(key)))return null;
      let light=null;
      if(outdoor && trip.date) {
        light=engine.light(lightInput(candidate,catalog,schedule));
        if(!daylightDoesNotWorsen(beforeLight,light))return null;
      }
      return {before:result,result:schedule,light,scheduleStart:input.start,needsCheck:issues(schedule).length>0};
    }catch {return null;}
  }};
}

export async function timingAdvice(trip,catalog,matrix,engine,result,stillCurrent=()=>true) {
  if(!needsTimingHelp(result) || !trip.places.length || trip.itinerary?.days.find(day=>day.id===trip.itinerary.active)?.kosa_plan)
    return {state:'not_needed',options:[]};
  const snapshot=structuredClone(trip),signature=tripSignature(snapshot),settings=snapshot.schedule || defaultSchedule();
  const trial=timingTrial(snapshot,catalog,matrix,engine,result),options=[];
  if(trial.error)return {state:trial.error,options:[]};
  let trials=0;
  async function test(candidate,change) {
    if(++trials%12===0)await new Promise(resolve=>setTimeout(resolve,0));
    if(!stillCurrent())return null;
    const tested=trial.evaluate(candidate);
    return tested?{signature,...change,places:[...candidate.places],start:candidate.schedule?.start ?? settings.start,...tested}:null;
  }
  // One-minute trials find the smallest earlier start. Calendar breaks and
  // departures make a binary search unsafe: feasibility need not be monotonic.
  for(let start=settings.start-1;start>=0;start--) {
    if(!stillCurrent())return {state:'stale',options:[]};
    const candidate={...snapshot,schedule:{...settings,start}};
    const option=await test(candidate,{kind:'start',previousStart:settings.start});
    if(option){options.push(option);break;}
  }
  // Try a single move; preserve every stop, duration, pause and recorded ticket.
  // Rebuilding planInput invalidates manual travel for changed directed pairs.
  let best=null;
  for(let from=1;from<snapshot.places.length;from++)for(let to=0;to<from;to++) {
    if(!stillCurrent())return {state:'stale',options:[]};
    const places=[...snapshot.places],[moved]=places.splice(from,1);places.splice(to,0,moved);
    const option=await test({...snapshot,places},{kind:'order',moved,from,to});
    if(option && (!best || from-to<best.from-best.to || from-to===best.from-best.to && option.result.finish<best.result.finish))best=option;
  }
  if(best)options.push(best);
  return stillCurrent()?{state:options.length?'ready':'no_option',options,trials}:{state:'stale',options:[]};
}

// Storage still owns validation, selected-day projection and real completion.
// A stale proposal is a no-op; fresh unrelated notes/expenses remain intact.
export function applyTimingAdvice(trip,option) {
  if(tripSignature(trip)!==option.signature)return {trip,error:'stale'};
  if(option.kind==='start')return {trip:{...trip,schedule:{...(trip.schedule || defaultSchedule()),start:option.start}},error:null};
  if(option.kind==='order')return {trip:{...trip,places:[...option.places]},error:null};
  return {trip,error:'unknown_option'};
}
