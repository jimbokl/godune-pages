import {saveRouteDay,routeDayTarget} from './route-day.mjs?v=2026101602';
import {withCityDayPlan,cityDayWeather} from './city-day-state.mjs?v=2026101703';
import {chooseTripDay} from './trip-days-state.mjs?v=2026101305';
import {planInput} from './trip-schedule-state.mjs?v=2026101305';
import {resolvePair} from './travel-estimates.mjs?v=2026101305';

// A read-only proposal uses the exact same Trip construction as explicit save.
export function cityDayPreview(trip,route,catalog,settings,selection){
 const target=routeDayTarget(trip,route,settings.id),day=target?.day,rail=day?.schedule?.rail;
 const minute=Number(settings.time.slice(0,2))*60+Number(settings.time.slice(3));
 const unchanged=day&&day.date===settings.date&&day.schedule?.start===minute&&cityDayWeather(day)===selection.weather
  &&(!selection.outward||rail?.outward?.id===selection.outward)&&(!selection.inbound||rail?.inbound?.id===selection.inbound);
 if(unchanged)return chooseTripDay(structuredClone(trip),day.id);
 return withCityDayPlan(saveRouteDay(trip,route,catalog,{...settings,edit:true}),catalog,selection);
}
// Rust owns waiting, calendars, pauses, reserves, rail constraints and all times.
export function cityTimeline(calculate,trip,catalog,matrix){
 const input=planInput(trip,catalog,matrix),result=calculate(input),rows=trip.places.map((id,i)=>{
  const stop=result.stops.find(r=>r.id===id),to=trip.places[i+1]||input.stops.at(-1)?.id==='__day_night'&&trip.itinerary?.days.find(d=>d.id===trip.itinerary.active)?.night_at;
  const travel=to?resolvePair(trip,id,to,catalog,matrix):null;
  return {id,minute:stop.begins,leaves:stop.leaves,visit:stop.visit_minutes,pause:trip.schedule.stops[id]?.pause||0,wait:stop.wait,walk:travel?.minutes??null,meters:travel?.distance_m??null,to,reserve:trip.schedule.reserve};
 });
 return {input,result,rows,returnAt:result.stops.find(r=>r.id==='__day_night')?.begins??result.finish};
}
