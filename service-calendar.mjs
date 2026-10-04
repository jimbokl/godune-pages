// One civil-date selector for ride tables and rule-based departures.
// null means unpublished; [] means the publication has no departures that day.
export const validServiceDate=value=>typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !value.startsWith('0000') && Number.isFinite(Date.parse(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
const object=value=>value && typeof value==='object' && !Array.isArray(value);
const fail=()=>{throw Error('Календарь транспорта не прочитан. Проверьте источник расписания.');};
const integers=(values,max)=>Array.isArray(values) && values.length>0 && new Set(values).size===values.length && values.every(n=>Number.isInteger(n)&&n>=1&&n<=max);
const clock=value=>typeof value==='string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const time=value=>clock(value)?Number(value.slice(0,2))*60+Number(value.slice(3)):Number.isInteger(value)&&value>=0&&value<1440?value:null;
const source=value=>{
  if(!object(value)||!validServiceDate(value.checked_at))return false;
  try{if(new URL(value.url).protocol!=='https:')return false;}catch{return false;}
  return value.image_sha256==null||/^[a-f0-9]{64}$/.test(value.image_sha256);
};
function departures(values){
  if(values===null)return null;
  if(!Array.isArray(values)||values.some((v,i)=>!clock(v)||(i>0&&values[i-1]>=v)))fail();
  return [...values];
}
function rides(values,weekday,month,exception){
  if(values===null)return null;
  if(!Array.isArray(values))fail();
  const ids=new Set();let previous=-1;
  for(const row of values){
    if(!object(row)||typeof row.id!=='string'||!row.id||ids.has(row.id))fail();
    ids.add(row.id);const departure=time(row.departure),arrival=time(row.arrival);
    if(departure===null||arrival===null||departure>=arrival||departure<=previous||row.via!=null&&(time(row.via)===null||time(row.via)<=departure||time(row.via)>=arrival))fail();
    if(row.days!==undefined&&!integers(row.days,7)||row.months!==undefined&&!integers(row.months,12))fail();
    previous=departure;
  }
  // An exact-date table replaces the weekly calendar, including closed days.
  return values.filter(row=>exception||(row.days===undefined||row.days.includes(weekday))&&(row.months===undefined||row.months.includes(month))).map(row=>structuredClone(row));
}
function direction(value,weekday,month,exception){
  if(value===null||Array.isArray(value))return rides(value,weekday,month,exception);
  if(!object(value)||!(value.duration===null||Number.isInteger(value.duration)&&value.duration>0&&value.duration<=1440))fail();
  if(exception)return {...structuredClone(value),departures:departures(value.departures)};
  if(!Array.isArray(value.rules))fail();
  const cells=new Set();let chosen=null;
  for(const rule of value.rules){
    if(!object(rule)||!integers(rule.months,12)||!integers(rule.days,7))fail();
    const rows=departures(rule.departures);
    for(const m of rule.months)for(const d of rule.days){const cell=m+':'+d;if(cells.has(cell))fail();cells.add(cell);}
    if(rule.months.includes(month)&&rule.days.includes(weekday))chosen=rows;
  }
  return {...structuredClone(value),departures:chosen};
}
export function validateService(service){
  if(!object(service))fail();
  if(!source(service.source)||!Array.isArray(service.exceptions))fail();
  if(service.valid_from!=null&&!validServiceDate(service.valid_from)||service.valid_until!=null&&!validServiceDate(service.valid_until)||service.valid_from&&service.valid_until&&service.valid_from>service.valid_until)fail();
  if(service.publication_year!=null&&(!Number.isInteger(service.publication_year)||service.publication_year<1||service.publication_year>9999))fail();
  const seen=new Set();
  for(const row of service.exceptions){if(!object(row)||!validServiceDate(row.date)||seen.has(row.date)||!source(row.source))fail();seen.add(row.date);}
  direction(service.outward,1,1,false);direction(service.inbound,1,1,false);
  for(const row of service.exceptions){direction(row.outward,1,1,true);direction(row.inbound,1,1,true);}
  return service;
}
export function serviceDay(service,day){
  if(!service)return {service:null,reason:'missing_service',outward:null,inbound:null};
  validateService(service);
  const result={service,source:service.source,reason:null,exception:false,outward:null,inbound:null};
  if(!validServiceDate(day))return {...result,reason:'choose_date'};
  const exception=service.exceptions.find(row=>row.date===day);
  if(!exception&&service.publication_year!=null&&Number(day.slice(0,4))!==service.publication_year)return {...result,reason:'unpublished_year'};
  if(!exception&&(service.valid_from&&day<service.valid_from||service.valid_until&&day>service.valid_until))return {...result,reason:'outside_validity'};
  const date=new Date(day+'T12:00:00Z'),weekday=date.getUTCDay()||7,month=date.getUTCMonth()+1;
  return {...result,source:exception?.source||service.source,exception:!!exception,
    outward:direction((exception||service).outward,weekday,month,!!exception),
    inbound:direction((exception||service).inbound,weekday,month,!!exception)};
}
