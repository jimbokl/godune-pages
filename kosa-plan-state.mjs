import {cleanTrip,emptyTrip} from './trip-state.mjs?v=17';
import {mergeJourney,tripHasDraft,validTripDate} from './trip-days-state.mjs?v=12';
export const kosaClock=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
export function kosaInput(answers,table) {
  if(!validTripDate(answers.date) || !['zelenogradsk','kaliningrad','svetlogorsk'].includes(answers.city)
    || !['one','two'].includes(answers.walks)) throw Error('Выберите дату, город и прогулку.');
  return {version:1,date:answers.date,valid_from:table.valid_from,valid_until:table.valid_until,checked_at:table.checked_at,
    ready_at:answers.ready,boarding:answers.boarding,first_visit:answers.first_visit,
    second_visit:answers.walks==='two'?answers.second_visit:null,outward:table.outward,inward:table.inward};
}
export function kosaNote(answers,day,table) {
  if(day.state!=='candidate')throw Error('Для этого дня ещё нет обратного рейса.');
  const rows=[`Куршская коса без машины · ${answers.date}`,
    `Город начала: ${{kaliningrad:'Калининград',zelenogradsk:'Зеленоградск',svetlogorsk:'Светлогорск'}[answers.city]}. Дорогу до пересадки в Зеленоградске нужно проверить отдельно.`,
    `По таблице № 210: Зеленоградск ${kosaClock(day.outward.departure)} → Эфа ${kosaClock(day.outward.arrival)}.`,
    `На Эфу с возвращением к остановке: ${answers.first_visit} мин. Запас перед посадкой: ${answers.boarding} мин.`];
  if(day.transfer)rows.push(`Переезд: Эфа ${kosaClock(day.transfer.departure)} → Танцующий лес ${kosaClock(day.transfer.via)}. На тропу: ${answers.second_visit} мин.`);
  rows.push(`У обратной остановки не позже ${kosaClock(day.board_by)}. Автобус ${kosaClock(answers.walks==='two'?day.inward.via:day.inward.departure)} → Зеленоградск ${kosaClock(day.finish)}.`);
  if(day.backup)rows.push(`Следующий рейс по таблице: ${kosaClock(answers.walks==='two'?day.backup.via:day.backup.departure)} → Зеленоградск ${kosaClock(day.backup.arrival)}. Места и движение требуют проверки.`);
  rows.push(`Источник: ${table.source_url} · таблица с ${table.valid_from} · сверена ${table.checked_at}.`,
    'Рейсы на дату поездки не подтверждены. Это план по опубликованной таблице, а не билет или бронь.',
    'Перед поездкой: билет категории «пешком», копия билета и расписания, вода, запасной вариант возвращения.',
    'Карты и PDF каждой тропы скачайте отдельно на godune.ru/kurshskaya-kosa/bez-mashiny/. Между тропами нет общего пешего трека.');
  return rows.join('\n');
}
export function addKosaDay(current,answers,day,table,catalog) {
  const before=cleanTrip(current,catalog),note=kosaNote(answers,day,table);
  const routes=answers.walks==='two'?['vysota-efa','tancuyushchiy-les']:['vysota-efa'];
  if(routes.some(id=>!catalog.routes.some(r=>r.slug===id)))throw Error('Прогулка пока недоступна в каталоге.');
  // Bus legs are a dated roadbook; they are never converted to a foot route.
  const metadata={version:1,...answers,source_sha256:table.image_sha256};
  const same=before.itinerary?.days.some(d=>d.note===note && d.kosa_plan?.version===1
    && Object.entries(metadata).every(([key,value])=>d.kosa_plan[key]===value));
  // Saving and then exporting the same proposal must not create a second day.
  if(same)return cleanTrip({...before,routes:[...new Set([...before.routes,...routes])]},catalog);
  const entry={id:'day-1',date:answers.date,places:[],start_at:null,night_at:null,note,costs:{},kosa_plan:metadata};
  const incoming={...emptyTrip(),date:answers.date,month:Number(answers.date.slice(5,7)),routes,
    itinerary:{version:1,active:entry.id,people:before.itinerary?.people || 1,days:[entry]}};
  const merged={...before,routes:[...new Set([...before.routes,...routes])]};
  return cleanTrip(tripHasDraft(before)?mergeJourney(before,incoming,merged):{...incoming,...(before.dreams?{dreams:before.dreams}:{})},catalog);
}
