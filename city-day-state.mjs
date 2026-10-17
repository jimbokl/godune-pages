import {resolveVisitCalendar} from './visit-calendar.mjs?v=2026101603';
import {serviceDay} from './service-calendar.mjs?v=2026101305';
import {rideSnapshot,saveRail} from './trip-rail-state.mjs?v=2026101305';
import {selectedDay,validJourneyProjection} from './trip-days-state.mjs?v=2026101707';
import {cityDayConfig,cityRainPlan} from './city-day-config.mjs?v=2026101709';
export const cityDayWeather=day=>{const config=cityDayConfig(day?.source_route);return day?.note?.split('\n').some(line=>line.startsWith(config.rainPrefix))?'rain':'sun';};
export function withCityDayPlan(trip,catalog,selection){
 const next=withCityDayRail(trip,catalog,selection?.outward&&selection?.inbound?selection:null);
 if(!selection?.weather)return next;
 if(!['sun','rain'].includes(selection.weather))throw Error('invalid_city_weather');
 const day=selectedDay(next),config=cityDayConfig(day.source_route),wasRain=cityDayWeather(day)==='rain',rain=cityRainPlan(config,catalog,day.date);
 const result=structuredClone(next),d=selectedDay(result),wet=selection.weather==='rain';
 // Weather presets apply once, on an explicit mode change. Date and train
 // edits keep personal durations and the chosen interior/exterior visit.
 if(config.museum&&wet!==wasRain){
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
 const lines=(day.note||'').split('\n'),generated=wet?cityDayRainNote(d,catalog):null;
 let replaced=false;
 // Replace only the generated line in place; personal text and blank lines stay exact.
 const notes=lines.flatMap(line=>{if(!line.startsWith(config.rainPrefix))return [line];if(!generated||replaced)return [];replaced=true;return [generated];});
 if(generated&&!replaced){if(!day.note)notes.length=0;notes.push(generated);}
 d.note=notes.join('\n');
 if(!validJourneyProjection(result))throw Error('invalid_city_plan_projection');
 return result;
}
export function cityDayRainNote(day,catalog){
 const config=cityDayConfig(day.source_route),museum=catalog.poi.find(p=>p.slug===config.museum),stop=day.schedule?.stops[config.museum];
 const inside=day.places.includes(config.museum)&&stop&&stop.visit_scope!=='outside';
 const visit=stop&&day.places.includes(config.museum)?`${museum?.name||'Музей'} — ${stop.visit} минут ${inside?'внутри':'снаружи'}.`:'Посещение музея в этот день не включено.';
 const walks=Object.keys(config.rainVisits||{}).filter(id=>day.places.includes(id)&&day.schedule.stops[id]).map(id=>`${catalog.poi.find(p=>p.slug===id)?.name||id} — ${day.schedule.stops[id].visit} минут.`).join(' ');
 const calendar=resolveVisitCalendar(museum,day.date),clock=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
 const hours=calendar.windows?.length?`Для выбранной даты: ${calendar.windows.map(w=>`${clock(w.open)}–${clock(w.close)}${w.last_entry==null?'':', последний вход в '+clock(w.last_entry)}`).join('; ')}. Перед выездом проверьте часы у музея.`:calendar.reason==='closed'?`В выбранную дату музей закрыт.${inside?' Выберите другую дату или осмотр снаружи.':''}`:'Часы музея на выбранную дату не подтверждены. Проверьте их у музея перед посещением.';
 return `${config.rainPrefix} ${visit} ${walks} ${hours} Дорога между местами остаётся на улице.`;
}
export function withCityDayRail(trip,catalog,selection){
 const day=selectedDay(trip);let draft=trip;
 // A changed date cannot inherit the previous day's service snapshot.
 if(day.schedule?.rail&&day.schedule.rail.date!==day.date){draft=saveRail(trip,null);selectedDay(draft).schedule=structuredClone(draft.schedule);}
 if(!selection)return draft;const config=cityDayConfig(day.source_route),service=catalog.rail_services?.find(s=>s.id===config.service),table=serviceDay(service,day.date);
 if(table.reason)return draft;
 const outward=table.outward?.find(r=>r.id===selection.outward),inbound=table.inbound?.find(r=>r.id===selection.inbound);if(!outward||!inbound||inbound.departure<=outward.arrival)throw Error('invalid_city_rail');
 const existing=selectedDay(draft).schedule?.rail;
 const sameJourney=existing?.service===service.id&&existing.date===day.date&&existing.outward?.id===outward.id&&existing.inbound?.id===inbound.id;
 const selected={service:service.id,date:day.date,outward:rideSnapshot(outward),inbound:rideSnapshot(inbound)};
 if(sameJourney&&JSON.stringify(existing.outward)===JSON.stringify(selected.outward)&&JSON.stringify(existing.inbound)===JSON.stringify(selected.inbound))return draft;
 // A corrected timetable refreshes source times while keeping personal access.
 const next=saveRail(draft,{...(sameJourney?existing:{after_arrival:0,before_return:0,boarding:15}),...selected});
 selectedDay(next).schedule=structuredClone(next.schedule);if(!validJourneyProjection(next))throw Error('invalid_city_rail_projection');return next;
}
