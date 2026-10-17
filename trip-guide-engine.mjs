import {dayJourneyBoundaries,boundaryForEntry,usesJourneyBoundaries} from './day-journey-boundaries.mjs?v=2026101305';
import {guidePhotoMetadata} from './author-photo.mjs?v=20261016';
import {transportGuideRows,transportPlanB} from './trip-transport-plans-view.mjs?v=2026101305';
import {serviceVisitRows} from './trip-service-visits-contract.mjs?v=2026101305';
import {partyLabel,dayPeople} from './trip-party.mjs?v=2026101305';
import {checkedReferenceBudget} from './day-reference-budget.mjs?v=2026101702';
import {cityReferenceMatches} from './city-day-budget.mjs?v=2026101705';
import {mobilityLabel,baseTransport,vehicleParkingNote,parkingAccessNote} from './day-mobility.mjs?v=2026101305';
import {assessDayPreferences} from './day-preferences.mjs?v=2026101305';
import {tripAccessProfile} from './route-access.mjs?v=2026101305';
// Portable, read-only snapshot. All times come from the same Rust API as the day screen.
import {journeyDays,selectedDay,chooseTripDay} from './trip-days-state.mjs?v=2026101305';
import {planInput,planTravel,planBaseTravel,defaultSchedule} from './trip-schedule-state.mjs?v=2026101305';
import {resolveRail} from './trip-rail-state.mjs?v=2026101305';
import {railAccess,dayFinish,dayEarliestFinish} from './rail-access.mjs?v=2026101305';
import {endBookingLabel,bookingEffects,bookingProblem,effectiveBookingDay,BOOKING_KINDS,BOOKING_STATUSES} from './trip-bookings-state.mjs?v=2026101305';
import {baseName,baseId,personalPoints,isPersonalPoint} from './personal-points.mjs?v=2026101305';
import {resolveTravel,previousPlace,resolveAccess,dayBases} from './travel-estimates.mjs?v=2026101305';
import {resolveExcursion} from './trip-transport-state.mjs?v=2026101305';
import {railJourney,roadJourney,waitJourney,excursionJourney} from './day-journey-view.mjs?v=2026101305';
import {buildGuide} from './virtual-guide-engine.mjs?v=2026101406';
import {placePath} from './place-path.mjs?v=2026101406';
import {clock,stopTimeView,ownPointPhoto} from './day-stop-view.mjs?v=2026101305';
import {waveLabel} from './day-wave.mjs?v=2026101305';
import {serviceGuide,mixedGuideRows,serviceRow,guideEntries,guideExpenses} from './trip-service-guide.mjs?v=2026101705';
import {menuChoiceGuide} from './trip-menu-choices-view.mjs?v=2026101305';
import {quoteMenuDay,menuQuoteText} from './trip-menu-preview.mjs?v=2026101305';

