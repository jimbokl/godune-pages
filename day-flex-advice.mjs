import {defaultSchedule,planInput} from './trip-schedule-state.mjs?v=17';
import {selectedDay} from './trip-days-state.mjs?v=25';
import {timingTrial} from './day-timing-advice.mjs?v=8';
import {resolveRail,rideSnapshot} from './trip-rail-state.mjs?v=6';
import {visitShelter,withShelterReplacements,shelterAssignments} from './day-shelter-advice.mjs?v=6';
import {planningSignature,planningWalkingMinutes} from './day-planning-state.mjs?v=1';
import {transferChoices} from './trip-transfer-connections-contract.mjs';

// Planning proposals, not a reconstruction of time already spent on the road.
// The shared Rust calculation remains the sole clock for every candidate.
export const flexSignature=planningSignature;
export const canFlexDay=trip=>trip.places.length>0 && !selectedDay(trip).kosa_plan;
export const flexOmissions=option=>option.omittedIds || (option.omitted?[option.omitted]:[]);

// Compare the remaining walk using the shared Rust result. This is not a new
// clock or a claim about shelter: waiting and unspecified landmark interiors
// are not counted as outdoor visits. Station approaches remain unchanged.
export function flexEffort(trip,catalog,result,check=null) {
  const outdoor=result.stops.reduce((minutes,row)=>{
    const place=catalog.poi.find(p=>p.slug===row.id),stop=trip.schedule?.stops[row.id];
    return minutes+(['nature','park','viewpoint','beach'].includes(place?.category) || stop?.visit_scope==='outside'
      ?row.visit_minutes+(stop?.pause || 0):0);
  },0);
  return {walking:planningWalkingMinutes(result,check)??((trip.schedule?.mode && trip.schedule.mode!=='foot'?0:result.travel_minutes)+result.access_minutes),outdoor};
}

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
  for(const choice of transferChoices(day))for(const endpoint of [choice.from,choice.to])if(endpoint.kind==='place')ids.add(endpoint.id);
  return ids;
}

