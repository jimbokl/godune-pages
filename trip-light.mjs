import {planInput} from './trip-schedule-state.mjs?v=10';
export const prefersDaylight = place => ['nature','park','viewpoint','beach'].includes(place?.category);
export function lightInput(trip,catalog,result) {
  return {version:1,date:trip.date,stops:result.stops.filter(item=>catalog.poi.some(row=>row.slug===item.id)).map(item=>{
    const place=catalog.poi.find(row=>row.slug===item.id);
    return {id:item.id,lat:place.lat,lon:place.lon,
      begins:item.arrival===null?null:item.arrival-(item.approach_minutes || 0),leaves:item.excursion ? item.excursion.start : item.leaves,
      outdoor:prefersDaylight(place)};
  })};
}
export function lightScore(light) {
  const rows=light.stops.filter(row=>row.outdoor);
  return {unknown:rows.some(row=>['unknown_timing','unavailable','outside_day'].includes(row.state)),
    dark:rows.reduce((sum,row)=>sum+(row.dark_minutes || 0),0),
    outside:rows.reduce((sum,row)=>sum+(row.outside_sun_minutes || 0),0)};
}
const conflicts = result => result.stops.flatMap(row=>row.issues).filter(row=>['closed','window_missed','after_deadline','transport_conflict','appointment_missed','appointment_venue_conflict'].includes(row.code)).length;
export const tripSignature = trip => JSON.stringify([trip.itinerary?.active ?? null,trip.date,trip.places,trip.schedule ?? null,trip.itinerary?.days.find(day=>day.id===trip.itinerary.active)?.bookings ?? null,
  trip.itinerary?.days.find(day=>day.id===trip.itinerary.active)?.start_at ?? null,trip.itinerary?.days.find(day=>day.id===trip.itinerary.active)?.night_at ?? null]);
