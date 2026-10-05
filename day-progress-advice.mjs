import {visitedPlaces,validProgress} from './day-progress.mjs?v=1';
import {defaultSchedule,planInput} from './trip-schedule-state.mjs?v=12';
import {tripSignature,lightInput} from './trip-light.mjs?v=8';

export function progressCandidate(trip,request) {
  if(trip.itinerary?.days.find(d=>d.id===trip.itinerary.active)?.kosa_plan)return {error:'progress_kosa'};
  const completed=[...visitedPlaces(trip)],progress={date:trip.date,at:request?.at,after:request?.after,completed,return_from:trip.schedule?.progress?.date===trip.date && trip.schedule.progress.return_from || trip.places.at(-1)};
  if(!validProgress(progress) || completed.some(id=>!trip.places.includes(id)))return {error:trip.date?'progress_place':'progress_date'};
  const prior=trip.schedule?.progress;
  if(prior?.date===trip.date && progress.at<prior.at)return {error:'progress_backwards'};
  return {trip:{...trip,schedule:{...(trip.schedule || defaultSchedule()),progress}}};
}
export function previewProgress(trip,request,catalog,matrix,engine) {
  const proposed=progressCandidate(trip,request);if(proposed.error)return proposed;
  try {
    const result=engine(planInput(proposed.trip,catalog,matrix));let light=null;
    try {light=engine.light?.(lightInput(proposed.trip,catalog,result)) || null;}catch {}
    return {signature:tripSignature(trip),request:{after:request.after,at:request.at},progress:structuredClone(proposed.trip.schedule.progress),result,light};
  }catch(error){return {error:error.message};}
}
export function applyProgress(trip,preview) {
  if(!preview?.result || tripSignature(trip)!==preview.signature)return {trip,error:'stale'};
  const proposed=progressCandidate(trip,preview.request);
  return proposed.error?{trip,error:proposed.error}:proposed;
}
export function clearProgress(trip,signature) {
  if(tripSignature(trip)!==signature)return {trip,error:'stale'};
  const schedule={...(trip.schedule || defaultSchedule())};delete schedule.progress;
  return {trip:{...trip,schedule}};
}
export const progressMessages={
  progress_date:'Укажите дату дня, затем время и место, где закончили осмотр.',
  progress_place:'Выберите место, которое уже отметили как посещённое.',
  progress_changed:'Отметки посещения изменились. Укажите заново, где и во сколько закончили осмотр.',
  progress_backwards:'Это раньше последней отметки времени. Для нового расчёта с утра выберите «Вернуть расчёт с начала дня».',
  progress_before_arrival:'Это раньше прибытия с записанным запасом. Проверьте время или запись прибытия.',
  invalid_rail_resume:'Выбранное время раньше прибытия электрички. Проверьте время и рейс.',
  progress_rail_unavailable:'Расписание выбранных электричек изменилось или недоступно на эту дату. Подтвердите рейсы в «Поездке на электричке».',
  progress_after_day:'Это позже границы дня или возвращения к отъезду. Измените конец дня или запись отъезда.',
  stale:'День уже изменился. Посмотрите свежий расчёт перед сохранением.'
};
