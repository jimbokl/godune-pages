import {cleanTrip} from './trip-state.mjs?v=17';
import {addTripDay,ensureJourney,journeyDays,mergeJourney,nextDate,selectedDay,validTripDate} from './trip-days-state.mjs?v=12';
import {defaultSchedule} from './trip-schedule-state.mjs?v=9';
import {TRIP_STARTERS} from './trip-starters.mjs?v=1';

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
  return [...new Map(wizardRoutes(catalog).map(route=>[route.area,{id:route.area,name:route.area_name || route.area}])).values()];
}

export function wizardStarters(catalog) {
  const known=new Set((catalog?.poi || []).map(point=>point.slug));
  return TRIP_STARTERS.filter(starter=>starter.days.every(day=>
    [...day.places,day.start_at,day.night_at].every(id=>id===null || known.has(id))));
}

export const journeyIsOccupied=trip=>journeyDays(trip).length>1 || dayIsOccupied(trip) || !!trip.routes.length;

// A date alone is a useful default, not permission to replace meaningful work.
export function dayIsOccupied(trip) {
  const day=selectedDay(trip);
  if(day.places.length || day.start_at || day.night_at || day.note?.trim()
    || Object.keys(day.costs || {}).length || day.bookings?.length || day.visited?.length)return true;
  const schedule=day.schedule || trip.schedule;
  if(!schedule)return false;
  const {mode,...settings}=schedule;
  return mode!==undefined && mode!=='foot' || stable(settings)!==stable(defaultSchedule());
}

export function wizardDefaults(trip,catalog) {
  const day=selectedDay(trip),occupied=dayIsOccupied(trip),routes=wizardRoutes(catalog);
  const area=routes.some(route=>route.area===trip.filters?.area)?trip.filters.area:routes[0]?.area || null;
  return {area,route:routes.find(route=>route.area===area)?.slug || null,starter:wizardStarters(catalog)[0]?.id || null,
    date:journeyIsOccupied(trip)?nextDate(trip.itinerary?.days.at(-1)?.date || trip.date):day.date,
    start:occupied?defaultSchedule().start:trip.schedule?.start ?? defaultSchedule().start,
    end:occupied?defaultSchedule().end:trip.schedule?.end ?? defaultSchedule().end};
}

export function prepareWizardDay(current,answers,catalog) {
  const route=wizardRoutes(catalog).find(row=>row.slug===answers.route && row.area===answers.area);
  if(!route)throw new Error('wizard_unknown_route');
  if(!(answers.date===null || validTripDate(answers.date)))throw new Error('wizard_invalid_date');
  if(!minute(answers.start) || !minute(answers.end) || answers.start>=answers.end)throw new Error('wizard_invalid_time');
  const occupied=dayIsOccupied(current),next=occupied?addTripDay(current):ensureJourney(current);
  const day=selectedDay(next),places=[...new Set(route.stops.map(stop=>stop.poi))];
  const schedule={...defaultSchedule(),mode:'foot',start:answers.start,end:answers.end};
  for(const id of places) {
    const point=catalog.poi.find(row=>row.slug===id);
    const visit=Number.isInteger(point.visit_minutes) && point.visit_minutes>0 && point.visit_minutes<=1440
      ? point.visit_minutes : places.length===1 && Number.isInteger(route.minutes) && route.minutes>0 && route.minutes<=1440 ? route.minutes : 30;
    schedule.stops[id]={visit,pause:0,leg:null,window:null};
  }
  day.date=answers.date;day.places=places;day.schedule=clone(schedule);
  if(!day.start_at && !day.night_at && route.return_to && catalog.poi.some(point=>point.slug===route.return_to))day.night_at=route.return_to;
  next.date=day.date;next.month=day.date?Number(day.date.slice(5,7)):next.month;
  next.places=[...places];next.schedule=schedule;
  next.routes=[...new Set([...current.routes,route.slug])];
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
  const starter=wizardStarters(catalog).find(row=>row.id===answers.starter);
  if(answers.area!=='whole-trip' || !starter)throw new Error('wizard_unknown_starter');
  if(!(answers.date===null || validTripDate(answers.date)))throw new Error('wizard_invalid_date');
  if(!minute(answers.start) || !minute(answers.end) || answers.start>=answers.end)throw new Error('wizard_invalid_time');
  let date=answers.date;
  const days=starter.days.map((template,index)=>{
    if(answers.date!==null && !validTripDate(date))throw new Error('wizard_date_overflow');
    const schedule={...defaultSchedule(),mode:template.mode,start:answers.start,end:answers.end};
    for(const id of template.places) {
      const visit=catalog.poi.find(point=>point.slug===id).visit_minutes;
      schedule.stops[id]={visit:Number.isInteger(visit)&&visit>0&&visit<=1440?visit:30,pause:0,leg:null,window:null};
    }
    const day={id:`day-${index+1}`,date,places:[...template.places],schedule,start_at:template.start_at,
      night_at:template.night_at,note:'',costs:{}};
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
