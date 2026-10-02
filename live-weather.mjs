// Own-domain forecast snapshot. Visitors do not contact the weather provider.
export const WEATHER_KEY = 'godune-weather-place:v1';
const ZONE = 'Europe/Kaliningrad';
const milliseconds = value => typeof value === 'string' ? Date.parse(value) : NaN;
const validTime = value => Number.isFinite(milliseconds(value));
const decimal = value => new Intl.NumberFormat('ru-RU', {maximumFractionDigits: 1}).format(value);
export function localDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone: ZONE, year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(date);
  const part = name => parts.find(item => item.type === name).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function localClock(value) {
  return validTime(value) ? new Intl.DateTimeFormat('ru-RU', {timeZone: ZONE, hour:'2-digit', minute:'2-digit', hourCycle:'h23'}).format(new Date(value)) : '—';
}
export function localDateTime(value) {
  return validTime(value) ? new Intl.DateTimeFormat('ru-RU', {timeZone: ZONE, day:'numeric', month:'long', hour:'2-digit', minute:'2-digit', hourCycle:'h23'}).format(new Date(value)) : 'дата неизвестна';
}
export function windDirection(degrees) {
  return ['с севера', 'с северо-востока', 'с востока', 'с юго-востока', 'с юга', 'с юго-запада', 'с запада', 'с северо-запада'][Math.round(degrees / 45) % 8];
}
const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
export function forecastView(snapshot, id, date = new Date()) {
  if (snapshot?.version !== 1 || snapshot?.kind !== 'forecast' || snapshot?.timezone !== ZONE || !Array.isArray(snapshot.locations)) return {status:'unavailable'};
  const place = snapshot.locations.find(item => item.id === id);
  if (!place) return {status:'unavailable'};
  const rows = Array.isArray(place.hours) ? place.hours.filter(row => validTime(row.time) &&
    finite(row.temperature_c, -90, 60) && finite(row.wind_ms, 0, 150) &&
    finite(row.wind_from_degrees, 0, 360) && finite(row.cloud_percent, 0, 100)) : [];
  const hour = rows.reduce((nearest, row) => !nearest || Math.abs(milliseconds(row.time) - date) < Math.abs(milliseconds(nearest.time) - date) ? row : nearest, null);
  if (!hour) return {status:'unavailable'};
  const age = value => date - milliseconds(value);
  const fresh = validTime(place.model_updated_at) && validTime(place.checked_at) &&
    age(place.model_updated_at) >= -300000 && age(place.model_updated_at) <= 12 * 3600000 &&
    age(place.checked_at) >= -300000 && age(place.checked_at) <= 6 * 3600000 &&
    Math.abs(milliseconds(hour.time) - date) <= 90 * 60000;
  const sunset = place.sun?.date === localDay(date) && validTime(place.sun?.sunset) && localDay(new Date(place.sun.sunset)) === localDay(date) ? place.sun.sunset : null;
  const rain = finite(hour.rain_mm, 0, 2000) && [1,6,12].includes(hour.rain_hours) ?
    `${decimal(hour.rain_mm)} мм за ${hour.rain_hours === 1 ? 'ближайший час' : 'ближайшие ' + hour.rain_hours + ' часов'}` : 'Количество осадков не указано';
  return {status:fresh ? 'fresh' : 'stale', place, hour, sunset, rain};
}
export function loadWeatherPlace(storage, locations, fallback = 'zelenogradsk') {
  let saved;
  try { saved = storage?.getItem(WEATHER_KEY); } catch { /* selection still works without storage */ }
  return locations.some(place => place.id === saved) ? saved : locations.some(place => place.id === fallback) ? fallback : locations[0]?.id;
}