export async function flexAdvice(trip,catalog,matrix,engine,result,request,stillCurrent=()=>true) {
  if(!canFlexDay(trip))return {state:'not_available',options:[]};
  const scenario=['rain','fatigue'].includes(request?.kind);
  if(!request || !['later','breathing_room','rain','fatigue'].includes(request.kind) || !Number.isInteger(request.minutes)
    || (scenario?request.minutes!==0:request.minutes<=0 || request.minutes>=1440))
    return {state:'invalid_request',options:[]};
  if(trip.schedule?.progress && request.kind==='later')return {state:'already_started',options:[]};
  const snapshot=structuredClone(trip),settings=snapshot.schedule || defaultSchedule(),signature=flexSignature(snapshot);
  const trial=timingTrial(snapshot,catalog,matrix,engine,result);
  if(trial.error)return {state:trial.error,options:[]};
  result=trial.before;
  if((request.kind==='breathing_room' || scenario) && result.finish===null)return {state:'incomplete',options:[]};
  const beforeEffort=scenario?flexEffort(snapshot,catalog,result,trial.check):null;
  if(request.kind==='rain' && !beforeEffort.outdoor)return {state:'no_outdoor',options:[]};
  if(request.kind==='fatigue' && !beforeEffort.walking)return {state:'no_walking',options:[]};
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
  const protectedIds=protectedFlexStops(snapshot,catalog),options=[];
  const optional=snapshot.places.filter(id=>!protectedIds.has(id));
  const rank=(a,b)=>(scenario?b.effort.saved[request.kind==='rain'?'outdoor':'walking']-a.effort.saved[request.kind==='rain'?'outdoor':'walking']:0)
    || b.result.slack-a.result.slack || snapshot.places.indexOf(flexOmissions(a)[0])-snapshot.places.indexOf(flexOmissions(b)[0]);
  let trials=0;
  async function test(change,places,omittedIds=[],replacements=[]) {
    if(++trials%8===0)await new Promise(resolve=>setTimeout(resolve,0));
    if(!stillCurrent())return null;
    const replaced=replacements.length?withShelterReplacements(snapshot,replacements,catalog):snapshot;
    if(!replaced)return null;
    const candidate={...replaced,places,schedule:{...(replaced.schedule || settings),start:change.start,
      ...(change.outward?{rail:{...settings.rail,outward:change.outward}}:{})}},tested=trial.evaluate(candidate);
    if(!tested)return null;
    if(request.kind==='later' && tested.result.stops[0]?.arrival<(result.stops[0]?.arrival??previousStart)+request.minutes)return null;
    const freed=result.finish===null?null:result.finish-tested.result.finish;
    if(request.kind==='breathing_room' && freed<request.minutes)return null;
    const afterEffort=scenario?flexEffort(candidate,catalog,tested.result,tested.dayAssessment):null;
    const effort=scenario?{before:beforeEffort,after:afterEffort,saved:{walking:beforeEffort.walking-afterEffort.walking,outdoor:beforeEffort.outdoor-afterEffort.outdoor}}:null;
    if(request.kind==='rain' && (effort.saved.outdoor<=0 || effort.saved.walking<0))return null;
    if(request.kind==='fatigue' && effort.saved.walking<=0)return null;
    const railChange=change.outward?{before:structuredClone(settings.rail.outward),after:structuredClone(change.outward),
      inbound:structuredClone(settings.rail.inbound),source:structuredClone(rail.source),service:rail.service.id}:null;
    return {signature,kind:request.kind,minutes:request.minutes,previousStart,start:change.start,
      displayStart:tested.scheduleStart,railChange,places:[...places],
      omitted:omittedIds.length===1?omittedIds[0]:null,omittedIds:[...omittedIds],
      ...(replacements.length?{replacements:structuredClone(replacements)}:{}),freed,...(effort?{effort}:{}),...tested};
  }
  if(request.kind==='rain') {
    const outside=optional.filter(id=>{
      const place=catalog.poi.find(p=>p.slug===id);
      return ['nature','park','viewpoint','beach'].includes(place?.category) || settings.stops[id]?.visit_scope==='outside';
    });
    const targets=catalog.poi.filter(place=>!snapshot.places.includes(place.slug)).flatMap(place=>{
      const shelter=visitShelter(place,snapshot.date);
      return shelter?[{to:place.slug,shelter,price:structuredClone(place.price || null)}]:[];
    });
    for(let count=1;count<=Math.min(outside.length,targets.length);count++) {
      const sheltered=[];
      for(const ids of omissions(outside,count))for(const replacements of shelterAssignments(ids,targets)) {
        if(!stillCurrent())return {state:'stale',options:[]};
        const changes=new Map(replacements.map(row=>[row.from,row.to]));
        const candidate=await test(starts[0],snapshot.places.map(id=>changes.get(id) || id),[],replacements);
        if(candidate){sheltered.push(candidate);sheltered.sort(rank);sheltered.splice(2);}
      }
      if(sheltered.length){options.push(...sheltered);break;}
    }
    // One indoor day and one shorter walk make the trade-off visible.
    if(options.length>1)options.splice(1);
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
        if(candidate){shorter.push(candidate);if(scenario){shorter.sort(rank);shorter.splice(2);}}
        // Time requests keep their established search. Weather and fatigue
        // compare every change of the same size to find the actual benefit.
        if(!scenario && count>1 && shorter.length>=2-options.length)break;
      }
      shorter.sort(rank);
      options.push(...shorter.slice(0,2-options.length));
      // Never move more places if a smaller change already works. A full walk
      // is already an answer; don't invent a multiple-omission alternative.
      if(shorter.length || !scenario && options.length)break;
    }
    if(options.length)break;
  }
  return stillCurrent()?{state:options.length?'ready':'no_option',options,trials}:{state:'stale',options:[]};
}

export function applyFlexAdvice(trip,option,catalog) {
  if(flexSignature(trip)!==option.signature)return {trip,error:'stale'};
  if(!['later','breathing_room','rain','fatigue'].includes(option.kind))return {trip,error:'unknown_option'};
  // Keep up-to-date notes, money and other days. The existing cleaner projects
  // only this day's new stop list and discards obsolete directed leg settings.
  const replaced=option.replacements?.length && catalog?withShelterReplacements(trip,option.replacements,catalog):trip;
  if(!replaced || option.replacements?.length && !catalog)return {trip,error:'stale'};
  const next={...replaced,places:[...option.places],schedule:{...(replaced.schedule || defaultSchedule()),start:option.start}};
  if(option.railChange)next.schedule.rail={...trip.schedule.rail,outward:structuredClone(option.railChange.after)};
  const moved=trip.places.filter(id=>!option.places.includes(id));
  if(moved.length)next.dreams=[...new Set([...(trip.dreams || []),...moved])];
  return {trip:next,error:null};
}
