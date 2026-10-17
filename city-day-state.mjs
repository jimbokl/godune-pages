import {serviceDay} from './service-calendar.mjs?v=2026101305';
import {rideSnapshot,saveRail} from './trip-rail-state.mjs?v=2026101305';
import {selectedDay,validJourneyProjection,changeDayDetails} from './trip-days-state.mjs?v=2026101707';
import {cityDayConfig,cityRainPlan} from './city-day-config.mjs?v=2026101703';
export const cityDayWeather=day=>{const config=cityDayConfig(day?.source_route);return day?.note?.split('\n').some(line=>line.startsWith(config.rainPrefix))?'rain':'sun';};
export function withCityDayPlan(trip,catalog,selection){
 const next=withCityDayRail(trip,catalog,selection?.outward&&selection?.inbound?selection:null);
 if(!selection?.weather)return next;
 if(!['sun','rain'].includes(selection.weather))throw Error('invalid_city_weather');
 const day=selectedDay(next),config=cityDayConfig(day.source_route),wasRain=cityDayWeather(day)==='rain',rain=cityRainPlan(config,catalog,day.date);
 const notes=(day.note||'').split('\n').filter(line=>!line.startsWith(config.rainPrefix));
 if(selection.weather==='rain')notes.push(rain.note);
 const result=changeDayDetails(next,{note:notes.filter(Boolean).join('\n')});
 if(config.museum&&(selection.weather==='rain'||wasRain)){
  const d=selectedDay(result),wet=selection.weather==='rain';
  const route=catalog.routes.find(row=>row.slug===d.source_route),original=id=>route?.stops.find(row=>row.poi===id);
  for(const [id,minutes] of Object.entries(config.rainVisits||{})){
   const stop=d.schedule.stops[id];if(stop)stop.visit=wet?minutes:original(id)?.visit_minutes??30;
  }
  const stop=d.schedule.stops[config.museum];if(stop){
   stop.visit=wet&&rain.open?config.rainMuseumMinutes:original(config.museum)?.visit_minutes??10;
   if(wet&&rain.open)delete stop.visit_scope;else if(original(config.museum)?.visit_scope)stop.visit_scope=original(config.museum).visit_scope;else delete stop.visit_scope;
  }
  result.schedule=structuredClone(d.schedule);
 }
 if(!validJourneyProjection(result))throw Error('invalid_city_plan_projection');
 return result;
}
export function withCityDayRail(trip,catalog,selection){
 if(!selection)return trip;const day=selectedDay(trip),config=cityDayConfig(day.source_route),service=catalog.rail_services?.find(s=>s.id===config.service),table=serviceDay(service,day.date);
 if(table.reason)return trip;
 const outward=table.outward?.find(r=>r.id===selection.outward),inbound=table.inbound?.find(r=>r.id===selection.inbound);if(!outward||!inbound||inbound.departure<=outward.arrival)throw Error('invalid_city_rail');
 const next=saveRail(trip,{service:service.id,date:day.date,outward:rideSnapshot(outward),inbound:rideSnapshot(inbound),after_arrival:0,before_return:0,boarding:15});
 selectedDay(next).schedule=structuredClone(next.schedule);if(!validJourneyProjection(next))throw Error('invalid_city_rail_projection');return next;
}
