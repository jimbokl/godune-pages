import {validVisitDate} from './visit-calendar.mjs?v=3';
import {serviceDay} from './service-calendar.mjs?v=1';

const minute=n=>Number.isInteger(n) && n>=0 && n<=1440;
const times=rows=>rows===null || Array.isArray(rows) && rows.every((n,i)=>minute(n) && n<1440 && (!i || rows[i-1]<n));
export function validExcursion(value) {
  const keys=['service','date','mode','shore','boarding','approach','return_walk','outward_duration','inbound_duration','outward_departures','inbound_departures'];
  return !!value && typeof value==='object' && !Array.isArray(value) && Object.keys(value).length===keys.length && keys.every(k=>Object.hasOwn(value,k))
    && typeof value.service==='string' && /^[a-z0-9][a-z0-9-]*$/.test(value.service)
    && (value.date===null || validVisitDate(value.date)) && ['foot','bike','car'].includes(value.mode)
    && minute(value.shore) && minute(value.boarding)
    && ['approach','return_walk'].every(k=>value[k]===null || minute(value[k]))
    && ['outward_duration','inbound_duration'].every(k=>value[k]===null || minute(value[k]) && value[k]>0)
    && times(value.outward_departures) && times(value.inbound_departures);
}
export const defaultExcursion = (service,trip) => ({service,date:trip.date ?? null,mode:trip.schedule?.mode || 'foot',shore:120,boarding:10,
  approach:null,return_walk:null,outward_duration:null,inbound_duration:null,outward_departures:null,inbound_departures:null});
const clockMinute=text=>Number(text.slice(0,2))*60+Number(text.slice(3));
export function parseDepartures(text) {
  if(!text.trim())return null;
  if(text.trim().toLowerCase()==='нет')return [];
  const rows=text.trim().split(/[\s,;]+/);
  if(rows.some(t=>!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)))throw Error('Укажите рейсы через пробел, например 10:00 12:00. Если рейсов нет, напишите «нет».');
  return [...new Set(rows.map(clockMinute))].sort((a,b)=>a-b);
}
export const transportOptions = (catalog,id) => (catalog?.transport_services || []).filter(row=>row.attach_to.includes(id));
export function resolveExcursion(trip,id,catalog) {
  const saved=trip.schedule?.stops[id]?.excursion;
  if(!saved)return null;
  const service=transportOptions(catalog,id).find(row=>row.id===saved.service), dated=validVisitDate(trip.date);
  const sameDate=dated && saved.date===trip.date && saved.mode===(trip.schedule?.mode || 'foot');
  const active=sameDate?structuredClone(saved):defaultExcursion(saved.service,trip);
  // Shore duration and the chosen allowance are preferences, not dated observations.
  active.shore=saved.shore;active.boarding=saved.boarding;
  const calendar=serviceDay(service,trip.date);
  const direction=name=>{
    const table=calendar[name],ordinary=table?.departures??null;
    const manual=active[name+'_departures'];
    const duration=active[name+'_duration'] ?? table?.duration ?? null;
    return {departures:manual ?? ordinary?.map(clockMinute) ?? null,duration,boarding:active.boarding,needs_check:true};
  };
  return {service,source:calendar.source||null,dated,sameDate,exception:calendar.exception||false,
    reason:calendar.reason||(!sameDate?'stale_estimates':null),
    input:{approach:active.approach,return_walk:active.return_walk,shore:active.shore,outward:direction('outward'),inbound:direction('inbound')},
    origins:{outward:active.outward_departures!==null?'manual':'source',inbound:active.inbound_departures!==null?'manual':'source'}};
}
