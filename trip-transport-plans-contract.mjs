// Portable calculation snapshots. A saved receipt never asserts that a whole
// Trip day fits, and editing its day never changes the original calculation.
import {validServiceDate} from './service-calendar.mjs?v=1';
import {partyCount} from './trip-party.mjs?v=1';
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v,fields)=>object(v)&&Object.keys(v).every(k=>fields.includes(k));
const text=(v,max=8192)=>typeof v==='string'&&!!v.trim()&&v.length<=max;
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const money=v=>integer(v,0,Number.MAX_SAFE_INTEGER);
const time=v=>v===null||integer(v,0,1439);
const equal=(a,b)=>JSON.stringify(a,(_,v)=>object(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v)===JSON.stringify(b,(_,v)=>object(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const https=v=>{if(!text(v,2048))return false;try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}};
const timestamp=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{3})?Z$/.test(v)&&validServiceDate(v.slice(0,10))&&Number.isFinite(Date.parse(v));
function source(v){
 if(!keys(v,['name','url','checked_at','verification','image_sha256','image_url','note'])||!https(v.url)||!validServiceDate(v.checked_at))return false;
 if(['name','verification','note'].some(k=>v[k]!==undefined&&v[k]!==null&&!text(v[k])))return false;
 return (v.image_url==null||https(v.image_url))&&(v.image_sha256==null||typeof v.image_sha256==='string'&&/^[a-f0-9]{64}$/.test(v.image_sha256));
}
function answers(a,profile){
 return keys(a,['date','ready','boarding','shore','people','exempt','bikes','mode','walks','forest'])&&validServiceDate(a.date)
  &&integer(a.ready,0,1439)&&integer(a.boarding,0,120)&&integer(a.shore,30,720)&&integer(a.people,1,20)
  &&integer(a.exempt,0,a.people)&&integer(a.bikes,1,20)&&integer(a.forest,30,240)&&['one','two'].includes(a.walks)
  &&(profile==='curonian-210'?['foot','car']:['foot','bike','car']).includes(a.mode);
}
function validPrice(p,a,profile){
 if(!keys(p,['currency','known','total','rows'])||p.currency!=='RUB'||!money(p.known)||!(p.total===null||money(p.total))||!Array.isArray(p.rows))return false;
 const expected=profile==='curonian-210'?[['park-person',a.people-a.exempt],[a.mode==='car'?'park-car':'bus-return',a.mode==='car'?1:a.people]]:[['ferry-people',a.people],...(a.mode==='foot'?[]:[[a.mode==='bike'?'ferry-bike':'ferry-car',a.mode==='bike'?a.bikes:1]])];
 if(p.rows.length!==expected.length)return false;
 let known=0;
 for(let i=0;i<p.rows.length;i++){
  const r=p.rows[i],[id,count]=expected[i];
  if(!keys(r,['id','label','count','unit','amount','cost','known','source','valid'])||r.id!==id||r.count!==count||!text(r.label,512)||!text(r.unit,512)||typeof r.valid!=='boolean'||!source(r.source)||!(r.amount===null||integer(r.amount,0,1e12))||!money(r.known)||!(r.cost===null||money(r.cost)))return false;
  if(!r.valid&&r.amount!==null)return false;
  const cost=count===0?0:r.amount===null?null:r.amount*count;
  if(cost!==null&&!money(cost)||r.cost!==cost||r.known!==(cost??0))return false;
  known+=r.known;if(!money(known))return false;
 }
 return p.known===known&&p.total===(p.rows.every(r=>r.cost!==null)?known:null);
}
export function validTransportReceipt(v){
 if(!keys(v,['version','profile','date','answers','state','finish','rows','price','source','title'])||v.version!==1||!['curonian-210','baltic-ferry'].includes(v.profile)||!validServiceDate(v.date)||!answers(v.answers,v.profile)||v.date!==v.answers.date||!text(v.title,512)||!source(v.source)||!validPrice(v.price,v.answers,v.profile)||!Array.isArray(v.rows)||v.rows.length>12)return false;
 const bus=v.profile==='curonian-210',calendar=['outside_validity','unpublished_year'];
 const states=bus?['candidate','no_outward','no_return','unknown_transfer','unavailable','car_price',...calendar]:['needs_check','incomplete','conflict',...calendar];
 if(!states.includes(v.state)||!(v.finish===null||integer(v.finish,0,bus?1439:2879)))return false;
 if(bus&&(v.answers.mode==='car')!==(v.state==='car_price'))return false;
 if(bus&&(v.state==='candidate')!==(v.finish!==null)||!bus&&v.state==='needs_check'&&v.finish===null)return false;
 if(calendar.includes(v.state)&&v.finish!==null||!bus&&['conflict','incomplete'].includes(v.state)&&v.finish!==null)return false;
 const ids=new Set(),transport=[],cost=[];
 for(const r of v.rows){
  if(!keys(r,['id','kind','time','title','text','source'])||!text(r.id,64)||ids.has(r.id)||!text(r.title,512)||typeof r.text!=='string'||r.text.length>8192||!['transport','cost'].includes(r.kind))return false;
  ids.add(r.id);
  if(r.kind==='cost'){if(r.time!==null)return false;cost.push(r);}
  else{
   if(!(r.time===null||integer(r.time,0,!bus&&r.id==='shore'?2879:1439))||!source(r.source)||!equal(r.source,v.source))return false;
   transport.push(r);
  }
 }
 if(cost.length!==v.price.rows.length+1)return false;
 for(let i=0;i<v.price.rows.length;i++){
  const p=v.price.rows[i],r=cost[i];
  const text=`${p.count} × ${p.amount===null?'тариф уточняется':`${p.amount/100} ₽`} · ${p.cost===null?'сумма уточняется':`${p.cost/100} ₽`}`;
  if(r.id!==p.id||r.title!==p.label||r.text!==text||!equal(r.source,p.source))return false;
 }
 const total=cost.at(-1),totalText=v.price.total!==null?`${v.price.total/100} ₽`:v.price.known>0?`Известная часть — ${v.price.known/100} ₽. Остальные тарифы нужно уточнить.`:'Подтверждённые тарифы пока не добавлены.';
 if(total.id!=='price-total'||Object.hasOwn(total,'source')||total.title!==(v.price.total===null?'Полная сумма пока неизвестна':'Итого')||total.text!==totalText)return false;
 const sequence=transport.map(r=>r.id).join(',');
 if(v.state==='car_price'||calendar.includes(v.state))return sequence==='no-table'&&transport[0].time===null;
 if(!bus){
  if(sequence!=='out,shore,back')return false;
  const [out,shore,back]=transport;
  if(out.time!==null&&out.time<v.answers.ready+v.answers.boarding||shore.time!==null&&(out.time===null||shore.time<=out.time)||back.time!==null&&(shore.time===null||back.time<shore.time+v.answers.shore+v.answers.boarding))return false;
  return v.finish===null||back.time!==null&&v.finish>back.time;
 }
 if(!['no-back','out,efa,no-back','out,efa,forest,no-back','out,efa,back','out,efa,back,backup','out,efa,forest,back','out,efa,forest,back,backup'].includes(sequence))return false;
 const by=id=>transport.find(r=>r.id===id),out=by('out'),efa=by('efa'),forest=by('forest'),back=by('back'),backup=by('backup');
 if(transport.some(r=>r.id==='no-back'?r.time!==null:!time(r.time)||r.time===null))return false;
 if(v.state==='candidate'&&!back||v.state!=='candidate'&&back||['no_outward','unavailable'].includes(v.state)&&out||['no_return','unknown_transfer'].includes(v.state)&&!out)return false;
 if(out&&(out.time<v.answers.ready+v.answers.boarding||efa.time<out.time)||forest&&(v.answers.walks!=='two'||forest.time<efa.time+v.answers.shore+v.answers.boarding))return false;
 if(back&&(v.answers.walks==='two'&&!forest||back.time<(forest?forest.time+v.answers.forest:efa.time+v.answers.shore)+v.answers.boarding||v.finish<=back.time))return false;
 return !backup||backup.time>back.time;
}
export function validTransportPlans(day){
 if(!object(day))return false;
 if(!Object.hasOwn(day,'transport_plans'))return true;
 const p=day.transport_plans;
 if(!keys(p,['version','entries'])||p.version!==1||!Array.isArray(p.entries)||p.entries.length>2)return false;
 const ids=new Set();
 return p.entries.every(e=>{if(!keys(e,['id','receipt','saved_at'])||!validTransportReceipt(e.receipt)||e.id!==e.receipt.profile||!timestamp(e.saved_at)||ids.has(e.id))return false;ids.add(e.id);return true;});
}
export const hasTransportPlans=day=>Object.hasOwn(day||{},'transport_plans')&&(!validTransportPlans(day)||day.transport_plans.entries.length>0);
export function copiedTransportPlans(day){
 if(!validTransportPlans(day))throw Error('invalid_transport_plans');
 return Object.hasOwn(day,'transport_plans')?structuredClone(day.transport_plans):undefined;
}
export function transportPlansImportIssue(trip){
 if(!Array.isArray(trip?.itinerary?.days))return null;
 for(const day of trip.itinerary.days){
  if(!object(day)||!Object.hasOwn(day,'transport_plans'))continue;
  const p=day.transport_plans;
  if(p?.version!==1||Array.isArray(p.entries)&&p.entries.some(e=>object(e?.receipt)&&e.receipt.version!==1))return 'Транспортный расчёт сохранён в другой версии. Ваш черновик на месте.';
  if(!validTransportPlans(day))return 'Не удалось прочитать транспортный расчёт. Ваш черновик на месте.';
 }
 return null;
}
export function transportPlanContext(entry,day){
 const sameDate=validTransportReceipt(entry?.receipt)&&entry.receipt.date===day?.date;
 const count=partyCount(day?.party)??(integer(day?.people,1,4294967295)?day.people:null);
 const sameParty=count===null?null:validTransportReceipt(entry?.receipt)&&entry.receipt.answers.people===count;
 return {sameDate,sameParty,needsRecalculation:!sameDate||sameParty!==true};
}
