import {cleanTrip} from './trip-state.mjs?v=20';
import {addTripDay,dayHasContent,ensureJourney,journeyDays,mergeJourney,nextDate,selectedDay,validTripDate} from './trip-days-state.mjs?v=15';
import {defaultSchedule} from './trip-schedule-state.mjs?v=12';
import {tripStarterChoices} from './trip-starters.mjs?v=14';
import {validDayWave,waveChoices,waveSchedule,waveStopSettings} from './day-wave.mjs?v=2';

const clone=value=>structuredClone(value);
const stable=value=>JSON.stringify(value,(_,row)=>row && typeof row==='object' && !Array.isArray(row)
  ? Object.fromEntries(Object.keys(row).sort().map(key=>[key,row[key]])) : row);
const minute=value=>Number.isInteger(value) && value>=0 && value<=1440;

export function wizardRoutes(catalog) {
  const known=new Set((catalog?.poi || []).map(point=>point.slug));
  return (catalog?.routes || []).filter(route=>route.mode==='walking' && route.slug && route.name
    && route.area && route.stops?.length && route.stops.every(stop=>known.has(stop.poi)));
}

export function wizardAreas(catalog) {
  return [...new Map(wizardChoices(catalog).map(route=>[route.area,{id:route.area,name:route.area_name || route.area}])).values()];
}

export const wizardChoices=(catalog,theme='mixed')=>waveChoices(catalog,wizardRoutes(catalog),theme);

export function wizardStarters(catalog) {
  return tripStarterChoices(catalog);
}

export const journeyIsOccupied=trip=>journeyDays(trip).length>1 || dayIsOccupied(trip) || !!trip.routes.length;

// A date alone is a useful default, not permission to replace meaningful work.
export const dayIsOccupied=dayHasContent;

export function wizardDefaults(trip,catalog) {
  const day=selectedDay(trip),occupied=dayIsOccupied(trip),routes=wizardRoutes(catalog);
  const area=routes.some(route=>route.area===trip.filters?.area)?trip.filters.area:routes[0]?.area || null;
  return {area,route:routes.find(route=>route.area===area)?.slug || null,starter:wizardStarters(catalog)[0]?.id || null,
    date:journeyIsOccupied(trip)?nextDate(trip.itinerary?.days.at(-1)?.date || trip.date):day.date,
    start:occupied?defaultSchedule().start:trip.schedule?.start ?? defaultSchedule().start,
    end:occupied?defaultSchedule().end:trip.schedule?.end ?? defaultSchedule().end};
}

export function prepareWizardDay(current,answers,catalog) {
  if(answers.wave!==undefined && !validDayWave(answers.wave))throw Error('wizard_invalid_wave');
  const route=wizardChoices(catalog,answers.wave?.theme || 'mixed').find(row=>row.slug===answers.route && row.area===answers.area);
  if(!route)throw new Error('wizard_unknown_route');
  if(!(answers.date===null || validTripDate(answers.date)))throw new Error('wizard_invalid_date');
  if(!minute(answers.start) || !minute(answers.end) || answers.start>=answers.end)throw new Error('wizard_invalid_time');
  const occupied=dayIsOccupied(current),next=occupied?addTripDay(current):ensureJourney(current);
  const day=selectedDay(next),places=[...new Set(route.stops.map(stop=>stop.poi))];
  let schedule={...defaultSchedule(),mode:'foot',start:answers.start,end:answers.end,stops:waveStopSettings(route,catalog)};
  if(answers.wave){day.wave={...answers.wave,theme:route.wave_theme,recipe:route.slug};schedule=waveSchedule(schedule,day.wave);}
  day.date=answers.date;day.places=places;day.schedule=clone(schedule);
  if(route.wave_recipe && route.access_note)day.note=route.access_note;
  if(!day.start_at && !day.night_at && route.return_to && catalog.poi.some(point=>point.slug===route.return_to))day.night_at=route.return_to;
  next.date=day.date;next.month=day.date?Number(day.date.slice(5,7)):next.month;
  next.places=[...places];next.schedule=schedule;
  next.routes=[...new Set([...current.routes,...(route.wave_recipe?[]:[route.slug])])];
  return {trip:cleanTrip(next,catalog),route,answers:clone(answers),placement:occupied?'separate':'current',
    sourceSignature:stable(current),targetId:day.id};
}

