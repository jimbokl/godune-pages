// The saved home stays private and intact. Only the walking calculation uses
// the arrival station as its origin and return, after the outward train.
import {validBase,baseName} from './personal-points.mjs?v=3';
import {bookingEffects} from './trip-bookings-state.mjs?v=3';
import {validStationRoad} from './station-road-proof.mjs?v=1';
const object=v=>!!v && typeof v==='object' && !Array.isArray(v);
const minute=v=>v===null || Number.isInteger(v) && v>=0 && v<=1440;
const stable=v=>JSON.stringify(v,(_,row)=>object(row)?Object.fromEntries(Object.keys(row).sort().map(k=>[k,row[k]])):row);
export function validRailAccess(v) {
  const keys=['version','station','start_at','return_at','to_station','from_station'];
  return object(v) && Object.keys(v).length===keys.length+(v.road===undefined?0:1) && keys.every(k=>Object.hasOwn(v,k))
    && v.version===1 && typeof v.station==='string' && /^[a-z0-9][a-z0-9-]*$/.test(v.station)
    && validBase(v.start_at) && validBase(v.return_at) && minute(v.to_station) && minute(v.from_station)
    &&(v.road===undefined||validStationRoad(v.road,v.to_station,v.from_station));
}
export function railAccess(trip,catalog) {
  const value=trip.schedule?.rail?.access;
  if(!validRailAccess(value))return null;
  if(catalog && !catalog.rail_services?.some(s=>s.id===trip.schedule.rail.service && s.arrival_poi===value.station
    && catalog.poi?.some(p=>p.slug===value.station && p.category==='transport')))return null;
  return value;
}
export function railHomeLocations(trip) {
  const day=trip.itinerary?.days?.find(d=>d.id===trip.itinerary.active) || {},bookings=bookingEffects(trip);
  return {start_at:bookings.start?.location || day.start_at || null,
    return_at:bookings.end?.location || bookings.night?.location || day.night_at || null};
}
export function railWalkBases(trip,bases) {
  const access=railAccess(trip);
  return access?{...bases,start_at:access.station,night_at:access.station,end_at:null}:bases;
}
export function railHomeInput(trip,catalog,start,end) {
  const access=railAccess(trip,catalog);if(!access)return null;
  const locations=railHomeLocations(trip);
  return {ready_at:start,end_by:end,
    approach:stable(access.start_at)===stable(locations.start_at)?access.to_station:null,
    return_minutes:stable(access.return_at)===stable(locations.return_at)?access.from_station:null};
}
export function railHomeNames(trip,catalog) {
  const locations=railHomeLocations(trip);
  return {start:locations.start_at?baseName(locations.start_at,catalog):'Начало поездки',
    return:locations.return_at?baseName(locations.return_at,catalog):'Конец поездки'};
}
export const dayFinish=result=>result?.rail?.home?result.rail.home.finish:result?.finish ?? null;
export const dayEarliestFinish=result=>result?.rail?.home?result.rail.home.earliest_finish:result?.earliest_finish ?? null;
