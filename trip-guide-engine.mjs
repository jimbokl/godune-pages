import {partyLabel} from './trip-party.mjs?v=1';
import {mobilityLabel,baseTransport,vehicleParkingNote,parkingAccessNote} from './day-mobility.mjs?v=4';
import {assessDayPreferences} from './day-preferences.mjs?v=6';
import {tripAccessProfile} from './route-access.mjs?v=1';
// Portable, read-only snapshot. All times come from the same Rust API as the day screen.
import {journeyDays,selectedDay,chooseTripDay} from './trip-days-state.mjs?v=24';
import {planInput,planTravel,planBaseTravel,defaultSchedule} from './trip-schedule-state.mjs?v=17';
import {resolveRail} from './trip-rail-state.mjs?v=6';
import {railAccess,dayFinish,dayEarliestFinish} from './rail-access.mjs?v=2';
import {bookingEffects,bookingProblem,effectiveBookingDay,BOOKING_KINDS,BOOKING_STATUSES} from './trip-bookings-state.mjs?v=2';
import {baseName,baseId,personalPoints,isPersonalPoint} from './personal-points.mjs?v=3';
import {resolveTravel,previousPlace,resolveAccess,dayBases} from './travel-estimates.mjs?v=11';
import {resolveExcursion} from './trip-transport-state.mjs?v=3';
import {railJourney,roadJourney,waitJourney,excursionJourney} from './day-journey-view.mjs?v=8';
import {buildGuide} from './virtual-guide-engine.mjs?v=2';
import {clock,stopTimeView,ownPointPhoto} from './day-stop-view.mjs?v=1';
import {waveLabel} from './day-wave.mjs?v=2';
import {serviceGuide,mixedGuideRows,serviceRow,guideEntries,guideExpenses} from './trip-service-guide.mjs?v=5';
import {menuChoiceGuide} from './trip-menu-choices-view.mjs';

const notes={unknown_travel:'Время дороги ещё неизвестно.',unknown_opening:'Часы входа ещё нужно сверить.',opening_needs_check:'Часы учтены; дату и билеты нужно сверить.',unknown_kitchen:'Уточните время последнего заказа.',kitchen_needs_check:'Время приёма заказов нужно сверить.',kitchen_closed:'В этот день заказы не принимают.',kitchen_window_missed:'К этому времени кухня уже не принимает заказ.',travel_needs_check:'Дорога учтена по оценке; доступ нужно сверить.',unknown_approach:'Неизвестно время подхода ко входу.',unknown_return:'Неизвестно время возвращения к парковке.',access_needs_check:'Пеший участок учтён по карте; темп и доступ нужно сверить.',transport_needs_check:'Переправу нужно сверить на дату поездки.',transport_incomplete:'Не хватает времени пути или расписания переправы.',transport_conflict:'Возвращение с переправы не складывается.',closed:'По выбранным часам в этот день посещений нет.',window_missed:'Осмотр не помещается в часы входа или сеанс.',appointment_needs_check:'Без времени дороги прибытие к билету нельзя подтвердить.',appointment_venue_conflict:'Время билета не совпадает с известными часами посещения.'};
export function guideIssue(issue) {
  if(issue.code==='fixed_visit_missed')return `К выбранному времени посещения не успеваем как минимум на ${issue.minutes} мин.`;
  if(issue.code==='fixed_visit_needs_check')return 'Прибытие к выбранному посещению ещё нельзя подтвердить.';
  if(issue.code==='appointment_missed')return `Позже записанного времени как минимум на ${issue.minutes} мин.`;
  if(issue.code==='after_deadline')return `Позже границы дня как минимум на ${issue.minutes} мин.`;
  return notes[issue.code] || 'Для этого участка нужны дополнительные сведения.';
}
export const guidePlanStatus={empty:'Остановок пока нет.',fits:'По вашим оценкам день складывается.',needs_check:'День складывается по оценкам. Дорогу и вход нужно сверить.',incomplete:'Точное время дня пока неизвестно: остались неуточнённые участки.',overrun:'Все остановки не помещаются в этот день.',conflict:'Есть остановки или рейсы, которые не помещаются в этот день.'};

