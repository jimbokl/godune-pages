// Physical trip boundaries reuse the existing local bases and dated bookings.
import {bookingEffects} from './trip-bookings-state.mjs?v=3';
import {baseName,isPersonalPoint} from './personal-points.mjs?v=3';
export function boundaryAnchor(value,id,catalog,date){
 const poi=typeof value==='string'?catalog.poi.find(p=>p.slug===value):null;
 if(!poi&&!isPersonalPoint(value))return null;
 return {id,name:baseName(value,catalog),kind:'landmark',revision:poi?`catalog:${poi.slug}:${poi.lat},${poi.lon}`:`point:${value.lat},${value.lon}`,
  location:poi?{kind:'catalog',reference_kind:'poi',id:poi.slug}:{kind:'point',lat:value.lat,lon:value.lon},
  source:poi?null:{reference:`Ваша точка в плане на ${date}`,checked_at:date,valid_from:null,valid_until:null}};
}
export function dayJourneyBoundaries(day,catalog){
 const bookings=bookingEffects({itinerary:{active:day.id,days:[day]}});
 const start=bookings.start?.location||day.start_at,night=bookings.night?.location||day.night_at,end=bookings.end?.location;
 // Check-in is an actual opening-time constraint; retain it as a checkpoint.
 const checkpoint=night&&(end||bookings.night?.time!=null)?{kind:'place',id:'__day_night'}:null;
 const origin=start?{kind:'origin',id:'__day_start'}:null,destination=end||night&&!checkpoint?{kind:'destination',id:'__day_finish'}:null;
 const rows=[origin&&{entry:origin,value:start,anchor:boundaryAnchor(start,origin.id,catalog,day.date)},checkpoint&&{entry:checkpoint,value:night,anchor:boundaryAnchor(night,checkpoint.id,catalog,day.date)},destination&&{entry:destination,value:end||night,anchor:boundaryAnchor(end||night,destination.id,catalog,day.date)}].filter(Boolean);
 return {origin,checkpoint,destination,rows,bookings,configured:!!(start||night||end)};
}
export const boundaryForEntry=(boundaries,entry)=>boundaries.rows.find(row=>row.entry.kind===entry?.kind&&row.entry.id===entry?.id);

// Generated and legacy vehicle days retain their own physical access anchors.
export const canConfigureJourneyBoundaries=day=>!day.kosa_plan&&!day.schedule?.rail&&!day.schedule?.base_transport&&(!day.schedule?.mode||day.schedule.mode==='foot');
// Reading existing vehicle bases does not require rewriting them as foot bases.
export const usesJourneyBoundaries=(day,catalog)=>!day.kosa_plan&&!day.schedule?.rail&&dayJourneyBoundaries(day,catalog).configured;
