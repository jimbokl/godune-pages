import {applyWizardDay, prepareWizardDay, wizardChoices, wizardDefaults} from './planning-wizard-state.mjs?v=2026101707';
import {journeyDays, validTripDate} from './trip-days-state.mjs?v=2026101707';

const TIME_ZONE='Europe/Kaliningrad';
const object=value=>value!==null && typeof value==='object' && !Array.isArray(value);
const stable=value=>JSON.stringify(value,(_,row)=>object(row)?Object.fromEntries(Object.keys(row).sort().map(key=>[key,row[key]])):row);
const asArray=value=>Array.isArray(value)?value:[];
const integer=value=>Number.isSafeInteger(value) && value>=0;
const dateAt=now=>new Intl.DateTimeFormat('en-CA',{timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);

export function kaliningradNow(now=new Date()) {
  const instant=now instanceof Date?now:new Date(now);
  if(!Number.isFinite(instant.getTime()))throw new TypeError('engagement_invalid_instant');
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:TIME_ZONE,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(instant);
  const part=key=>parts.find(item=>item.type===key)?.value;
  return {date:dateAt(instant),minute:Number(part('hour'))*60+Number(part('minute')),timezone:TIME_ZONE};
}

const minuteValue=value=>Number.isInteger(value)&&value>=0&&value<=1440;
export function solarStatus(lightResult,now=new Date()) {
  const current=kaliningradNow(now);
  const unknown={state:'unknown',date:current.date,timezone:TIME_ZONE,currentMinute:current.minute,sunrise:null,sunset:null,dusk:null,remainingToSunset:null,remainingToDusk:null};
  if(!object(lightResult)||lightResult.date!==current.date||lightResult.timezone!==TIME_ZONE)return unknown;
  const row=asArray(lightResult.stops).find(item=>object(item)&&object(item.sun)&&minuteValue(item.sun.sunset)&&minuteValue(item.sun.dusk));
  if(!row)return unknown;
  const {sunrise,sunset,dusk}=row.sun;
  const remainingToSunset=Math.max(0,sunset-current.minute),remainingToDusk=Math.max(0,dusk-current.minute);
  const state=current.minute<sunset?'before_sunset':current.minute<dusk?'after_sunset_before_dusk':'after_dusk';
  return {state,date:current.date,timezone:TIME_ZONE,currentMinute:current.minute,
    sunrise:minuteValue(sunrise)?sunrise:null,sunset,dusk,remainingToSunset,remainingToDusk};
}

function normalizePath(path,base='https://local.invalid/',directory=false) {
  if(typeof path!=='string'||!path)return null;
  try {
    const url=new URL(path,base);let value=url.pathname.replace(/index\.html$/,'');
    if(directory&&value!=='/'&&!value.endsWith('/'))value+='/';
    return value;
  } catch { return null; }
}
function listResources(response) {
  const packages=Array.isArray(response)?response:asArray(response?.packages);
  return packages.flatMap(pack=>asArray(pack?.resources).map(resource=>resource?.path).filter(path=>typeof path==='string'));
}
export function offlineProof(listResponse,{pagePath,mapPaths=[],base='https://local.invalid/'}={}) {
  const have=new Set(listResources(listResponse).map(path=>normalizePath(path,base)).filter(Boolean));
  const page=normalizePath(pagePath,base,true),maps=[...new Set(asArray(mapPaths).map(path=>normalizePath(path,base)).filter(Boolean))];
  const pageReady=!!page&&have.has(page),missingMaps=maps.filter(path=>!have.has(path)),mapReady=maps.length>0&&missingMaps.length===0;
  const missing=[...(!pageReady?[pagePath||null]:[]),...missingMaps].filter(Boolean);
  return {ready:pageReady&&mapReady,pageReady,mapReady,missing,
    resources:pageReady&&mapReady?[page,...maps]:[]};
}

function selectedRows(context,selectedPaths) {
  const paths=new Set(asArray(selectedPaths).filter(path=>typeof path==='string'));
  const rows=[];
  if(context?.node?.path&&paths.has(context.node.path))rows.push(context.node);
  for(const row of asArray(context?.neighbors))if(paths.has(row.path))rows.push(row);
  return rows;
}
function knownSum(rows,key) {
  const unknown=rows.filter(row=>!integer(row[key])).length;
  return {value:unknown?null:rows.reduce((sum,row)=>sum+row[key],0),unknown};
}
export function engagementSummary(context,selectedPaths) {
  const rows=selectedRows(context,selectedPaths),duration=knownSum(rows,'duration_min'),price=knownSum(rows,'price_kopecks');
  return {count:rows.length,duration_min:duration.value,price_kopecks:price.value,
    duration_unknown:duration.unknown,price_unknown:price.unknown,unknown:duration.unknown+price.unknown,
    paths:rows.map(row=>row.path)};
}

function contextValid(context) {
  return object(context)&&context.version===1&&object(context.node)&&typeof context.node.path==='string'
    &&Array.isArray(context.node.poi_ids)&&Array.isArray(context.node.recipe_ids)&&Array.isArray(context.node.sources)
    &&Array.isArray(context.neighbors)&&context.neighbors.every(row=>object(row)&&typeof row.path==='string'
      &&['before','after','alternative','complement'].includes(row.relation)&&Array.isArray(row.poi_ids)
      &&Array.isArray(row.recipe_ids)&&Array.isArray(row.proof));
}
function recipeIds(row) {return asArray(row?.recipe_ids).filter(id=>typeof id==='string');}
const engagementOf=day=>object(day?.engagement)?day.engagement:null;

export function prepareEngagementDay(current,catalog,context,selectedPaths,options={},wizardContext=null) {
  if(!contextValid(context))throw new Error('engagement_invalid_context');
  const rows=selectedRows(context,selectedPaths);
  if(!rows.length)throw new Error('engagement_empty_selection');
  const allPaths=rows.map(row=>row.path),selectedPoi=[...new Set(rows.flatMap(row=>asArray(row.poi_ids).filter(id=>typeof id==='string')))];
  const candidates=[...new Set(rows.flatMap(recipeIds))];
  const choices=wizardChoices(catalog,'mixed');
  const route=candidates.map(id=>choices.find(choice=>choice.slug===id)).find(choice=>choice
    &&selectedPoi.every(id=>choice.stops.some(stop=>stop.poi===id)));
  if(!route)throw new Error('engagement_no_matching_recipe');
  const defaults=wizardDefaults(current,catalog),date=Object.hasOwn(options,'date')?options.date:defaults.date;
  if(date!==null&&!validTripDate(date))throw new Error('engagement_invalid_date');
  const answers={...defaults,...options,area:route.area,route:route.slug,date,
    ...(route.wave_recipe?{wave:{version:1,pace:options.pace==='calm'?'calm':'full',theme:route.wave_theme,recipe:route.slug}}:{})};
  delete answers.pace;
  const fingerprint=stable({paths:[...allPaths].sort(),recipe:route.slug,date});
  const existing=journeyDays(current).find(day=>engagementOf(day)?.fingerprint===fingerprint);
  if(existing)return {kind:'existing',fingerprint,targetId:existing.id,paths:allPaths,recipe:route.slug,sourceSignature:stable(current)};
  const wizard=prepareWizardDay(current,answers,catalog,wizardContext);
  return {kind:'prepared',fingerprint,paths:allPaths,recipe:route.slug,sourceSignature:wizard.sourceSignature,
    targetId:wizard.targetId,placement:wizard.placement,wizard,route};
}

export function saveEngagementDay(current,proposal,catalog,wizardContext=null) {
  if(!proposal||typeof proposal.fingerprint!=='string')return {state:current,applied:false,reason:'invalid_proposal',targetId:null};
  const existing=journeyDays(current).find(day=>engagementOf(day)?.fingerprint===proposal.fingerprint);
  if(existing)return {state:current,applied:true,reason:'already_saved',targetId:existing.id};
  if(proposal.kind!=='prepared'||stable(current)!==proposal.sourceSignature)return {state:current,applied:false,reason:'changed',targetId:null};
  const applied=applyWizardDay(current,proposal.wizard,catalog,{separate:true,context:wizardContext});
  if(!applied.applied)return {state:current,applied:false,reason:applied.reason,targetId:null};
  const state=structuredClone(applied.state),day=state.itinerary?.days.find(row=>row.id===proposal.targetId);
  if(!day)return {state:current,applied:false,reason:'changed',targetId:null};
  day.engagement={version:1,fingerprint:proposal.fingerprint,paths:[...proposal.paths],recipe:proposal.recipe};
  return {state,applied:true,reason:null,targetId:day.id};
}

export function engagementDay(trip,id) {
  const day=journeyDays(trip).find(row=>row.id===id);
  return day&&engagementOf(day)?structuredClone(day):null;
}
