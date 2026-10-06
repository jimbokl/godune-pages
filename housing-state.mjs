import {journeyDays,ensureJourney,chooseTripDay} from './trip-days-state.mjs?v=22';
import {bookingEffects} from './trip-bookings-state.mjs?v=2';
import {baseId,validBase} from './personal-points.mjs?v=3';
import {resolvePair,resolveAccessBetween,loadTripTravelMatrix,travelMode} from './travel-estimates.mjs?v=9';

export function housingContext(trip,ids) {
  return JSON.stringify({active:trip.itinerary?.active||'day-1',days:journeyDays(trip).filter(d=>ids.includes(d.id))});
}
export const housingLock=(day,role)=>day.bookings?.find(r=>r.status!=='cancelled'&&r.binding===(role==='start_at'?'start':'night'))||null;
const sum=(...legs)=>legs.some(n=>n===null||n===undefined)?null:legs.reduce((a,b)=>a+b,0);
function endpointAccess(trip,id,before,after,catalog,matrix,direction) {
  const access=resolveAccessBetween(trip,id,before,after,catalog,matrix);
  return access?access[direction].minutes:0;
}
export async function housingInput(base,trip,ids,candidates,catalog) {
  const days=journeyDays(trip).filter(day=>ids.includes(day.id));
  if(!days.length||days.some(d=>!d.places.length))throw Error('Выберите дни с остановками.');
  const rows=[];
  for(const candidate of candidates) {
    const legs=[];
    for(const day of days) {
      let projected=chooseTripDay(trip,day.id);projected=ensureJourney(projected);
      const d=projected.itinerary.days.find(d=>d.id===day.id),arrival=bookingEffects(projected).start;
      // A comparison is hypothetical. Never change a traveller's existing record.
      d.start_at=arrival?.location||candidate.point;d.night_at=candidate.point;
      if(d.bookings)d.bookings=d.bookings.map(b=>b.binding==='night'?{...b,binding:'none'}:b);
      const matrix=await loadTripTravelMatrix(base,projected,catalog);
      const from=baseId(d.start_at),to=baseId(candidate.point),first=d.places[0],last=d.places.at(-1);
      legs.push({id:d.id,
        outbound:sum(resolvePair(projected,from,first,catalog,matrix).minutes,
          endpointAccess(projected,from,null,first,catalog,matrix,'back'),endpointAccess(projected,first,from,d.places[1]||to,catalog,matrix,'approach')),
        return_trip:sum(endpointAccess(projected,last,d.places.at(-2)||from,to,catalog,matrix,'back'),
          resolvePair(projected,last,to,catalog,matrix).minutes,endpointAccess(projected,to,last,null,catalog,matrix,'approach'))});
    }
    rows.push({id:candidate.id,days:legs});
  }
  return {version:1,candidates:rows};
}
export function applyHousing(trip,point,changes,expected,ids) {
  if(housingContext(trip,ids)!==expected)return {state:trip,stale:true};
  if(!validBase(point)||!point||!changes.length)return {state:trip,invalid:true};
  const next=ensureJourney(trip),seen=new Set();
  for(const change of changes) {
    const day=next.itinerary.days.find(d=>d.id===change.day);
    if(!day||!ids.includes(day.id)||!['start_at','night_at'].includes(change.role)||housingLock(day,change.role)||seen.has(`${change.day}/${change.role}`))return {state:trip,invalid:true};
    seen.add(`${change.day}/${change.role}`);day[change.role]=structuredClone(point);
  }
  return {state:next};
}
export const housingMode=day=>travelMode({schedule:day.schedule});
