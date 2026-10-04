// Read-only presentation of the existing Rust schedule. No second calculator.
export const clock = minute => `${minute >= 1440 ? `+${Math.floor(minute/1440)} дн. ` : ''}${String(Math.floor(minute/60)%24).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;

export function ownPointPhoto(point) {
  return (Array.isArray(point?.photos) ? point.photos : []).find(path => typeof path === 'string'
    && /^assets\/(?:author|food)\/[a-zA-Z0-9_./-]+\.(?:jpg|jpeg|png|webp|avif)$/i.test(path)
    && !path.includes('..')) || null;
}

export function stopTimeView(item, booking = null, blockedByReturn = false) {
  const planned = blockedByReturn ? 'После возвращения'
    : item.begins === null ? `Не раньше ${clock(item.earliest_begin)}` : clock(item.begins);
  if (booking) {
    return {kind: 'fixed', label: booking.status === 'booked' ? 'Время билета' : 'Планирую на',
      time: clock(booking.time), note: blockedByReturn ? 'Возвращение ещё не складывается.'
        : item.arrival === null ? `Прибытие не раньше ${clock(item.earliest_arrival)}. Дорогу нужно уточнить.`
        : `По плану будете на месте около ${clock(item.arrival)}.`,
      planned};
  }
  return {kind: 'flexible', label: blockedByReturn ? 'Сначала возвращение'
    : item.begins === null ? 'Время ещё неполное' : 'Начать около', time: planned, note: '',
    planned};
}

const routine = new Set(['opening_needs_check', 'kitchen_needs_check', 'travel_needs_check',
  'access_needs_check', 'transport_needs_check']);
export const routineStopIssue = issue => routine.has(issue.code);
