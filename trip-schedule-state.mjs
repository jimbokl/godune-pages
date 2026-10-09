import {bookingEffects} from './trip-bookings-state.mjs?v=2';
import {railAccess,railHomeInput} from './rail-access.mjs?v=2';
import {validRail,resolveRail} from './trip-rail-state.mjs?v=6';
import {validProgress,currentProgress,remainingTrip} from './day-progress.mjs?v=2';
// Optional extension of the existing version-1 trip; older drafts stay byte-compatible.
import {resolveVisitCalendar} from './visit-calendar.mjs?v=4';
import {resolveKitchenCalendar} from './kitchen-calendar.mjs';
import {validExcursion,resolveExcursion} from './trip-transport-state.mjs?v=3';
import {validBaseTransport,mobilitySegments,travelVia} from './day-mobility.mjs?v=4';
import {TRAVEL_MODES, resolveTravel, resolveAccess, resolveAccessBetween, resolvePair, dayBases, previousPlace, sameArrival} from './travel-estimates.mjs?v=12';
export const defaultSchedule = () => ({start:540, end:1080, reserve:10, stops:{}});
const minute = n => Number.isInteger(n) && n >= 0 && n <= 1440;
const day = value => value === null || typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !value.startsWith('0000') && Number.isFinite(Date.parse(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10) === value;
export function validSchedule(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !minute(value.start) || !minute(value.end)
    || value.start >= value.end || !minute(value.reserve) || value.mode!==undefined && !Object.hasOwn(TRAVEL_MODES,value.mode) || value.base_transport!==undefined && !validBaseTransport(value.base_transport) || value.rail!==undefined && !validRail(value.rail) || value.progress!==undefined && !validProgress(value.progress) || !value.stops || typeof value.stops !== 'object' || Array.isArray(value.stops)) return false;
  return Object.entries(value.stops).every(([id, stop]) => id && stop && typeof stop === 'object' && !Array.isArray(stop)
    && minute(stop.visit) && minute(stop.pause) && (stop.excursion===undefined || stop.excursion===null || validExcursion(stop.excursion))
    && (stop.visit_fact === undefined || stop.visit_fact === null || typeof stop.visit_fact === 'string' && /^[a-z0-9][a-z0-9-]{0,127}$/.test(stop.visit_fact))
    && (stop.visit_scope === undefined || stop.visit_scope === 'outside')
    && (stop.leg === null || stop.leg && typeof stop.leg.from === 'string' && minute(stop.leg.minutes) && (stop.leg.mode===undefined || Object.hasOwn(TRAVEL_MODES,stop.leg.mode)) && (stop.leg.via===undefined || typeof stop.leg.via==='string' && /^[a-z0-9][a-z0-9-]{0,127}$/.test(stop.leg.via)))
    && (stop.window === null || stop.window && minute(stop.window.open) && minute(stop.window.close) && stop.window.open < stop.window.close && day(stop.window.date)));
}
export function cleanSchedule(value, places) {
  if (!validSchedule(value)) return null;
  const stops = Object.fromEntries(Object.entries(value.stops).filter(([id]) => places.includes(id)).map(([id, stop]) => [id,
    {visit:stop.visit, pause:stop.pause, leg:stop.leg ? {from:stop.leg.from,minutes:stop.leg.minutes,...(stop.leg.mode!==undefined?{mode:stop.leg.mode}:{}),...(stop.leg.via!==undefined?{via:stop.leg.via}:{})} : null,
      window:stop.window ? {open:stop.window.open,close:stop.window.close,date:stop.window.date} : null,
      ...(stop.visit_fact !== undefined ? {visit_fact:stop.visit_fact} : {}),
      ...(stop.visit_scope !== undefined ? {visit_scope:stop.visit_scope} : {}),
      ...(stop.excursion!==undefined ? {excursion:stop.excursion===null?null:structuredClone(stop.excursion)} : {})}]));
  return {start:value.start,end:value.end,reserve:value.reserve,stops,...(value.mode!==undefined?{mode:value.mode}:{}),...(value.base_transport?{base_transport:structuredClone(value.base_transport)}:{}),...(value.rail?{rail:structuredClone(value.rail)}:{}),...(value.progress?{progress:structuredClone(value.progress)}:{})};
}
export function planTravel(trip,id,catalog,matrix) {
  const projected=remainingTrip(trip),progress=currentProgress(trip);
  const first=progress && projected.places[1]===id,mode=projected.schedule?.mode || 'foot';
  const anchor=id=>catalog?.poi.find(p=>p.slug===id)?.arrival_points?.[mode]?.id;
  const atParking=first && mode!=='foot' && anchor(progress.after);
  const travel=atParking && sameArrival(catalog,id,progress.after,mode)?{origin:'same_place',minutes:0,mode}:resolveTravel(projected,id,catalog,matrix);
  const access=atParking?resolveAccessBetween(projected,id,null,projected.places[2] || dayBases(trip).night_at || dayBases(trip).end_at,catalog,matrix):resolveAccess(projected,id,catalog,matrix);
  return {projected,travel,access};
}
export function planBaseTravel(trip,role,catalog,matrix) {
  const projected=remainingTrip(trip),bases=dayBases(trip);
  const from=role==='end'?(bases.night_at || projected.places.at(-1)):projected.places.at(-1),to=bases[role==='end'?'end_at':'night_at'];
  if(!from || !to)return null;
  return {projected,from,to,travel:resolvePair(projected,from,to,catalog,matrix)};
}
export function planInput(trip, catalog, matrix) {
  const settings = cleanSchedule(trip.schedule, trip.places) || defaultSchedule();
  const progress=currentProgress(trip),configured=remainingTrip({...trip,schedule:settings}),bases=dayBases(trip),bookings=bookingEffects(trip);
  const access=railAccess(trip),resolved=resolveRail(configured,catalog),rail=resolved?.input;
  const remaining=progress?configured.places.slice(1):configured.places;
  const stops=remaining.map(id => {
    const stop = Object.hasOwn(settings.stops,id) ? settings.stops[id] : null;
    const manual=stop?.window && stop.window.date === trip.date;
    const calendar=!manual && catalog ? resolveVisitCalendar(catalog.poi.find(place=>place.slug===id),trip.date,stop?.visit_fact,stop?.visit_scope) : null;
    const {travel,access}=planTravel({...trip,schedule:settings},id,catalog,matrix);
    const excursion=resolveExcursion(configured,id,catalog);
    const kitchen=resolveKitchenCalendar(catalog?.poi.find(place=>place.slug===id),trip.date);
    return {id,visit:stop?.visit ?? 30,pause:stop?.pause ?? 0,
      ...(bookings.stops[id]?{appointment:{start:bookings.stops[id].time,duration:bookings.stops[id].duration}}:{}),
      travel:travel.minutes,
      ...(travel.origin==='estimate' ? {travel_needs_check:true} : {}),
      ...(access ? {access:{approach:access.approach.minutes,return_minutes:access.back.minutes,needs_check:true}} : {}),
      opening:manual ? [{open:stop.window.open,close:stop.window.close}] : calendar?.windows ?? null,
      ...(calendar?.sessions !== null && calendar?.sessions !== undefined ? {sessions:calendar.sessions} : {}),
      ...(calendar?.needsCheck ? {opening_needs_check:true} : {}),
      ...(kitchen ? {kitchen:kitchen.input} : {}),
      ...(excursion ? {excursion:excursion.input} : {})};
  });
  if(progress)stops.unshift({id:'__day_checkpoint',visit:0,pause:0,travel:0,opening:[{open:0,close:1440}]});
  if(!progress && stops.length && bases.start_at) {
    const access=resolveAccessBetween(configured,bases.start_at,null,trip.places[0],catalog,matrix);
    stops.unshift({id:'__day_origin',visit:0,pause:0,travel:0,opening:[{open:0,close:1440}],
      ...(access?{access:{approach:0,return_minutes:access.back.minutes,needs_check:true}}:{}),
      ...(settings.rail?.access && !rail?{access:{approach:null,return_minutes:0,needs_check:true}}:{})});
  }
  if(stops.length && trip.places.length && bases.night_at) {
    const {travel}=planBaseTravel({...trip,schedule:settings},'night',catalog,matrix);
    const access=resolveAccessBetween(configured,bases.night_at,configured.places.at(-1),bases.end_at,catalog,matrix);
    stops.push({id:'__day_night',visit:0,pause:0,travel:travel.minutes,opening:[{open:access?0:bookings.night?.time??0,close:1440}],
      ...(travel.origin==='estimate'?{travel_needs_check:true}:{}),
      ...(access?{access:{approach:access.approach.minutes,return_minutes:bases.end_at?access.back.minutes:0,needs_check:true}}:{})});
  }
  if(stops.length && bookings.end && bases.end_at) {
    const {from:previous,travel}=planBaseTravel({...trip,schedule:settings},'end',catalog,matrix);
    const access=resolveAccessBetween(configured,bases.end_at,previous,null,catalog,matrix);
    stops.push({id:'__day_departure',visit:0,pause:0,travel:travel.minutes,opening:[{open:0,close:1440}],...(travel.origin==='estimate'?{travel_needs_check:true}:{}),
      ...(access?{access:{approach:access.approach.minutes,return_minutes:0,needs_check:true}}:{})});
  }
  const end=Math.min(settings.end,bookings.end?bookings.end.time-bookings.end.buffer:1440);
  const start=progress?progress.at:Math.max(settings.start,bookings.start?bookings.start.time+bookings.start.buffer:0);
  if(progress && bookings.start && start<bookings.start.time+bookings.start.buffer)throw Error('progress_before_arrival');
  if(start>=end)throw new Error(progress?'progress_after_day':bookings.end?'departure_before_day':'arrival_after_day');
  if(rail && access)rail.home=railHomeInput(trip,catalog,start,end);
  if(progress && settings.rail && !rail)throw Error('progress_rail_unavailable');
  if(progress && rail){rail.resume_at=progress.at;
    // A manual station approach belongs to the original final place.
    if(!access && configured.places.at(-1)!==(progress.return_from || trip.places.at(-1)))rail.before_return=null;
  }
  return {version:1,start,end,reserve:settings.reserve,stops,...(rail?{rail}:{})};
}
export function updateSchedule(trip, field, value, id) {
  const settings = cleanSchedule(trip.schedule, trip.places) || defaultSchedule();
  if (!id && ['start','end','reserve','mode'].includes(field)) settings[field] = value;
  else if(!id && field==='base_mode') {
    if(value==='foot')delete settings.base_transport;
    else if(['car','bike'].includes(value) && trip.places.length)settings.base_transport={version:1,mode:value,via:settings.base_transport?.via || trip.places[0]};
    else return trip;
  }
  else if (id && trip.places.includes(id)) {
    const stop = Object.hasOwn(settings.stops,id) ? settings.stops[id] : {visit:30,pause:0,leg:null,window:null};
    if (['visit','pause'].includes(field)) stop[field] = value;
    else if (field === 'travel') {
      const projected=remainingTrip(trip),previous=previousPlace(projected,id),via=previous?travelVia(projected,previous,id,dayBases(trip)):null;
      stop.leg = previous && value !== null ? {from:previous, minutes:value,mode:mobilitySegments(projected,previous,id,dayBases(trip))[0].mode,...(via?{via}:{})} : null;
    } else if (field === 'window') stop.window = value ? {...value,date:trip.date ?? null} : null;
    else if (field === 'visit_fact') {stop.visit_fact=value;delete stop.visit_scope;stop.window=null;}
    else if (field === 'visit_scope') {
      if(value!==null && value!=='outside')return trip;
      if(value===null)delete stop.visit_scope;else stop.visit_scope=value;
      delete stop.visit_fact;stop.window=null;
    }
    else if (field === 'excursion') stop.excursion=value===null?null:structuredClone(value);
    else return trip;
    settings.stops[id] = stop;
  } else return trip;
  return validSchedule(settings) ? {...trip,schedule:settings} : trip;
}
