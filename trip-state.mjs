import {validTripDate,cleanJourney,mergeJourney} from './trip-days-state.mjs?v=5';
export {validTripDate} from './trip-days-state.mjs?v=5';
import {cleanSchedule} from './trip-schedule-state.mjs?v=6';
export const TRIP_KEY = 'godune-trip:v1';
export const emptyTrip = () => ({version: 1, places: [], routes: [], month: null, date: null,
  filters: {area: 'all', minutes: 'all'}});
export const TRIP_AREAS = ['all', 'kaliningrad', 'kurshskaya-kosa'];
export const TRIP_TIMES = ['all', '120', '180'];

export function cleanTrip(record, catalog) {
  if (!record || record.version !== 1) return emptyTrip();
  const valid = (values, rows) => {
    const known = new Set(rows.map(row => row.slug));
    return Array.isArray(values) ? [...new Set(values.filter(id => typeof id === 'string' && known.has(id)))] : [];
  };
  const date = validTripDate(record.date) ? record.date : null;
  const trip = {version: 1, places: valid(record.places, catalog.poi), routes: valid(record.routes, catalog.routes),
    month: date ? Number(date.slice(5, 7)) : Number.isInteger(record.month) && record.month >= 1 && record.month <= 12 ? record.month : null,
    date, filters: {area: TRIP_AREAS.includes(record.filters?.area) ? record.filters.area : 'all',
      minutes: TRIP_TIMES.includes(record.filters?.minutes) ? record.filters.minutes : 'all'}};
  const schedule = cleanSchedule(record.schedule, trip.places);
  if (schedule) trip.schedule = schedule;
  const itinerary=cleanJourney(record.itinerary,trip,catalog);
  if(itinerary)trip.itinerary=itinerary;
  return trip;
}

export function mergeTrips(current, incoming, catalog) {
  const before = cleanTrip(current, catalog), next = cleanTrip(incoming, catalog);
  const merged = {...next, places: [...new Set([...before.places, ...next.places])],
    routes: [...new Set([...before.routes, ...next.routes])]};
  if(before.itinerary || next.itinerary)return cleanTrip(mergeJourney(before,next,merged),catalog);
  const schedule = next.schedule || before.schedule;
  if (schedule) merged.schedule = {...schedule,stops:{...before.schedule?.stops,...next.schedule?.stops}};
  return cleanTrip(merged, catalog);
}