const notes={unknown_travel:'Время дороги ещё неизвестно.',unknown_opening:'Часы посещения не записаны.',opening_needs_check:'Расчёт по опубликованным часам.',unknown_kitchen:'Последний заказ кухни: время не указано.',kitchen_needs_check:'Кухня учтена по опубликованным часам.',kitchen_closed:'В этот день заказы не принимают.',kitchen_window_missed:'К этому времени кухня уже не принимает заказ.',travel_needs_check:'Время дороги — оценка.',unknown_approach:'Неизвестно время подхода ко входу.',unknown_return:'Неизвестно время возвращения к парковке.',access_needs_check:'Время подхода ко входу и обратно — оценка.',transport_needs_check:'Переправу нужно сверить на дату поездки.',transport_incomplete:'Не хватает времени пути или расписания переправы.',transport_conflict:'Возвращение с переправы не складывается.',closed:'По выбранным часам в этот день посещений нет.',window_missed:'Осмотр не помещается в часы входа или сеанс.',appointment_needs_check:'Без времени дороги прибытие к билету нельзя подтвердить.',appointment_venue_conflict:'Время билета не совпадает с известными часами посещения.'};
export function guideIssue(issue) {
  if(issue.code==='fixed_visit_missed')return `К выбранному времени посещения не успеваем как минимум на ${issue.minutes} мин.`;
  if(issue.code==='fixed_visit_needs_check')return 'Прибытие к выбранному посещению ещё нельзя подтвердить.';
  if(issue.code==='appointment_missed')return `Позже записанного времени как минимум на ${issue.minutes} мин.`;
  if(issue.code==='after_deadline')return `Позже границы дня как минимум на ${issue.minutes} мин.`;
  return notes[issue.code] || 'Для этого участка нужны дополнительные сведения.';
}
export const guidePlanStatus={empty:'Остановок пока нет.',fits:'По вашим оценкам день складывается.',needs_check:'День складывается по оценкам. Дорогу и вход нужно сверить.',incomplete:'Точное время дня пока неизвестно: остались неуточнённые участки.',overrun:'Все остановки не помещаются в этот день.',conflict:'Есть остановки или рейсы, которые не помещаются в этот день.'};
const conflictIssues=new Set(['closed','window_missed','kitchen_closed','kitchen_window_missed','after_deadline','transport_conflict','appointment_missed','appointment_venue_conflict','fixed_visit_missed']);

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
    const issues=item.issues.map(issue=>outside && issue.code==='unknown_opening'?'Внешний осмотр: время доступа не записано.':guideIssue(issue)),state=item.issues.some(issue=>conflictIssues.has(issue.code))?'conflict':issues.length?'needs_check':'estimate';
    if(item.id==='__day_checkpoint'){rows.push({id:item.id,kind:'notice',time:settings.progress.at,title:`Снова в пути · ${name(settings.progress.after)}`,text:'Вы указали время после осмотра. Ниже — оставшийся день; пройденные места сохранены без выдуманного времени посещения.',state:'estimate'});return;}
    if(item.id.startsWith('__day_')) {
      const role=item.id==='__day_origin'?'start':item.id==='__day_night'?'night':'end';
      const title=stationAccess?{start:'Начало прогулки у станции',night:'Обратно к станции',end:bookings.end?.kind==='return'?'Возвращение':'К вылету / отъезду'}[role]:{start:'Начало',night:'Возвращение',end:bookings.end?.kind==='return'?'Возвращение':'К вылету / отъезду'}[role];
      const anchor=namedBases[role+'_at'],point=isPersonalPoint(anchor)?anchor:catalog.poi.find(p=>p.slug===anchor);
      const gps=Number.isFinite(point?.lat)&&Number.isFinite(point?.lon)?` GPS: ${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}.`:'';
      const vehicle=baseTransport(trip);
      if(role!=='start') {
        const inbound=planBaseTravel(trip,role,catalog,matrix);
        if(inbound)rows.push(roadJourney(item,inbound.travel,settings.reserve,name(inbound.from),blocked,name));
      }
      rows.push({id:item.id,kind:role==='start'?'start':'return',time:blocked?null:item.begins,title:`${title} · ${baseName(anchor,catalog)}`,text:(blocked?'Сначала нужно подобрать возвращение.':item.begins===null?`Не раньше ${clock(item.earliest_begin)}. Точное время ещё неизвестно.`:role==='start'?(stationAccess?'Начало прогулки после прибытия поезда.':'Начало дня по выбранному времени.'):'Время по расчёту дня. Подход к двери ещё нужно сверить.')+(role==='end'&&bookings.end?` ${endBookingLabel(bookings.end)} до ${clock(bookings.end.time)}; запас ${bookings.end.buffer} мин.`:'')+` ${mobilityLabel(trip)}.`+(vehicle && (role==='night'||role==='end'&&!bases.night_at) && trip.places.length && baseId(anchor)!==vehicle.via?` Сначала вернитесь к оставленному транспорту: ${name(vehicle.via)}. Парковку и проход нужно сверить.`:'')+gps+(issues.length?' '+issues.join(' '):''),state});return;
    }
    const place=catalog.poi.find(p=>p.slug===item.id);if(!place)throw Error('guide_unknown_point');
    const {projected,travel,access}=planTravel(trip,item.id,catalog,matrix),previous=previousPlace(projected,item.id);
    if(previous)rows.push(roadJourney(item,travel,settings.reserve,name(previous),blocked,name));
    const booking=bookings.stops[item.id],wait=waitJourney(item,!!booking);if(wait&&!blocked)rows.push(wait);
    const view=stopTimeView(item,booking,blocked),pause=settings.stops[item.id]?.pause || 0;
    const detail_text=`${item.visit_minutes} мин на месте${pause?` + ${pause} мин пауза`:''}.${outside?' Осмотр снаружи, без входа внутрь.':''}`+(view.note?' '+view.note:'')+(access?' '+parkingAccessNote(access):'');
    rows.push({id:item.id,poi:item.id,kind:'visit',time:blocked?null:item.begins,title:place.name,
      text:`${view.label}: ${view.time}. ${item.visit_minutes} мин на месте${pause?` + ${pause} мин пауза`:''}.${outside?' Осмотр снаружи, без входа внутрь.':''}`+(view.note?' '+view.note:'')
        +(access?' '+parkingAccessNote(access):'')+(issues.length?' '+issues.join(' '):''),
      detail_text,issue_notes:item.issues.map((issue,i)=>({...issue,text:issues[i]})),state});
    const excursion=resolveExcursion(trip,item.id,catalog);if(excursion&&item.excursion)rows.push(...excursionJourney(excursion,item.excursion,place.name));
  });
  if(settings.progress)rows.push({id:'completed-places',kind:'notice',time:null,title:'Уже были',text:settings.progress.completed.map(name).join(' · ')+'. Время посещения не записано.',state:'estimate'});
  return [...rows,...rail.after];
}

