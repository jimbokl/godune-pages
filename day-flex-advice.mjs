import {defaultSchedule,planInput} from './trip-schedule-state.mjs?v=11';
import {selectedDay} from './trip-days-state.mjs?v=14';
import {tripSignature} from './trip-light.mjs?v=7';
import {timingTrial} from './day-timing-advice.mjs?v=2';
import {resolveRail,rideSnapshot} from './trip-rail-state.mjs?v=3';

// Planning proposals, not a reconstruction of time already spent on the road.
// The shared Rust calculation remains the sole clock for every candidate.
export const flexSignature=trip=>JSON.stringify([tripSignature(trip),selectedDay(trip).visited || []]);
export const canFlexDay=trip=>trip.places.length>0 && !selectedDay(trip).kosa_plan;
export const flexOmissions=option=>option.omittedIds || (option.omitted?[option.omitted]:[]);

// Search by the number of moved places, keeping the remaining order intact.
// Lazy combinations avoid allocating the power set; each calculation yields
// regularly so changing the request or day can cancel a long search.
function* omissions(ids,count,from=0,chosen=[]) {
  if(chosen.length===count){yield [...chosen];return;}
  for(let i=from;i<=ids.length-(count-chosen.length);i++) {
    chosen.push(ids[i]);yield* omissions(ids,count,i+1,chosen);chosen.pop();
  }
}
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
  const optional=snapshot.places.filter(id=>!protectedIds.has(id));
  let trials=0;
  async function test(change,places,omittedIds=[]) {
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
      displayStart:tested.scheduleStart,railChange,places:[...places],
      omitted:omittedIds.length===1?omittedIds[0]:null,omittedIds:[...omittedIds],freed,...tested};
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
    for(let count=1;count<=Math.min(optional.length,snapshot.places.length-1);count++) {
      const shorter=[];
      for(const moved of omissions(optional,count)) {
        if(!stillCurrent())return {state:'stale',options:[]};
        const removed=new Set(moved);
        const candidate=await test(change,snapshot.places.filter(id=>!removed.has(id)),moved);
        if(candidate)shorter.push(candidate);
        // Two comparisons are enough for the existing compact UI. For a single
        // omission keep its established ranking; for several, stop as soon as
        // the comparisons are ready rather than enumerate unnecessary subsets.
        if(count>1 && shorter.length>=2-options.length)break;
      }
      shorter.sort((a,b)=>b.result.slack-a.result.slack || snapshot.places.indexOf(flexOmissions(a)[0])-snapshot.places.indexOf(flexOmissions(b)[0]));
      options.push(...shorter.slice(0,2-options.length));
      // Never move more places if a smaller change already works. A full walk
      // is already an answer; don't invent a multiple-omission alternative.
      if(options.length)break;
    }
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
  const moved=trip.places.filter(id=>!option.places.includes(id));
  if(moved.length)next.dreams=[...new Set([...(trip.dreams || []),...moved])];
  return {trip:next,error:null};
}
