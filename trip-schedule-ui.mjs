import {selectedDay} from './trip-days-state.mjs?v=16';
import {resolveRail} from './trip-rail-state.mjs?v=5';
import {railJourney,roadJourney,waitJourney} from './day-journey-view.mjs?v=3';
import {journeyRow} from './day-journey-ui.mjs?v=3';
import {bookingEffects,effectiveBookingDay} from './trip-bookings-state.mjs?v=2';
import {baseName} from './personal-points.mjs?v=3';
import {lightInput, lightAlternative, lightMessage, renderLightView, tripSignature} from './trip-light.mjs?v=9';
import {defaultSchedule, planInput, planTravel, updateSchedule} from './trip-schedule-state.mjs?v=13';
import {loadScheduler} from './trip-scheduler.mjs?v=20';
import {resolveVisitCalendar, visitFacts} from './visit-calendar.mjs?v=4';
import {resolveKitchenCalendar} from './kitchen-calendar.mjs';
import {transportCard,bindTransport} from './trip-transport-ui.mjs?v=8';
import {TRAVEL_MODES, travelMode, manualLeg, resolveTravel, resolveAccess, loadTripTravelMatrix, previousPlace, dayBases} from './travel-estimates.mjs?v=6';
import {clock, ownPointPhoto, stopTimeView, routineStopIssue} from './day-stop-view.mjs?v=1';
import {initTimingAdvice} from './day-timing-advice-ui.mjs?v=4';
import {initFlexAdvice} from './day-flex-advice-ui.mjs?v=7';
import {initDayProgress} from './day-progress-ui.mjs?v=2';
import {progressMessages} from './day-progress-advice.mjs?v=2';
import {currentProgress,remainingTrip} from './day-progress.mjs?v=2';
import {flexSignature} from './day-flex-advice.mjs?v=7';
import {markVisited,travelContext} from './trip-travel-state.mjs?v=6';

export {clock} from './day-stop-view.mjs?v=1';
const timeInput = minute => minute === null ? '' : clock(minute%1440);
const minutes = text => /^\d{2}:\d{2}$/.test(text) ? Number(text.slice(0,2))*60+Number(text.slice(3)) : null;