function guideReferenceBudget(calculate,record,people){
  if(!Object.hasOwn(record,'reference_budget'))return {};
  try{
    const value=checkedReferenceBudget(calculate,record.reference_budget),context=value.context;
    const city=['zelenogradsk-one-day','svetlogorsk-one-day'].includes(context.route);
    const stale=city?!cityReferenceMatches(value,record,people):context.route!==record.source_route||context.date!==record.date||context.people!==dayPeople(record,people);
    return {reference_budget:value,...(stale?{reference_budget_notice:'Маршрут, дата, участники или выбранные варианты изменились. Ниже сохранён прежний справочный расчёт; его цены и источники сами не обновляются.'}:{})};
  }catch{
    return {reference_budget_error:'Сохранённый справочный бюджет не прошёл проверку. Исходные суммы и источники остались в записи дня; уточните расчёт в плане.'};
  }
}
// Catalogue recommendations are independent of the user's ordered day.
// Remove only the exact generated suffix, retaining every authored paragraph.
function orderedStory(point,place) {
  if(point.kind!=='place_card')return point.story;
  const edges=place.complementary_edges||place;
  const tails=['edge_after','edge_before'].map(key=>edges[key]?.linking_sentence).filter(Boolean);
  return point.story.map(paragraph=>{
    for(const tail of tails)if(paragraph.endsWith(tail))paragraph=paragraph.slice(0,-tail.length).trimEnd();
    return paragraph;
  }).filter(Boolean);
}
function orderedGuideLegs(trip,catalog,matrix,result,services,rows,entries) {
  const legs=new Map(),name=id=>personalPoints(trip).find(p=>p.slug===id)?.name||baseName(id,catalog);
  const itinerary=services?.check?.itinerary,progress=trip.schedule?.progress;
  const ordered=!services&&progress?[entries.find(v=>v.kind==='place'&&v.id===progress.after),...entries.filter(v=>!v.completed)].filter(Boolean):entries;
  for(const [index,entry]of ordered.entries()) {
    if(entry.kind!=='place')continue;
    const next=ordered[index+1];let to=next?.id,toName=next?.name,travel=null,roadRows=[],kind=next?.kind||'return';
    if(itinerary){
      const from=itinerary.order.find(v=>v.kind==='place'&&v.id===entry.id);
      const connection=from&&itinerary.connections.find(v=>v.from===from.schedule_id);
      const destination=connection&&itinerary.order.find(v=>v.schedule_id===connection.to);
      // Never bridge a saved service or a removed/unsupported timeline entry.
      if(destination&&(!next||destination.kind===next.kind&&destination.id===next.id)){
        const boundary=boundaryForEntry(dayJourneyBoundaries(selectedDay(trip),catalog),destination);
        to=boundary?baseId(boundary.value):destination.id;toName=boundary?.anchor?.name||next?.name||name(to);
        roadRows=rows.filter(row=>row.id===`road:${destination.schedule_id}`||row.id.startsWith(`connection:${destination.schedule_id}:`));
        travel=connection.leg;
      }
    } else if(!services&&result){
      if(next?.kind==='place'){
        const resolved=planTravel(trip,next.id,catalog,matrix);
        if(previousPlace(resolved.projected,next.id)===entry.id){travel=resolved.travel;roadRows=rows.filter(row=>row.id===`road-${next.id}`);}
      } else if(!next){
        const item=result.stops.find(v=>v.id==='__day_night'||v.id==='__day_departure');
        const role=item?.id==='__day_night'?'night':'end',resolved=item&&planBaseTravel(trip,role,catalog,matrix);
        if(resolved?.from===entry.id){to=resolved.to;toName=name(to);travel=resolved.travel;roadRows=rows.filter(row=>row.id===`road-${item.id}`);}
        else {
          const rail=resolveRail(trip,catalog),row=rows.find(v=>v.id==='rail-return-walk');
          if(rail&&row){to=rail.service.id||'rail-return';toName=rail.service.to;roadRows=[row];}
        }
      }
    }
    if(!to||!toName)continue;
    const state=!roadRows.length||roadRows.some(row=>row.state==='unknown')?'unknown':roadRows.some(row=>row.state==='conflict')?'conflict':roadRows.some(row=>row.state==='needs_check')?'needs_check':roadRows.every(row=>row.state==='timetable')?'timetable':'estimate';
    const known=state!=='unknown'&&state!=='conflict';
    const meters=known&&travel?.origin!=='manual'&&Number.isFinite(travel?.distance_m)?travel.distance_m:null;
    const sources=[...new Map([travel?.source,...roadRows.flatMap(row=>[row.source,...(row.sources||[])])].filter(Boolean).map(source=>[JSON.stringify(source),source])).values()];
    legs.set(entry.id,{from:entry.id,to,kind,title:`${kind==='return'?'Возвращение':'Дальше'} — «${toName}»`,
      text:(meters!==null?`${meters} м по карте. `:'')+(roadRows.length?roadRows.map(row=>row.text).join(' '):'Дорога между этими остановками ещё не рассчитана.'),
      distance_m:meters,minutes:known?travel?.minutes??null:null,state,sources});
  }
  return legs;
}

