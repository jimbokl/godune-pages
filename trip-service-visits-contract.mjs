// File envelope only. Rust checks nested rules before a saved choice is used.
import {validServiceProvenance} from './service-provenance.mjs';
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=v=>typeof v==='string'&&!!v.trim();
const keys=(v,allowed)=>object(v)&&Object.keys(v).every(k=>allowed.includes(k));
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!v.startsWith('0000')&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const categories=new Set(['bike_rental','bath','pool','gym','market','workshop','dining','water_activity']);
export const serviceVisitRows=day=>Array.isArray(day?.service_visits)?day.service_visits:[];
export const hasServiceVisits=day=>Object.hasOwn(day||{},'service_visits')&&day.service_visits!==null&&(!Array.isArray(day.service_visits)||day.service_visits.length>0);

export function validServiceVisit(v){
 if(!keys(v,['version','id','name','category','identity','address','point','selection','note','saved_at','provenance'])||v.version!==1||typeof v.id!=='string'||!/^visit-[1-9]\d*$/.test(v.id)||!text(v.name)||!categories.has(v.category)||typeof v.note!=='string')return false;
 if(!keys(v.identity,['place_id','branch_id','service_id','offer_id'])||![v.identity.place_id,v.identity.branch_id,v.identity.service_id].every(text)||!(v.identity.offer_id==null||text(v.identity.offer_id)))return false;
 if(!(v.address==null||typeof v.address==='string')||!text(v.saved_at)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v.saved_at)||!date(v.saved_at.slice(0,10))||!Number.isFinite(Date.parse(v.saved_at)))return false;
 if(v.provenance!=null&&!validServiceProvenance(v.provenance,v.saved_at.slice(0,10),v.identity))return false;
 if(v.point!=null&&(!keys(v.point,['lon','lat','source_id','checked_at'])||!Number.isFinite(v.point.lon)||Math.abs(v.point.lon)>180||!Number.isFinite(v.point.lat)||Math.abs(v.point.lat)>90||!text(v.point.source_id)||!date(v.point.checked_at)))return false;
 const s=v.selection;
 if(!object(s)||s.version!==1||s.service_id!==v.identity.service_id||!text(s.activity_id)||!object(s.visit)||!['manual','directed','rental'].includes(s.visit.kind)||!object(s.visit.input)||s.visit.input.version!==1||!object(s.policy)||s.policy.version!==1||!object(s.participants)||!object(s.limits))return false;
 if(s.visit.kind==='rental'){
  const r=s.visit.input;
  if(r.id!==s.activity_id||r.service_id!==s.service_id||r.offer_id!==v.identity.offer_id||r.pickup?.point?.branch_id!==v.identity.branch_id)return false;
 }
 return [s.price,s.visit.kind==='rental'?s.visit.input.price:null].every(p=>p==null||object(p)&&p.version===1&&p.activity_id===s.activity_id&&p.offer_id===v.identity.offer_id);
}
export function serviceVisitImportIssue(trip){
 for(const day of trip?.itinerary?.days||[]){
  if(!Object.hasOwn(day,'service_visits'))continue;
  if(!Array.isArray(day.service_visits))return 'Не удалось прочитать посещения в этой поездке. Ваш черновик на месте.';
  const ids=new Set();
  for(const visit of day.service_visits){
   if(object(visit)&&Number.isInteger(visit.version)&&visit.version>1)return 'Посещения в этом файле созданы в новой версии. Ваш черновик на месте.';
   if(object(visit?.provenance)&&Number.isInteger(visit.provenance.version)&&visit.provenance.version>1)return 'Сведения об источниках в этом файле созданы в новой версии. Ваш черновик на месте.';
   if(!validServiceVisit(visit)||ids.has(visit.id))return 'Не удалось прочитать посещения в этой поездке. Ваш черновик на месте.';
   ids.add(visit.id);
  }
 }
 return null;
}
export function serviceVisitContext(visit,day){
 if(!validServiceVisit(visit))return 'unsupported';
 if(!day?.date)return 'date_missing';
 return visit.selection.visit.input.date===day.date?'ready':'date_changed';
}
export function copiedServiceVisits(value){
 const rows=structuredClone(value);
 if(Array.isArray(rows))for(const visit of rows)if(validServiceVisit(visit))visit.selection.participants.booking={status:'not_booked',notice_minutes:null};
 return rows;
}
