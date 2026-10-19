import {DAY_INTERESTS,assessPreferenceChoice} from './day-preferences.mjs?v=2026101305';
import {feedbackContribution,feedbackReason} from './personalization-feedback-state.mjs?v=2026101904';

const keys=['interest_match','time_fit','visited_penalty','weather_fit','partner_boost'];
const object=value=>value!==null && typeof value==='object' && !Array.isArray(value);
export function validRankingConfig(value){
  return !!(object(value) && Object.keys(value).length===2 && value.version===1 && object(value.weights)
    && Object.keys(value.weights).length===keys.length && keys.every(key=>Object.hasOwn(value.weights,key)
      && Number.isFinite(value.weights[key]) && value.weights[key]>=0 && value.weights[key]<=10)
    && value.weights.partner_boost===0);
}

// Route facts come from the canonical catalogue; special showcase facts are
// emitted from its existing source engines, never inferred from visible text.
export function rankingCandidate(binding,catalog){
  if(!object(binding))return null;
  if(binding.route){
    const route=catalog.routes.find(row=>row.slug===binding.route);
    return route?{...route,id:binding.id || route.slug}:null;
  }
  if(!['kosa','fish'].includes(binding.kind) || typeof binding.id!=='string')return null;
  return {id:binding.id,themes:binding.kind==='fish'?['gastro']:['nature'],
    minutes:binding.kind==='fish'?binding.minutes:null,
    stops:binding.kind==='fish' && Array.isArray(binding.places)?binding.places.map(poi=>({poi})):[]};
}

export function rankCandidates(candidates,profile,catalog,config){
  const enabled=validRankingConfig(config),weights=enabled?config.weights:{};
  const explicit=[...new Set(profile.interests || [])].filter(id=>Object.hasOwn(DAY_INTERESTS,id));
  // Activity is a weak interest clue only. It never enters visited_places.
  const weak=[...new Set((profile.interest_signals || []).filter(row=>row.source==='local_activity' && row.strength==='weak').map(row=>row.interest))]
    .filter(id=>Object.hasOwn(DAY_INTERESTS,id));
  const interests=explicit.length?explicit:weak,strength=explicit.length?1:0.25;
  const visited=new Set(profile.visited_places || []),hours=profile.time_budget_hours;
  const budget=[1,2,4,8].includes(hours)?hours*60:null;
  return candidates.map((candidate,index)=>{
    const row={candidate,index,score:0,reasons:[],features:{interest_match:0,time_fit:0,visited_penalty:0,weather_fit:null,partner_boost:0,feedback_fit:0}};
    if(!enabled || !candidate)return row;
    const matched=assessPreferenceChoice(candidate,catalog,{version:1,interests,needs:[]}).matched;
    const places=[...new Set((candidate.stops || []).map(stop=>stop.poi))];
    const seen=places.filter(id=>visited.has(id));
    row.features.interest_match=interests.length?strength*matched.length/interests.length:0;
    row.features.time_fit=budget && Number.isFinite(candidate.minutes) && candidate.minutes>0 && candidate.minutes<=budget?1:0;
    row.features.visited_penalty=places.length?seen.length/places.length:0;
    row.score=weights.interest_match*row.features.interest_match+weights.time_fit*row.features.time_fit-weights.visited_penalty*row.features.visited_penalty;
    const feedback=feedbackContribution(candidate,profile,catalog);
    row.features.feedback_fit=feedback.delta;row.score+=feedback.delta;
    if(weights.interest_match*row.features.interest_match>0)row.reasons.push(`${explicit.length?'В интересах дня':'По активности на сайте'}: ${matched.map(id=>DAY_INTERESTS[id].toLocaleLowerCase('ru')).join(', ')}.`);
    if(weights.time_fit*row.features.time_fit>0)row.reasons.push('Время прогулки укладывается в ваш ответ. Дорога до начала — отдельно.');
    if(weights.visited_penalty*row.features.visited_penalty>0)row.reasons.push('Есть места, которые вы отметили посещёнными.');
    const reason=feedbackReason(feedback);if(reason)row.reasons.push(reason);
    // No compatible route/date weather evidence exists in STEP2. Unknown is
    // neutral even when a future config supplies a nonzero weather weight.
    return row;
  }).sort((a,b)=>b.score-a.score || a.index-b.index);
}
