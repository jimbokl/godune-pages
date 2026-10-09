import {resolveVisitCalendar,validVisitDate} from './visit-calendar.mjs?v=4';
import {previewStopReplacement} from './trip-replacement-state.mjs?v=19';
import {defaultSchedule} from './trip-schedule-state.mjs?v=19';

// Closure is a visitor's scenario, not an edit to the regional facts. A new
// place needs its own dated calendar; the original stop's window is discarded.
export function replacementAvailability(place,date){
 if(!validVisitDate(date))return null;
 const calendar=resolveVisitCalendar(place,date),source=calendar.source;
 if(calendar.fact?.scope!=='place'||!source?.url?.startsWith('https://')
  ||!['official_source','field_checked'].includes(source.verification)
  ||!validVisitDate(source.checked_at)||source.checked_at>date
  ||!(calendar.windows?.length||calendar.sessions?.length))return null;
 return structuredClone({fact:calendar.fact,source,exceptionDate:calendar.exceptionDate,needsCheck:calendar.needsCheck});
}

export function withClosedReplacement(trip,replacements,catalog){
 let next=trip;
 for(const row of replacements){
  const availability=replacementAvailability(catalog.poi.find(p=>p.slug===row.to),trip.date);
  if(!availability||JSON.stringify(availability)!==JSON.stringify(row.availability))return null;
  const preview=previewStopReplacement(next,row.from,row.to,catalog);
  if(preview.error)return null;
  next=preview.after;
  next.schedule ||= defaultSchedule();
  next.schedule.stops[row.to] ||= {visit:30,pause:0,leg:null,window:null};
  next.schedule.stops[row.to].visit_fact=availability.fact.id;
 }
 return next;
}

export async function closedAdvice({trip,catalog,trial,request,signature,previousStart,protectedIds,stillCurrent}){
 if(!trip.places.includes(request.stop))return {state:'invalid_closed_stop',options:[]};
 if(protectedIds.has(request.stop))return {state:'protected_closed',options:[],protectedStop:request.stop};
 const original=catalog.poi.find(p=>p.slug===request.stop),options=[];
 let trials=0;
 async function test(candidate,replacements=[]){
  if(++trials%8===0)await new Promise(resolve=>setTimeout(resolve,0));
  if(!stillCurrent())return null;
  const tested=trial.evaluate(candidate);
  if(!tested)return null;
  return {signature,kind:'closed',minutes:0,closedStop:request.stop,previousStart,
   start:trip.schedule.start,displayStart:tested.scheduleStart,places:[...candidate.places],
   omitted:replacements.length?null:request.stop,omittedIds:replacements.length?[]:[request.stop],
   ...(replacements.length?{replacements}:{}),...tested};
 }
 const shorter=await test({...trip,places:trip.places.filter(id=>id!==request.stop)});
 if(shorter)options.push(shorter);
 let best=null;
 // Category is only a discovery filter. Directed roads, calendars, fixed
 // visits and the complete return are checked by the common Rust day model.
 for(const place of catalog.poi){
  if(!stillCurrent())return {state:'stale',options:[]};
  if(place.category!==original.category||trip.places.includes(place.slug))continue;
  const availability=replacementAvailability(place,trip.date);if(!availability)continue;
  const replacement={from:request.stop,to:place.slug,availability,price:structuredClone(place.price??null)};
  const next=withClosedReplacement(trip,[replacement],catalog);if(!next)continue;
  const option=await test(next,[replacement]);
  if(option&&(!best||option.result.finish<best.result.finish))best=option;
 }
 if(best)options.push(best);
 return stillCurrent()?{state:options.length?'ready':'no_option',options,trials}:{state:'stale',options:[]};
}
