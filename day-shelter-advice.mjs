import {resolveVisitCalendar,validVisitDate} from './visit-calendar.mjs?v=4';
import {previewStopReplacement} from './trip-replacement-state.mjs?v=1';
import {defaultSchedule} from './trip-schedule-state.mjs?v=13';

// An indoor visit is a sourced access fact, never a guess from a POI category.
export function visitShelter(place,date) {
  if(!validVisitDate(date))return null;
  for(const fact of place?.visit_conditions || []) {
    if(fact.kind!=='access' || fact.scope!=='place' || fact.shelter?.kind!=='indoor'
      || !fact.source?.url?.startsWith('https://') || !['official_source','field_checked'].includes(fact.source?.verification)
      || !validVisitDate(fact.source.checked_at) || fact.source.checked_at>date
      || fact.valid_from && date<fact.valid_from || fact.valid_until && date>fact.valid_until)continue;
    const calendar=resolveVisitCalendar(place,date,fact.shelter.hours_fact);
    if(calendar.fact?.id!==fact.shelter.hours_fact || calendar.fact.scope!=='place'
      || calendar.reason==='closed' || !calendar.windows?.length && !calendar.sessions?.length)continue;
    return {fact:structuredClone(fact),hours:structuredClone(calendar.fact),source:structuredClone(calendar.source)};
  }
  return null;
}

// Use the ordinary replacement contract: old windows and directed manual roads
// cannot describe a new place. Money keeps its original binding; no ticket is bought.
export function withShelterReplacements(trip,replacements,catalog) {
  let next=trip;
  for(const row of replacements) {
    const place=catalog.poi.find(p=>p.slug===row.to),shelter=visitShelter(place,trip.date);
    if(!shelter || JSON.stringify(shelter)!==JSON.stringify(row.shelter))return null;
    const preview=previewStopReplacement(next,row.from,row.to,catalog);
    if(preview.error)return null;
    next=preview.after;
    next.schedule ||= defaultSchedule();
    next.schedule.stops[row.to]={...(next.schedule.stops[row.to] || {visit:30,pause:0,leg:null,window:null}),visit_fact:shelter.hours.id};
  }
  return next;
}

export function* shelterAssignments(ids,targets,chosen=[]) {
  if(chosen.length===ids.length){yield chosen;return;}
  for(const target of targets)if(!chosen.some(row=>row.to===target.to))
    yield* shelterAssignments(ids,targets,[...chosen,{...target,from:ids[chosen.length]}]);
}
