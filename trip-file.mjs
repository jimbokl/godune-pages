import {validJourneyProjection,tripHasDraft,tripPlaceIds} from './trip-days-state.mjs?v=22';
import {cleanTrip, validTripDate, TRIP_AREAS, TRIP_TIMES} from './trip-state.mjs?v=26';
import {validSchedule} from './trip-schedule-state.mjs?v=16';

export const TRIP_FILE_BYTES = 1024 * 1024;
export function createTripFile(state, catalog, now = new Date()) {
  return JSON.stringify({format: 'godune.trip', version: 1, savedAt: now.toISOString(),
    trip: cleanTrip(state, catalog)}, null, 2) + '\n';
}

export function downloadTripFile(state, catalog, now = new Date()) {
  const blob = new Blob([createTripFile(state, catalog, now)], {type:'application/json'});
  const link = document.createElement('a'), objectURL = URL.createObjectURL(blob);
  link.href = objectURL; link.download = 'Поездка-на-Балтику-' + (state.date || now.toISOString().slice(0,10)) + '.json';
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(objectURL), 60000);
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
      || Object.hasOwn(trip,'dreams') && !(Array.isArray(trip.dreams) && trip.dreams.every(id => typeof id === 'string'))
      || Object.hasOwn(trip,'schedule') && !validSchedule(trip.schedule) || Object.hasOwn(trip,'itinerary') && !validJourneyProjection(trip)) throw Error();
    const state = cleanTrip(trip, catalog);
    const missing = tripPlaceIds(trip).filter(id => !tripPlaceIds(state).includes(id)).length
      + new Set(trip.routes.filter(id => !state.routes.includes(id))).size
      + new Set((trip.dreams || []).filter(id => !state.dreams?.includes(id))).size;
    if (!tripHasDraft(state) && !state.dreams?.length) return {error: missing ? 'Мест из этой поездки уже нет в каталоге. Ваш черновик на месте.' : 'В этом файле пока нет мест, расходов или записей поездки.'};
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
