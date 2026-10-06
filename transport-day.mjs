import {serviceDay,validServiceDate} from './service-calendar.mjs?v=1';
import {transitHomeInput} from './transport-home.mjs?v=1';

// Legacy bus publications are adapted at the boundary, not inside the calendar.
export function transitTable(publication,day){
  const source={url:publication.source_url,checked_at:publication.checked_at,image_sha256:publication.image_sha256,image_url:publication.image_url,note:publication.note};
  const service={valid_from:publication.valid_from,valid_until:publication.valid_until,
    publication_year:publication.publication_year??(publication.valid_until?null:Number(publication.valid_from?.slice(0,4))),source,
    outward:publication.outward,inbound:publication.inward,
    exceptions:(publication.exceptions||[]).map(row=>({...row,inbound:row.inward}))};
  const selected=serviceDay(service,day);
  return {...selected,publication:{...publication,...(selected.exception?{
    valid_from:day,valid_until:day,checked_at:selected.source.checked_at,source_url:selected.source.url,
    image_sha256:selected.source.image_sha256||null,image_url:selected.source.image_url||null,note:selected.source.note||'Изменение расписания на выбранную дату.',
  }:{}),publication_year:selected.exception?Number(day.slice(0,4)):service.publication_year,outward:selected.reason?publication.outward:selected.outward,inward:selected.reason?publication.inward:selected.inbound}};
}
const minutes=value=>typeof value==='string'?Number(value.slice(0,2))*60+Number(value.slice(3)):value;
const nativeRides=rows=>(rows??[]).map(row=>({id:row.id,departure:minutes(row.departure),arrival:minutes(row.arrival),via:row.via==null?null:minutes(row.via)}));
export function datedTransitInput(preferences,publication,locations=null){
  if(!validServiceDate(preferences.date))throw Error('Выберите дату поездки.');
  const selected=transitTable(publication,preferences.date),table=selected.publication;
  const input={version:1,date:preferences.date,valid_from:table.valid_from,valid_until:table.valid_until,checked_at:table.checked_at,publication_year:table.publication_year,
    ready_at:preferences.ready,boarding:preferences.boarding,first_visit:preferences.first_visit,second_visit:preferences.second_visit??null,
    outward:nativeRides(table.outward),inward:nativeRides(table.inward)};
  if(!selected.reason&&(table.outward===null||table.inward===null))input.timetable_known=false;
  if(locations?.first)input.visit_light=locations;
  const home=transitHomeInput(preferences);if(home)input.home=home;
  return input;
}

// Constrain a dated publication to explicitly selected rides. Keep later buses
// as backups, but never invent a stop time or substitute a changed service.
export function pinTransitSelection(input,busSnapshot,railSnapshot=null){
  const equal=(a,b)=>a && b && ['id','departure','arrival','via'].every(key=>a[key]===b[key]);
  const find=(rows,ride)=>{const found=rows.find(row=>equal(row,ride));if(!found)throw Error('transport_selection_changed');return found;};
  let bus,rail;
  try {bus=JSON.parse(busSnapshot);rail=railSnapshot===null?null:JSON.parse(railSnapshot);}catch {throw Error('transport_selection_changed');}
  if(!Array.isArray(bus)||bus.length!==3||!bus[0]||!bus[2]||!!bus[1]!==!!input.second_visit)throw Error('transport_selection_changed');
  const next=structuredClone(input),out=find(input.outward,bus[0]),back=find(input.inward,bus[2]);
  const transfer=bus[1]?find(input.inward,bus[1]):null;
  if(transfer && transfer.departure>=back.departure)throw Error('transport_selection_changed');
  next.outward=[out];
  next.inward=input.inward.filter(row=>equal(row,transfer)||equal(row,back)||row.departure>back.departure);
  if(input.rail){
    if(!Array.isArray(rail)||rail.length!==2)throw Error('transport_selection_changed');
    next.rail.outward=[find(input.rail.outward,rail[0])];
    const homeTrain=find(input.rail.inward,rail[1]);
    next.rail.inward=input.home?input.rail.inward.filter(row=>equal(row,homeTrain)||row.departure>homeTrain.departure):[homeTrain];
  }else if(rail!==null)throw Error('transport_selection_changed');
  return next;
}
