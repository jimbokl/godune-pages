import {mobilityLabel,baseTransport} from './day-mobility.mjs?v=1';
import {applyWizardPlan,dayIsOccupied,journeyIsOccupied,prepareWizardPlan,wizardDefaults,wizardRoutes,wizardChoices,wizardStarters} from './planning-wizard-state.mjs?v=14';
import {chooseTripDay,selectedDay} from './trip-days-state.mjs?v=20';
import {planInput,planBaseTravel,planTravel} from './trip-schedule-state.mjs?v=15';
import {roadJourney} from './day-journey-view.mjs?v=5';
import {baseName} from './personal-points.mjs?v=3';
import {previousPlace} from './travel-estimates.mjs?v=8';
import {assessSchedule,readinessCopy} from './day-readiness.mjs?v=4';
import {WAVE_PACES,waveEvidence} from './day-wave.mjs?v=2';
import {downloadTripFile} from './trip-file.mjs?v=25';
import {partyLabel,validParty} from './trip-party.mjs?v=1';
import {DAY_INTERESTS,DAY_NEEDS,preferencesLabel,assessPreferenceChoice,assessDayPreferences} from './day-preferences.mjs?v=3';

const clock=minute=>`${minute>=1440?`+${Math.floor(minute/1440)} дн. `:''}${String(Math.floor(minute/60)%24).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
const duration=minute=>`${Math.floor(minute/60)?`${Math.floor(minute/60)} ч `:''}${minute%60?`${minute%60} мин`:''}`.trim() || '0 мин';
const dateLabel=value=>value?new Intl.DateTimeFormat('ru',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z')):'Дата пока не выбрана';
const minute=value=>/^\d\d:\d\d$/.test(value)?Number(value.slice(0,2))*60+Number(value.slice(3)):null;
const timeEvidence=route=>route?.stops?.some(stop=>stop.visit_minutes!==undefined || stop.pause_minutes!==undefined)
  ?'Время остановок и пауз предложено редакцией. Это оценка для прогулки; она не подтверждает часы входа или билет.'
  :'Время посещения берём из карточек. На отдельную тропу заложено время прогулки; где оценки нет — оставляем 30 минут.';
const stopLabel=count=>`${count} ${count%100>=11&&count%100<=14?'остановок':count%10===1?'остановка':count%10>=2&&count%10<=4?'остановки':'остановок'}`;
const titles=['Что планируем на Балтике?','Какая прогулка Вам ближе?','Ваш день складывается'];
const leads=['Одна прогулка или несколько дней у моря — выберите, с чего начать.',
  'У каждой прогулки своё начало. Выберите одну — посмотрим остановки и время на дорогу.',
  'Остановки идут по порядку. До сохранения поездка остаётся как была.'];
const issueText={
  unknown_travel:'Время дороги до этой остановки неизвестно.',unknown_approach:'Путь от парковки до места нужно уточнить.',
  unknown_return:'Время возвращения к парковке неизвестно.',unknown_opening:'Часы посещения пока не проверены.',
  opening_needs_check:'Часы учтены; дату и билеты нужно сверить.',travel_needs_check:'Дорога оценена по карте; оставьте запас.',
  access_needs_check:'Подход оценён по карте; проход и темп нужно сверить.',
  closed:'По известному расписанию посещений в этот день нет.',window_missed:'Остановка не помещается в часы посещения.',
  after_deadline:'Этот участок выходит за выбранное время дня.',
  unknown_kitchen:'Время последнего заказа пока не проверено.',kitchen_needs_check:'Приём заказов на эту дату нужно сверить.',
  kitchen_closed:'В этот день заказы не принимают.',kitchen_window_missed:'К приходу кухня уже не принимает заказ.',
  transport_needs_check:'Рейсы на выбранную дату нужно сверить.',transport_incomplete:'Для дороги не хватает расписания.',
  transport_conflict:'По известному расписанию рейс не подходит.',appointment_missed:'К записанному времени не успеваем.',
  appointment_needs_check:'Неизвестная дорога не позволяет подтвердить время прибытия.',
  appointment_venue_conflict:'Время записи расходится с часами места.'
};

export function initPlanningWizard({mount,workshop,catalog,base}) {
  if(!mount || !workshop || !wizardRoutes(catalog).length)return null;
  const $=selector=>mount.querySelector(selector),all=selector=>[...mount.querySelectorAll(selector)];
  const form=$('[data-wizard-form]'),status=$('[data-wizard-status]'),result=$('[data-wizard-result]');
  const save=$('[data-wizard-save]');
  const defaults=()=>({...wizardDefaults(workshop.getState(),catalog),wave:{version:1,theme:'mixed',pace:'calm',recipe:null}});
  let answers=defaults(),step=1,proposal=null,revision=null,sequence=0,saving=false,attempt=null,assessments=[],preferenceMatrix=null,preferenceLoading=null;
  const node=(tag,text,className)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;if(className)element.className=className;return element;};
  const point=id=>catalog.poi.find(row=>row.slug===id);
  const multi=()=>answers.area==='whole-trip';
  const announce=text=>{status.textContent=text;};
  const focusTitle=()=>{$('[data-wizard-title]').focus({preventScroll:true});mount.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});};

  function summary() {
    const date=form.elements.wizard_date.value || null;
    $('[data-wizard-settings-summary]').textContent=`${dateLabel(date)} · ${form.elements.wizard_start.value}–${form.elements.wizard_end.value} · изменить`;
  }

  function origin() {
    const known=answers.base!==null && answers.base!==undefined;
    $('[data-wizard-base-summary]').textContent=known?`Откуда и куда вернёмся: ${baseName(answers.base,catalog)} · изменить`:'Начало у первой остановки · изменить';
    $('[data-wizard-base-pick]').textContent=known?'Изменить место проживания':'Добавить место проживания';
    $('[data-wizard-base-clear]').hidden=!known;
    $('[data-wizard-start-label]').textContent=known?(multi()?'Выход из жилья каждый день':'Выход из жилья'):(multi()?'Начало каждого дня':'Начало прогулки');
    $('[data-wizard-base-note]').textContent=known
      ?'Начнём и закончим здесь. Учтём дорогу по карте; проход от двери и на месте нужно проверить.'
      :'Добавьте адрес, если знаете, где будете жить. Посчитаем дорогу до прогулки и возвращение. Без адреса день начинается у первой остановки.';
  }

  function group() {
    const adults=Number(form.elements.wizard_adults.value),children=Number(form.elements.wizard_children.value);
    answers.party={version:1,adults,children};
    $('[data-wizard-party-summary]').textContent=validParty(answers.party)?`Кто едет: ${partyLabel(answers.party)} · изменить`:'Кто едет · проверьте число путешественников';
  }

  function transport() {
    const field=$('[data-wizard-transport]');if(!field)return;
    for(const radio of field.querySelectorAll('input'))radio.checked=radio.value===answers.transport;
    const label={auto:'Транспорт по готовому плану',foot:'Пешком',car:'На машине'}[answers.transport];
    $('[data-wizard-transport-summary]').textContent=`Как добираетесь: ${label} · изменить`;
    $('[data-wizard-transport-note]').textContent=answers.transport==='car'
      ?'В городе оставим машину у начала прогулки и пойдём пешком. На косе доедем до каждой остановки. Парковку и проход ко входу нужно проверить.'
      :answers.transport==='foot'?'Дорогу между местами и от жилья посчитаем пешком. Посмотрите время: далеко разнесённые остановки могут не поместиться в один день.'
      :'Сохраним способ передвижения из выбранного плана. В городе — пешком, в готовых поездках к разнесённым остановкам косы — на машине.';
  }

  function preferences({refresh=false}={}) {
    const container=$('[data-wizard-preferences]');if(!container)return;
    if(refresh)for(const [name,values,title,key]of [['wizard_interest',DAY_INTERESTS,'Что хочется увидеть?','interests'],['wizard_need',DAY_NEEDS,'Что важно в прогулке?','needs']]) {
      const field=node('fieldset',undefined,'wizard-chips wizard-preference-chips');field.append(node('legend',title));
      for(const [value,text]of Object.entries(values)) {
        const label=node('label'),input=node('input');input.type='checkbox';input.name=name;input.value=value;input.checked=answers.preferences[key].includes(value);
        label.append(input,node('span',text));field.append(label);
      }
      container.querySelector(`[data-wizard-${key}]`).replaceChildren(field);
    }
    $('[data-wizard-preferences-summary]').textContent=preferencesLabel(answers.preferences)?`Вам важно: ${preferencesLabel(answers.preferences)} · изменить`:'Интересы и прогулка · выбрать';
  }

  async function preferenceDistances() {
    if(preferenceMatrix || preferenceLoading || !answers.preferences.needs.includes('short_walks'))return;
    preferenceLoading=import('./travel-estimates.mjs?v=8').then(({loadTravelMatrix})=>loadTravelMatrix(base));
    try {preferenceMatrix=await preferenceLoading;if(step===2)routes({refreshSettings:false});}
    catch { /* Missing road evidence remains visible; a preference can still be saved. */ }
    finally {preferenceLoading=null;}
  }

  function preferenceResult(trip,matrix=null) {
    const assessment=assessDayPreferences(trip,catalog,matrix);if(!assessment.label)return null;
    const details=node('details',undefined,'wizard-evidence wizard-preference-result');details.dataset.wizardPreferenceResult='';details.open=assessment.access==='barriers';
    details.append(node('summary',`Вам важно: ${assessment.label}`));
    for(const note of assessment.notes)details.append(node('p',note));
    return details;
  }

  function routes({refreshSettings=true}={}) {
    if(refreshSettings)void preferenceDistances();
    const themeMount=$('[data-wizard-waves]'),paceMount=$('[data-wizard-pace]');
    const themes=[['mixed','Все прогулки'],['beach','У моря'],['gastro','За вкусом'],['history','Город и история']].filter(([id])=>id==='mixed' || wizardChoices(catalog,id).some(row=>row.area===answers.area));
    if(multi() || !themes.some(([id])=>id===answers.wave.theme))answers.wave.theme='mixed';
    function chips(mount,name,title,items,selected) {
      const field=node('fieldset',undefined,'wizard-chips');field.append(node('legend',title));
      for(const [value,text] of items){const label=node('label'),radio=node('input');radio.type='radio';radio.name=name;radio.value=value;radio.checked=value===selected;label.append(radio,node('span',text));field.append(label);}
      mount.replaceChildren(field);
    }
    if(themeMount){themeMount.hidden=multi() || themes.length<2;chips(themeMount,'wizard_theme','Как проведём день?',themes,answers.wave.theme);}
    if(paceMount){chips(paceMount,'wizard_pace','В каком темпе?',Object.entries(WAVE_PACES).map(([id,row])=>[id,row.name]),answers.wave.pace);paceMount.append(node('p',answers.wave.pace==='calm'?'Больше времени на остановки и паузы между ними.':'Время на остановки и короткий запас между ними.','wizard-pace-note'));}
    preferences({refresh:refreshSettings});
    const options={matrix:preferenceMatrix};
    const rows=multi()?wizardStarters(catalog,answers.preferences,options):wizardChoices(catalog,answers.wave.theme,answers.preferences,options).filter(route=>route.area===answers.area);
    const key=multi()?'starter':'route',id=row=>multi()?row.id:row.slug;
    if(!rows.some(row=>id(row)===answers[key]))answers[key]=rows[0]?id(rows[0]):null;
    const choices=rows.map(route=>{
      const label=node('label',undefined,'wizard-choice wizard-route'),radio=node('input'),copy=node('span');
      radio.type='radio';radio.name=multi()?'wizard_starter':'wizard_route';radio.value=id(route);radio.required=true;radio.checked=id(route)===answers[key];
      copy.append(node('strong',route.name),node('small',multi()?route.description:`${route.minutes?`Около ${duration(route.minutes)} · `:''}${stopLabel(route.stops.length)}`));
      copy.append(node('span',multi()?route.geography || 'Калининград · Зеленоградск · Куршская коса.':route.start_note,'wizard-choice-note'));
      const match=assessPreferenceChoice(route,catalog,answers.preferences,options),notes=[];
      if(match.matched.length)notes.push(match.matched.map(id=>DAY_INTERESTS[id]).join(' · '));
      if(answers.preferences.needs.includes('short_walks'))notes.push(match.distance===null?'Длина пути пока неизвестна':`${(match.distance/1000).toLocaleString('ru',{maximumFractionDigits:1})} км по карте · от жилья отдельно`);
      if(match.access!=='not_requested')notes.push(match.barriers.length?'Есть ступени или ограничения · подробнее в плане':'Проход на всём пути ещё нужно проверить');
      if(notes.length){const note=node('span',notes.join('. '),'wizard-preference-match');note.dataset.wizardPreferenceMatch='';copy.append(note);}
      const mark=node('span','→','wizard-choice-mark');mark.setAttribute('aria-hidden','true');label.append(radio,copy,mark);return label;
    });
    $('[data-wizard-routes]').replaceChildren(...choices);
    const separate=(multi()?journeyIsOccupied:dayIsOccupied)(workshop.getState());
    $('[data-wizard-placement]').textContent=multi()?(separate?'У Вас уже есть планы. Добавим все новые дни рядом с ними — проверьте первую дату.':'Начнём новую поездку. Каждый день потом можно изменить.'):
      separate?'Выбранный день уже занят. Эта прогулка станет отдельным днём — проверьте её дату.':'Прогулка заполнит свободный выбранный день.';
    $('[data-wizard-date-label]').textContent=multi()?'Первый день, если знаете дату':'Дата, если знаете';
    $('[data-wizard-start-label]').textContent=multi()?'Начало каждого дня':'Начало прогулки';
    $('[data-wizard-settings-note]').textContent=multi()?(answers.transport==='foot'?'Все дороги считаем пешком. Длинные переходы на косе нужно проверить.':'Транспорт показан у каждого дня. Время задаётся для каждого дня отдельно.')+' Электричку, автобус или смену жилья добавьте после сохранения.':'Билеты, обед и долгие остановки можно добавить после сохранения.';
    origin();transport();
    $('[data-wizard-preview-label]').textContent=multi()?'Посмотреть план →':'Посмотреть день →';
    if(!refreshSettings)return;
    form.elements.wizard_adults.value=answers.party.adults;
    form.elements.wizard_children.value=answers.party.children;group();
    $('[data-wizard-settings]').open=separate;
    form.elements.wizard_date.value=answers.date || '';
    form.elements.wizard_start.value=answers.start===null?'':clock(answers.start);
    form.elements.wizard_end.value=answers.end===null?'':clock(answers.end);summary();
  }

  function show(number,{focus=true}={}) {
    step=number;sequence++;
    delete mount.dataset.wizardCalculating;
    all('[data-wizard-step]').forEach(panel=>{panel.hidden=Number(panel.dataset.wizardStep)!==step;});
    all('[data-wizard-progress]').forEach(item=>{const current=Number(item.dataset.wizardProgress)===step;item.toggleAttribute('data-current',current);if(current)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current');});
    $('[data-wizard-title]').textContent=titles[step-1];$('[data-wizard-lead]').textContent=leads[step-1];
    if(multi() && step>1){$('[data-wizard-title]').textContent=step===2?'Как проведём поездку?':'Ваша поездка по дням';$('[data-wizard-lead]').textContent=step===2?'Останемся в городе или поедем к морю и дюнам. Выберите план — затем посмотрим каждый день.':'Откройте день, чтобы увидеть остановки и расчёт времени. Любую часть плана можно изменить после сохранения.';}
    all('[data-wizard-progress-label]').forEach((label,index)=>{label.textContent=(multi()?['Выбор','Дни','План']:['Место','Прогулка','Ваш день'])[index];});
    $('[data-wizard-change-label]').textContent=multi()?'← Изменить план':'← Изменить прогулку';
    $('[data-wizard-saved]').hidden=true;save.disabled=false;
    if(step===2)routes();
    if(step===3)preview();
    if(focus)focusTitle();
  }

  function orderedStops(schedule=null,trip=proposal.trip,route=proposal.route,matrix=null) {
    const list=node('ol',undefined,'wizard-timeline');list.dataset.wizardTimeline='';
    const day=selectedDay(trip);
    function baseStop(id,location,label) {
      if(!location)return;
      const row=schedule?.stops.find(stop=>stop.id===id),li=node('li',undefined,'wizard-base-stop'),time=node('span',undefined,'wizard-time');
      li.dataset.wizardBaseStop=id;
      time.textContent=row?row.begins===null?`Не раньше ${clock(row.earliest_begin)}`:clock(row.begins):'—';
      const copy=node('div');copy.append(node('strong',`${label}: ${baseName(location,catalog)}`));
      copy.append(node('p',mobilityLabel(trip),'wizard-stop-duration'));
      if(row && id!=='__day_origin') {
        const inbound=planBaseTravel(trip,id==='__day_departure'?'end':'night',catalog,matrix);
        if(inbound)copy.append(node('p',roadJourney(row,inbound.travel,trip.schedule.reserve,baseName(inbound.from,catalog),false,id=>baseName(id,catalog)).text,'wizard-stop-note'));
      }
      if(row?.issues.length){const issues=node('ul',undefined,'wizard-issues');for(const issue of row.issues){const line=node('li',issueText[issue.code] || 'Этот участок требует уточнения.');line.dataset.wizardIssue=issue.code;issues.append(line);}copy.append(issues);}
      li.append(time,copy);list.append(li);
    }
    baseStop('__day_origin',day.start_at,'Выход');
    for(const [index,id]of trip.places.entries()) {
      const place=point(id),row=schedule?.stops.find(stop=>stop.id===id),li=node('li'),time=node('span',undefined,'wizard-time');
      time.textContent=row?row.begins===null?`Не раньше ${clock(row.earliest_begin)}`:clock(row.begins):String(index+1).padStart(2,'0');
      const copy=node('div'),link=node('a',place.name);link.href=new URL(`poi/${id}/`,base).href;
      const settings=trip.schedule.stops[id];
      copy.append(link,node('p',`${settings.visit} мин. на остановку${settings.pause?` + ${settings.pause} мин. пауза`:''}`,'wizard-stop-duration'));
      if(row) {
        const {projected,travel}=planTravel(trip,id,catalog,matrix),previous=previousPlace(projected,id);
        if(previous)copy.append(node('p',roadJourney(row,travel,trip.schedule.reserve,baseName(previous,catalog),false,id=>baseName(id,catalog)).text,'wizard-stop-note'));
      }
      const note=route?.stops.find(stop=>stop.poi===id)?.note;if(note)copy.append(node('p',note,'wizard-stop-note'));
      if(row?.issues.length) {
        const issues=node('ul',undefined,'wizard-issues');
        for(const issue of row.issues){const text=(settings.visit_scope==='outside' && issue.code==='unknown_opening'?'Доступ к месту снаружи ещё нужно сверить.':issueText[issue.code]) || 'Этот участок требует уточнения.';const line=node('li',text);line.dataset.wizardIssue=issue.code;issues.append(line);}copy.append(issues);
      }
      li.append(time,copy);list.append(li);
    }
    baseStop('__day_night',day.night_at,'Возвращение');
    return list;
  }

  function renderResult(schedule=null,error=false,matrices=null) {
    if(proposal.kind==='journey'){renderJourney(schedule,error,matrices);return;}
    const day=selectedDay(proposal.trip),heading=node('h3',proposal.route.name,'wizard-result-title');
    const meta=node('p',`${proposal.placement==='separate'?'Отдельный день':'Выбранный день'} · ${dateLabel(day.date)} · начало в ${clock(answers.start)}`,'wizard-result-meta');
    const party=node('p',partyLabel(day.party) || '', 'wizard-party-note');
    const brief=node('p',proposal.route.description,'wizard-result-copy');
    const timing=node('p',undefined,'wizard-calculation');timing.dataset.wizardCalculation='';
    if(schedule) {
      const lower=schedule.finish===null;
      timing.textContent=`${lower?'Окончание не раньше':'По расчёту — до'} ${clock(lower?schedule.earliest_finish:schedule.finish)}. ${schedule.status==='overrun' || schedule.status==='conflict'?'В выбранное время день не помещается. Измените время или прогулку.':lower?'Для точного времени не хватает данных о дороге.':'Дорога и посещения могут занять больше времени; перед выходом сверьте условия.'}`;
      timing.dataset.wizardCalculation=schedule.status;
    } else timing.textContent=error?'Время сейчас не рассчиталось. Порядок остановок можно сохранить и уточнить позже.':'Считаем дорогу и остановки…';
    const access=node('p',answers.transport==='auto'?proposal.route.access_note:mobilityLabel(proposal.trip)+'. Рейсы общественного транспорта в этот расчёт не входят.','wizard-access-note');
    const assumptions=node('details',undefined,'wizard-evidence');assumptions.append(node('summary','Что учтено в этом дне'));
    assumptions.append(node('p',proposal.route.geometry_source || 'Линия прогулки рассчитана по карте. Проход на месте ещё нужно сверить.'));
    if(proposal.route.verified_at)assumptions.append(node('p',`Данные маршрута: ${dateLabel(proposal.route.verified_at)}.`));
    assumptions.append(node('p',timeEvidence(proposal.route)+' '+waveEvidence(day.wave)+' После сохранения это можно изменить.'));
    assumptions.append(node('p',mobilityLabel(proposal.trip)+'.'));
    const vehicle=baseTransport(proposal.trip);if(vehicle)assumptions.append(node('p',`Перед дорогой обратно сначала вернёмся к месту начала прогулки: ${baseName(vehicle.via,catalog)}. Парковку и проход нужно проверить.`));
    const bases=[];if(day.start_at)bases.push(`Начало дня: ${baseName(day.start_at,catalog)}.`);if(day.night_at)bases.push(`Возвращение: ${baseName(day.night_at,catalog)}.`);
    if(bases.length)assumptions.append(node('p',bases.join(' ')));
    else assumptions.append(node('p','Начало у первой остановки. Дорога до неё и от конца прогулки здесь не рассчитана.'));
    const protection=node('p',proposal.placement==='separate'?'В выбранном дне уже есть Ваши планы. Сохраним их целиком, а прогулку добавим отдельным днём.':'Сохраним этот день в общей поездке. Регистрация не нужна.','wizard-save-note');
    result.replaceChildren(meta,heading,party,brief,timing,orderedStops(schedule,proposal.trip,proposal.route,matrices),access,assumptions,protection);
    const preference=preferenceResult(proposal.trip,matrices);if(preference)timing.before(preference);
    save.textContent=proposal.placement==='separate'?'Добавить отдельный день':'Сохранить день в поездке';
  }

  function renderJourney(schedules=null,error=false,matrices=null) {
    const introduction=node('div',undefined,'wizard-journey-intro');
    introduction.append(node('p',dateLabel(answers.date),'wizard-result-meta'),node('h3',proposal.starter.geography?proposal.starter.name:`${proposal.starter.name} на Балтике`,'wizard-result-title'),node('p',proposal.starter.description,'wizard-result-copy'));
    introduction.append(node('p',partyLabel(answers.party) || '', 'wizard-party-note'));
    introduction.append(node('p',answers.transport==='auto' && proposal.starter.access_note || (answers.transport==='foot'?'Все дороги посчитаны пешком. Проверьте время длинных переходов на косе. Рейсы общественного транспорта в этот расчёт не входят.':'Способ передвижения показан у каждого дня. Электричку, автобус и смену жилья можно добавить после сохранения.'),'wizard-access-note'));
    if(answers.base)introduction.append(node('p',`Каждый новый день начинается и заканчивается здесь: ${baseName(answers.base,catalog)}. Дорога входит в расчёт; способ передвижения показан у каждого дня.`,'wizard-access-note'));
    const days=proposal.targetIds.map((id,index)=>{
      const trip=chooseTripDay(proposal.trip,id),day=selectedDay(trip),schedule=schedules?.get(id),card=node('details',undefined,'wizard-day');
      card.dataset.wizardDay=id;card.open=index===0;
      const heading=node('summary'),number=node('span',String(index+1).padStart(2,'0'),'wizard-day-number'),copy=node('span');
      const areas=[...new Set(day.places.map(place=>point(place).area_name).filter(Boolean))];
      const recipe=proposal.starter.days[index].recipe;
      copy.append(node('strong',recipe?.name || areas.join(' · ') || point(day.places[0]).name),node('small',`${dateLabel(day.date)} · ${mobilityLabel(trip)} · ${stopLabel(day.places.length)}`));
      heading.append(number,copy,node('span','+','wizard-day-toggle'));card.append(heading);
      const body=node('div',undefined,'wizard-day-body'),timing=node('p',undefined,'wizard-calculation');timing.dataset.wizardCalculation=schedule?.status || 'pending';
      if(schedule){const lower=schedule.finish===null;timing.textContent=`${lower?'Окончание не раньше':'По расчёту — до'} ${clock(lower?schedule.earliest_finish:schedule.finish)}. ${['overrun','conflict'].includes(schedule.status)?'День не помещается в выбранное время. Его можно сократить или начать раньше.':lower?'Для точного времени не хватает данных о дороге.':'Перед выходом сверьте проход, часы и билеты.'}`;}
      else timing.textContent=error?'Время сейчас не рассчиталось. Сохраните остановки и уточните план позже.':'Считаем дорогу и остановки…';
      body.append(timing,orderedStops(schedule,trip,recipe,matrices?.get(id)));
      const preference=preferenceResult(trip,matrices?.get(id));if(preference)body.prepend(preference);
      if(recipe)body.append(node('p',answers.transport==='auto'?recipe.access_note:mobilityLabel(trip)+'; пешие подходы и парковку сверяйте на месте.','wizard-access-note'));
      const bases=day.start_at?`Начало: ${baseName(day.start_at,catalog)}. Возвращение: ${baseName(day.night_at,catalog)}. Дорога включена в расчёт.`:recipe?`Начало: ${point(day.places[0]).name}. ${day.night_at?`Возвращение: ${baseName(day.night_at,catalog)}.`:''} Дорога от жилья и обратно добавляется отдельно.`:
        'Начало у первой остановки. Дорога до неё и от конца прогулки здесь не рассчитана.';
      body.append(node('p',bases,'wizard-access-note'));card.append(body);return card;
    });
    const evidence=node('details',undefined,'wizard-evidence');evidence.append(node('summary','Как рассчитан план'),node('p','Дорога каждого дня оценена по общей карте маршрутов. '+timeEvidence(proposal.starter.days.find(day=>day.recipe)?.recipe)+' '+waveEvidence(answers.wave)+' Всё это можно изменить в поездке.'),node('p','Часы работы на будущую дату, билеты, питание и переезды между днями требуют отдельной проверки. Расчёт не подтверждает бронь или доступ на тропу.'));
    result.replaceChildren(introduction,...days,evidence,node('p',proposal.placement==='separate'?'Ваши прежние дни, записи и расходы останутся целиком. Добавим этот план отдельными днями.':'Все дни сохранятся в этом браузере. Регистрация не нужна.','wizard-save-note'));
    save.textContent=proposal.placement==='separate'?`Добавить ${proposal.starter.name} к поездке`:'Сохранить всю поездку';
  }

  async function preview() {
    const ticket=sequence;
    assessments=[assessSchedule(null)];
    try {proposal=prepareWizardPlan(workshop.getState(),answers,catalog);revision=workshop.getRevision();}
    catch {proposal=null;save.disabled=true;result.replaceChildren();announce('Прогулка сейчас недоступна. Вернитесь к выбору дня.');return;}
    save.disabled=true;renderResult();mount.dataset.wizardCalculating='true';announce('');
    try {
      const [{loadScheduler},{loadTripTravelMatrix}]=await Promise.all([import('./trip-scheduler.mjs?v=20'),import('./travel-estimates.mjs?v=8')]);
      const calculate=await loadScheduler(base);
      const trips=proposal.kind==='journey'?proposal.targetIds.map(id=>chooseTripDay(proposal.trip,id)):[proposal.trip];
      const matrices=await Promise.all(trips.map(trip=>loadTripTravelMatrix(base,trip,catalog).catch(()=>null)));
      const schedules=trips.map((trip,index)=>calculate(planInput(trip,catalog,matrices[index])));
      if(ticket!==sequence || step!==3)return;
      assessments=schedules.map(assessSchedule);
      renderResult(proposal.kind==='journey'?new Map(proposal.targetIds.map((id,index)=>[id,schedules[index]])):schedules[0],false,proposal.kind==='journey'?new Map(proposal.targetIds.map((id,index)=>[id,matrices[index]])):matrices[0]);
    } catch {
      if(ticket!==sequence || step!==3)return;
      renderResult(null,true);
    } finally {
      if(ticket===sequence && step===3){delete mount.dataset.wizardCalculating;save.disabled=false;if(revision!==workshop.getRevision())changed();}
    }
  }

  function changed() {
    if(saving || !proposal || step!==3 || ! $('[data-wizard-saved]').hidden || revision===workshop.getRevision())return;
    save.disabled=true;announce('Поездка изменилась. Обновите предложение для текущего дня.');
    if(!$('[data-wizard-recalculate]')) {
      const refresh=node('button','Обновить предложение','wizard-secondary');refresh.type='button';refresh.dataset.wizardRecalculate='';
      refresh.addEventListener('click',()=>show(3));result.append(refresh);
    }
  }

  form.addEventListener('submit',event=>{
    event.preventDefault();announce('');
    if(step===1) {
      const field=form.querySelector('input[name="wizard_area"]:checked');
      if(!field){announce('Выберите место прогулки.');form.querySelector('input[name="wizard_area"]')?.focus();return;}
      attempt ||= workshop.progress?.begin('wizard');
      answers.area=field.value;show(2);return;
    }
    if(step!==2)return;
    form.elements.wizard_end.setCustomValidity('');
    form.elements.wizard_adults.setCustomValidity('');form.elements.wizard_children.setCustomValidity('');
    for(const field of [form.elements.wizard_adults,form.elements.wizard_children])if(!field.checkValidity()){$('[data-wizard-party]').open=true;field.reportValidity();return;}
    group();
    if(!validParty(answers.party)){$('[data-wizard-party]').open=true;form.elements.wizard_adults.setCustomValidity(answers.party.adults+answers.party.children<1?'Укажите хотя бы одного путешественника.':'Проверьте число взрослых и детей.');form.elements.wizard_adults.reportValidity();return;}
    for(const field of [form.elements.wizard_date,form.elements.wizard_start,form.elements.wizard_end])if(!field.checkValidity()){$('[data-wizard-settings]').open=true;field.reportValidity();return;}
    const route=form.querySelector('input[name="wizard_route"]:checked'),starter=form.querySelector('input[name="wizard_starter"]:checked');
    answers={...answers,route:route?.value || answers.route,starter:starter?.value || answers.starter,date:form.elements.wizard_date.value || null,start:minute(form.elements.wizard_start.value),end:minute(form.elements.wizard_end.value)};
    if(answers.start>=answers.end){form.elements.wizard_end.setCustomValidity('Конец дня должен быть позже начала прогулки.');form.elements.wizard_end.reportValidity();return;}
    try {prepareWizardPlan(workshop.getState(),answers,catalog);show(3);}catch {announce('Проверьте план, дату и время. Все дни должны помещаться в выбранный календарь.');}
  });
  form.addEventListener('input',event=>{
    if(event.target.name==='wizard_transport'){answers.transport=event.target.value;routes({refreshSettings:false});return;}
    form.elements.wizard_end.setCustomValidity('');
    form.elements.wizard_adults.setCustomValidity('');form.elements.wizard_children.setCustomValidity('');
    if(event.target.name==='wizard_adults' || event.target.name==='wizard_children')group();
    if(event.target.name==='wizard_interest' || event.target.name==='wizard_need') {
      answers.preferences={...answers.preferences,interests:all('input[name="wizard_interest"]:checked').map(input=>input.value),needs:all('input[name="wizard_need"]:checked').map(input=>input.value)};
      routes({refreshSettings:false});preferenceDistances();
    }
    if(step===2)answers={...answers,route:form.querySelector('input[name="wizard_route"]:checked')?.value || answers.route,starter:form.querySelector('input[name="wizard_starter"]:checked')?.value || answers.starter,
      date:form.elements.wizard_date.value || null,start:minute(form.elements.wizard_start.value),end:minute(form.elements.wizard_end.value)};
    if(event.target.name==='wizard_theme' || event.target.name==='wizard_pace'){
      answers.wave={...answers.wave,[event.target.name==='wizard_theme'?'theme':'pace']:event.target.value};routes({refreshSettings:false});
    }
    summary();
  });
  all('[data-wizard-back]').forEach(button=>button.addEventListener('click',()=>show(step-1)));
  $('[data-wizard-base-pick]').addEventListener('click',async()=>{
    const button=$('[data-wizard-base-pick]'),ticket=sequence;button.disabled=true;
    try {
      const {pickPersonalPoint}=await import('./personal-point-picker.mjs?v=4');
      const route=wizardChoices(catalog).find(row=>row.slug===answers.route && row.area===answers.area);
      const starter=wizardStarters(catalog).find(row=>row.id===answers.starter);
      const focus=point(multi()?starter?.days[0]?.places[0]:route?.stops[0]?.poi);
      const chosen=await pickPersonalPoint({base,initial:answers.base,focusPlace:focus,caption:'Где будете жить?',saveLabel:'Использовать в этом плане →',privacyText:'Пока адрес только в мастере. В поездку он попадёт после сохранения плана; в файл и ссылку — если Вы решите поделиться.'});
      if(chosen && ticket===sequence && step===2){answers.base=chosen;origin();announce('Место выбрано. Посмотрите план с дорогой туда и обратно.');}
    } catch {if(ticket===sequence)announce('Не удалось открыть выбор адреса. Ответы сохранились; попробуйте ещё раз.');}
    finally {button.disabled=false;if(ticket===sequence && step===2 && button.isConnected)button.focus({preventScroll:true});}
  });
  $('[data-wizard-base-clear]').addEventListener('click',()=>{answers.base=null;origin();announce('Начнём у прогулки. Дорога от жилья в этот план не входит.');});
  save.addEventListener('click',async()=>{
    if(saving || save.disabled || !proposal)return;
    saving=true;save.disabled=true;mount.setAttribute('aria-busy','true');let intent;
    try {
      const committed=await workshop.setState(current=>{intent=applyWizardPlan(current,proposal,catalog,{separate:proposal.placement==='separate'});return intent.state;},multi()?'План сохранён в поездке.':'Прогулка сохранена в поездке.',{expectedRevision:revision});
      if(committed.conflict || !intent?.applied){announce('Поездка уже изменилась. Обновите предложение перед сохранением.');revision=-1;return;}
      const readiness=readinessCopy(assessments,committed.saved);
      workshop.progress?.saved(attempt,assessments.find(row=>row.calculated)||assessments[0],committed.saved);
      $('[data-wizard-form]').hidden=true;$('[data-wizard-progress="3"]').setAttribute('aria-current','step');
      $('[data-wizard-saved]').hidden=false;
      $('[data-wizard-lead]').textContent=committed.saved?'Остановки уже в Вашей поездке. Их можно переставить, дополнить или взять с собой.':'Остановки остаются в этой вкладке. Файл поездки поможет перенести их на другой телефон.';
      $('[data-wizard-saved-travel]').hidden=!committed.saved;
      $('[data-wizard-download]').hidden=committed.saved;
      $('[data-wizard-saved-travel]').textContent=multi()?'Открыть поездку в дороге →':'Открыть день в дороге →';
      $('[data-wizard-saved-editor]').textContent=multi()?'Настроить дни подробнее':'Настроить день подробнее';
      $('[data-wizard-again]').textContent=multi()?'Собрать ещё план':'Собрать ещё день';
      announce(readiness.next);
      $('[data-wizard-title]').textContent=readiness.title;
      (committed.saved?$('[data-wizard-saved-travel]'):$('[data-wizard-download]')).focus({preventScroll:true});
    } catch {announce('Не удалось сохранить день. Ответы здесь — попробуйте ещё раз.');}
    finally {saving=false;mount.removeAttribute('aria-busy');save.disabled=false;changed();}
  });

  function reset() {
    sequence++;proposal=null;attempt=null;assessments=[];answers=defaults();form.hidden=false;
    all('input[name="wizard_area"]').forEach(input=>{input.checked=input.value===answers.area;});
    announce('');show(1);
  }
  $('[data-wizard-again]').addEventListener('click',reset);
  $('[data-wizard-download]').addEventListener('click',()=>{
    try {downloadTripFile(workshop.getState(),catalog);announce('Файл подготовлен. Сохраните его на телефоне или компьютере — потом его можно открыть в поездке.');}
    catch {announce('Браузер не подготовил файл. Попробуйте ещё раз — Ваш план открыт здесь.');}
  });
  const cleared=()=>{reset();announce('Память поездки очищена. Можно выбрать новую прогулку.');};
  window.addEventListener('godune:trip-change',changed);window.addEventListener('godune:memory-cleared',cleared);
  all('input[name="wizard_area"]').forEach(input=>{input.checked=input.value===answers.area;});
  $('[data-wizard-fallback]').hidden=true;$('[data-wizard-shell]').hidden=false;mount.dataset.wizardReady='true';
  show(1,{focus:false});
  return {reset,destroy(){sequence++;window.removeEventListener('godune:trip-change',changed);window.removeEventListener('godune:memory-cleared',cleared);}};
}
