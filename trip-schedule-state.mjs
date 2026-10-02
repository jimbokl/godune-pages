// Optional extension of the existing version-1 trip; older drafts stay byte-compatible.
import {resolveVisitCalendar} from './visit-calendar.mjs?v=1';
import {TRAVEL_MODES, resolveTravel} from './travel-estimates.mjs?v=1';
export const defaultSchedule = () => ({start:540, end:1080, reserve:10, stops:{}});
const minute = n => Number.isInteger(n) && n >= 0 && n <= 1440;
const day = value => value === null || typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !value.startsWith('0000') && Number.isFinite(Date.parse(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10) === value;
export function validSchedule(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !minute(value.start) || !minute(value.end)
    || value.start >= value.end || !minute(value.reserve) || value.mode!==undefined && !Object.hasOwn(TRAVEL_MODES,value.mode) || !value.stops || typeof value.stops !== 'object' || Array.isArray(value.stops)) return false;
  return Object.entries(value.stops).every(([id, stop]) => id && stop && typeof stop === 'object' && !Array.isArray(stop)
    && minute(stop.visit) && minute(stop.pause)
    && (stop.visit_fact === undefined || stop.visit_fact === null || typeof stop.visit_fact === 'string' && /^[a-z0-9][a-z0-9-]{0,127}$/.test(stop.visit_fact))
    && (stop.leg === null || stop.leg && typeof stop.leg.from === 'string' && minute(stop.leg.minutes) && (stop.leg.mode===undefined || Object.hasOwn(TRAVEL_MODES,stop.leg.mode)))
    && (stop.window === null || stop.window && minute(stop.window.open) && minute(stop.window.close) && stop.window.open < stop.window.close && day(stop.window.date)));
}
export function cleanSchedule(value, places) {
  if (!validSchedule(value)) return null;
  const stops = Object.fromEntries(Object.entries(value.stops).filter(([id]) => places.includes(id)).map(([id, stop]) => [id,
    {visit:stop.visit, pause:stop.pause, leg:stop.leg ? {from:stop.leg.from,minutes:stop.leg.minutes,...(stop.leg.mode!==undefined?{mode:stop.leg.mode}:{})} : null,
      window:stop.window ? {open:stop.window.open,close:stop.window.close,date:stop.window.date} : null,
      ...(stop.visit_fact !== undefined ? {visit_fact:stop.visit_fact} : {})}]));
  return {start:value.start,end:value.end,reserve:value.reserve,stops,...(value.mode!==undefined?{mode:value.mode}:{})};
}
export function planInput(trip, catalog, matrix) {
  const settings = cleanSchedule(trip.schedule, trip.places) || defaultSchedule();
  return {version:1,start:settings.start,end:settings.end,reserve:settings.reserve,stops:trip.places.map((id,index) => {
    const stop = Object.hasOwn(settings.stops,id) ? settings.stops[id] : null;
    const manual=stop?.window && stop.window.date === trip.date;
    const calendar=!manual && catalog ? resolveVisitCalendar(catalog.poi.find(place=>place.slug===id),trip.date,stop?.visit_fact) : null;
    const travel=resolveTravel({...trip,schedule:settings},id,catalog,matrix);
    return {id,visit:stop?.visit ?? 30,pause:stop?.pause ?? 0,
      travel:travel.minutes,
      ...(travel.origin==='estimate' ? {travel_needs_check:true} : {}),
      opening:manual ? [{open:stop.window.open,close:stop.window.close}] : calendar?.windows ?? null,
      ...(calendar?.sessions !== null && calendar?.sessions !== undefined ? {sessions:calendar.sessions} : {}),
      ...(calendar?.needsCheck ? {opening_needs_check:true} : {})};
  })};
}
export function updateSchedule(trip, field, value, id) {
  const settings = cleanSchedule(trip.schedule, trip.places) || defaultSchedule();
  if (!id && ['start','end','reserve','mode'].includes(field)) settings[field] = value;
  else if (id && trip.places.includes(id)) {
    const stop = Object.hasOwn(settings.stops,id) ? settings.stops[id] : {visit:30,pause:0,leg:null,window:null};
    if (['visit','pause'].includes(field)) stop[field] = value;
    else if (field === 'travel') {
      const previous = trip.places[trip.places.indexOf(id)-1];
      stop.leg = previous && value !== null ? {from:previous, minutes:value,mode:settings.mode || 'foot'} : null;
    } else if (field === 'window') stop.window = value ? {...value,date:trip.date ?? null} : null;
    else if (field === 'visit_fact') {stop.visit_fact=value;stop.window=null;}
    else return trip;
    settings.stops[id] = stop;
  } else return trip;
  return validSchedule(settings) ? {...trip,schedule:settings} : trip;
}