// No exception escapes into IndexedDB's request callback. A refused intent
// returns the current Trip unchanged and tells the UI what needs attention.
export function applyWizardDay(current,proposal,catalog,{separate=false}={}) {
  if(!proposal || stable(current)!==proposal.sourceSignature)return {state:current,applied:false,reason:'changed'};
  if(proposal.placement==='separate' && !separate)return {state:current,applied:false,reason:'separate_required'};
  try {
    const fresh=prepareWizardDay(current,proposal.answers,catalog);
    if(fresh.placement!==proposal.placement || fresh.targetId!==proposal.targetId)return {state:current,applied:false,reason:'changed'};
    return {state:fresh.trip,applied:true,reason:null};
  } catch {
    return {state:current,applied:false,reason:'unavailable'};
  }
}

export function prepareWizardTrip(current,answers,catalog) {
  if(answers.wave!==undefined && (!validDayWave(answers.wave) || answers.wave.theme!=='mixed'))throw Error('wizard_invalid_wave');
  const starter=wizardStarters(catalog).find(row=>row.id===answers.starter);
  if(answers.area!=='whole-trip' || !starter)throw new Error('wizard_unknown_starter');
  if(!(answers.date===null || validTripDate(answers.date)))throw new Error('wizard_invalid_date');
  if(!minute(answers.start) || !minute(answers.end) || answers.start>=answers.end)throw new Error('wizard_invalid_time');
  let date=answers.date;
  const days=starter.days.map((template,index)=>{
    if(answers.date!==null && !validTripDate(date))throw new Error('wizard_date_overflow');
    let schedule={...defaultSchedule(),mode:template.mode,start:answers.start,end:answers.end};
    for(const id of template.places) {
      const visit=catalog.poi.find(point=>point.slug===id).visit_minutes;
      schedule.stops[id]={visit:Number.isInteger(visit)&&visit>0&&visit<=1440?visit:30,pause:0,leg:null,window:null};
    }
    if(template.recipe)schedule.stops=waveStopSettings(template.recipe,catalog);
    const theme=template.recipe?.theme || (template.places.every(id=>catalog.poi.find(row=>row.slug===id).gastronomy)?'gastro':'mixed');
    const wave=(answers.wave || template.recipe)?{...(answers.wave || {version:1,pace:'full'}),theme,recipe:template.recipe?.slug || null}:null;
    if(wave)schedule=waveSchedule(schedule,wave);
    const day={id:`day-${index+1}`,date,places:[...template.places],schedule,...(wave?{wave}:{}),start_at:template.start_at,
      night_at:template.night_at,note:template.recipe?.access_note || '',costs:{}};
    date=nextDate(date);return day;
  });
  const incoming={...clone(current),places:[...days[0].places],date:days[0].date,schedule:clone(days[0].schedule),
    itinerary:{version:1,active:days[0].id,people:current.itinerary?.people || 1,days}};
  const occupied=journeyIsOccupied(current),trip=cleanTrip(occupied?mergeJourney(current,incoming,clone(current)):incoming,catalog);
  const targetIds=trip.itinerary.days.slice(occupied?journeyDays(current).length:0).map(day=>day.id);
  return {kind:'journey',trip,starter,answers:clone(answers),placement:occupied?'separate':'current',
    sourceSignature:stable(current),targetIds};
}

export function prepareWizardPlan(current,answers,catalog) {
  return answers.area==='whole-trip'?prepareWizardTrip(current,answers,catalog):prepareWizardDay(current,answers,catalog);
}

export function applyWizardPlan(current,proposal,catalog,{separate=false}={}) {
  if(proposal?.kind!=='journey')return applyWizardDay(current,proposal,catalog,{separate});
  if(stable(current)!==proposal.sourceSignature)return {state:current,applied:false,reason:'changed'};
  if(proposal.placement==='separate' && !separate)return {state:current,applied:false,reason:'separate_required'};
  try {
    const fresh=prepareWizardTrip(current,proposal.answers,catalog);
    if(fresh.placement!==proposal.placement || stable(fresh.targetIds)!==stable(proposal.targetIds))return {state:current,applied:false,reason:'changed'};
    return {state:fresh.trip,applied:true,reason:null};
  } catch {
    return {state:current,applied:false,reason:'unavailable'};
  }
}
