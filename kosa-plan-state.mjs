import {cleanTrip,emptyTrip} from './trip-state.mjs?v=19';
import {mergeJourney,tripHasDraft,validTripDate,chooseTripDay} from './trip-days-state.mjs?v=14';
import {railTable,rideSnapshot} from './trip-rail-state.mjs?v=3';
import {selectKosaInterchanges,assessKosaWalking} from './kosa-interchanges.mjs?v=3';
import {kosaBoarding,kosaBoardingText} from './kosa-boarding.mjs?v=1';
import {kosaLightSummary} from './kosa-light.mjs?v=1';
import {datedTransitInput,transitTable} from './transport-day.mjs?v=1';
export const kosaClock=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
export function kosaRailTable(answers,catalog) {
  if(answers.city!=='kaliningrad')return null;
  if(!['kaliningrad-north-zelenogradsk','kaliningrad-south-zelenogradsk'].includes(answers.station))throw Error('Выберите вокзал Калининграда.');
  return railTable(catalog,answers.station,answers.date);
}
export function kosaInput(answers,table,catalog) {
  if(!validTripDate(answers.date) || !['zelenogradsk','kaliningrad','svetlogorsk'].includes(answers.city)
    || !['one','two'].includes(answers.walks)) throw Error('Выберите дату, город и прогулку.');
  const location=slug=>{const point=catalog?.poi?.find(p=>p.slug===slug);return point&&Number.isFinite(point.lat)&&Number.isFinite(point.lon)?{lat:point.lat,lon:point.lon}:null;};
  const input=datedTransitInput({...answers,second_visit:answers.walks==='two'?answers.second_visit:null},table,{first:location('vysota-efa'),second:location('tancuyushchiy-les')});
  const rail=kosaRailTable(answers,catalog);
  if(rail){
    if(!rail.service || (rail.reason && !['unpublished_year','outside_validity'].includes(rail.reason)) || !rail.reason && (!rail.outward || !rail.inbound))throw Error('Нет проверенной таблицы электричек на эту дату.');
    input.rail={valid_from:rail.exception?answers.date:rail.service.valid_from,valid_until:rail.exception?answers.date:rail.service.valid_until,
      publication_year:rail.exception?Number(answers.date.slice(0,4)):rail.service.publication_year,
      to_station:answers.to_station??null,from_station:answers.from_station??null,to_bus:answers.to_bus,to_train:answers.to_train,boarding:answers.rail_boarding,
      outward:(rail.outward||[]).map(r=>({...rideSnapshot(r),via:null})),inward:(rail.inbound||[]).map(r=>({...rideSnapshot(r),via:null}))};
  }
  return input;
}
export function kosaNote(answers,day,table,catalog,interchanges,options={}) {
  if(day.state!=='candidate')throw Error('Для этого дня ещё нет обратного рейса.');
  table=transitTable(table,answers.date).publication;
  const rows=[`Куршская коса без машины · ${answers.date}`,
    `Город начала: ${{kaliningrad:'Калининград',zelenogradsk:'Зеленоградск',svetlogorsk:'Светлогорск'}[answers.city]}.${day.rail?'':' Дорогу до пересадки в Зеленоградске нужно проверить отдельно.'}`,
    `По таблице № 210: Зеленоградск ${kosaClock(day.outward.departure)} → Эфа ${kosaClock(day.outward.arrival)}.`,
    `На Эфу с возвращением к остановке: ${answers.first_visit} мин. Запас перед посадкой: ${answers.boarding} мин.`];
  if(day.transfer)rows.push(`Переезд: Эфа ${kosaClock(day.transfer.departure)} → Танцующий лес ${kosaClock(day.transfer.via)}. На тропу: ${answers.second_visit} мин.`);
  rows.push(`У обратной остановки не позже ${kosaClock(day.board_by)}. Автобус ${kosaClock(answers.walks==='two'?day.inward.via:day.inward.departure)} → Зеленоградск ${kosaClock(day.finish)}.`);
  if(day.backup)rows.push(`Следующий рейс по таблице: ${kosaClock(answers.walks==='two'?day.backup.via:day.backup.departure)} → Зеленоградск ${kosaClock(day.backup.arrival)}. Места и движение требуют проверки.`);
  else rows.push('После выбранного обратного рейса в этой таблице другого автобуса нет. Запасной способ возвращения нужно договорить до поездки.');
  if(options.light!==false)rows.push(...kosaLightSummary(day.light).rows.map(row=>row.text));
  if(options.boarding!==false){
    const boarding=kosaBoarding(table,answers);
    if(boarding)rows.push(...boarding.legs.map(kosaBoardingText));
    else rows.push('Названия остановок посадки пока не загружены. Уточните их до поездки.');
  }
  if(day.rail){
    const rail=kosaRailTable(answers,catalog),r=day.rail;
    rows.splice(2,0,answers.origin==='station'?`Начало у вокзала ${rail.service.from} в ${kosaClock(r.home_start)}; у поезда к ${kosaClock(r.station_by)}. Дорога от жилья не включена.`:`Выйти из жилья в ${kosaClock(r.home_start)}. До вокзала ${r.to_station} мин по вашей оценке; у поезда к ${kosaClock(r.station_by)}.`,
      `${rail.service.from}: поезд № ${r.outward.id} ${kosaClock(r.outward.departure)} → ${rail.service.to} ${kosaClock(r.outward.arrival)}. От станции до автобуса ${r.to_bus} мин по вашей оценке.`,
      `Обратно: от автобуса до поезда ${r.to_train} мин по вашей оценке; у поезда к ${kosaClock(r.train_by)}. Поезд № ${r.inward.id} ${kosaClock(r.inward.departure)} → ${rail.service.from} ${kosaClock(r.inward.arrival)}. ${answers.origin==='station'?'Дальнейшая дорога до жилья не включена.':`До жилья ${r.from_station} мин; вернуться около ${kosaClock(r.home_finish)}.`}`);
    if(day.backup)rows.push(r.backup?`После запасного автобуса: поезд ${kosaClock(r.backup.departure)} → ${kosaClock(r.backup.arrival)}.`:'После запасного автобуса подходящей электрички в этой таблице нет. Этот автобус не даёт полного запасного возвращения.');
    rows.push(`Электрички: ${rail.source.url} · сверено ${rail.source.checked_at}. Подходы и запас заданы вами; пути от двери и платформы ещё не проверены.`);
  }
  const selected=selectKosaInterchanges(answers,interchanges);
  if(selected){
    const walking=assessKosaWalking(answers,selected);
    rows.push(...walking.checks.map(check=>check.text),...walking.checks.filter(check=>check.trail).map(check=>
      `${check.trail.name}: длина тропы — ${check.trail.source_url} · сверено ${check.trail.checked_at}. Темп ${check.trail.pace_kmh} км/ч и паузы — выбранная оценка, не полевое измерение.`),
      `Переходы: ${selected.source.name} · карта от ${selected.source.snapshot_at}. Площадка № 210 и последние метры ещё не проверены на месте.`);
  }else rows.push('Время переходов пока не сопоставлено с картой. Уточните его перед поездкой.');
  rows.push(`Источник: ${table.source_url} · таблица с ${table.valid_from} · сверена ${table.checked_at}.`,
    'Рейсы на дату поездки не подтверждены. Это план по опубликованной таблице, а не билет или бронь.',
    'Перед поездкой: билет категории «пешком», копия билета и расписания, вода, запасной вариант возвращения.',
    'Карты и PDF каждой тропы скачайте отдельно на godune.ru/kurshskaya-kosa/bez-mashiny/. Между тропами нет общего пешего трека.');
  return rows.join('\n');
}
export function isGeneratedKosaNote(note,answers,day,table,catalog,interchanges){
  return [{},{boarding:false},{light:false},{boarding:false,light:false}]
    .some(options=>note===kosaNote(answers,day,table,catalog,interchanges,options));
}
// Bind the two chosen trains as well as the transcribed bus publication.
export const kosaRailSnapshot=day=>day.rail?JSON.stringify([day.rail.outward,day.rail.inward]):null;
export const kosaBusSnapshot=day=>JSON.stringify([day.outward,day.transfer,day.inward]);
export function addKosaDay(current,answers,day,table,catalog,interchanges,editingDay=null) {
  const before=cleanTrip(current,catalog),note=kosaNote(answers,day,table,catalog,interchanges);
  const routes=answers.walks==='two'?['vysota-efa','tancuyushchiy-les']:['vysota-efa'];
  if(routes.some(id=>!catalog.routes.some(r=>r.slug===id)))throw Error('Прогулка пока недоступна в каталоге.');
  // Bus legs are a dated roadbook; they are never converted to a foot route.
  const metadata={version:1,...answers,source_sha256:transitTable(table,answers.date).publication.image_sha256,rail_snapshot:kosaRailSnapshot(day),bus_snapshot:kosaBusSnapshot(day)};
  const same=before.itinerary?.days.some(d=>d.note===note && d.kosa_plan?.version===1
    && Object.entries(metadata).every(([key,value])=>d.kosa_plan[key]===value));
  // Saving and then exporting the same proposal must not create a second day.
  if(same)return cleanTrip({...before,routes:[...new Set([...before.routes,...routes])]},catalog);
  // Replace only the exact generated day this form previously saved or restored.
  // A changed date, another active day or a concurrent edit keeps the append path.
  const target=before.itinerary?.days.find(d=>d.id===before.itinerary.active);
  if(editingDay?.kosa_plan?.version===1&&target?.id===editingDay.id&&target.date===answers.date
    &&JSON.stringify(target)===JSON.stringify(editingDay)){
    const updated={...target,note,kosa_plan:metadata};
    return cleanTrip(chooseTripDay({...before,routes:[...new Set([...before.routes,...routes])],
      itinerary:{...before.itinerary,days:before.itinerary.days.map(d=>d.id===target.id?updated:d)}},target.id),catalog);
  }
  const entry={id:'day-1',date:answers.date,places:[],start_at:null,night_at:null,note,costs:{},kosa_plan:metadata};
  const incoming={...emptyTrip(),date:answers.date,month:Number(answers.date.slice(5,7)),routes,
    itinerary:{version:1,active:entry.id,people:before.itinerary?.people || 1,days:[entry]}};
  const merged={...before,routes:[...new Set([...before.routes,...routes])]};
  return cleanTrip(tripHasDraft(before)?mergeJourney(before,incoming,merged):{...incoming,...(before.dreams?{dreams:before.dreams}:{})},catalog);
}
