import {wizardChoices,wizardDefaults,prepareWizardPlan,dayIsOccupied} from './planning-wizard-state.mjs?v=2026101707';
import {selectedDay} from './trip-days-state.mjs?v=2026101707';
import {defaultSchedule} from './trip-schedule-state.mjs?v=2026101305';
import {cleanTrip} from './trip-state.mjs?v=2026101707';
import {contextualProfile} from './personalization-state.mjs?v=2026101904';
import {rankCandidates} from './personalization-ranking-state.mjs?v=2026101904';
import {forecastView,localDay} from './live-weather.mjs?v=2026101305';

export const AUTO_SCHEMA={type:'object',additionalProperties:false,required:['version','route','places','start','end','mode','backup'],properties:{version:{const:1},route:{type:'string'},places:{type:'array',minItems:2,maxItems:4,uniqueItems:true,items:{type:'string'}},start:{type:'integer',minimum:0,maximum:1439},end:{type:'integer',minimum:1,maximum:1440},mode:{const:'foot'},backup:{type:'string'}}};
const keys=(value,names)=>value && typeof value==='object' && !Array.isArray(value) && Object.keys(value).length===names.length && names.every(key=>Object.hasOwn(value,key));
export function validAutoConfig(value){
  return keys(value,['version','transport','llm']) && value.version===1 && keys(value.transport,['mode','max_points','min_points','intercity']) && value.transport.mode==='foot' && value.transport.max_points===4 && value.transport.min_points===2 && value.transport.intercity===false && keys(value.llm,['enabled','endpoint','context_consent']) && typeof value.llm.enabled==='boolean' && typeof value.llm.context_consent==='boolean' && (value.llm.endpoint===null || typeof value.llm.endpoint==='string' && /^\/api\/[a-z0-9/-]+$/.test(value.llm.endpoint));
}
export const DEFAULT_AUTO_CONFIG={version:1,transport:{mode:'foot',max_points:4,min_points:2,intercity:false},llm:{enabled:false,endpoint:null,context_consent:false}};
function autoPlaces(route,{rain,start,end,rainTarget}){
  const ids=[...new Set(route.stops.map(stop=>stop.poi))],at=rainTarget?ids.indexOf(rainTarget):-1;
  if(rainTarget && at<0)return [];
  const first=at<0?0:Math.min(at,ids.length-2),count=rainTarget || rain || end-start<=120?2:4;
  return ids.slice(first,first+count);
}
export function autoContext(current,record,catalog,{now=new Date(),weather=null,rain=false,rainTarget=null,ranking=null}={}){
  const defaults=wizardDefaults(current,catalog),profile=contextualProfile(record,current,catalog,now.getTime());
  const date=current.date || localDay(now),hasWindow=!!current.schedule && (dayIsOccupied(current) || !!current.date || current.schedule.start!==defaultSchedule().start || current.schedule.end!==defaultSchedule().end);
  const localMinutes=now.getUTCHours()*60+now.getUTCMinutes()+120;
  const start=hasWindow?current.schedule.start:date===localDay(now)?Math.max(defaults.start,Math.ceil((localMinutes%1440)/15)*15):defaults.start;
  const end=hasWindow?current.schedule.end:Math.min(defaults.end,start+(profile.time_budget_hours || 4)*60);
  const area=current.filters?.area;
  let routes=wizardChoices(catalog).filter(route=>route.stops.length>=2);
  if(routes.some(route=>route.area===area))routes=routes.filter(route=>route.area===area);
  // Snapshot location/date/freshness must all match. Regional weather is never
  // transferred to a neighbouring town or to the next selected day.
  const weatherFor=route=>date===localDay(now)?forecastView(weather,route.area,now):{status:'unavailable'};
  const selection={rain,start,end,rainTarget};
  const candidates=routes.map(route=>({...route,themes:[],minutes:null,stops:route.stops.filter(stop=>autoPlaces(route,selection).includes(stop.poi))}));
  const ranked=rankCandidates(candidates,profile,catalog,ranking).map(row=>({...row,candidate:routes.find(route=>route.slug===row.candidate.slug),wet:weatherFor(row.candidate)}));
  const sheltered=route=>autoPlaces(route,selection).filter(id=>catalog.poi.find(p=>p.slug===id)?.category==='museum' && route.stops.find(stop=>stop.poi===id)?.visit_scope!=='outside').length;
  ranked.sort((a,b)=>((rain || b.wet.status==='fresh' && b.wet.hour.rain_mm>0)?sheltered(b.candidate):0)-((rain || a.wet.status==='fresh' && a.wet.hour.rain_mm>0)?sheltered(a.candidate):0) || b.score-a.score || a.index-b.index);
  if(rainTarget)ranked.sort((a,b)=>Number(b.candidate.stops.some(stop=>stop.poi===rainTarget))-Number(a.candidate.stops.some(stop=>stop.poi===rainTarget)));
  return {profile,date,start,end,rain,rainTarget,routes:ranked.map(row=>row.candidate),weatherFor};
}
export function autoBackups(context,catalog,route,places){
  const eligible=new Set(context.routes.filter(row=>row.area===route.area).flatMap(row=>row.stops.map(stop=>stop.poi)));
  return catalog.poi.filter(point=>eligible.has(point.slug) && !places.includes(point.slug)).sort((a,b)=>Number(b.category==='museum')-Number(a.category==='museum')).map(point=>point.slug);
}
export function ruleAutoPlan(context,catalog,route=context.routes[0]){
  if(!route || context.start>=context.end)throw Error('auto_no_window');
  const places=autoPlaces(route,context);
  if(context.rainTarget && !places.length)throw Error('auto_backup_unavailable');
  const backup=autoBackups(context,catalog,route,places)[0];
  if(places.length<2 || !backup)throw Error('auto_no_candidate');
  return {version:1,route:route.slug,places,start:context.start,end:context.end,mode:'foot',backup};
}
export function validAutoPlan(value,context,catalog){
  if(!keys(value,AUTO_SCHEMA.required) || value.version!==1 || value.mode!=='foot' || !Number.isInteger(value.start) || !Number.isInteger(value.end) || value.start!==context.start || value.end!==context.end || value.start<0 || value.end>1440 || value.start>=value.end || !Array.isArray(value.places) || value.places.length<2 || value.places.length>4 || new Set(value.places).size!==value.places.length)return false;
  const route=context.routes.find(route=>route.slug===value.route),backup=catalog.poi.find(point=>point.slug===value.backup);
  if(!route || !backup || backup.area!==route.area || value.places.includes(value.backup) || !context.routes.some(row=>row.area===route.area && row.stops.some(stop=>stop.poi===value.backup)) || context.rainTarget && !value.places.includes(context.rainTarget))return false;
  // Keep a canonical contiguous segment: no invented POI, reordering, transport,
  // cross-town jump or LLM estimate can enter the common day.
  const first=route.stops.findIndex(stop=>stop.poi===value.places[0]);
  return first>=0 && value.places.every((id,index)=>route.stops[first+index]?.poi===id);
}
export function prepareAutoDay(current,plan,context,catalog){
  if(!validAutoPlan(plan,context,catalog))throw Error('auto_invalid');
  const route=context.routes.find(row=>row.slug===plan.route),defaults=wizardDefaults(current,catalog);
  const answers={...defaults,area:route.area,route:route.slug,date:context.date,start:plan.start,end:plan.end,transport:'foot',base:null,preferences:{version:1,interests:context.profile.interests,needs:context.profile.needs},wave:{version:1,theme:'mixed',pace:context.profile.travel_party==='family' || context.profile.pace==='slow'?'calm':'full',recipe:null}};
  const native=prepareWizardPlan(current,answers,catalog),next=native.trip,day=selectedDay(next);
  day.places=[...plan.places];next.places=[...plan.places];
  day.schedule.stops=Object.fromEntries(Object.entries(day.schedule.stops).filter(([id])=>plan.places.includes(id)));
  day.night_at=null;day.start_at=null;day.wave={...day.wave,recipe:null};next.schedule=structuredClone(day.schedule);
  // The shortened suggestion does not claim the full route geometry.
  next.routes=[...current.routes];
  const backup=catalog.poi.find(point=>point.slug===plan.backup);
  day.note=`Автоматический день. Запасной вариант: ${backup.name}. Часы, вход и дорогу к нему нужно проверить. Дорога от жилья и обратно не рассчитана.`;
  return {...native,trip:cleanTrip(next,catalog),autoPlan:structuredClone(plan),context};
}
export function applyAutoDay(current,proposal,catalog){
  if(JSON.stringify(current)!==proposal.sourceJSON)return {state:current,applied:false};
  try{return {state:prepareAutoDay(current,proposal.autoPlan,proposal.context,catalog).trip,applied:true};}catch{return {state:current,applied:false};}
}
