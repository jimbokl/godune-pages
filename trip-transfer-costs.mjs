import {effectiveBookingDay} from './trip-bookings-state.mjs?v=2';
// A price belongs to the saved directed journey, never to an inferred tariff.
import {isPersonalPoint} from './personal-points.mjs?v=3';
import {sameArrival,TRAVEL_MODES} from './travel-estimates.mjs?v=6';
const object=value=>!!value && typeof value==='object' && !Array.isArray(value);
const keys=(value,list)=>Object.keys(value).every(key=>list.includes(key));
const text=value=>typeof value==='string' && !!value.trim();
const position=value=>Number.isFinite(value.lon) && Math.abs(value.lon)<=180 && Number.isFinite(value.lat) && Math.abs(value.lat)<=90;
const date=value=>value===null || typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !value.startsWith('0000') && Number.isFinite(Date.parse(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
const arrival=value=>value===null || object(value) && keys(value,['id','lon','lat']) && text(value.id) && position(value);
export function validTransferPoint(value) {
  return isPersonalPoint(value) || object(value) && keys(value,['kind','id','name','lon','lat','arrival']) && value.kind==='catalog' && text(value.id) && text(value.name) && position(value) && arrival(value.arrival);
}
export function validTransfer(value) {
  return object(value) && keys(value,['version','role','date','mode','leg_mode','from','to']) && value.version===1 && ['start','between','return','departure'].includes(value.role) && date(value.date) && Object.hasOwn(TRAVEL_MODES,value.mode) && Object.hasOwn(TRAVEL_MODES,value.leg_mode) && (value.leg_mode===value.mode || value.leg_mode==='foot') && validTransferPoint(value.from) && validTransferPoint(value.to);
}
const point=(base,mode,catalog)=>{
  if(isPersonalPoint(base))return structuredClone(base);
  const poi=catalog.poi.find(p=>p.slug===base);if(!poi)return null;
  const gate=poi.arrival_points?.[mode];
  const result={kind:'catalog',id:poi.slug,name:poi.name,lon:poi.lon,lat:poi.lat,arrival:gate?{id:gate.id,lon:gate.lon,lat:gate.lat}:null};
  return validTransferPoint(result)?result:null;
};
export function dayTransfers(day,catalog) {
  day=effectiveBookingDay(day);
  const mode=day.schedule?.mode || 'foot',stops=day.places,result=[];
  const add=(from,to,role)=>{
    const a=point(from,mode,catalog),b=point(to,mode,catalog);if(!a || !b)return;
    const leg_mode=typeof from==='string' && typeof to==='string' && sameArrival(catalog,from,to,mode)?'foot':mode;
    result.push({version:1,role,date:day.date,mode,leg_mode,from:a,to:b});
  };
  if(stops.length && day.start_at)add(day.start_at,stops[0],'start');
  for(let i=1;i<stops.length;i++)add(stops[i-1],stops[i],'between');
  if(stops.length && day.night_at)add(stops.at(-1),day.night_at,'return');
  if(stops.length && day.end_at)add(day.night_at||stops.at(-1),day.end_at,'departure');
  return result;
}
const identity=point=>point.kind==='personal'?['personal',point.lon,point.lat]:['catalog',point.id,point.lon,point.lat,point.arrival===null?null:[point.arrival.id,point.arrival.lon,point.arrival.lat]];
const direction=transfer=>JSON.stringify([transfer.role,identity(transfer.from),identity(transfer.to)]);
export const transferKey=transfer=>JSON.stringify([transfer.date,transfer.mode,transfer.leg_mode,direction(transfer)]);
export const transferContext=(day,catalog)=>JSON.stringify([day.date,day.schedule?.mode || 'foot',day.places,day.start_at,day.night_at,dayTransfers(day,catalog)]);
export const transferTitle=transfer=>`${transfer.from.name} → ${transfer.to.name}`;
export const transferRole=transfer=>({start:'От начала дня',between:'Между остановками',return:'К ночёвке',departure:'К вылету / отъезду'})[transfer.role];
export function transferStatus(saved,day,catalog) {
  const current=dayTransfers(day,catalog),mode=day.schedule?.mode || 'foot';
  if(current.some(row=>transferKey(row)===transferKey(saved)))return {current:true,reason:'Этот переезд в плане дня.'};
  if(saved.date!==day.date)return {current:false,reason:'Дата дня изменилась. Проверьте цену на новую дату.'};
  if(saved.mode!==mode)return {current:false,reason:'Способ передвижения изменился. Проверьте расход.'};
  const sameIds=(a,b)=>a.kind===b.kind && (a.kind==='personal'?a.lon===b.lon && a.lat===b.lat:a.id===b.id);
  if(current.some(row=>row.role===saved.role && sameIds(row.from,saved.from) && sameIds(row.to,saved.to)))return {current:false,reason:'Точка или подход изменились. Проверьте прежний переезд.'};
  return {current:false,reason:'Этого переезда больше нет в плане дня. Сумма сохранена.'};
}
