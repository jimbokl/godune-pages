import {placePath} from './place-path.mjs?v=2026101406';
import {validPreferences} from './day-preferences.mjs?v=2026101305';
import {journeyDays} from './trip-days-state.mjs?v=2026101707';

// A small local activity cache, not a record of real-world visits.
export const PROFILE_VERSION=1, EVENT_LIMIT=200, RETENTION_MS=30*86400000;
export const PARTIES=['unknown','solo','couple','family','friends'];
export const TIME_BUDGETS=[null,1,2,4,8];
export const EVENT_TYPES=['place_view','route_save','planner_add','partner_click'];
const object=v=>v!==null && typeof v==='object' && !Array.isArray(v);
const timestamp=(v,now)=>typeof v==='string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString()===v && Date.parse(v)<=now;
const known=(catalog,kind,id)=>typeof id==='string' && (kind==='route'?catalog.routes:catalog.poi)?.some(row=>row.slug===id);
const iso=now=>new Date(now).toISOString();
export function emptyProfile(now=Date.now(),generation=0){
  return {version:PROFILE_VERSION,revision:0,generation,onboarding:'pending',travel_party:'unknown',time_budget_hours:null,created_at:iso(now),last_seen_at:iso(now),events:[]};
}
export function pageContext(pathname,catalog){
  const place=catalog.poi.find(row=>pathname===`/${placePath(row)}` || pathname===`/poi/${row.slug}/`);
  if(place)return {kind:'place',id:place.slug};
  const route=catalog.routes.find(row=>pathname===`/routes/${row.slug}/`);
  if(route)return {kind:'route',id:route.slug};
  return {kind:({'/':'home','/planner/':'planner','/routes/':'routes','/map/':'map'})[pathname] || 'other'};
}
function validPage(value,catalog){
  return object(value) && (value.kind==='place'?known(catalog,'place',value.id):value.kind==='route'?known(catalog,'route',value.id):['home','planner','routes','map','other'].includes(value.kind) && value.id===undefined)
    && Object.keys(value).every(key=>['kind','id'].includes(key));
}
export function eventContext(page,now=Date.now()){
  const hour=new Date(now+2*3600000).getUTCHours();
  return {page,utc_offset_minutes:120,time_of_day:hour<6?'night':hour<12?'morning':hour<18?'afternoon':'evening',weather:null};
}
export function validProfile(value,catalog,now=Date.now()){
  if(!object(value) || value.version!==PROFILE_VERSION || !Number.isSafeInteger(value.revision) || value.revision<0 || !Number.isSafeInteger(value.generation) || value.generation<0
    || !['pending','dismissed','answered'].includes(value.onboarding) || !PARTIES.includes(value.travel_party) || !TIME_BUDGETS.includes(value.time_budget_hours)
    || !timestamp(value.created_at,now) || !timestamp(value.last_seen_at,now) || value.created_at>value.last_seen_at || !Array.isArray(value.events) || value.events.length>EVENT_LIMIT)return false;
  const ids=new Set();
  return value.events.every(row=>{
    if(!object(row) || typeof row.id!=='string' || !/^[a-zA-Z0-9-]{1,80}$/.test(row.id) || ids.has(row.id) || !EVENT_TYPES.includes(row.type) || row.type==='partner_click'
      || !timestamp(row.timestamp,now) || row.timestamp<value.created_at || !known(catalog,row.type==='route_save'?'route':'place',row.entity_id))return false;
    ids.add(row.id);
    const context=row.context;
    return object(context) && validPage(context.page,catalog) && context.utc_offset_minutes===120 && ['night','morning','afternoon','evening'].includes(context.time_of_day) && context.weather===null
      && Object.keys(context).every(key=>['page','utc_offset_minutes','time_of_day','weather'].includes(key))
      && Object.keys(row).every(key=>['id','type','entity_id','timestamp','context'].includes(key));
  }) && Object.keys(value).every(key=>['version','revision','generation','onboarding','travel_party','time_budget_hours','created_at','last_seen_at','events'].includes(key));
}
export function pruneEvents(events,now=Date.now()){
  const seen=new Set();
  return events.filter(row=>Date.parse(row.timestamp)>=now-RETENTION_MS && Date.parse(row.timestamp)<=now).filter(row=>!seen.has(row.id) && seen.add(row.id)).slice(-EVENT_LIMIT);
}
export function applyProfileAction(current,action,catalog,now=Date.now()){
  if(action.type==='reset'){
    const reset={...emptyProfile(now,current.generation+1),revision:current.revision+1,onboarding:'dismissed'};
    if(!validProfile(reset,catalog,now))throw Error('profile-invalid');
    return reset;
  }
  const next=structuredClone(current);
  if(action.type==='answers'){
    // Patch only fields actually changed in the UI; another tab owns its edits.
    for(const key of ['travel_party','time_budget_hours'])if(Object.hasOwn(action.patch,key))next[key]=action.patch[key];
    next.onboarding='answered';
  }else if(action.type==='dismiss')next.onboarding='dismissed';
  else if(action.type==='events')next.events.push(...action.events);
  else if(action.type!=='seen')throw Error('profile-action');
  next.events=pruneEvents(next.events,now);next.last_seen_at=iso(Math.max(now,Date.parse(next.last_seen_at)));
  if(!validProfile(next,catalog,now))throw Error('profile-invalid');
  if(JSON.stringify(next)===JSON.stringify(current))return current;
  next.revision++;if(!validProfile(next,catalog,now))throw Error('profile-invalid');return next;
}
// The canonical legacy snapshot already has day-1 identity. Materialising that
// snapshot for a note, expense or empty second day must not invent additions.
const selectedPlaces=trip=>journeyDays(trip).flatMap(day=>day.places.map(id=>({key:`${day.id}:${id}`,id})));
export function confirmedTripEvents(result,catalog){
  if(!result?.saved || result.conflict || !result.before || !result.state)return [];
  const beforePlaces=new Set(selectedPlaces(result.before).map(row=>row.key)),beforeRoutes=new Set(result.before.routes || []);
  return [...new Set(result.state.routes || [])].filter(id=>!beforeRoutes.has(id) && known(catalog,'route',id)).map(entity_id=>({type:'route_save',entity_id}))
    .concat([...new Set(selectedPlaces(result.state).filter(row=>!beforePlaces.has(row.key)).map(row=>row.id))].filter(id=>known(catalog,'place',id)).map(entity_id=>({type:'planner_add',entity_id})));
}
export function contextualProfile(record,trip,catalog,now=Date.now()){
  const days=trip?.itinerary?.days || [],day=days.find(row=>row.id===trip.itinerary.active);
  const preferences=validPreferences(day?.preferences)?day.preferences:{interests:[],needs:[]};
  const weak=new Set();
  for(const event of pruneEvents(record.events,now)){
    const places=event.type==='route_save'?(catalog.routes.find(row=>row.slug===event.entity_id)?.stops || []).map(row=>catalog.poi.find(p=>p.slug===row.poi)):[catalog.poi.find(row=>row.slug===event.entity_id)];
    for(const place of places){const interest={beach:'sea',nature:'nature',park:'nature',landmark:'history',museum:'museums',restaurant:'food'}[place?.category];if(interest)weak.add(interest);}
  }
  return {user_id:null,travel_party:record.travel_party,time_budget_hours:record.time_budget_hours,interests:[...preferences.interests],interests_source:validPreferences(day?.preferences)?'selected_day':'unknown',needs:[...preferences.needs],
    interest_signals:[...weak].map(interest=>({interest,source:'local_activity',strength:'weak'})),
    pace:({calm:'slow',full:'medium'})[day?.wave?.pace] || 'unknown',
    visited_places:[...new Set(days.flatMap(row=>row.visited || []))].filter(id=>known(catalog,'place',id)),
    saved_routes:[...new Set(trip?.routes || [])].filter(id=>known(catalog,'route',id)),created_at:record.created_at,last_seen_at:record.last_seen_at};
}
