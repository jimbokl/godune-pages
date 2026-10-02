import {cleanTrip, validTripDate, TRIP_AREAS, TRIP_TIMES} from './trip-state.mjs?v=5';
import {validSchedule} from './trip-schedule-state.mjs?v=3';

export const TRIP_FILE_BYTES = 1024 * 1024;
export function createTripFile(state, catalog, now = new Date()) {
  return JSON.stringify({format: 'godune.trip', version: 1, savedAt: now.toISOString(),
    trip: cleanTrip(state, catalog)}, null, 2) + '\n';
}

export function readTripFile(text, catalog) {
  try {
    if (new TextEncoder().encode(text).byteLength > TRIP_FILE_BYTES) throw Error();
    const document = JSON.parse(text.replace(/^\uFEFF/, ''));
    if (document?.format !== 'godune.trip') return {error: 'Это другой файл. Выберите файл поездки, сохранённый на «Маршрутах Балтики». Ваш черновик на месте.'};
    if (document.version !== 1) return {error: 'Этот файл создан в другой версии поездки. Ваш черновик на месте.'};
    const trip = document.trip;
    if (!trip || trip.version !== 1 || ![trip.places, trip.routes].every(list => Array.isArray(list) && list.every(id => typeof id === 'string'))
      || !(trip.month === null || Number.isInteger(trip.month) && trip.month >= 1 && trip.month <= 12)
      || !(trip.date === null || validTripDate(trip.date)) || (trip.date && Number(trip.date.slice(5, 7)) !== trip.month)
      || !TRIP_AREAS.includes(trip.filters?.area) || !TRIP_TIMES.includes(trip.filters?.minutes)
      || Object.hasOwn(trip,'schedule') && !validSchedule(trip.schedule)) throw Error();
    const state = cleanTrip(trip, catalog);
    const missing = new Set(trip.places.filter(id => !state.places.includes(id))).size
      + new Set(trip.routes.filter(id => !state.routes.includes(id))).size;
    if (!state.places.length && !state.routes.length) return {error: missing ? 'Мест из этой поездки уже нет в каталоге. Ваш черновик на месте.' : 'В этом файле пока нет мест или прогулок.'};
    return {state, missing};
  } catch { return {error: 'Не удалось прочитать файл поездки. Ваш черновик на месте. Попробуйте другую копию файла.'}; }
}

export async function persistentStorage(storage, request = false) {
  if (typeof storage?.persisted !== 'function' || request && typeof storage.persist !== 'function') return {supported: false, granted: false};
  try {
    let granted = await storage.persisted();
    if (!granted && request) granted = await storage.persist();
    return {supported: true, granted: Boolean(granted)};
  } catch { return {supported: true, granted: false, failed: true}; }
}