export function initTripSchedule({mount, read, commit, base, catalog}) {
  if (!mount) return {render(){}};
  const compact=document.body.dataset.tool==='planner';
  const section = document.createElement('section'); section.className='trip-schedule'; section.setAttribute('aria-labelledby','trip-plan-title');
  section.innerHTML=`<div class="trip-plan-heading"><div><p class="eyebrow">Оставьте время морю</p><h3 id="trip-plan-title">Ваш день, без спешки</h3><p>Осмотр, дорога и пауза у воды. Соберите день, в котором не придётся всё время спешить.</p></div><button type="button" class="button button-light" id="trip-plan-open" aria-expanded="false" aria-controls="trip-plan-body">Рассчитать время</button></div>
  <div id="trip-plan-body" hidden><p class="trip-plan-note">Выберите, как будете перемещаться. Оценим дорогу по открытой карте; осмотр и паузы можно подстроить под себя. Дата добавит часы работы и сеансы. Перед поездкой сверьте вход, парковку и билеты. Если путь ещё неясен, время дальше останется неполным.</p><form id="trip-day-settings" class="trip-day-settings"></form><section id="trip-light" class="trip-light" aria-label="Свет выбранного дня"></section><p id="trip-plan-summary" role="status"></p><ol id="trip-plan-stops" class="trip-plan-stops"></ol><p id="trip-plan-feedback" role="status"></p></div>`;
  mount.insertBefore(section, mount.querySelector('#trip-weather, #trip-utilities'));
  if(compact) {
    section.classList.add('day-timeline');
    section.querySelector('#trip-plan-title').textContent='Один шаг за другим';
    const body=section.querySelector('#trip-plan-body');body.hidden=false;
    const timing=document.createElement('details');timing.id='trip-timing-settings';timing.className='day-disclosure';
    const caption=document.createElement('summary');caption.textContent='Время и транспорт';timing.append(caption);
    body.prepend(timing);timing.append(section.querySelector('.trip-plan-note'),section.querySelector('#trip-day-settings'));
    const light=document.createElement('details');light.className='day-disclosure day-light-details';
    const title=document.createElement('summary');title.textContent='Свет и закат';light.append(title,section.querySelector('#trip-light'));body.append(light);
    const open=section.querySelector('#trip-plan-open');open.hidden=true;open.setAttribute('aria-expanded','true');
  }
  const $=selector=>section.querySelector(selector);
  const adviceMount=document.createElement('section');adviceMount.className='day-timing-advice';adviceMount.hidden=true;
  $('#trip-plan-summary').after(adviceMount);
  const advice=initTimingAdvice({mount:adviceMount,commit,feedback:$('#trip-plan-feedback')});
  const flexMount=document.createElement('details');flexMount.className='day-flex-advice day-timing-advice';flexMount.hidden=true;
  $('#trip-plan-stops').after(flexMount);
  const flex=initFlexAdvice({mount:flexMount,commit,feedback:$('#trip-plan-feedback')});
  const progressMount=document.createElement('details');progressMount.id='day-progress';progressMount.className='day-progress day-timing-advice';progressMount.hidden=true;
  $('#trip-plan-summary').after(progressMount);
  const progress=initDayProgress({mount:progressMount,commit,feedback:$('#trip-plan-feedback')});
  bindTransport({section,read,commit,catalog,feedback:$('#trip-plan-feedback')});
  let opened=compact, sequence=0;
  function input(form, caption, name, type, value, stop) {
    const label=document.createElement('label'), field=document.createElement('input');
    label.textContent=caption;field.type=type;field.name=name;field.value=value;field.dataset.planField=name;
    if (stop) field.dataset.planStop=stop;
    if (type==='number') {field.min='0';field.max='1440';field.step='1';field.required=true;}
    label.append(field);form.append(label);return field;
  }
  const applyButton = form => {
    const button=document.createElement('button');button.type='submit';button.className='save-item';button.textContent='Сохранить время';form.append(button);
  };
  function renderSettings(settings) {
    const form=$('#trip-day-settings');form.replaceChildren();form.dataset.planDayId=read().itinerary?.active || '';
    const modes=document.createElement('fieldset'), legend=document.createElement('legend');modes.className='trip-travel-modes';legend.textContent='Как перемещаемся';modes.append(legend);
    for(const [mode,caption]of Object.entries(TRAVEL_MODES)) {
      const label=document.createElement('label'), radio=document.createElement('input'), text=document.createElement('span');
      radio.type='radio';radio.name='mode';radio.value=mode;radio.checked=mode===(settings.mode || 'foot');radio.dataset.planField='mode';
      text.textContent=caption;label.append(radio,text);modes.append(label);
    }form.append(modes);
    input(form,'Начать в','start','time',timeInput(settings.start)).required=true;
    input(form,'Закончить до','end','time',timeInput(settings.end)).required=true;
    input(form,'Запас на каждый переход, мин','reserve','number',settings.reserve);
    applyButton(form);
  }
  function calendarCard(place, trip, value, manual, item) {
    const calendar=resolveVisitCalendar(place,trip.date,value.visit_fact,value.visit_scope), facts=visitFacts(place);
    const card=document.createElement('div');card.className='trip-visit-calendar';
    card.dataset.visitOrigin=manual ? 'manual' : calendar.windows!==null || calendar.sessions!==null ? 'calendar' : 'unknown';
    card.dataset.visitReason=calendar.reason || '';card.dataset.visitDate=trip.date || '';
    if(facts.length || value.visit_scope==='outside') {
      const label=document.createElement('label'), select=document.createElement('select');
      label.textContent='Что хотите посетить';select.dataset.planCalendar=item.id;select.dataset.planField='visit_fact';select.dataset.planStop=item.id;
      const automatic=document.createElement('option');automatic.value='';automatic.textContent=place.hours ? place.hours.label : 'Выберите посещение';select.append(automatic);
      const outside=document.createElement('option');outside.value='__outside';outside.textContent='Посмотреть снаружи';select.append(outside);
      for(const fact of facts.filter(row=>row.id!==place.hours?.id)) {
        const option=document.createElement('option');option.value=fact.id;option.textContent=fact.label;select.append(option);
      }
      if(value.visit_fact && !facts.some(row=>row.id===value.visit_fact)) {
        const missing=document.createElement('option');missing.value=value.visit_fact;missing.textContent='Прежнее расписание больше не доступно';select.append(missing);
      }
      select.value=value.visit_scope==='outside'?'__outside':value.visit_fact || '';label.append(select);card.append(label);
    }
    const title=document.createElement('p');title.className='trip-calendar-title';
    title.textContent=manual ? `Ваше время: ${clock(manual.open)}–${clock(manual.close)}` : calendar.reason==='outside'?'Осмотр снаружи':calendar.fact?.label || 'Время посещения';card.append(title);
    const note=document.createElement('p');
    if(manual) note.textContent='Для этой даты расчёт использует ваше окно посещения.';
    else if(calendar.reason==='outside')note.textContent='Без входа внутрь. Музейные сеансы и часы помещений не применяются. Доступ с улицы нужно сверить перед выходом.';
    else if(calendar.reason==='closed') note.textContent=calendar.exceptionDate?'В изменении на эту дату указано, что посещений нет.':'По обычному расписанию в этот день выходной.';
    else if(calendar.windows?.length) {
      note.textContent=calendar.windows.map(window=>`${clock(window.open)}–${clock(window.close)}`+(window.last_entry!==undefined ? ` · вход до ${clock(window.last_entry)}` : '')).join('; ')
        +(calendar.rule?.cash_closes ? ` · касса до ${calendar.rule.cash_closes}` : '');
    } else if(calendar.sessions?.length) {
      note.textContent=`Сеанс занимает ${calendar.rule?.duration || calendar.sessions[0].duration} мин. Начало — строго по расписанию; наличие билетов нужно проверить.`;
      const times=document.createElement('details'), summary=document.createElement('summary'), list=document.createElement('p');
      summary.textContent='Все начала сеансов';list.textContent=calendar.sessions.map(row=>clock(row.start)).join(' · ');times.append(summary,list);card.append(times);
    } else note.textContent={choose_date:'Укажите дату поездки, чтобы сверить день недели и сезон.',outside_validity:'Это расписание не действует на выбранную дату. Уточните новое у места.',
      park_scope:'Часы территории парка не заменяют часы тропы или экскурсии.',cashdesk_scope:'Это часы кассы. Время концерта или спектакля выбирают по билету.',
      unknown_day:'Для этого дня часов пока нет. Уточните их у места.',missing_fact:'Прежнее расписание больше не доступно. Выберите другое посещение.',
      unknown_hours:'Точного окна для расчёта пока нет. Уточните его у места.'}[calendar.reason] || 'Часы на выбранную дату нужно уточнить.';
    card.append(note);
    if(calendar.fact) {
      const source=document.createElement('p');source.className='trip-calendar-source';const link=document.createElement('a');
      const evidence=calendar.source || calendar.fact.source;
      link.href=evidence.url;link.target='_blank';link.rel='noopener';link.textContent=evidence.name;
      source.append(link,` · проверено ${evidence.checked_at.split('-').reverse().join('.')}`);card.append(source);
      if(!manual && calendar.needsCheck) {const caution=document.createElement('p');caution.className='trip-calendar-source';caution.textContent=calendar.exceptionDate ? 'Изменение на выбранную дату. Билеты и работу места перед поездкой сверьте с ним.' : 'Обычное расписание: праздники и изменения на дату поездки сверьте с местом.';card.append(caution);}
    }
    if(manual) {const reset=document.createElement('button');reset.type='button';reset.dataset.planReset=item.id;reset.className='save-item';reset.textContent='Вернуться к расписанию места';card.append(reset);}
    if(calendar.reason==='choose_date' && !manual) {const choose=document.createElement('button');choose.type='button';choose.className='save-item';choose.textContent='Указать дату';choose.addEventListener('click',()=>document.querySelector('#trip-date')?.focus());card.append(choose);}
    return card;
  }
  function kitchenCard(place, trip) {
    const value=resolveKitchenCalendar(place,trip.date);if(!value)return null;
    const card=document.createElement('div');card.className='trip-visit-calendar trip-kitchen-calendar';
    card.dataset.kitchenReason=value.calendar.reason || '';
    const title=document.createElement('p');title.className='trip-calendar-title';title.textContent='Когда можно заказать';card.append(title);
    const note=document.createElement('p'), c=value.calendar;
    note.textContent=c.windows===null ? 'Время последнего заказа ещё не подтверждено. Часы зала его не заменяют.' : !c.windows.length ? 'На выбранную дату заказы не принимают.' : c.windows.map(w=>`${clock(w.open)}–${clock(w.last_entry??w.close)}`).join('; ')+' · заказать нужно в это время; закончить еду можно позже, до закрытия зала.';
    card.append(note);
    if(c.fact) {
      const evidence=c.source || c.fact.source, source=document.createElement('p'), link=document.createElement('a');source.className='trip-calendar-source';
      link.href=evidence.url;link.target='_blank';link.rel='noopener';link.textContent=evidence.name;
      source.append(link,` · проверено ${evidence.checked_at.split('-').reverse().join('.')}`);card.append(source);
    }
    return card;
  }
  function renderStops(trip, result, matrix, light) {
    const settings=trip.schedule || defaultSchedule(),observed=currentProgress(trip);
    const rail=compact?railJourney(resolveRail(trip,catalog),result.rail):{before:[],after:[]};
    $('#trip-plan-stops').replaceChildren(...rail.before.map(journeyRow),...result.stops.map((item,index)=>{
      const blockedByReturn=result.stops.slice(0,index).some(row=>row.excursion?.conflict);
      if(item.id==='__day_checkpoint')return journeyRow({id:item.id,kind:'notice',time:observed.at,title:`Снова в пути · ${catalog.poi.find(p=>p.slug===observed.after)?.name || observed.after}`,text:'Вы указали время после осмотра. Пройденные места остаются в поездке; ниже — оставшийся путь.',state:'estimate'});
      if(item.id==='__day_origin' || item.id==='__day_night' || item.id==='__day_departure') {
        const li=document.createElement('li'), bases=dayBases(trip), origin=item.id==='__day_origin', departure=item.id==='__day_departure';
        li.className='trip-day-anchor';li.dataset.planAnchor=origin?'start':departure?'end':'night';
        const rawDay=trip.itinerary?.days.find(row=>row.id===trip.itinerary.active),day=rawDay?effectiveBookingDay(rawDay):null, placeName=baseName(origin?day?.start_at:departure?bookingEffects(trip).end?.location:day?.night_at,catalog);
        const header=document.createElement('div');header.className='trip-timeline-heading';
        const time=document.createElement('span');time.className='trip-timeline-time';time.textContent=blockedByReturn?'После возвращения':item.begins===null?`Не раньше ${clock(item.earliest_begin)}`:clock(item.begins);
        const name=document.createElement('span');name.textContent=`${origin?'Начало':departure?'К вылету / отъезду':'К ночи'} · ${placeName}`;header.append(time,name);li.append(header);
        const note=document.createElement('p');note.className='trip-timeline-detail';note.textContent=origin?'Дорога начинается у ближайшего подходящего дорожного сегмента. Подход от двери до него ещё нужно сверить.':'Дорога к ближайшему дорожному сегменту включена в окончание дня. Подход к двери ещё нужно сверить.';
        if(item.issues.some(row=>['unknown_travel','unknown_approach','unknown_return'].includes(row.code)))note.textContent+=' Путь ещё нужно уточнить: точное время неизвестно.';
        if(item.issues.some(row=>row.code==='after_deadline')) {note.textContent+=' Позже границы дня или времени возвращения к отъезду.';li.dataset.planConflict='true';}
        li.append(note);return li;
      }
      const place=catalog.poi.find(row=>row.slug===item.id), value=settings.stops[item.id] || {visit:30,pause:0,leg:null,window:null};
      const window=value.window?.date === trip.date ? value.window : null;
      const {projected,travel,access}=planTravel(trip,item.id,catalog,matrix),manual=manualLeg(projected,item.id);
      const li=document.createElement('li');li.dataset.planPoint=item.id;
      li.dataset.travelOrigin=travel.origin;li.dataset.travelStatus=travel.status || '';li.dataset.travelMode=travel.mode;
      const booking=bookingEffects(trip).stops[item.id];
      const header=document.createElement('div');header.className='trip-timeline-heading';
      const time=document.createElement('span');time.className='trip-timeline-time';
      time.textContent=blockedByReturn?'После возвращения':item.begins === null ? `Не раньше ${clock(item.earliest_begin)}` : clock(item.begins);
      const name=document.createElement('a');name.href=new URL(`poi/${item.id}/`,base).href;name.textContent=place.name;
      header.append(time,name);li.append(header);
      if(compact) {
        const view=stopTimeView(item,booking,blockedByReturn);li.dataset.dayTiming=view.kind;
        const lead=document.createElement('div');lead.className='day-stop-lead';header.before(lead);lead.append(header);
        const caption=document.createElement('span');caption.className='day-time-caption';caption.textContent=view.label;
        time.before(caption);time.textContent=view.time;name.className='day-stop-name';
        const photo=ownPointPhoto(place);
        if(photo) {
          const link=document.createElement('a');link.href=name.href;link.className='day-stop-photo';
          link.setAttribute('aria-label',`Открыть ${place.name}`);
          const image=document.createElement('img');image.src=new URL(photo,base);image.alt='';
          image.width=192;image.height=144;image.loading='lazy';image.decoding='async';image.fetchPriority='low';
          image.addEventListener('error',()=>{link.remove();lead.dataset.hasPhoto='false';},{once:true});
          link.append(image);lead.append(link);lead.dataset.hasPhoto='true';
        }
        if(view.note){const note=document.createElement('p');note.className='day-arrival-note';note.textContent=view.note;li.append(note);}
      }
      const timing=document.createElement('p');timing.className='trip-timeline-detail';
      timing.textContent=`${item.visit_minutes} мин на осмотр`+(value.pause ? ` · ${value.pause} мин пауза` : '')
        +(!compact && item.wait ? ` · ${item.wait} мин ожидание` : '')
        +(!compact && previousPlace(projected,item.id) && travel.minutes!==null ? ` · ${travel.origin==='estimate'?'около ':''}${travel.minutes} мин дорога + ${settings.reserve} мин запас` : '');
      li.append(timing);
      if(compact) {
        const previous=previousPlace(projected,item.id);
        const steps=[];
        if(previous)steps.push(roadJourney(item,travel,settings.reserve,baseName(previous,catalog),blockedByReturn));
        const wait=waitJourney(item,!!booking);if(wait)steps.push(wait);
        if(steps.length){const path=document.createElement('ol');path.className='day-stop-journey';path.setAttribute('aria-label','Дорога к остановке');path.append(...steps.map(journeyRow));header.closest('.day-stop-lead').before(path);}
      }
      if(booking){const note=document.createElement('p');note.className='trip-booking-timing';note.textContent=`${booking.name}: ${clock(booking.time)} · ${booking.duration} мин · время записано вами`;li.append(note);}
      const lightRow=light?.stops.find(row=>row.id===item.id),lightText=lightRow && lightMessage(lightRow);
      if(lightText) {const note=document.createElement('p');note.className='trip-light-note';note.dataset.lightState=lightRow.state;note.textContent=lightText;li.append(note);}
      if(previousPlace(projected,item.id)) {
        const road=document.createElement('div');road.className='trip-road-note';
        const text=document.createElement('p');
        if(travel.origin==='same_place')text.textContent='Начало и остановка в одном месте: дорога между ними не нужна.';
        else if(travel.origin==='estimate') {
          text.textContent=`${TRAVEL_MODES[travel.leg_mode || travel.mode]} · ${(travel.distance_m/1000).toLocaleString('ru-RU',{maximumFractionDigits:1})} км по карте. `
            +(travel.leg_mode==='foot' && travel.mode!=='foot'?'Машина остаётся на общей парковке.':travel.mode==='car'?'Без пробок и поиска свободного места. Для отмеченных парковок пеший участок учтён отдельно; у остальных мест подход ещё нужно сверить.':'Темп, покрытие и остановки могут изменить время. Вход может быть в стороне от дорожной привязки.');
          if(travel.snap_m?.some(m=>m>50))text.textContent+=` От дорожных привязок до меток — ${travel.snap_m[0]} и ${travel.snap_m[1]} м по прямой. Путь ко входу не учтён.`;
        }else if(travel.origin==='manual')text.textContent='Используем ваше время дороги для этого направления и способа передвижения.';
        else text.textContent={far_snap:'Дорога далеко от отмеченной точки. Уточните вход или парковку и задайте своё время.',
          restricted_access:'На пути отмечено ограничение доступа. Проверьте его перед поездкой и задайте время дороги.',
          ferry_schedule:'Путь проходит через паром. Нужны расписание и время ожидания.',
          country_check:'Этот путь требует проверки границ. Автоматически в план его не добавляем.',
          long_leg:'Переход занимает больше суток. Разделите поездку на дни или выберите другой транспорт.',
          no_path:'Для этого способа передвижения связного пути пока нет.',changed_point:'Координаты места изменились. Оценку дороги нужно обновить.',
          coincident_snap:'Дорожные привязки совпали. Путь между входами ещё нужно уточнить.',unavailable:'Оценки дороги сейчас не загрузились. Можно задать своё время.',missing_pair:'Этот переход ещё не рассчитан. Можно задать своё время.'}[travel.status]||'Время дороги ещё нужно уточнить.';
        road.append(text);
        if(travel.source) {
          const source=document.createElement('a');source.href=travel.source.url;source.target='_blank';source.rel='noopener';source.textContent=`OpenStreetMap · карта на ${travel.source.snapshot_at.slice(0,10).split('-').reverse().join('.')}`;
          const license=document.createElement('a');license.href=new URL('assets/licenses/routing-data.txt',base);license.target='_blank';license.rel='noopener';license.textContent='Условия карты';road.append(source,' · ',license);
        }
        if(compact && travel.origin==='estimate') {
          const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Как рассчитана дорога';details.className='day-road-details';details.append(summary,road);li.append(details);
        }else li.append(road);
      }
      if(access) {
        const card=document.createElement('div');card.className='trip-calendar-card trip-access-card';card.dataset.planAccess=item.id;
        const title=document.createElement('p');title.className='trip-calendar-title';title.textContent=access.anchor.name;
        const note=document.createElement('p');note.textContent=access.anchor.note;
        const path=document.createElement('p');path.className='trip-timeline-detail';
        path.textContent=(access.approach.origin==='shared'?'Переход от предыдущей точки уже учтён.':access.approach.minutes===null?'Время от парковки до места пока неизвестно.':`От парковки до места — около ${access.approach.minutes} мин пешком.`)
          +' '+(access.back.origin==='shared'?'К машине вернётесь после следующей точки.':access.back.minutes===null?'Время возвращения к парковке пока неизвестно.':`Обратно — около ${access.back.minutes} мин.`);
        const source=document.createElement('a');source.href=access.anchor.source.url;source.target='_blank';source.rel='noopener';source.textContent=`Точка на OpenStreetMap · проверена ${access.anchor.source.checked_at.split('-').reverse().join('.')}`;
        const nav=document.createElement('a');nav.href=new URL(`?map=${access.anchor.id}`,base);nav.className='save-item';nav.textContent='Парковка на нашей карте ↗';
        const evidence=document.createElement('p');evidence.className='trip-calendar-source';evidence.append(source);
        const caution=document.createElement('p');caution.className='trip-calendar-source';caution.textContent='Подход оценён по карте. Ступени, настил и фактический вход сверьте перед поездкой.';
        card.append(title,path,note,evidence,caution,nav);li.append(card);
      }
      const calendar=calendarCard(place,trip,value,window,item);
      if(compact) {
        const details=document.createElement('details'),summary=document.createElement('summary');
        details.className='day-visit-details';details.dataset.dayVisit=item.id;
        const reason=calendar.dataset.visitReason;
        summary.textContent=reason==='outside'?'Посмотреть снаружи':reason==='closed'?'В этот день закрыто':reason==='choose_date'?'Часы посещения · укажите дату':calendar.dataset.visitOrigin==='unknown'?'Часы посещения · нужно уточнить':calendar.querySelector('.trip-calendar-title')?.textContent || 'Часы посещения';
        details.append(summary,calendar);li.append(details);
      }else li.append(calendar);
      const kitchen=kitchenCard(place,trip);if(kitchen)li.append(kitchen);
      const transport=transportCard({trip,item,place,catalog,clock});if(transport)li.append(transport);
      if(item.issues.length) {
        const issues=document.createElement('ul');issues.className='trip-plan-issues';
        const routine=document.createElement('ul');routine.className='trip-plan-issues';
        for(const issue of item.issues) {
          const line=document.createElement('li');line.dataset.planIssue=issue.code;
          line.textContent={unknown_travel:'Сколько займёт дорога от предыдущей точки?',unknown_opening:value.visit_scope==='outside'?'Доступ к месту снаружи ещё нужно сверить.':'Время входа ещё нужно сверить.',
            opening_needs_check:'Часы учтены. Осталось сверить дату и билеты с местом.',
            unknown_kitchen:'До какого часа принимают заказ — уточните у кафе.',kitchen_needs_check:'Приём заказов учтён. Время на выбранную дату нужно сверить.',
            kitchen_closed:'В этот день заказы не принимают.',kitchen_window_missed:'К началу остановки кухня уже не принимает заказ. Начните раньше или выберите другое кафе.',
            travel_needs_check:'Дорога учтена как оценка. Сверьте доступ и оставьте запас.',
            unknown_approach:'Уточните пеший путь от парковки до места.',unknown_return:'Уточните время возвращения к парковке.',
            access_needs_check:'Пеший участок учтён по карте. Доступ и темп нужно сверить.',
            transport_needs_check:'Переправа учтена по расписанию и оценкам. Рейсы на дату поездки нужно сверить.',
            transport_incomplete:'Для точного дня не хватает расписания или времени переправы и пути к причалу.',
            transport_conflict:'Переправа не складывается: рейсов нет или последний уже не подходит.',
            closed:'По выбранному расписанию в этот день нет посещений.',window_missed:'Осмотр не помещается в часы работы или время последнего входа; подходящего сеанса тоже нет.',
            appointment_missed:`К записанному времени опаздываем как минимум на ${issue.minutes} мин. Переставьте остановки или начните раньше.`,
            appointment_needs_check:'Время билета записано, но неизвестная дорога не позволяет подтвердить прибытие вовремя.',
            appointment_venue_conflict:'Время билета не совпадает с известными часами или сеансами. Сверьте запись с местом.',
            after_deadline:`Позже конца дня как минимум на ${issue.minutes} мин.`}[issue.code];
          if(['closed','window_missed','kitchen_closed','kitchen_window_missed','after_deadline','transport_conflict','appointment_missed','appointment_venue_conflict'].includes(issue.code)) li.dataset.planConflict='true';
          (compact && routineStopIssue(issue) ? routine : issues).append(line);
        }
        if(issues.children.length)li.append(issues);
        if(routine.children.length){const details=document.createElement('details'),summary=document.createElement('summary');details.className='day-before-leaving';details.dataset.dayChecks=item.id;summary.textContent=`Перед выходом · ${routine.children.length}`;details.append(summary,routine);li.append(details);}
      }
      const details=document.createElement('details'), summary=document.createElement('summary'), form=document.createElement('form');
      details.dataset.planEditor=item.id;summary.textContent='Настроить остановку';form.dataset.planEdit=item.id;form.dataset.planFrom=previousPlace(projected,item.id) || '';form.dataset.planDayId=trip.itinerary?.active || '';form.dataset.planDay=trip.date || '';form.dataset.planMode=travelMode(trip);form.className='trip-stop-settings';details.append(summary,form);
      const visitField=input(form,booking?'Длительность из записи, мин':'На осмотр, мин','visit','number',booking?.duration??value.visit,item.id);
      if(booking){visitField.disabled=true;const note=document.createElement('p');note.className='trip-plan-note';note.textContent='Длительность и фиксированное время меняются в карточке билета выше.';form.append(note);}
      input(form,'Пауза после осмотра, мин','pause','number',value.pause,item.id);
      if(previousPlace(projected,item.id)) {const field=input(form,'Ваше время дороги, мин','travel','number',manual?.minutes ?? '',item.id);field.required=false;field.placeholder=travel.origin==='estimate'?`По карте: ${travel.minutes}`:'Пока неизвестно';
        const note=document.createElement('p');note.className='trip-plan-note';note.textContent='Пустое поле возвращает оценку по карте. Ваше время относится к выбранному способу передвижения.';form.append(note);}
      input(form,'Вход не раньше, если знаете','open','time',timeInput(window?.open ?? null),item.id);
      input(form,'Закончить осмотр до, если знаете','close','time',timeInput(window?.close ?? null),item.id);
      if(value.window && !window) {const note=document.createElement('p');note.className='trip-plan-note';note.textContent='Окно посещения было задано для другой даты. Уточните его заново.';form.append(note);}
      applyButton(form);li.append(details);return li;
    }),...rail.after.map(journeyRow));
    if(observed){const history=document.createElement('details');history.className='day-disclosure';history.dataset.progressHistory='true';const title=document.createElement('summary');title.textContent=`Позади: ${observed.completed.length}`;history.append(title);const list=document.createElement('ul');for(const id of observed.completed){const item=document.createElement('li');item.textContent=catalog.poi.find(p=>p.slug===id)?.name || id;list.append(item);}history.append(list);$('#trip-plan-stops').before(history);}
  }
  async function render() {
    advice.reset();
    flex.reset();progress.reset();section.querySelector('[data-progress-history]')?.remove();
    const generated=compact && selectedDay(read()).kosa_plan;
    section.hidden = !generated && read().places.length === 0 && !read().schedule?.rail;
    if(compact)$('#trip-timing-settings').hidden=!!generated;
    if(!opened) return;
    const ticket=++sequence, trip=read(), settings=trip.schedule || defaultSchedule();
    const focused=document.activeElement?.dataset.planField, focusedStop=document.activeElement?.dataset.planStop, focusedMode=document.activeElement?.type==='radio'?document.activeElement.value:null;
      const expanded=[...section.querySelectorAll('details[data-plan-editor][open]')].map(node=>node.dataset.planEditor);
      const transportExpanded=[...section.querySelectorAll('details[data-transport-editor][open]')].map(node=>node.dataset.transportEditor);
      const visitsExpanded=[...section.querySelectorAll('details[data-day-visit][open]')].map(node=>node.dataset.dayVisit);
      const checksExpanded=[...section.querySelectorAll('details[data-day-checks][open]')].map(node=>node.dataset.dayChecks);
    section.dataset.scheduleReady='false';
    $('#trip-light').replaceChildren();
    $('#trip-plan-summary').textContent='Раскладываем день…';
    try {
      if(generated) {
        $('#trip-plan-stops').replaceChildren();
        const [calculate,{savedKosaJourney}]=await Promise.all([loadScheduler(base),import('./day-kosa-journey.mjs?v=3')]);
        const view=await savedKosaJourney(trip,catalog,base,calculate);if(ticket!==sequence)return;
        const summary=$('#trip-plan-summary');summary.textContent=view.message;summary.dataset.planStatus=view.state==='ready'?'needs_check':view.state==='conflict'?'conflict':'incomplete';
        const visited=selectedDay(trip).visited || [],context=travelContext(trip);
        for(const row of view.rows){
          const node=journeyRow(row);
          if(row.kind==='visit' && row.poi){
            const button=document.createElement('button');button.type='button';button.className='save-item';button.dataset.kosaVisited=row.poi;button.textContent='Осмотр закончен';
            button.onclick=async()=>{button.disabled=true;try{
              const outcome=await commit(value=>markVisited(value,row.poi,true,context),'');
              $('#trip-plan-feedback').textContent=outcome?.conflict?'День изменился. Посмотрите свежий план.':outcome?.saved?'Отметка сохранена. Укажите время у остановки в «Продолжить день после тропы».':'Отметка показана в этой вкладке. Сохранение не завершилось; скачайте файл поездки.';
            }catch{$('#trip-plan-feedback').textContent='Сохранение не завершилось. Попробуйте ещё раз.';}finally{if(button.isConnected)button.disabled=false;}};
            if(!visited.includes(row.poi))node.append(button);
          }
          $('#trip-plan-stops').append(node);
        }
        progress.render({trip,catalog,matrix:null,engine:calculate,kosaContext:view.context,stillCurrent:()=>ticket===sequence && tripSignature(read())===tripSignature(trip)});
        if(trip.places.length)$('#trip-plan-stops').append(journeyRow({id:'kosa-extra',kind:'notice',time:null,title:'Дополнительные места пока вне расчёта',text:`Вы добавили ещё ${trip.places.length} мест. Время поездки на косу их не учитывает. Они сохранены в списке «Изменить порядок и остановки».`,state:'unknown'}));
        const link=document.createElement('a');link.href=new URL('kurshskaya-kosa/bez-mashiny/#kosa-planner',base);link.className='day-kosa-edit';link.textContent='Изменить поездку на косу →';
        const entry=document.createElement('li');entry.className='day-journey-action';entry.append(link);$('#trip-plan-stops').append(entry);
        section.dataset.scheduleReady='true';return;
      }
      const [calculate,matrix]=await Promise.all([loadScheduler(base),loadTripTravelMatrix(base,trip,catalog).catch(()=>null)]);if(ticket!==sequence)return;
      progress.render({trip,catalog,matrix,engine:calculate,stillCurrent:()=>ticket===sequence && tripSignature(read())===tripSignature(trip)});
      const result=calculate(planInput(trip,catalog,matrix));
      let light=null;
      if(trip.date)try {light=calculate.light(lightInput(trip,catalog,result));}catch{/* Preserve the schedule when the optional light layer cannot be calculated. */}
      renderSettings(settings);renderStops(trip,result,matrix,light);
      for(const id of visitsExpanded){const node=[...section.querySelectorAll('[data-day-visit]')].find(row=>row.dataset.dayVisit===id);if(node)node.open=true;}
      for(const id of checksExpanded){const node=[...section.querySelectorAll('[data-day-checks]')].find(row=>row.dataset.dayChecks===id);if(node)node.open=true;}
      const applyLight = async alternative => {
        let applied=false;
        await commit(current=>{
          if(tripSignature(current)!==alternative.signature)return current;
          applied=true;return {...current,places:alternative.places};
        },'');
        $('#trip-plan-feedback').textContent=applied?'Порядок обновлён. Свет и дорога пересчитаны.':'План уже изменился. Пересчитайте предложение для нового дня.';
      };
      renderLightView($('#trip-light'),trip,catalog,light,null,applyLight);
      const summary=$('#trip-plan-summary');summary.dataset.planStatus=result.status;
      const intro={empty:'Сначала добавьте точки в свой маршрут.',fits:'По вашим оценкам, день складывается.',needs_check:'День складывается по оценкам. Сверьте дорогу и вход в выбранные места.',
        incomplete:'Для точного плана нужно время дороги, пеших участков или переправы.',overrun:'Этот день не вмещает все остановки.',conflict:'Есть остановки или рейсы, которые не помещаются в этот день.'}[result.status];
      const noReturn=result.stops.some(row=>row.excursion?.conflict);
      summary.textContent=(trip.schedule?.progress?`Остаток дня с ${clock(trip.schedule.progress.at)}. `:'')+intro+(result.stops.length && !noReturn ? ` ${result.finish === null ? 'Закончите не раньше' : 'Ориентир окончания:'} ${clock(result.earliest_finish)}.` : '')
        +(result.slack!==null && result.slack>=0 && result.stops.length ? ` До ${result.rail?'границы дня с обратным поездом':'конца дня'} остаётся ${result.slack} мин.` : '')
        +(result.rail?' Выбранные электрички учитывают путь от станции, возвращение и запас на посадку.':'');
      section.dataset.scheduleReady='true';
      advice.render({trip,catalog,matrix,engine:calculate,result,stillCurrent:()=>ticket===sequence && tripSignature(read())===tripSignature(trip)});
      flex.render({trip,catalog,matrix,engine:calculate,result,stillCurrent:()=>ticket===sequence && flexSignature(read())===flexSignature(trip)});
      if(light) lightAlternative(trip,catalog,matrix,calculate,result,light,()=>ticket===sequence && tripSignature(read())===tripSignature(trip)).then(alternative=>{
        if(ticket===sequence && alternative)renderLightView($('#trip-light'),trip,catalog,light,alternative,applyLight);
      }).catch(()=>{});
      for(const details of section.querySelectorAll('details[data-plan-editor]')) details.open=expanded.includes(details.dataset.planEditor);
      for(const details of section.querySelectorAll('details[data-transport-editor]')) details.open=transportExpanded.includes(details.dataset.transportEditor);
      if(focused) [...section.querySelectorAll('[data-plan-field]')].find(node=>node.dataset.planField===focused && node.dataset.planStop===focusedStop && (!focusedMode || node.value===focusedMode))?.focus({preventScroll:true});
    } catch (error) {
      if(ticket!==sequence)return;
      renderSettings(settings);$('#trip-plan-stops').replaceChildren();
      $('#trip-plan-summary').textContent=progressMessages[error.message] || (error.message==='departure_before_day'?'Время возвращения к отъезду раньше начала дня. Перенесите остановки или измените дату записи.':error.message==='arrival_after_day'?'Прибытие с запасом позже конца дня. Продлите день или перенесите прогулку на следующую дату.':'Расчёт дня сейчас не открылся. Попробуйте ещё раз.');
      if(generated){const link=document.createElement('a');link.href=new URL('kurshskaya-kosa/bez-mashiny/#kosa-planner',base);link.className='day-kosa-edit';link.textContent='Открыть сохранённую поездку на косу →';const entry=document.createElement('li');entry.className='day-journey-action';entry.append(link);$('#trip-plan-stops').append(entry);}
      section.dataset.scheduleReady=(['arrival_after_day','departure_before_day'].includes(error.message) || Object.hasOwn(progressMessages,error.message))?'true':'error';
      $('#trip-plan-summary').dataset.planStatus=(['arrival_after_day','departure_before_day'].includes(error.message) || Object.hasOwn(progressMessages,error.message))?'conflict':'error';
    }
  }
  $('#trip-plan-open').addEventListener('click',()=>{
    opened=!opened;$('#trip-plan-body').hidden=!opened;$('#trip-plan-open').setAttribute('aria-expanded',String(opened));
    $('#trip-plan-open').textContent=opened?'Свернуть план':'Рассчитать время';
    if(opened) render();else sequence++;
  });
  section.addEventListener('change',event=>{
    if(event.target.name==='mode') {commit(current=>updateSchedule(current,'mode',event.target.value),'Способ передвижения выбран.');return;}
    const id=event.target.dataset.planCalendar;if(!id)return;
    const fact=event.target.value || null;
    commit(current=>updateSchedule(current,fact==='__outside'?'visit_scope':'visit_fact',fact==='__outside'?'outside':fact,id),'Посещение выбрано.');
  });
  section.addEventListener('click',event=>{
    const id=event.target.closest('[data-plan-reset]')?.dataset.planReset;if(!id)return;
    commit(current=>updateSchedule(current,'window',null,id),'Вернулись к расписанию места.');
  });
  section.addEventListener('submit',async event=>{
    if(event.target.closest('[data-transport-edit]') || event.target.matches('.day-flex-form'))return;
    event.preventDefault();const form=event.target, values=new FormData(form), id=form.dataset.planEdit;
    const feedback=$('#trip-plan-feedback');feedback.textContent='';
    let fields;
    if(id) {
      const open=minutes(values.get('open')), close=minutes(values.get('close'));
      if((open===null)!==(close===null) || open!==null && open >= (close===0 ? 1440 : close)) {feedback.textContent='Укажите обе границы окна: начало раньше конца.';return;}
      fields=[['pause',Number(values.get('pause'))],['window',open===null?null:{open,close:close===0?1440:close}]];
      if(values.has('visit'))fields.unshift(['visit',Number(values.get('visit'))]);
      if(values.has('travel'))fields.push(['travel',values.get('travel')===''?null:Number(values.get('travel'))]);
    } else {
      const start=minutes(values.get('start')), end=minutes(values.get('end'))===0?1440:minutes(values.get('end'));
      if(start===null || end===null || start>=end) {feedback.textContent='Время начала должно быть раньше конца дня.';return;}
      fields=[['start',start],['end',end],['reserve',Number(values.get('reserve'))]];
    }
    const from=form.dataset.planFrom || '', day=form.dataset.planDay || '', mode=form.dataset.planMode, dayId=form.dataset.planDayId || '';let changedContext=false;
    await commit(current=>{
      if((current.itinerary?.active || '')!==dayId) {changedContext=true;return current;}
      // Apply related fields together, so a temporarily invalid start/end cannot lose a user's edit.
      if(!id) return {...current,schedule:{...(current.schedule||defaultSchedule()),...Object.fromEntries(fields)}};
      return fields.reduce((next,[field,value])=>{
        if(field==='travel' && ((previousPlace(remainingTrip(current),id) || '')!==from || travelMode(current)!==mode) || field==='window' && (current.date || '')!==day) {changedContext=true;return next;}
        return updateSchedule(next,field,value,id);
      },current);
    },'План дня сохранён.');
    if(changedContext) feedback.textContent='Порядок или дата уже изменились. Проверьте дорогу и окно посещения заново.';
  });
  return {render};
}
