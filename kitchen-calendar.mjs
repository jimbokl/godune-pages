import {resolveVisitCalendar} from './visit-calendar.mjs?v=3';

// The dining room and order acceptance are different facts, both date-aware.
export function resolveKitchenCalendar(place, date) {
  if(!place?.gastronomy)return null;
  const id=place.gastronomy.kitchen_fact;
  const fact=(place.visit_conditions || []).find(row=>row.id===id);
  const calendar=resolveVisitCalendar({hours:fact},date);
  return {calendar,input:{ordering:calendar.windows,needs_check:calendar.needsCheck}};
}
