// Portable choices only. Rust validates every graph, ride and timing rule.
import {validServiceDate} from './service-calendar.mjs?v=1';
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v,names)=>object(v)&&Object.keys(v).every(k=>names.includes(k));
const text=v=>typeof v==='string'&&!!v.trim();
const endpoint=v=>keys(v,['kind','id'])&&['origin','place','service','destination'].includes(v.kind)&&text(v.id);
export const connectionKey=v=>JSON.stringify([v.from.kind,v.from.id,v.to.kind,v.to.id]);
export const transferChoices=day=>Array.isArray(day?.transfer_connections?.choices)?day.transfer_connections.choices:[];
export const hasTransferConnections=day=>Object.hasOwn(day||{},'transfer_connections')&&(!validTransferConnections(day.transfer_connections)||day.transfer_connections.choices.length>0);
export function validTransferChoice(v){
 if(!keys(v,['version','id','name','date','from','to','graph','steps','note','saved_at'])||v.version!==1||!/^connection-[1-9]\d*$/.test(v.id)||!text(v.name)||!validServiceDate(v.date)||!endpoint(v.from)||!endpoint(v.to)||typeof v.note!=='string')return false;
 if(!text(v.saved_at)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v.saved_at)||!validServiceDate(v.saved_at.slice(0,10))||!Number.isFinite(Date.parse(v.saved_at)))return false;
 if(!keys(v.graph,['version','anchors','links'])||v.graph.version!==1||!Array.isArray(v.graph.anchors)||!Array.isArray(v.graph.links)||!Array.isArray(v.steps)||!v.steps.length)return false;
 return v.steps.every(s=>s?.kind==='road'?keys(s,['kind','from','to','mode'])&&text(s.from)&&text(s.to)&&['foot','bike','car'].includes(s.mode):s?.kind==='ride'&&keys(s,['kind','ride'])&&object(s.ride)&&text(s.ride.id));
}
export function validTransferConnections(value){
 if(!keys(value,['version','choices'])||value.version!==1||!Array.isArray(value.choices))return false;
 const ids=new Set(),pairs=new Set(),rides=new Set();
 return value.choices.every(v=>{
  if(!validTransferChoice(v)||ids.has(v.id)||pairs.has(connectionKey(v)))return false;
  ids.add(v.id);pairs.add(connectionKey(v));
  for(const s of v.steps)if(s.kind==='ride'){if(rides.has(s.ride.id))return false;rides.add(s.ride.id);}
  return true;
 });
}
export function transferConnectionImportIssue(trip){
 for(const day of trip?.itinerary?.days||[]){
  if(!Object.hasOwn(day,'transfer_connections'))continue;
  if(Number.isInteger(day.transfer_connections?.version)&&day.transfer_connections.version>1)return 'Дорога в этом файле сохранена в новой версии. Ваш черновик на месте.';
  if(!validTransferConnections(day.transfer_connections))return 'Не удалось прочитать выбранную дорогу. Ваш черновик на месте.';
 }
 return null;
}
