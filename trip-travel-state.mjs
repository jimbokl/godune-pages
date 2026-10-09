import {ensureJourney,selectedDay,journeyDays,chooseTripDay} from './trip-days-state.mjs?v=26';
import {effectiveBookingDay} from './trip-bookings-state.mjs?v=2';
import {isPersonalPoint} from './personal-points.mjs?v=3';
import {dayPointIds} from './day-points.mjs?v=1';

// An intent belongs to the displayed day, date and order. Other visited marks can merge.
export const travelContext=trip=>{const day=selectedDay(trip);return JSON.stringify([day.id,trip.date,dayPointIds(day),day.kosa_plan || null]);};
export function markVisited(trip,id,value,context){
  if(context!==travelContext(trip)||!dayPointIds(selectedDay(trip)).includes(id)||typeof value!=='boolean')return trip;
  const next=ensureJourney(trip),day=selectedDay(next),visited=new Set(day.visited||[]);
  if(value)visited.add(id);else visited.delete(id);
  day.visited=dayPointIds(day).filter(slug=>visited.has(slug));
  return next;
}
export function selectTravelDay(trip,id,context){
  return context===travelContext(trip)&&journeyDays(trip).some(d=>d.id===id)?chooseTripDay(trip,id):trip;
}
export function travelSnapshot(trip,catalog){
  const raw=selectedDay(trip),day=effectiveBookingDay(raw),visited=new Set(raw.visited||[]);
  const places=dayPointIds(raw).map(id=>catalog.poi.find(p=>p.slug===id)).filter(Boolean);
  return {day,raw,places,visited,next:places.find(p=>!visited.has(p.slug))||null,done:places.filter(p=>visited.has(p.slug)).length,context:travelContext(trip)};
}
export function travelCoverage(trip,catalog,paths,maps,base){
  const day=effectiveBookingDay(selectedDay(trip));
  const ids=[...new Set([...dayPointIds(selectedDay(trip)),day.start_at,day.night_at,day.end_at].filter(id=>typeof id==='string'))];
  const points=ids.map(id=>catalog.poi.find(p=>p.slug===id)).filter(Boolean);
  for(const value of [day.start_at,day.night_at,day.end_at])if(isPersonalPoint(value))points.push(value);
  const inside=(p,b)=>Array.isArray(b)&&p.lon>=b[0]&&p.lon<=b[2]&&p.lat>=b[1]&&p.lat<=b[3];
  const has=path=>paths.has(new URL(path,base).pathname);
  return {page:has('travel/'),cards:ids.filter(id=>has(`poi/${id}/`)).length,total:ids.length,
    covered:points.filter(p=>maps.some(m=>inside(p,m.bbox))).length,points:points.length};
}
