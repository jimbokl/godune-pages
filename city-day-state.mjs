import {serviceDay} from './service-calendar.mjs?v=2026101305';
import {rideSnapshot,saveRail} from './trip-rail-state.mjs?v=2026101305';
import {selectedDay,validJourneyProjection,changeDayDetails} from './trip-days-state.mjs?v=2026101305';
const rainyNote='План на дождь: сократить променад, вместо части времени у моря зайти в Мурариум (10:00–19:00, вход до 18:30, полный билет 500 ₽), затем пообедать в «Телеграфе». Дорога между местами остаётся на улице.';
export const cityDayWeather=day=>day?.note?.split('\n').includes(rainyNote)?'rain':'sun';
export function withCityDayPlan(trip,catalog,selection){
 const next=withCityDayRail(trip,catalog,selection?.outward&&selection?.inbound?selection:null);
 if(!selection?.weather)return next;
 if(!['sun','rain'].includes(selection.weather))throw Error('invalid_city_weather');
 const notes=(selectedDay(next).note||'').split('\n').filter(line=>line!==rainyNote);
 if(selection.weather==='rain')notes.push(rainyNote);
 return changeDayDetails(next,{note:notes.filter(Boolean).join('\n')});
}
export function withCityDayRail(trip,catalog,selection){
 if(!selection)return trip;const day=selectedDay(trip),service=catalog.rail_services?.find(s=>s.id==='kaliningrad-south-zelenogradsk'),table=serviceDay(service,day.date);
 if(table.reason)return trip;
 const outward=table.outward?.find(r=>r.id===selection.outward),inbound=table.inbound?.find(r=>r.id===selection.inbound);if(!outward||!inbound||inbound.departure<=outward.arrival)throw Error('invalid_city_rail');
 const next=saveRail(trip,{service:service.id,date:day.date,outward:rideSnapshot(outward),inbound:rideSnapshot(inbound),after_arrival:0,before_return:0,boarding:15});
 selectedDay(next).schedule=structuredClone(next.schedule);if(!validJourneyProjection(next))throw Error('invalid_city_rail_projection');return next;
}
