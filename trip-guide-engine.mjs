import {partyLabel} from './trip-party.mjs?v=1';
// Portable, read-only snapshot. All times come from the same Rust API as the day screen.
import {journeyDays,selectedDay,chooseTripDay} from './trip-days-state.mjs?v=17';
import {planInput,planTravel,defaultSchedule} from './trip-schedule-state.mjs?v=13';
import {resolveRail} from './trip-rail-state.mjs?v=5';
import {bookingEffects,bookingProblem,effectiveBookingDay,BOOKING_KINDS,BOOKING_STATUSES} from './trip-bookings-state.mjs?v=2';
import {baseName,personalPoints,isPersonalPoint} from './personal-points.mjs?v=3';
import {resolveTravel,previousPlace,resolveAccess,dayBases} from './travel-estimates.mjs?v=6';
import {resolveExcursion} from './trip-transport-state.mjs?v=3';
import {railJourney,roadJourney,waitJourney,excursionJourney} from './day-journey-view.mjs?v=4';
import {buildGuide} from './virtual-guide-engine.mjs?v=2';
import {clock,stopTimeView,ownPointPhoto} from './day-stop-view.mjs?v=1';
import {waveLabel} from './day-wave.mjs?v=2';

const notes={unknown_travel:'Время дороги ещё неизвестно.',unknown_opening:'Часы входа ещё нужно сверить.',opening_needs_check:'Часы учтены; дату и билеты нужно сверить.',unknown_kitchen:'Уточните время последнего заказа.',kitchen_needs_check:'Время приёма заказов нужно сверить.',kitchen_closed:'В этот день заказы не принимают.',kitchen_window_missed:'К этому времени кухня уже не принимает заказ.',travel_needs_check:'Дорога учтена по оценке; доступ нужно сверить.',unknown_approach:'Неизвестно время подхода ко входу.',unknown_return:'Неизвестно время возвращения к парковке.',access_needs_check:'Пеший участок учтён по карте; темп и доступ нужно сверить.',transport_needs_check:'Переправу нужно сверить на дату поездки.',transport_incomplete:'Не хватает времени пути или расписания переправы.',transport_conflict:'Возвращение с переправы не складывается.',closed:'По выбранным часам в этот день посещений нет.',window_missed:'Осмотр не помещается в часы входа или сеанс.',appointment_needs_check:'Без времени дороги прибытие к билету нельзя подтвердить.',appointment_venue_conflict:'Время билета не совпадает с известными часами посещения.'};
export function guideIssue(issue) {
  if(issue.code==='appointment_missed')return `Позже записанного времени как минимум на ${issue.minutes} мин.`;
  if(issue.code==='after_deadline')return `Позже границы дня как минимум на ${issue.minutes} мин.`;
  return notes[issue.code] || 'Для этого участка нужны дополнительные сведения.';
}
export const guidePlanStatus={empty:'Остановок пока нет.',fits:'По вашим оценкам день складывается.',needs_check:'День складывается по оценкам. Дорогу и вход нужно сверить.',incomplete:'Точное время дня пока неизвестно: остались неуточнённые участки.',overrun:'Все остановки не помещаются в этот день.',conflict:'Есть остановки или рейсы, которые не помещаются в этот день.'};

export function guideDayRows(trip,catalog,result,matrix) {
  const settings=trip.schedule || defaultSchedule(),bookings=bookingEffects(trip),bases=dayBases(trip);
  const namedBases=effectiveBookingDay(selectedDay(trip));
  // Indexed personal points include a slug; they are not the strict saved base shape.
  const points=personalPoints(trip),name=id=>points.find(p=>p.slug===id)?.name || baseName(id,catalog);
  const rail=railJourney(resolveRail(trip,catalog),result.rail),rows=[...rail.before];
  result.stops.forEach((item,index)=>{
    const blocked=result.stops.slice(0,index).some(stop=>stop.excursion?.conflict);
    const outside=settings.stops[item.id]?.visit_scope==='outside';
    const issues=item.issues.map(issue=>outside && issue.code==='unknown_opening'?'Доступ к месту снаружи ещё нужно сверить.':guideIssue(issue)),state=issues.length?'needs_check':'estimate';
    if(item.id==='__day_checkpoint'){rows.push({id:item.id,kind:'notice',time:settings.progress.at,title:`Снова в пути · ${name(settings.progress.after)}`,text:'Вы указали время после осмотра. Ниже — оставшийся день; пройденные места сохранены без выдуманного времени посещения.',state:'estimate'});return;}
    if(item.id.startsWith('__day_')) {
      const role=item.id==='__day_origin'?'start':item.id==='__day_night'?'night':'end';
      const title={start:'Начало',night:'Возвращение',end:'К вылету / отъезду'}[role];
      const anchor=namedBases[role+'_at'],point=isPersonalPoint(anchor)?anchor:catalog.poi.find(p=>p.slug===anchor);
      const gps=Number.isFinite(point?.lat)&&Number.isFinite(point?.lon)?` GPS: ${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}.`:'';
      rows.push({id:item.id,kind:role==='start'?'start':'return',time:blocked?null:item.begins,title:`${title} · ${baseName(anchor,catalog)}`,text:(blocked?'Сначала нужно подобрать возвращение.':item.begins===null?`Не раньше ${clock(item.earliest_begin)}. Точное время ещё неизвестно.`:role==='start'?'Начало дня по выбранному времени.':'Время по расчёту дня. Подход к двери ещё нужно сверить.')+gps+(issues.length?' '+issues.join(' '):''),state});return;
    }
    const place=catalog.poi.find(p=>p.slug===item.id);if(!place)throw Error('guide_unknown_point');
    const {projected,travel,access}=planTravel(trip,item.id,catalog,matrix),previous=previousPlace(projected,item.id);
    if(previous)rows.push(roadJourney(item,travel,settings.reserve,name(previous),blocked));
    const booking=bookings.stops[item.id],wait=waitJourney(item,!!booking);if(wait&&!blocked)rows.push(wait);
    const view=stopTimeView(item,booking,blocked),pause=settings.stops[item.id]?.pause || 0;
    rows.push({id:item.id,poi:item.id,kind:'visit',time:blocked?null:item.begins,title:place.name,
      text:`${view.label}: ${view.time}. ${item.visit_minutes} мин на месте${pause?` + ${pause} мин пауза`:''}.${outside?' Осмотр снаружи, без входа внутрь.':''}`+(view.note?' '+view.note:'')
        +(access?` Подход: ${access.approach.minutes===null?'неизвестно':access.approach.minutes+' мин'}. Обратно к парковке: ${access.back.minutes===null?'неизвестно':access.back.minutes+' мин'}.`:'')+(issues.length?' '+issues.join(' '):''),state});
    const excursion=resolveExcursion(trip,item.id,catalog);if(excursion&&item.excursion)rows.push(...excursionJourney(excursion,item.excursion,place.name));
  });
  if(settings.progress)rows.push({id:'completed-places',kind:'notice',time:null,title:'Уже были',text:settings.progress.completed.map(name).join(' · ')+'. Время посещения не записано.',state:'estimate'});
  return [...rows,...rail.after];
}

