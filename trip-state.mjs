import {cleanSchedule} from './trip-schedule-state.mjs?v=4';
export const TRIP_KEY = 'godune-trip:v1';
export const emptyTrip = () => ({version: 1, places: [], routes: [], month: null, date: null,
  filters: {area: 'all', minutes: 'all'}});
export const TRIP_AREAS = ['all', 'kaliningrad', 'kurshskaya-kosa'];
export const TRIP_TIMES = ['all', '120', '180'];

export function validTripDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T12:00:00Z');
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value && !value.startsWith('0000');
}

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
  return trip;
}

export function mergeTrips(current, incoming, catalog) {
  const before = cleanTrip(current, catalog), next = cleanTrip(incoming, catalog);
  const merged = {...next, places: [...new Set([...before.places, ...next.places])],
    routes: [...new Set([...before.routes, ...next.routes])]};
  const schedule = next.schedule || before.schedule;
  if (schedule) merged.schedule = {...schedule,stops:{...before.schedule?.stops,...next.schedule?.stops}};
  return cleanTrip(merged, catalog);
}
