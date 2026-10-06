import {visitedPlaces,validProgress} from './day-progress.mjs?v=2';
import {defaultSchedule,planInput} from './trip-schedule-state.mjs?v=15';
import {tripSignature,lightInput} from './trip-light.mjs?v=11';
import {generatedDayPoints,dayPointIds} from './day-points.mjs?v=1';
import {kosaProgressInput} from './day-kosa-progress.mjs?v=4';

export function progressCandidate(trip,request) {
  const day=trip.itinerary?.days.find(d=>d.id===trip.itinerary.active),generated=generatedDayPoints(day),points=day?dayPointIds(day):trip.places;
  const completed=[...visitedPlaces(trip)],progress={date:trip.date,at:request?.at,after:request?.after,completed,return_from:trip.schedule?.progress?.date===trip.date && trip.schedule.progress.return_from || trip.places.at(-1)};
  if(generated.length)progress.kosa_snapshot=JSON.stringify(day.kosa_plan);
  if(progress.return_from===undefined)delete progress.return_from;
  if(!validProgress(progress) || completed.some(id=>!points.includes(id)))return {error:trip.date?'progress_place':'progress_date'};
  if(generated.length && (!generated.includes(progress.after) || generated.some((id,i)=>completed.includes(id)!==(i<=generated.indexOf(progress.after)))))return {error:'progress_walk_order'};
  const prior=trip.schedule?.progress;
  if(prior?.date===trip.date && progress.at<prior.at)return {error:'progress_backwards'};
  return {trip:{...trip,schedule:{...(trip.schedule || defaultSchedule()),progress}}};
}
export function previewProgress(trip,request,catalog,matrix,engine,kosaContext=null) {
  const proposed=progressCandidate(trip,request);if(proposed.error)return proposed;
  try {
    if(generatedDayPoints(trip.itinerary?.days.find(d=>d.id===trip.itinerary.active)).length){
      const result=engine.transitDay(kosaProgressInput(proposed.trip,kosaContext));
      if(!result.continuation)throw Error('progress_unavailable');
      return {signature:tripSignature(trip),request:{after:request.after,at:request.at},progress:structuredClone(proposed.trip.schedule.progress),result,kosa:true};
    }
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
  progress_kosa_changed:'План косы или выбранные рейсы изменились. Откройте план косы и подтвердите их перед новым расчётом.',
  progress_unavailable:'Возвращение пока не подтверждено. Откройте план косы и подберите рейсы на эту дату.',
  progress_walk_order:'Отметьте пройденные тропы по порядку и выберите последнюю из них. Дополнительные места остаются вне автобусного расчёта.',
  progress_before_walk:'Это раньше прибытия на выбранную тропу. Проверьте время и место.',
  progress_unknown_walk:'Этой тропы нет в сохранённой поездке. Подтвердите план косы заново.',
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
