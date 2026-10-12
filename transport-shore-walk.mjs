// Editorial walking budgets are separate from the operator's transport times.
// Saved walks carry their own text and sources; never refill them from live data.
import {validServiceDate} from './service-calendar.mjs?v=1';
import {railConnectionRows} from './transport-rail-connection.mjs?v=2026101205';
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v,allowed)=>object(v)&&Object.keys(v).every(k=>allowed.includes(k));
const text=(v,max=2048)=>typeof v==='string'&&!!v.trim()&&v.length<=max;
const minutes=v=>Number.isSafeInteger(v)&&v>=1&&v<=720;
const https=v=>{try{const u=new URL(v);return text(v)&&u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}};
const source=v=>keys(v,['name','url','checked_at'])&&text(v.name,512)&&https(v.url)&&validServiceDate(v.checked_at);
const step=(v,template)=>keys(v,['id','title','text','minutes','source','map_url'])&&typeof v.id==='string'&&/^[a-z][a-z0-9-]{0,47}$/.test(v.id)&&text(v.title,160)&&text(v.text)&&source(v.source)&&(v.map_url===undefined||https(v.map_url))&&(minutes(v.minutes)||template&&v.minutes==='remaining');
const steps=(rows,template)=>Array.isArray(rows)&&rows.length>=2&&rows.length<=6&&rows.every(v=>step(v,template))&&new Set(rows.map(v=>v.id)).size===rows.length;
export function validShoreWalkProfile(v){
 if(!keys(v,['version','minimum_minutes','title','short_title','full','short'])||v.version!==1||!Number.isSafeInteger(v.minimum_minutes)||v.minimum_minutes<30||v.minimum_minutes>720||!text(v.title,160)||!text(v.short_title,160))return false;
 return [['full',v.minimum_minutes],['short',30]].every(([key,minimum])=>steps(v[key],true)&&v[key].filter(s=>s.minutes==='remaining').length===1&&v[key].reduce((sum,s)=>sum+(s.minutes==='remaining'?0:s.minutes),0)<minimum);
}
export function buildShoreWalk(p,a,result){
 if(!p.shore_walk||a.mode!=='foot'||!['circular_candidate','needs_check'].includes(result.state))return undefined;
 if(!validShoreWalkProfile(p.shore_walk))throw Error('shore_walk_profile_invalid');
 const v=p.shore_walk,variant=a.shore>=v.minimum_minutes?'full':'short',rows=v[variant],remaining=a.shore-rows.reduce((sum,s)=>sum+(s.minutes==='remaining'?0:s.minutes),0);
 return {version:1,variant,allocation:'editorial-estimate',title:variant==='full'?v.title:v.short_title,minutes:a.shore,steps:rows.map(s=>({...structuredClone(s),minutes:s.minutes==='remaining'?remaining:s.minutes}))};
}
export function validShoreWalk(v,receipt){
 if(receipt.profile!=='baltic-ferry'||receipt.answers.mode!=='foot'||!['circular_candidate','needs_check'].includes(receipt.state))return false;
 return keys(v,['version','variant','allocation','title','minutes','steps'])&&v.version===1&&['full','short'].includes(v.variant)&&v.allocation==='editorial-estimate'&&text(v.title,160)&&v.minutes===receipt.answers.shore&&steps(v.steps,false)&&v.steps.reduce((sum,s)=>sum+s.minutes,0)===v.minutes;
}
export function transportReceiptRows(receipt){
 const rail=railConnectionRows(receipt);
 return [...rail.before,...receipt.rows.flatMap(row=>{
  if(row.id==='back')return [structuredClone(row),...rail.after];
  if(row.id==='backup'&&receipt.rail_connection?.backup_catches_train===false)return [{...structuredClone(row),title:'Запасной паром · поезд уже не подходит',text:`После этого рейса до обратного поезда не успеть. ${row.text}`}];
  if(row.id!=='shore'||!receipt.shore_walk)return [structuredClone(row)];
  return [structuredClone(row),...receipt.shore_walk.steps.map(s=>({id:`shore-walk-${s.id}`,kind:'walk',time:null,timeLabel:`${s.minutes} мин · ориентир на прогулку`,title:s.title,text:s.text,source:structuredClone(s.source)}))];
 }),...(receipt.rows.some(r=>r.id==='back')?[]:rail.after),...rail.cost];
}