export async function collectTripGuide({trip,catalog,scope='day',calculate,matrixFor,roadsFor,kosaFor,createdAt=new Date().toISOString()}) {
  if(!['day','trip'].includes(scope))throw Error('guide_invalid_scope');
  const saved=structuredClone(trip),days=scope==='day'?[selectedDay(saved)]:journeyDays(saved),out=[];
  for(const [index,record] of days.entries()) {
    const current=chooseTripDay(saved,record.id),generated=!!record.kosa_plan;
    const kosa=generated?await kosaFor(current):null;
    const points=[...new Set([...(generated?['vysota-efa',...(record.kosa_plan.walks==='two'?['tancuyushchiy-les']:[])]:[]),...current.places])];
    const guide=buildGuide(catalog,{trip:{...current,places:points}});
    const matrix=generated?null:await matrixFor(current),result=generated?null:calculate(planInput(current,catalog,matrix));
    const roads=generated?{type:'FeatureCollection',features:[]}:await roadsFor(current,matrix);
    const rows=generated?[...kosa.rows,...(current.places.length?[{id:'extra-places',kind:'notice',time:null,title:'Дополнительные места вне расчёта',text:'Эти места сохранены ниже. Время поездки на косу их не учитывает.',state:'unknown'}]:[])]:guideDayRows(current,catalog,result,matrix);
    const recipe=catalog.day_waves?.recipes?.find(row=>row.slug===record.wave?.recipe);
    out.push({id:record.id,name:record.name || (generated?'День на куршской волне':recipe?.name || waveLabel(record.wave)) || `День ${journeyDays(saved).findIndex(d=>d.id===record.id)+1 || index+1}`,date:current.date,
      record:structuredClone(record),party_label:partyLabel(record.party),status:generated?kosa.state:result.status,summary:generated?kosa.message:(current.schedule?.progress?`Остаток дня с ${clock(current.schedule.progress.at)}. `:'')+guidePlanStatus[result.status],
      finish:generated?(kosa.book?.finish ?? null):result.finish,earliest_finish:result?.earliest_finish ?? null,slack:generated?(kosa.book?.continuation?.slack ?? null):result?.slack ?? null,
      rows,roads,roadSource:matrix?.source || null,kosa:kosa?.book || null,
      stops:guide.stops.map(point=>{const p=catalog.poi.find(p=>p.slug===point.id);return {...point,completed:!!current.schedule?.progress?.completed.includes(point.id),photo:ownPointPhoto(p),conditions:structuredClone(p.visit_conditions || [])};}),
      bookings:(record.bookings || []).map(row=>({...structuredClone(row),kindLabel:BOOKING_KINDS[row.kind],statusLabel:BOOKING_STATUSES[row.status],locationLabel:baseName(row.location,catalog),problem:bookingProblem(row,record)})),
      planB:generated?kosa.book?.fallback || 'Откройте прежний план косы и подтвердите рейсы. До этого точное возвращение неизвестно.':'Если задержались или устали, сохраните время билета и обратного рейса. Пропустите гибкую остановку. После изменения дня пересчитайте дорогу; этот файл сам не обновляется.'});
  }
  return {version:1,scope,created_at:createdAt,title:scope==='day'?out[0].name:'Ваша поездка на Балтийской волне',days:out};
}
