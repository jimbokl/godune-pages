// Road legs use the traveller's times. They never masquerade as operator data.
import {validServiceDate} from './service-calendar.mjs?v=1';
export const roadOrigins={
 'kaliningrad-bus':{label:'Автобус',phrase:'автобусом',leg:'Автобус № 107',cost:'билеты на автобус'},
 'kaliningrad-car':{label:'Машина',phrase:'на машине',leg:'На машине',cost:'топливо и парковка'},
 'kaliningrad-bike':{label:'Велосипед',phrase:'на велосипеде',leg:'На велосипеде',cost:'расходы на велодорогу'},
 'kaliningrad-taxi':{label:'Такси',phrase:'на такси',leg:'Такси',cost:'такси туда и обратно'}
};
export const hasRoadConnection=a=>Object.hasOwn(roadOrigins,a?.origin||'');
const fields=['road_minutes','road_return_minutes','road_transfer','road_return_at'];
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const clock=n=>`${String(Math.floor(n/60)%24).padStart(2,'0')}:${String(n%60).padStart(2,'0')}${n>=1440?' (следующий день)':''}`;
const stable=(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v;
export function validRoadConnectionAnswers(a,profile){
 if(!hasRoadConnection(a))return fields.every(k=>a[k]===undefined);
 return profile==='baltic-ferry'&&integer(a.road_minutes,1,600)&&integer(a.road_return_minutes,1,600)&&integer(a.road_transfer,0,120)
  &&(a.origin==='kaliningrad-bus'?integer(a.road_return_at,0,1439):a.road_return_at===undefined);
}
export const roadPierReady=a=>a.ready+a.road_minutes+a.road_transfer;
export function buildRoadConnection(a,c){
 const arrival=a.ready+a.road_minutes,pier_ready=roadPierReady(a),return_ready=c?.finish_estimate==null?null:c.finish_estimate+a.road_transfer;
 const return_departure=a.origin==='kaliningrad-bus'?(return_ready!==null&&a.road_return_at>=return_ready?a.road_return_at:null):return_ready;
 const state=return_ready===null?'no_ferry':return_departure===null?'missed_return':'connected';
 const backup_catches_return=a.origin==='kaliningrad-bus'&&c?.backup_cycle!=null?c.backup_cycle+c.round_trip_estimate+a.road_transfer<=a.road_return_at:null;
 return {version:1,origin:a.origin,allocation:'personal-estimate',departure:a.ready,arrival,pier_ready,transfer_minutes:a.road_transfer,
  outward_minutes:a.road_minutes,return_minutes:a.road_return_minutes,return_ready,return_departure,
  return_arrival:return_departure===null?null:return_departure+a.road_return_minutes,state,backup_catches_return,
  source:a.origin==='kaliningrad-bus'?{name:'Регио-экспресс · маршрут № 107',url:'https://regio-express.ru/marshruty/107-kaliningrad-baltijsk',checked_at:'2026-10-12',verification:'Маршрут подтверждён перевозчиком. Время отправления, дорога и пересадка в этом расчёте заданы путешественником.'}:null};
}
export function validRoadConnection(r,receipt){
 if(!validRoadConnectionAnswers(receipt.answers,receipt.profile)||!hasRoadConnection(receipt.answers))return false;
 const expected=buildRoadConnection(receipt.answers,receipt.circular),c=receipt.circular;
 // Source metadata travels with the receipt and may outlive today's source date.
 if(receipt.answers.origin==='kaliningrad-bus'){
  const s=r?.source;
  if(!s||Object.keys(s).sort().join(',')!=='checked_at,name,url,verification'||s.url!=='https://regio-express.ru/marshruty/107-kaliningrad-baltijsk'||!validServiceDate(s.checked_at)||!['name','verification'].every(k=>typeof s[k]==='string'&&s[k].trim()&&s[k].length<=2048))return false;
  expected.source=s;
 }
 return JSON.stringify(r,stable)===JSON.stringify(expected,stable)&&(c?.outbound_cycle==null||c.outbound_cycle>=r.pier_ready+c.boarding);
}
export function roadConnectionStatus(receipt){
 const r=receipt.road_connection;if(!r)return null;
 if(receipt.state==='unpublished_year')return 'Расписание парома на этот год пока не добавлено. Выберите дату в опубликованном периоде.';
 if(receipt.state==='outside_validity')return 'На выбранную дату таблица парома не действует. Выберите другую дату.';
 if(r.state==='connected')return `По вашему плану, в Калининграде — около ${clock(r.return_arrival)}. Время дороги и пересадок можно изменить.`;
 return r.state==='missed_return'?'К выбранному обратному автобусу не успеть. Выберите более позднее отправление или сократите прогулку.':'С выбранным временем дороги паром и прогулка не складываются. Начните раньше или сократите прогулку.';
}
export function roadConnectionRows(receipt){
 const r=receipt.road_connection;if(!r)return {before:[],after:[],cost:[]};
 const mode=roadOrigins[r.origin],row=(id,time,title,text)=>({id,kind:'transport',time,title,text,...(r.source?{source:structuredClone(r.source)}:{})});
 const before=[row('road-out',r.departure,`${mode.leg} · Калининград → Балтийск`,`Ваш план: выезд ${clock(r.departure)}, дорога ${r.outward_minutes} мин, прибытие около ${clock(r.arrival)}. Ещё ${r.transfer_minutes} мин до парома; у причала около ${clock(r.pier_ready)}.`)];
 const after=[row('road-back',r.return_departure,`${mode.leg} · Балтийск → Калининград`,r.state==='connected'?`После парома заложено ${r.transfer_minutes} мин до обратной дороги. Выезд ${clock(r.return_departure)}; ${r.return_minutes} мин в пути. Калининград около ${clock(r.return_arrival)}. Время задано вами.`:roadConnectionStatus(receipt))];
 return {before,after,cost:[{id:'road-fare',kind:'cost',time:null,title:mode.cost[0].toUpperCase()+mode.cost.slice(1),text:'В сумму за паром не входят. Учитывайте отдельно в бюджете дня.'}]};
}