export async function collectTripGuide({trip,catalog,scope='day',calculate,matrixFor,roadsFor,kosaFor,createdAt=new Date().toISOString()}) {
  if(!['day','trip'].includes(scope))throw Error('guide_invalid_scope');
  const saved=structuredClone(trip),allDays=journeyDays(saved),days=scope==='day'?[selectedDay(saved)]:allDays,out=[];
  for(const [index,record] of days.entries()) {
    const current=chooseTripDay(saved,record.id),generated=!!record.kosa_plan,transport=record.transport_plans?.entries||[],transportOnly=transport.length>0&&!current.places.length&&!serviceVisitRows(record).length&&!generated;
    const kosa=generated?await kosaFor(current):null;
    const points=[...new Set([...(generated?['vysota-efa',...(record.kosa_plan.walks==='two'?['tancuyushchiy-les']:[])]:[]),...current.places])];
    const guide=buildGuide(catalog,{trip:{...current,places:points}});
    const matrix=generated||transportOnly?null:await matrixFor(current),services=serviceGuide(calculate,current,catalog,matrix);
    // A separate transport receipt affects certainty, not the known walking geometry.
    const geometryServices=services?.check?.itinerary||services?.services?.length||Object.hasOwn(record,'timeline')||Object.hasOwn(record,'transfer_connections')||usesJourneyBoundaries(record,catalog)?services:null;
    const result=generated||transportOnly?null:services?.check?.itinerary?services.check.places:calculate(planInput(current,catalog,matrix));
    let roads=generated||transportOnly?{type:'FeatureCollection',features:[]}:await roadsFor(current,matrix);
    // Legacy geometry must not bridge two places with a service in between.
    if(geometryServices){
      const pairs=(services.check?.itinerary?.connections||[]).filter(c=>c.status==='known'&&c.leg?.mode==='foot').map(c=>{
        const order=services.check.itinerary.order,from=order.find(v=>v.schedule_id===c.from),to=order.find(v=>v.schedule_id===c.to);
        return from?.kind==='place'&&to?.kind==='place'?{from:from.id,to:to.id}:null;
      }).filter(Boolean);
      roads={...roads,features:(roads.features||[]).filter(f=>f.properties?.mode==='foot'&&f.properties.kind==='travel'&&pairs.some(p=>p.from===f.properties.from&&p.to===f.properties.to))};
    }
    const rows=generated?[...kosa.rows,...(current.places.some(id=>id!==kosa.book?.dinner?.plan.place.id)?[{id:'extra-places',kind:'notice',time:null,title:'Дополнительные места вне расчёта',text:'Эти места сохранены ниже. Время поездки на косу их не учитывает.',state:'unknown'}]:[])]:transportOnly?[]:mixedGuideRows(current,catalog,services||{},guideIssue)||guideDayRows(current,catalog,result,matrix);
    if(services?.services?.length&&!services.check?.itinerary){rows.push({id:'separate-visits',kind:'notice',time:null,title:'Посещения вне расчёта прогулки',text:services.error||'Выбранные посещения показаны отдельно. Дорога между ними и прогулкой ещё не рассчитана.',state:'unknown'},...services.services.map(v=>serviceRow(v)));}
    if(services?.issues.length)rows.push({id:'service-day-issues',kind:'notice',time:null,title:'Перед выходом',text:services.issues.join(' '),issue_codes:(services.check?.issues||[]).map(issue=>issue.code),state:'unknown'});
    if(transport.length)rows.push(...transportGuideRows(transport,record));
    const stops=guide.stops.map(point=>{const p=catalog.poi.find(p=>p.slug===point.id);
      // Hours and admission are separate canonical facts, but must travel with
      // the offline place card just like access conditions and their sources.
      const facts=[p.hours,p.price,...(p.visit_conditions || [])].filter(Boolean),seen=new Set();
      const conditions=facts.filter(fact=>{if(seen.has(fact.id))return false;seen.add(fact.id);return true;});
      const photo_metadata=guidePhotoMetadata(p);
      return {...point,story:orderedStory(point,p),photo_metadata,path:placePath(catalog,point.id),completed:!!current.schedule?.progress?.completed.includes(point.id),photo:photo_metadata?.src||ownPointPhoto(p),conditions:structuredClone(conditions)};});
    const entries=guideEntries(record,stops,services?.services||[]),legs=orderedGuideLegs(current,catalog,matrix,result,geometryServices,rows,entries);
    for(const stop of stops)if(legs.has(stop.id))stop.next_leg=legs.get(stop.id);
    const transportNeedsInfo=services?.transportNeedsInfo===true||services?.check?.issues?.some(issue=>String(issue.code||'').startsWith('transport_'))===true;
    const complete=!transportNeedsInfo&&(!services||!!services.check?.itinerary||(!services.services?.length&&!services.error&&!(services.check?.issues?.length)));
    const recipe=[...(catalog.routes || []),...(catalog.day_waves?.recipes || [])].find(row=>row.slug===record.wave?.recipe);
    let menuQuote=null;
    if(record.menu_choices?.length)try{menuQuote={...quoteMenuDay(calculate,record)};menuQuote.text=menuQuoteText(menuQuote);}catch{menuQuote={error:'Стоимость порций не рассчитана. Цены и количества сохранены ниже.'};}
    out.push({id:record.id,number:allDays.findIndex(d=>d.id===record.id)+1 || index+1,name:record.name || (transportOnly?transport[0].receipt.title:generated?'День на куршской волне':recipe?.name || waveLabel(record.wave)) || `День ${allDays.findIndex(d=>d.id===record.id)+1 || index+1}`,date:current.date,
      record:structuredClone(record),party_label:partyLabel(record.party),preferences:assessDayPreferences(current,catalog,matrix),access:tripAccessProfile(current,catalog),status:services?(services.check?.state||'needs_info'):transport.length?'needs_info':generated?kosa.state:result.status,summary:services?services.summary+(generated?' '+kosa.message:''):transport.length?'Транспорт сохранён отдельным расчётом. Остальные места и дорога между ними в него не входят.':generated?kosa.message:(current.schedule?.progress?`Остаток дня с ${clock(current.schedule.progress.at)}. `:'')+guidePlanStatus[result.status],
      finish:!complete?null:generated?(kosa.book?.finish ?? null):dayFinish(result),earliest_finish:!complete?null:generated?(kosa.book?.earliest_finish??null):dayEarliestFinish(result),slack:!complete?null:generated?(kosa.book?.home?kosa.book.home.return_slack:kosa.book?.continuation?.slack ?? null):result?.rail?.home?result.rail.home.return_slack:result?.slack ?? null,
      slack_label:generated?(kosa.book?.home?'запас до возвращения':'запас до конца заданного окна дня'):result?.rail?.home?'запас до выбранного обратного рейса':'запас до конца заданного окна дня',
      rows,transport_plans:structuredClone(transport),roads,roadSource:matrix?.source || null,kosa:kosa?.book || null,generated_note:kosa?.generated_note===true,
      stops,entries,menu_choices:menuChoiceGuide(record),menu_quote:menuQuote,services:services?.services||[],services_budget:services?.check?.services_budget||null,expenses:guideExpenses(calculate,current),...guideReferenceBudget(calculate,record,saved.itinerary?.people||1),
      bookings:(record.bookings || []).map(row=>({...structuredClone(row),kindLabel:BOOKING_KINDS[row.kind],statusLabel:BOOKING_STATUSES[row.status],locationLabel:baseName(row.location,catalog),problem:bookingProblem(row,record)})),
      planB:transportOnly&&transport.length===1?transportPlanB(transport[0].receipt):generated?kosa.book?.fallback || 'Откройте прежний план косы и подтвердите рейсы. До этого точное возвращение неизвестно.':'Если задержались или устали, сохраните время билета и обратного рейса. Пропустите гибкую остановку. После изменения дня пересчитайте дорогу; этот файл сам не обновляется.'});
  }
  return {version:1,scope,created_at:createdAt,title:scope==='day'?out[0].name:'Ваша поездка на Балтийской волне',days:out};
}