// Try moving a late outdoor stop earlier. Every option uses the actual directed road and visit calendar.
// This is an explicit suggestion; it never silently sorts, deletes or saves the visitor's work.
export async function lightAlternative(trip,catalog,matrix,engine,result,light,stillCurrent=()=>true) {
  if(!trip.date || !result.stops.length || result.finish===null || conflicts(result)) return null;
  const original=lightScore(light);if(original.unknown || !original.outside) return null;
  let best=null,iterations=0;
  const scores=new Map(light.stops.map(row=>[row.id,row]));
  for(let from=1;from<trip.places.length;from++) {
    const row=scores.get(trip.places[from]);if(!row?.outdoor || !row.outside_sun_minutes)continue;
    for(let to=0;to<from;to++) {
      if(++iterations%20===0)await new Promise(resolve=>setTimeout(resolve,0));
      if(!stillCurrent())return null;
      const places=[...trip.places], [moved]=places.splice(from,1);places.splice(to,0,moved);
      const candidate={...trip,places}, schedule=engine(planInput(candidate,catalog,matrix));
      if(schedule.finish===null || conflicts(schedule))continue;
      const candidateLight=engine.light(lightInput(candidate,catalog,schedule)),score=lightScore(candidateLight);
      if(!score.unknown && (score.dark<original.dark || score.dark===original.dark && score.outside<original.outside)
        && (!best || score.dark<best.score.dark || score.dark===best.score.dark && (score.outside<best.score.outside || score.outside===best.score.outside && schedule.finish<best.schedule.finish))) {
        best={places,schedule,light:candidateLight,score,moved,signature:tripSignature(trip)};
      }
    }
  }
  return stillCurrent()?best:null;
}
export function lightMessage(row) {
  if(!row.outdoor)return null;
  return {daylight:'По расчёту весь осмотр и возвращение — при дневном свете.',
    twilight:`Часть времени — в сумерках: ${row.outside_sun_minutes} мин. В лесу свет уходит раньше, чем над морем.`,
    dark:`Часть остановки приходится на темноту по расчёту: ${row.dark_minutes} мин. Освещение тропы и путь обратно нужно уточнить.`,
    unknown_timing:'Время остановки ещё неполное. Пока нельзя сказать, какой свет вас встретит.',
    outside_day:'Остановка выходит за выбранный день. Свет следующего дня здесь ещё не рассчитан.',
    unavailable:'Для этой точки свет пока не рассчитан.'}[row.state];
}
export function renderLightView(mount,trip,catalog,light,alternative,onApply) {
  mount.replaceChildren();mount.dataset.lightDate=trip.date || '';
  if(!trip.date) {
    const note=document.createElement('p');note.className='trip-light-intro';note.textContent='Выберите дату поездки — покажем свет этого дня.';
    const button=document.createElement('button');button.type='button';button.className='save-item';button.textContent='Выбрать дату';button.onclick=()=>{const field=document.querySelector('#trip-date');field?.scrollIntoView({block:'center'});field?.focus({preventScroll:true});};mount.append(note,button);return;
  }
  if(!light) {const note=document.createElement('p');note.textContent='Свет этого дня пока не рассчитан. Ваш план и порядок остановок сохранены.';mount.append(note);return;}
  const row=light.stops.find(row=>row.outdoor) || light.stops[0];
  if(!row){const note=document.createElement('p');note.textContent='Добавьте место в маршрут — покажем свет по его координатам.';mount.append(note);return;}
  const place=catalog.poi.find(place=>place.slug===row.id),title=document.createElement('h4'),caption=document.createElement('p');
  title.textContent='Свет вашего дня';caption.className='trip-light-intro';
  caption.textContent=`${place.name} · ${new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(trip.date+'T12:00:00Z'))} · время Калининграда`;
  const clock=minute=>minute===null?'—':`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
  const sun=row.sun;mount.append(title,caption);
  if(['dawn','sunrise','sunset','dusk'].every(key=>sun[key]!==null)) {
    const scale=document.createElement('div');scale.className='trip-light-scale';scale.setAttribute('aria-hidden','true');
    const p=value=>`${value/14.4}%`;
    scale.style.background=`linear-gradient(to right, #253b51 0%, #253b51 ${p(sun.dawn)}, #d4a65c ${p(sun.dawn)}, #d4a65c ${p(sun.sunrise)}, #d9e7ea ${p(sun.sunrise)}, #d9e7ea ${p(sun.sunset)}, #d4a65c ${p(sun.sunset)}, #d4a65c ${p(sun.dusk)}, #253b51 ${p(sun.dusk)}, #253b51 100%)`;
    mount.append(scale);
  }
  const times=document.createElement('dl');times.className='trip-light-times';
  for(const [key,label]of [['dawn','Светает'],['sunrise','Восход'],['sunset','Закат'],['dusk','Сумерки заканчиваются']]) {
    const pair=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=clock(sun[key]);dd.dataset.lightEvent=key;pair.append(dt,dd);times.append(pair);
  }mount.append(times);
  const detail=document.createElement('details'),summary=document.createElement('summary'),note=document.createElement('p');summary.textContent='Что говорит этот свет';
  note.textContent='Расчёт для открытого горизонта. Утром светает с началом гражданских сумерек, вечером они заканчиваются после заката. Это часы солнца, а не прогноз ясного неба. В лесу, тумане и между зданиями темнее; освещение и доступ на тропу нужно проверить отдельно. Каждую остановку считаем по её координатам, вместе с подходом и возвращением.';
  detail.append(summary,note);mount.append(detail);
  if(alternative) {
    const proposal=document.createElement('div');proposal.className='trip-light-proposal';proposal.dataset.lightAlternative='ready';
    const heading=document.createElement('p');heading.className='trip-light-proposal-title';heading.textContent=alternative.score.outside?'Оставить прогулке больше света':'Прогуляться, пока светло';
    const copy=document.createElement('p');copy.textContent=`«${catalog.poi.find(row=>row.slug===alternative.moved).name}» — раньше. На открытом воздухе вне дневного света: ${alternative.score.outside} мин вместо ${lightScore(light).outside}. День закончится около ${clock(alternative.schedule.finish)}. Часы посещения и дорога учтены.`;
    const order=document.createElement('ol');for(const id of alternative.places){const li=document.createElement('li');li.textContent=catalog.poi.find(place=>place.slug===id).name;order.append(li);}
    const button=document.createElement('button');button.type='button';button.className='save-item';button.dataset.applyLight='true';button.textContent='Сохранить этот порядок';button.onclick=()=>onApply(alternative);
    proposal.append(heading,copy,order,button);mount.append(proposal);
  } else if(lightScore(light).outside) {
    const note=document.createElement('p');note.className='trip-light-intro';note.textContent='Часть прогулки выходит за дневной свет. Попробуйте другое время начала или оставьте природную точку на другой день. Порядок автоматически не меняем.';mount.append(note);
  }
}