export function tripWeatherNote(trip, now = new Date()) {
  const today = localDay(now);
  if (trip.date && trip.date !== today) {
    const name = new Intl.DateTimeFormat('ru-RU', {day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'}).format(new Date(trip.date + 'T12:00:00Z'));
    return `Вы выбрали ${name} Здесь — прогноз на ближайшие часы, а не на дату поездки.`;
  }
  if (!trip.month || trip.month === Number(today.slice(5, 7))) return '';
  const name = new Intl.DateTimeFormat('ru-RU', {month: 'long', timeZone: ZONE}).format(new Date(Date.UTC(2026, trip.month - 1, 15)));
  return `Для поездки на ${name} прогноз появится ближе к выезду. Здесь — ближайшие часы на Балтике.`;
}

export async function initWeather(base, workshop) {
  const root = document.querySelector('#trip-weather');
  if (!root) return;
  const $ = selector => root.querySelector(selector);
  const select = $('#weather-place'), note = $('#weather-status'), metrics = $('#weather-metrics');
  let snapshot, storage, request, lastFetch = 0;
  try { storage = window.localStorage; } catch { storage = null; }
  const set = (selector, text) => { $(selector).textContent = text; };
  const render = () => {
    if (!snapshot) return;
    const now = new Date(), view = forecastView(snapshot, select.value, now);
    root.dataset.weatherState = view.status;
    metrics.hidden = view.status === 'unavailable';
    if (view.status === 'unavailable') {
      note.textContent = 'Прогноз пока не загрузился. Ваш маршрут сохранён — к нему можно вернуться в любое время.';
      $('#weather-detail').hidden = true;
      $('#weather-trip-note').hidden = true;
      return;
    }
    const {hour, place, sunset} = view;
    set('#weather-temperature', `${hour.temperature_c > 0 ? '+' : ''}${decimal(hour.temperature_c)}°`);
    set('#weather-wind', `${decimal(hour.wind_ms)} м/с`);
    set('#weather-wind-detail', windDirection(hour.wind_from_degrees));
    set('#weather-cloud', `${Math.round(hour.cloud_percent)}%`);
    set('#weather-rain', view.rain);
    set('#weather-sunset', sunset ? localClock(sunset) : '—');
    set('#weather-sunset-detail', sunset ? 'По времени Калининграда' : 'Расчёт на сегодня пока не получен');
    const time = $('#weather-hour'); time.dateTime = hour.time; time.textContent = localDateTime(hour.time);
    note.textContent = view.status === 'fresh' ? 'Прогноз для ближайшей прогулки' : 'Сохранённый прогноз устарел. Ожидаем обновление.';
    $('#weather-detail').hidden = false;
    set('#weather-updated', `Модель обновлена ${localDateTime(place.model_updated_at)}. Источник проверен ${localDateTime(place.checked_at)}. Это прогноз, а не замер на берегу.`);
    const future = $('#weather-trip-note');
    future.textContent = tripWeatherNote(workshop.getState(), now);
    future.hidden = !future.textContent;
  };
  const refresh = async () => {
    if (request) return request;
    request = (async () => {
      try {
        const response = await fetch(new URL('data/live-weather.json', base), {cache:'no-cache', signal:AbortSignal.timeout(12000)});
        if (!response.ok) throw new Error('Snapshot unavailable');
        const data = await response.json();
        if (data?.version !== 1 || !Array.isArray(data.locations) || !data.locations.length) throw new Error('Invalid snapshot');
        const previous = snapshot ? select.value : null;
        snapshot = data;
        select.replaceChildren(...data.locations.map(place => {
          const option = document.createElement('option'); option.value = place.id; option.textContent = place.name; return option;
        }));
        select.value = data.locations.some(place => place.id === previous) ? previous : loadWeatherPlace(storage, data.locations);
        select.disabled = false; lastFetch = Date.now();
        render();
      } catch {
        if (snapshot) render();
        else {
          root.dataset.weatherState = 'unavailable';
          note.textContent = 'Прогноз пока не загрузился. Ваш маршрут на месте.';
          metrics.hidden = true;
        }
      }
    })();
    try { await request; } finally { request = null; }
  };
  select.addEventListener('change', () => {
    try { storage?.setItem(WEATHER_KEY, select.value); } catch { /* browser may deny storage */ }
    render();
  });
  window.addEventListener('godune:trip-change', render);
  window.addEventListener('storage', event => {
    if (event.key === WEATHER_KEY && snapshot) { select.value = loadWeatherPlace(storage, snapshot.locations); render(); }
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { render(); if (Date.now() - lastFetch > 15 * 60000) refresh(); }
  });
  // No request per visitor to the provider; own snapshot is revalidated once per 15 minutes.
  setInterval(() => { if (!document.hidden) { render(); if (Date.now() - lastFetch > 15 * 60000) refresh(); } }, 60000);
  await refresh();
}
