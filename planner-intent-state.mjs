import {wizardAreas,wizardChoices,wizardStarters,wizardDefaults} from './planning-wizard-state.mjs?v=2026101707';
import {wizardBusTargets,wizardBusChoices} from './wizard-bus.mjs?v=2026101707';
import {wizardRailTargets} from './wizard-rail.mjs?v=2026101707';
import {DAY_INTERESTS,DAY_NEEDS,assessPreferenceChoice} from './day-preferences.mjs?v=2026101305';

const keys=['day_count','date','area','start','end','travel_party','party','interests','exclude_interests','needs','pace','transport','selection','unresolved','unsupported'];
const slots=['day_count','date','area','time_window','party','transport','selection'];
const exact=(v,k)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===k.length&&k.every(x=>Object.hasOwn(v,x));
const one=(v,values)=>v===null||values.includes(v);
const list=(v,values)=>Array.isArray(v)&&new Set(v).size===v.length&&v.every(x=>values.includes(x));
export const intentDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number(v.slice(0,4))>0&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
export function emptyIntent(){return {day_count:null,date:null,area:null,start:null,end:null,travel_party:null,party:null,interests:[],exclude_interests:[],needs:[],pace:null,transport:null,selection:null,unresolved:[],unsupported:[]};}
const points=(choice,catalog)=>[...new Set(choice.days?choice.days.flatMap(d=>d.places):choice.stops.map(s=>s.poi))].map(id=>catalog.poi.find(p=>p.slug===id)).filter(Boolean);
function metadata(choice,catalog){
  const match=assessPreferenceChoice(choice,catalog,{version:1,interests:Object.keys(DAY_INTERESTS),needs:[]});
  return {interests:match.matched,poi_categories:[...new Set(points(choice,catalog).map(p=>p.category))].sort()};
}
export function intentOptions(catalog){return {
  areas:wizardAreas(catalog),
  routes:wizardChoices(catalog).map(r=>({id:r.slug,area:r.area,name:r.name,...metadata(r,catalog)})),
  starters:wizardStarters(catalog).filter(s=>s.days.length===2).map(s=>({id:s.id,area:s.days[0].recipe?.area,name:s.name,day_count:2,...metadata(s,catalog),transport_modes:[...new Set(s.days.map(d=>d.transport||d.mode))]})).filter(s=>s.area)
};}
export function validIntent(v,options){
  if(!exact(v,keys)||!one(v.day_count,[1,2])||!(v.date===null||intentDate(v.date))||!one(v.area,options.areas.map(a=>a.id)))return false;
  if(!(v.start===null||Number.isInteger(v.start)&&v.start>=0&&v.start<1440)||!(v.end===null||Number.isInteger(v.end)&&v.end>0&&v.end<=1440)||v.start!==null&&v.end!==null&&v.start>=v.end)return false;
  if(!one(v.travel_party,['unknown','solo','couple','family','friends'])||!one(v.pace,['calm','full'])||!one(v.transport,['auto','foot','car','rail','bus','no_car']))return false;
  if(v.party!==null&&(!exact(v.party,['adults','children'])||![v.party.adults,v.party.children].every(n=>Number.isInteger(n)&&n>=0)||v.party.adults+v.party.children<1||v.party.adults+v.party.children>4294967295))return false;
  if(!list(v.interests,Object.keys(DAY_INTERESTS))||!list(v.exclude_interests,Object.keys(DAY_INTERESTS))||!list(v.needs,Object.keys(DAY_NEEDS))||!list(v.unresolved,slots))return false;
  if(!Array.isArray(v.unsupported)||v.unsupported.length>8||v.unsupported.some(s=>typeof s!=='string'||!s.trim()||s.length>240))return false;
  if(v.selection!==null){
    if(!exact(v.selection,['kind','id'])||!['route','starter'].includes(v.selection.kind))return false;
    const row=(v.selection.kind==='route'?options.routes:options.starters).find(r=>r.id===v.selection.id);
    if(!row||v.area!==null&&row.area!==v.area||v.day_count!==null&&v.day_count!==(v.selection.kind==='route'?1:2))return false;
  }
  return true;
}
export function compatibleIntentChoices(intent,options){
  const rows=intent.day_count===2?options.starters:options.routes;
  return rows.filter(r=>(!intent.area||r.area===intent.area)&&!intent.exclude_interests.some(i=>r.interests.includes(i))
    &&!(intent.day_count===2&&intent.transport==='foot'&&r.transport_modes.some(m=>m!=='foot'))
    &&!(intent.day_count===2&&intent.transport==='no_car'&&r.transport_modes.includes('car')))
    .sort((a,b)=>b.interests.filter(i=>intent.interests.includes(i)).length-a.interests.filter(i=>intent.interests.includes(i)).length);
}
export function intentQuestions(intent,options){
  const missing=[];
  if(intent.day_count===null)missing.push('day_count');
  if(intent.area===null)missing.push('area');
  if(intent.date===null||intent.unresolved.includes('date'))missing.push('date');
  if(intent.start===null||intent.end===null)missing.push('time_window');
  if(['family','friends'].includes(intent.travel_party)&&intent.party===null||intent.party&&['solo','couple'].includes(intent.travel_party)&&intent.party.adults+intent.party.children!==(intent.travel_party==='solo'?1:2))missing.push('party');
  if(intent.transport===null)missing.push('transport');
  if(intent.interests.some(i=>intent.exclude_interests.includes(i))||intent.day_count!==null&&intent.area!==null&&!compatibleIntentChoices(intent,options).length)missing.push('selection');
  return [...new Set(missing)].slice(0,3);
}
export function intentPlan(intent,trip,catalog,profile=null){
  const options=intentOptions(catalog);
  if(!validIntent(intent,options))throw Error('intent_invalid');
  const local=[];
  if(profile){
    const copy=structuredClone(intent);
    if(!copy.interests.length&&profile.interests?.length){copy.interests=profile.interests.filter(i=>Object.hasOwn(DAY_INTERESTS,i)&&!copy.exclude_interests.includes(i));if(copy.interests.length)local.push('Интересы взяты из настроек выбранного дня.');}
    if(!copy.needs.length&&profile.needs?.length)copy.needs=profile.needs.filter(i=>Object.hasOwn(DAY_NEEDS,i));
    if(copy.pace===null&&['slow','medium'].includes(profile.pace)){copy.pace=profile.pace==='slow'?'calm':'full';local.push('Темп взят из настроек выбранного дня.');}
    if(copy.travel_party===null&&['solo','couple','family','friends'].includes(profile.travel_party))copy.travel_party=profile.travel_party;
    intent=copy;
  }
  const questions=intentQuestions(intent,options);
  if(questions.length)return {questions,answers:null,notes:[]};
  const rows=compatibleIntentChoices(intent,options),selected=rows.find(r=>r.id===intent.selection?.id)||rows[0];
  if(!selected)return {questions:['selection'],answers:null,notes:[]};
  // Preferences and exclusions are checked against canonical stops, never LLM prose.
  const notes=[...intent.unsupported,...local];
  const absent=intent.interests.filter(i=>!selected.interests.includes(i));
  if(absent.length)notes.push('В готовом плане пока нет отдельных остановок по интересам: '+absent.map(i=>DAY_INTERESTS[i]).join(', ')+'.');
  if(intent.needs.length)notes.push('Проверьте отметки о лестницах и проходах в плане ниже.');
  if(intent.exclude_interests.length)notes.push('Из выбора исключены готовые планы с такими остановками: '+intent.exclude_interests.map(i=>DAY_INTERESTS[i]).join(', ')+'.');
  const defaults=wizardDefaults(trip,catalog),transport=intent.transport==='no_car'?(intent.day_count===2?'auto':'foot'):intent.transport;
  const answers={...defaults,area:intent.day_count===2?'whole-trip':intent.area,date:intent.date,start:intent.start,end:intent.end,
    transport,preferences:{version:1,interests:[...intent.interests],needs:[...intent.needs]},
    wave:{version:1,theme:'mixed',pace:intent.pace||'calm',recipe:null},
    ...(intent.party?{party:{version:1,...intent.party}}:intent.travel_party==='solo'?{party:{version:1,adults:1,children:0}}:intent.travel_party==='couple'?{party:{version:1,adults:2,children:0}}:{}),
    ...(intent.day_count===2?{starter:selected.id}:{route:selected.id})};
  if(transport==='rail'&&!wizardRailTargets(catalog,answers).length||transport==='bus'&&(!wizardBusTargets(catalog,answers).length||intent.day_count===1&&!wizardBusChoices(catalog).some(r=>r.slug===answers.route)))return {questions:['selection'],answers:null,notes:[]};
  if(!intent.party)notes.push(`В расчёте: ${answers.party.adults} взрослых, ${answers.party.children} детей. Число можно изменить в готовом плане.`);
  return {questions:[],answers,notes,selection:selected};
}

export function kaliningradToday(now=new Date()){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Kaliningrad',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