export function guideDayRows(trip,catalog,result,matrix) {
  const settings=trip.schedule || defaultSchedule(),bookings=bookingEffects(trip),bases=dayBases(trip);
  const stationAccess=railAccess(trip),namedBases=stationAccess?{start_at:stationAccess.station,night_at:stationAccess.station}:effectiveBookingDay(selectedDay(trip));
  // Indexed personal points include a slug; they are not the strict saved base shape.
  const points=personalPoints(trip),name=id=>points.find(p=>p.slug===id)?.name || baseName(id,catalog);
  const rail=railJourney(resolveRail(trip,catalog),result.rail),rows=[...rail.before];
  const parking=vehicleParkingNote(trip,catalog);
  if(parking)rows.push({id:'vehicle-parking',kind:'notice',time:null,title:'Где оставлен транспорт',text:parking,state:'needs_check'});
  result.stops.forEach((item,index)=>{
    const blocked=result.stops.slice(0,index).some(stop=>stop.excursion?.conflict);
    const outside=settings.stops[item.id]?.visit_scope==='outside';
    const issues=item.issues.map(issue=>outside && issue.code==='unknown_opening'?'Доступ к месту снаружи ещё нужно сверить.':guideIssue(issue)),state=issues.length?'needs_check':'estimate';
    if(item.id==='__day_checkpoint'){rows.push({id:item.id,kind:'notice',time:settings.progress.at,title:`Снова в пути · ${name(settings.progress.after)}`,text:'Вы указали время после осмотра. Ниже — оставшийся день; пройденные места сохранены без выдуманного времени посещения.',state:'estimate'});return;}
    if(item.id.startsWith('__day_')) {
      const role=item.id==='__day_origin'?'start':item.id==='__day_night'?'night':'end';
      const title=stationAccess?{start:'Начало прогулки у станции',night:'Обратно к станции',end:'К вылету / отъезду'}[role]:{start:'Начало',night:'Возвращение',end:'К вылету / отъезду'}[role];
      const anchor=namedBases[role+'_at'],point=isPersonalPoint(anchor)?anchor:catalog.poi.find(p=>p.slug===anchor);
      const gps=Number.isFinite(point?.lat)&&Number.isFinite(point?.lon)?` GPS: ${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}.`:'';
      const vehicle=baseTransport(trip);
      if(role!=='start') {
        const inbound=planBaseTravel(trip,role,catalog,matrix);
        if(inbound)rows.push(roadJourney(item,inbound.travel,settings.reserve,name(inbound.from),blocked,name));
      }
      rows.push({id:item.id,kind:role==='start'?'start':'return',time:blocked?null:item.begins,title:`${title} · ${baseName(anchor,catalog)}`,text:(blocked?'Сначала нужно подобрать возвращение.':item.begins===null?`Не раньше ${clock(item.earliest_begin)}. Точное время ещё неизвестно.`:role==='start'?(stationAccess?'Начало прогулки после прибытия поезда.':'Начало дня по выбранному времени.'):'Время по расчёту дня. Подход к двери ещё нужно сверить.')+` ${mobilityLabel(trip)}.`+(vehicle && (role==='night'||role==='end'&&!bases.night_at) && trip.places.length && baseId(anchor)!==vehicle.via?` Сначала вернитесь к оставленному транспорту: ${name(vehicle.via)}. Парковку и проход нужно сверить.`:'')+gps+(issues.length?' '+issues.join(' '):''),state});return;
    }
    const place=catalog.poi.find(p=>p.slug===item.id);if(!place)throw Error('guide_unknown_point');
    const {projected,travel,access}=planTravel(trip,item.id,catalog,matrix),previous=previousPlace(projected,item.id);
    if(previous)rows.push(roadJourney(item,travel,settings.reserve,name(previous),blocked,name));
    const booking=bookings.stops[item.id],wait=waitJourney(item,!!booking);if(wait&&!blocked)rows.push(wait);
    const view=stopTimeView(item,booking,blocked),pause=settings.stops[item.id]?.pause || 0;
    rows.push({id:item.id,poi:item.id,kind:'visit',time:blocked?null:item.begins,title:place.name,
      text:`${view.label}: ${view.time}. ${item.visit_minutes} мин на месте${pause?` + ${pause} мин пауза`:''}.${outside?' Осмотр снаружи, без входа внутрь.':''}`+(view.note?' '+view.note:'')
        +(access?' '+parkingAccessNote(access):'')+(issues.length?' '+issues.join(' '):''),state});
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
    const matrix=generated?null:await matrixFor(current),services=serviceGuide(calculate,current,catalog,matrix);
    const result=generated?null:services?.check?.itinerary?services.check.places:calculate(planInput(current,catalog,matrix));
    let roads=generated?{type:'FeatureCollection',features:[]}:await roadsFor(current,matrix);
    // Legacy geometry must not bridge two places with a service in between.
    if(services){
      const pairs=(services.check?.itinerary?.connections||[]).filter(c=>c.status==='known'&&c.leg?.mode==='foot').map(c=>{
        const order=services.check.itinerary.order,from=order.find(v=>v.schedule_id===c.from),to=order.find(v=>v.schedule_id===c.to);
        return from?.kind==='place'&&to?.kind==='place'?{from:from.id,to:to.id}:null;
      }).filter(Boolean);
      roads={...roads,features:(roads.features||[]).filter(f=>f.properties?.mode==='foot'&&f.properties.kind==='travel'&&pairs.some(p=>p.from===f.properties.from&&p.to===f.properties.to))};
    }
    const rows=generated?[...kosa.rows,...(current.places.length?[{id:'extra-places',kind:'notice',time:null,title:'Дополнительные места вне расчёта',text:'Эти места сохранены ниже. Время поездки на косу их не учитывает.',state:'unknown'}]:[])]:mixedGuideRows(current,catalog,services||{},guideIssue)||guideDayRows(current,catalog,result,matrix);
    if(services&&!services.check?.itinerary){rows.push({id:'separate-visits',kind:'notice',time:null,title:'Посещения вне расчёта прогулки',text:services.error||'Выбранные посещения показаны отдельно. Дорога между ними и прогулкой ещё не рассчитана.',state:'unknown'},...services.services.map(v=>serviceRow(v)));}
    if(services?.issues.length)rows.push({id:'service-day-issues',kind:'notice',time:null,title:'Перед выходом',text:services.issues.join(' '),state:'unknown'});
    const stops=guide.stops.map(point=>{const p=catalog.poi.find(p=>p.slug===point.id);return {...point,completed:!!current.schedule?.progress?.completed.includes(point.id),photo:ownPointPhoto(p),conditions:structuredClone(p.visit_conditions || [])};});
    const entries=guideEntries(record,stops,services?.services||[]),complete=!services||!!services.check?.itinerary;
    const recipe=[...(catalog.routes || []),...(catalog.day_waves?.recipes || [])].find(row=>row.slug===record.wave?.recipe);
    out.push({id:record.id,name:record.name || (generated?'День на куршской волне':recipe?.name || waveLabel(record.wave)) || `День ${journeyDays(saved).findIndex(d=>d.id===record.id)+1 || index+1}`,date:current.date,
      record:structuredClone(record),party_label:partyLabel(record.party),preferences:assessDayPreferences(current,catalog,matrix),access:tripAccessProfile(current,catalog),status:services?(services.check?.state||'needs_info'):generated?kosa.state:result.status,summary:services?services.summary+(generated?' '+kosa.message:''):generated?kosa.message:(current.schedule?.progress?`Остаток дня с ${clock(current.schedule.progress.at)}. `:'')+guidePlanStatus[result.status],
      finish:!complete?null:generated?(kosa.book?.finish ?? null):dayFinish(result),earliest_finish:!complete?null:generated?(kosa.book?.earliest_finish??null):dayEarliestFinish(result),slack:!complete?null:generated?(kosa.book?.home?kosa.book.home.return_slack:kosa.book?.continuation?.slack ?? null):result?.rail?.home?result.rail.home.return_slack:result?.slack ?? null,
      rows,roads,roadSource:matrix?.source || null,kosa:kosa?.book || null,generated_note:kosa?.generated_note===true,
      stops,entries,menu_choices:menuChoiceGuide(record),services:services?.services||[],services_budget:services?.check?.services_budget||null,expenses:guideExpenses(calculate,current),
      bookings:(record.bookings || []).map(row=>({...structuredClone(row),kindLabel:BOOKING_KINDS[row.kind],statusLabel:BOOKING_STATUSES[row.status],locationLabel:baseName(row.location,catalog),problem:bookingProblem(row,record)})),
      planB:generated?kosa.book?.fallback || 'Откройте прежний план косы и подтвердите рейсы. До этого точное возвращение неизвестно.':'Если задержались или устали, сохраните время билета и обратного рейса. Пропустите гибкую остановку. После изменения дня пересчитайте дорогу; этот файл сам не обновляется.'});
  }
  return {version:1,scope,created_at:createdAt,title:scope==='day'?out[0].name:'Ваша поездка на Балтийской волне',days:out};
}
