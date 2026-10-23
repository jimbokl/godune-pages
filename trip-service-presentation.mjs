// Read-only wording for saved visits, their timeline and both offline PDFs.
// Native results remain authoritative; a published programme is not an end time.
import {validEventSnapshot} from './trip-events-contract.mjs?v=2026101707';

export const eventEndText=event=>validEventSnapshot(event)&&event.end_time===null?'Время окончания не указано. Уточните его у организатора.':null;
const stageNames={approach:'подхода к входу',collect:'получения снаряжения',change_before:'переодевания перед посещением',prepare:'подготовки',activity:'самого посещения',complete:'завершения',change_after:'переодевания после посещения',return_walk:'обратного пути к ориентиру'};
const checkReasons={time:['unknown_duration','unknown_calendar'],approach:['access_minutes_unknown'],return:['access_minutes_unknown'],conditions:['condition_not_recorded'],cost:['amount_unknown'],upfront:['amount_unknown'],event:['event_venue_unknown']};
const conditions={age:'возраст',group:'состав группы',audience:'категория посетителей',equipment:'снаряжение',booking:'предварительная запись'};

// null means that the caller must retain its existing fallback. In particular,
// a new native issue, changed context or failed condition must never disappear.
export function eventVisitPresentation(visit,assessment,context='ready'){
 const event=visit?.event,a=assessment;
 if(!validEventSnapshot(event)||context!=='ready'||a?.state!=='needs_info'||!Array.isArray(a.visit?.issues)||!Array.isArray(a.visit?.duration?.segments)||!Array.isArray(a.eligibility?.checks))return null;
 if(!Array.isArray(a.checks)||a.checks.some(c=>!['pass','unknown'].includes(c.status)||c.status==='unknown'&&(!Object.hasOwn(checkReasons,c.kind)||!Array.isArray(c.reasons)||!c.reasons.length||c.reasons.some(r=>!checkReasons[c.kind].includes(r)))))return null;
 const segments=a.visit.duration.segments;
 if(a.visit.issues.some(i=>i.code!=='unknown_calendar'&&(i.code!=='unknown_duration'||!Object.hasOwn(stageNames,i.stage)||!segments.some(s=>s.stage===i.stage&&s.minutes===null))))return null;
 if(a.eligibility.checks.some(c=>!['pass','unknown'].includes(c.status)||c.status==='unknown'&&(!Object.hasOwn(conditions,c.kind)||!Array.isArray(c.reasons)||!c.reasons.length||c.reasons.some(r=>r.code!=='condition_not_recorded'))))return null;
 const id=visit.id||event.id,hints=[],seen=new Set();
 const add=(stage,text)=>{if(!seen.has(stage)){seen.add(stage);hints.push({key:`${id}:${stage}`,stage,text});}};
 const end=eventEndText(event);if(end)add('event_end',end);
 const access=[];
 if(!visit.point||a.checks.some(c=>c.kind==='event'&&c.reasons?.includes('event_venue_unknown')))access.push('входе');
 if(a.visit.issues.some(i=>i.code==='unknown_calendar'))access.push('часах допуска');
 for(const stage of ['approach','return_walk'])if(segments.some(s=>s.stage===stage&&s.minutes===null))access.push(stage==='approach'?'времени подхода':'обратном пути');
 if(access.length){const list=access.length===1?access[0]:access.slice(0,-1).join(', ')+' и '+access.at(-1);add('access',`${!visit.address?'Адрес не записан. ':''}Нет сведений о ${list}. Уточните у организатора перед выходом.`);}
 for(const s of segments)if(s.minutes===null){
  if(!Object.hasOwn(stageNames,s.stage))return null;
  if(['approach','return_walk'].includes(s.stage)||s.stage==='activity'&&end)continue;
  add(s.stage,`Время ${stageNames[s.stage]} неизвестно. Уточните его перед выходом.`);
 }
 const unknown=[...new Map(a.eligibility.checks.filter(c=>c.status==='unknown').map(c=>[c.kind,c])).values()];
 const conditionHints=unknown.length?[{key:`${id}:conditions`,stage:'conditions',text:`Условия не записаны: ${unknown.map(c=>conditions[c.kind]).join(', ')}. Уточните у организатора.`}]:[];
 return {hints,conditionHints,coveredStages:segments.filter(s=>s.minutes===null).map(s=>s.stage)};
}

export function serviceTimingTotal(assessment){
 const total=assessment?.summary?.total_minutes,known=assessment?.visit?.duration?.known_minutes;
 if(Number.isFinite(total)&&total>=0)return `Всего на посещение: ${total} мин.`;
 if(total===null&&Number.isFinite(known)&&known>0)return `Учтённые этапы посещения: ${known} мин.`;
 return null;
}
export function serviceLocationText(service){
 return service?.address?'Вход и подход уточните до выхода.':'Адрес и вход не записаны. Уточните их у организатора.';
}
export function serviceTimeExplained(issue,visits,check){
 if(issue?.code!=='service_time_unknown'||issue.entry?.kind!=='service')return false;
 const visit=visits.find(v=>v.id===issue.entry.id),row=check?.visits?.find(v=>v.id===issue.entry.id);
 return !!eventVisitPresentation(visit,row?.assessment,row?.context);
}
export function serviceDayPresentation(check,visits){
 if(check?.state!=='needs_info'||check.places?.finish!==null||!check.issues?.length)return null;
 if(!check.issues.every(i=>serviceTimeExplained(i,visits,check)))return null;
 return 'Возвращение для всего дня пока не рассчитано.';
}
