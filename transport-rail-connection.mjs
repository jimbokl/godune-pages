// A dated railway snapshot joins the ferry calculation without changing its
// operator times or inventing a fare. Walking and boarding are personal budgets.
import {serviceDay,validServiceDate} from './service-calendar.mjs?v=2026101305';
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v,list)=>object(v)&&Object.keys(v).length===list.length&&list.every(k=>Object.hasOwn(v,k));
const minute=v=>Number.isSafeInteger(v)&&v>=0&&v<1440;
const time=v=>Number(v.slice(0,2))*60+Number(v.slice(3));
const clock=v=>`${String(Math.floor(v/60)).padStart(2,'0')}:${String(v%60).padStart(2,'0')}`;
const equal=(a,b)=>{const stable=(_,v)=>object(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v;return JSON.stringify(a,stable)===JSON.stringify(b,stable);};
const https=v=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}};
const ride=v=>keys(v,['id','departure','arrival'])&&typeof v.id==='string'&&/^[a-z0-9-]{1,48}$/.test(v.id)&&minute(v.departure)&&minute(v.arrival)&&v.arrival>v.departure;
const rides=v=>v===null||Array.isArray(v)&&v.length<=64&&v.every((r,i)=>ride(r)&&(i===0||v[i-1].departure<r.departure))&&new Set(v.map(r=>r.id)).size===v.length;
const evidence=v=>v===null||keys(v,['name','url','checked_at'])&&typeof v.name==='string'&&v.name.length>0&&v.name.length<=512&&https(v.url)&&validServiceDate(v.checked_at);
const reasons=[null,'missing_service','choose_date','unpublished_year','outside_validity'];
export const hasRailConnection=a=>a.origin==='kaliningrad-rail';
export function validRailConnectionAnswers(a,profile){
 if(a.origin===undefined)return a.station_walk===undefined&&a.rail_boarding===undefined;
 if(['baltiysk','kaliningrad-bus','kaliningrad-car','kaliningrad-bike','kaliningrad-taxi'].includes(a.origin))return profile==='baltic-ferry'&&a.station_walk===undefined&&a.rail_boarding===undefined;
 return hasRailConnection(a)&&profile==='baltic-ferry'&&a.mode==='foot'&&Number.isSafeInteger(a.station_walk)&&a.station_walk>=0&&a.station_walk<=90&&Number.isSafeInteger(a.rail_boarding)&&a.rail_boarding>=0&&a.rail_boarding<=120;
}
function selection(a,table,circular){
 const outward=table.calendar_reason?null:table.outward_table?.find(r=>r.departure>=a.ready+a.rail_boarding)??null;
 const pier_ready=outward?outward.arrival+a.station_walk:null;
 const station_ready=circular?.finish_estimate!=null?circular.finish_estimate+a.station_walk:null;
 const inbound=outward&&station_ready!==null?table.inbound_table?.find(r=>r.departure>=station_ready+a.rail_boarding)??null:null;
 const state=table.calendar_reason||(!outward?'no_outward':circular?.return_cycle==null?'no_ferry':!inbound?'no_return':'connected');
 const backup_catches_train=circular?.backup_cycle!=null?!!table.inbound_table?.some(r=>r.departure>=circular.backup_cycle+circular.round_trip_estimate+a.station_walk+a.rail_boarding):null;
 return {outward,inbound,pier_ready,station_ready,state,backup_catches_train};
}
export function railConnectionTable(a,services){
 const day=serviceDay(services?.services?.find(s=>s.id==='kaliningrad-south-baltiysk'),a.date);
 const source=day.source?{name:day.source.name,url:day.source.url,checked_at:day.source.checked_at}:null;
 const convert=rows=>rows===null?null:rows.map(r=>({id:r.id,departure:time(r.departure),arrival:time(r.arrival)}));
 return {calendar_reason:day.reason,source,outward_table:convert(day.outward),inbound_table:convert(day.inbound)};
}
export const railPierReady=(a,table)=>selection(a,table,null).pier_ready;
export function buildRailConnection(a,table,circular){
 return {version:1,service:'kaliningrad-south-baltiysk',date:a.date,allocation:'personal-estimate',walking_minutes:a.station_walk,boarding:a.rail_boarding,...structuredClone(table),...selection(a,table,circular),fare:{currency:'RUB',total:null}};
}
export function validRailConnection(v,receipt){
 const a=receipt.answers;
 if(!hasRailConnection(a)||!validRailConnectionAnswers(a,receipt.profile)||!keys(v,['version','service','date','allocation','walking_minutes','boarding','calendar_reason','source','outward_table','inbound_table','outward','inbound','pier_ready','station_ready','state','backup_catches_train','fare']))return false;
 if(v.version!==1||v.service!=='kaliningrad-south-baltiysk'||v.date!==a.date||v.allocation!=='personal-estimate'||v.walking_minutes!==a.station_walk||v.boarding!==a.rail_boarding||!reasons.includes(v.calendar_reason)||!evidence(v.source)||!rides(v.outward_table)||!rides(v.inbound_table)||!keys(v.fare,['currency','total'])||v.fare.currency!=='RUB'||v.fare.total!==null)return false;
 if(v.calendar_reason===null&&v.source===null||v.calendar_reason!==null&&(v.outward_table!==null||v.inbound_table!==null))return false;
 const expected=selection(a,v,receipt.circular);
 if(!Object.entries(expected).every(([k,value])=>equal(v[k],value)))return false;
 const c=receipt.circular;
 return c?.outbound_cycle==null||v.pier_ready!==null&&c.outbound_cycle>=v.pier_ready+c.boarding;
}
export function railConnectionStatus(receipt){
 const r=receipt.rail_connection;if(!r)return null;
 if(r.state==='connected')return `Поезд и паром подобраны. Прибытие поезда на Южный — ${clock(r.inbound.arrival)}.`;
 return ({no_outward:'Поезд из Калининграда уже не подходит. Начните раньше или выберите другую дату.',no_ferry:'После поезда не складывается прогулка с обратным паромом. Измените время на косе или дату.',no_return:'После парома на обратный поезд не успеть. Сократите прогулку или измените запасы времени.',unpublished_year:'Расписание поездов на этот год пока не добавлено.',outside_validity:'Опубликованное расписание поездов не действует на эту дату.',missing_service:'Расписание поездов пока не добавлено.',choose_date:'Выберите дату поездки.'})[r.state];
}
export function railConnectionRows(receipt){
 const r=receipt.rail_connection;if(!r)return {before:[],after:[],cost:[]};
 const before=[],after=[],row=(id,time,title,text,personal=false)=>({id,kind:'transport',time,title,text,...(!personal&&r.source?{source:structuredClone(r.source)}:{})});
 if(r.outward){
  before.push(row('rail-out',r.outward.departure,'Поезд · Калининград-Южный → Балтийск',`У поезда — к ${clock(r.outward.departure-r.boarding)}. Прибытие в Балтийск — ${clock(r.outward.arrival)}.`));
  before.push(row('rail-to-pier',r.outward.arrival,'От вокзала к парому',`Вы заложили ${r.walking_minutes} мин пешком до Морского бульвара, 2Б. У причала — около ${clock(r.pier_ready)}.`,true));
 }else before.push(row('rail-no-out',null,'Поезд из Калининграда не подобран',railConnectionStatus(receipt)));
 if(r.station_ready!==null)after.push(row('rail-to-station',receipt.circular.finish_estimate,'От парома к вокзалу',`Вы заложили ${r.walking_minutes} мин пешком. На вокзале — около ${clock(r.station_ready)}; ещё ${r.boarding} мин перед поездом.`,true));
 if(r.inbound)after.push(row('rail-back',r.inbound.departure,'Поезд · Балтийск → Калининград-Южный',`Прибытие в Калининград-Южный — ${clock(r.inbound.arrival)}.`));
 else after.push(row('rail-no-back',null,'Обратный поезд не подобран',railConnectionStatus(receipt)));
 return {before,after,cost:[{id:'rail-fare',kind:'cost',time:null,title:'Билеты на поезд туда и обратно',text:'Цена не добавлена в расчёт. Уточните тариф КППК перед поездкой.',...(r.source?{source:structuredClone(r.source)}:{})}]};
}
