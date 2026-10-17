// Read-only guide projection. Freshness decisions belong to the Rust engine.
import {serviceSourceUrl} from './service-provenance.mjs?v=2026101707';
import {validEventSnapshot} from './trip-events-contract.mjs?v=2026101707';
import {eventDurationEstimateText} from './trip-events-duration.mjs?v=2026101707';
import {formatKopecks} from './trip-money.mjs?v=2026101305';

export function guideRegionDate(value=new Date()){
 const date=new Date(value);if(!Number.isFinite(date.getTime()))throw Error('guide_invalid_as_of');
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kaliningrad',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 return ['year','month','day'].map(key=>parts.find(part=>part.type===key).value).join('-');
}
export function guideFactFreshness(engine,snapshot,asOf,visitDate){
 if(!snapshot?.facts?.length||typeof engine.factFreshness!=='function')return null;
 try{return engine.factFreshness({version:1,as_of:asOf,...(visitDate?{visit_date:visitDate}:{}),snapshot:structuredClone(snapshot)});}catch{return null;}
}
export function guideFreshnessText(report){
 if(!report?.facts?.length)return 'Свежесть сохранённых сведений не проверена. Уточните их перед выходом.';
 const facts=report.facts||[],messages=[];
 if(facts.some(fact=>fact.freshness==='needs_review'))messages.push('Срок части сведений истёк: нужна повторная проверка.');
 if(facts.some(fact=>fact.freshness==='unknown'))messages.push('Свежесть части сведений неизвестна.');
 if(facts.some(fact=>fact.effective_status==='conflict'))messages.push('Источники расходятся.');
 if(facts.some(fact=>['not_yet_valid','outside_validity'].includes(fact.freshness)))messages.push('Часть сведений не действует на дату оценки.');
 if(facts.some(fact=>fact.visit_applicability==='beyond_review_horizon'))messages.push('Дата поездки выходит за срок проверки сведений.');
 if(facts.some(fact=>['before_validity','after_validity'].includes(fact.visit_applicability)))messages.push('Часть сведений не действует на дату поездки.');
 return messages.join(' ')||'Срок проверки сведений на дату оценки не истёк. Перед выходом сверьте источник.';
}
export const guideClaimWarning=report=>report?.facts?.length&&report.facts.every(fact=>fact.freshness==='current'&&fact.effective_status==='confirmed'&&fact.visit_applicability==='within_validity')?'':guideFreshnessText(report);
export function guideClaimSnapshot(engine,claims){
 const facts=new Map();
 for(const claim of claims){
  if(typeof engine.factSnapshot!=='function')continue;
  try{for(const fact of engine.factSnapshot({version:1,...structuredClone(claim)}).facts||[])facts.set(JSON.stringify([fact.subject.kind,fact.subject.id,fact.path]),fact);}catch{}
 }
 return {version:2,facts:[...facts.values()]};
}
export function guideClaimFreshness(report,subject,path){
 const facts=report?.facts?.filter(fact=>fact.subject.kind===subject.kind&&fact.subject.id===subject.id&&fact.path===path);
 return facts?.length?{...report,facts}:null;
}
export function guideMenuPrice(row,report){
 const price=row.choice.price,value=price.amount_kopecks!==null?formatKopecks(price.amount_kopecks):price.from_kopecks!==null?'от '+formatKopecks(price.from_kopecks):price.label||'Цена не указана';
 return [value,price.observed_at?'меню на '+price.observed_at:'',guideFreshnessText(report)].filter(Boolean).join(' · ');
}
export function guideEventPresentation(event){
 if(!validEventSnapshot(event))return null;
 const estimate=eventDurationEstimateText(event);
 const instant=value=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Kaliningrad',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value));
 return {lines:[{scheduled:'Запланировано по сохранённому источнику.',cancelled:'Событие отменено. Сохранённая запись остаётся в поездке.',postponed:'Событие перенесено. Уточните новое время у источника.'}[event.status],
  `Начало по источнику: ${instant(event.start_time)} · Калининград.`,event.end_time?`Окончание по источнику: ${instant(event.end_time)} · Калининград.`:'Окончание неизвестно. Полное время посещения и возвращения нужно уточнить.',
  ...(estimate?[estimate]:[])],
  source:{name:'Сохранённый снимок события',url:serviceSourceUrl(event.source_url),checked_at:event.verified_at,date_label:'источник проверен'}};
}
