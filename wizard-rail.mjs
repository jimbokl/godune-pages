// Dated rail choices for the shared wizard. Suggestions only become a saved
// timetable after the traveller previews and explicitly applies the plan.
import {waveChoices} from './day-wave.mjs?v=2';
import {nextDate} from './trip-days-state.mjs?v=24';
import {tripStarterChoices} from './trip-starters.mjs?v=24';
import {railTable,rideSnapshot,validRail,resolveRail} from './trip-rail-state.mjs?v=6';
import {railStation} from './rail-destinations.mjs?v=1';
import {planInput} from './trip-schedule-state.mjs?v=17';
const clone=value=>structuredClone(value);
const stable=value=>JSON.stringify(value,(_,row)=>row && typeof row==='object' && !Array.isArray(row)?Object.fromEntries(Object.keys(row).sort().map(k=>[k,row[k]])):row);
export function wizardRailTargets(catalog,answers) {
  const route=waveChoices(catalog,catalog.routes.filter(row=>row.mode==='walking'),answers.wave?.theme || 'mixed').find(row=>row.slug===answers.route && row.area===answers.area);
  const templates=answers.area==='whole-trip'?tripStarterChoices(catalog).find(row=>row.id===answers.starter)?.days || []:route?[{places:route.stops.map(row=>row.poi)}]:[];
  let date=answers.date;
  return templates.flatMap((template,index)=>{
    const today=date;date=nextDate(date);
    if((answers.transport===undefined || answers.transport==='auto') && template.transport!=='rail')return [];
    const areas=new Set(template.places.map(id=>catalog.poi.find(p=>p.slug===id)?.area).filter(Boolean));
    const services=(catalog.rail_services || []).filter(service=>{const {station}=railStation(service,catalog);return station && areas.size===1 && areas.has(station.area);});
    return services.length?[{index,date:today,services}]:[];
  });
}
export function wizardRailActive(catalog,answers) {
  return answers.transport==='rail' || ((answers.transport===undefined || answers.transport==='auto')
    && answers.area==='whole-trip' && !!tripStarterChoices(catalog).find(row=>row.id===answers.starter)?.days.some(day=>day.transport==='rail'));
}
export function wizardRailChoice(catalog,answers,target) {
  const previous=answers.rail_days?.find(row=>row.day_index===target.index)?.rail;
  const service=target.services.find(row=>row.id===previous?.service) || target.services.find(row=>Array.isArray(row.outward)&&Array.isArray(row.inbound)) || target.services[0];
  const table=railTable(catalog,service.id,target.date),station=service.arrival_poi,home=answers.base || null;
  const sameAccess=previous?.service===service.id && previous?.access?.station===station && stable(previous.access.start_at)===stable(home) && stable(previous.access.return_at)===stable(home);
  const access={version:1,station,start_at:clone(home),return_at:clone(home),to_station:sameAccess?previous.access.to_station:null,from_station:sameAccess?previous.access.from_station:null};
  if(sameAccess&&previous.access.road)access.road=clone(previous.access.road);
  const boarding=previous&&Object.hasOwn(previous,'boarding')?previous.boarding:10;
  const selected=(direction)=>{
    const rows=table[direction] || [];
    if(previous?.date===target.date && previous.service===service.id){const pinned=rows.find(row=>stable(rideSnapshot(row))===stable(previous[direction]));if(pinned)return rideSnapshot(pinned);}
    const suggested=direction==='outward'?rows.find(row=>rideSnapshot(row).departure>=answers.start+(access.to_station ?? 0)+boarding):[...rows].reverse().find(row=>rideSnapshot(row).arrival+(access.from_station ?? 0)<=answers.end);
    return suggested?rideSnapshot(suggested):rows.length?rideSnapshot(direction==='outward'?rows[0]:rows.at(-1)):null;
  };
  const rail={service:service.id,date:target.date,outward:selected('outward'),inbound:selected('inbound'),after_arrival:0,before_return:0,boarding,access};
  return {target,table,rail,available:!table.reason && !!table.outward?.length && !!table.inbound?.length};
}
export function attachWizardRail(day,catalog,answers,index,target) {
  const rail=answers.rail_days?.find(row=>row.day_index===index)?.rail;
  if(!target || !validRail(rail) || !rail.access || rail.date!==day.date || !target.services.some(row=>row.id===rail.service))throw Error('wizard_rail_unavailable');
  if(stable(rail.access.start_at)!==stable(day.start_at) || stable(rail.access.return_at)!==stable(day.night_at))throw Error('wizard_rail_changed_base');
  const trip={date:day.date,places:day.places,schedule:{...day.schedule,rail},itinerary:{active:day.id,days:[day]}};
  if(!resolveRail(trip,catalog)?.input)throw Error('wizard_rail_unavailable');
  day.schedule.rail=clone(rail);
  return day;
}

// Offer an earlier return only after the same native calculation has proved
// the walking route, boarding allowance and complete home road still fit.
export function earlierWizardReturn(trip,catalog,matrix,schedule,calculate) {
  const rail=trip.schedule?.rail;
  if(!rail?.access || schedule?.rail?.state!=='fits' || schedule.rail.home?.finish===null
    || !Number.isInteger(schedule.rail.return_ready) || schedule.rail.wait<60)return null;
  const table=railTable(catalog,rail.service,trip.date);if(table.reason)return null;
  for(const row of table.inbound || []) {
    const ride=rideSnapshot(row);
    if(ride.departure<schedule.rail.return_ready || ride.departure>=rail.inbound.departure)continue;
    const candidate=clone(trip);candidate.schedule.rail.inbound=ride;
    const result=calculate(planInput(candidate,catalog,matrix));
    if(result.rail?.state==='fits' && Number.isInteger(result.rail.home?.finish)
      && !['conflict','overrun'].includes(result.status))return {ride,result};
  }
  return null;
}

// A missed return can sometimes be avoided by leaving earlier. Prove the whole
// day with the same calculator; never shorten the walk or its reserve to fit.
export function earlierWizardDeparture(trip,catalog,matrix,schedule,calculate) {
  const rail=trip.schedule?.rail;
  if(!rail?.access || schedule?.rail?.state!=='missed'
    || !Number.isInteger(rail.access.to_station) || !Number.isInteger(rail.access.from_station))return null;
  const table=railTable(catalog,rail.service,trip.date);if(table.reason)return null;
  for(const row of [...(table.outward || [])].reverse()) {
    const ride=rideSnapshot(row);
    if(ride.departure>=rail.outward.departure)continue;
    const latestStart=ride.departure-rail.access.to_station-rail.boarding;
    if(latestStart<0)continue;
    const start=Math.min(trip.schedule.start,latestStart),candidate=clone(trip);
    candidate.schedule.start=start;candidate.schedule.rail.outward=ride;
    const result=calculate(planInput(candidate,catalog,matrix));
    if(result.rail?.state==='fits' && Number.isInteger(result.rail.home?.finish)
      && !['conflict','overrun'].includes(result.status))return {ride,start,result};
  }
  return null;
}
