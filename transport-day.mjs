import {serviceDay,validServiceDate} from './service-calendar.mjs?v=1';

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
  return input;
}
