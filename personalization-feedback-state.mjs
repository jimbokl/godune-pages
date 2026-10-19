// Explicit recommendation answers share the existing bounded local event log.
// Categories are always read from canonical POI, never accepted from an event.
export const FEEDBACK_TYPE='recommendation_feedback', FEEDBACK_VERSION=1;
const DAY=86400000;
export const feedbackWeek=now=>Math.floor((now+120*60000+3*DAY)/(7*DAY)); // Monday 00:00, UTC+2
const object=value=>value!==null && typeof value==='object' && !Array.isArray(value);
export function feedbackTarget(value,catalog){
  if(!object(value) || Object.keys(value).length!==2 || !['place','route'].includes(value.kind) || typeof value.id!=='string')return null;
  return (value.kind==='place'?catalog.poi:catalog.routes).some(row=>row.slug===value.id)?{kind:value.kind,id:value.id}:null;
}
export const feedbackKey=target=>`${target.kind}:${target.id}`;
export function feedbackCategories(target,catalog){
  if(!feedbackTarget(target,catalog))return [];
  const places=target.kind==='place'?[target.id]:(catalog.routes.find(row=>row.slug===target.id)?.stops || []).map(row=>row.poi);
  return [...new Set(places.map(id=>catalog.poi.find(row=>row.slug===id)?.category).filter(value=>typeof value==='string' && value.length>0))].sort();
}
export function feedbackAnswers(events){
  const latest=new Map();
  for(const event of events)if(event.type===FEEDBACK_TYPE)latest.set(feedbackKey({kind:event.entity_kind,id:event.entity_id}),event);
  return latest;
}
export function projectFeedback(events,catalog){
  const totals=new Map();
  // Integer tenths avoid order-dependent floating-point drift before clamping.
  for(const event of feedbackAnswers(events).values())for(const category of feedbackCategories({kind:event.entity_kind,id:event.entity_id},catalog))totals.set(category,(totals.get(category) || 0)+(event.answer==='yes'?1:-2));
  return Object.fromEntries([...totals].sort(([a],[b])=>a.localeCompare(b)).map(([category,tenths])=>[category,Math.min(2,Math.max(0,1+tenths/10))]));
}
export function validFeedbackLearning(value,catalog){
  const categories=new Set(catalog.poi.map(row=>row.category));
  return !!(object(value) && Object.keys(value).length===3 && value.version===FEEDBACK_VERSION && Number.isSafeInteger(value.week)
    && object(value.weights) && Object.entries(value.weights).every(([category,weight])=>categories.has(category) && Number.isFinite(weight) && weight>=0 && weight<=2));
}
export function feedbackContribution(candidate,profile,catalog){
  const places=candidate?.places || (candidate?.stops || []).map(row=>row.poi);
  const categories=[...new Set(places.map(id=>catalog.poi.find(row=>row.slug===id)?.category).filter(Boolean))];
  const weights=profile.category_weights || {};
  const affected=categories.filter(category=>Number.isFinite(weights[category]) && weights[category]>=0 && weights[category]<=2 && weights[category]!==1);
  const delta=categories.length?categories.reduce((sum,category)=>sum+(affected.includes(category)?weights[category]-1:0),0)/categories.length:0;
  return {delta,categories:affected};
}
export function feedbackReason(contribution){
  return contribution.delta>0?'Ваши оценки добавили вес категориям этой прогулки.':contribution.delta<0?'Ваши оценки уменьшили вес категорий этой прогулки.':null;
}
