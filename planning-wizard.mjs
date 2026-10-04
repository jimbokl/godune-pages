import {applyWizardPlan,dayIsOccupied,journeyIsOccupied,prepareWizardPlan,wizardDefaults,wizardRoutes,wizardStarters} from './planning-wizard-state.mjs?v=3';
import {chooseTripDay,selectedDay} from './trip-days-state.mjs?v=12';
import {planInput} from './trip-schedule-state.mjs?v=9';
import {baseName} from './personal-points.mjs?v=3';
import {assessSchedule,readinessCopy} from './day-readiness.mjs?v=2';
import {downloadTripFile} from './trip-file.mjs?v=17';

const clock=minute=>`${minute>=1440?`+${Math.floor(minute/1440)} дн. `:''}${String(Math.floor(minute/60)%24).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
const duration=minute=>`${Math.floor(minute/60)?`${Math.floor(minute/60)} ч `:''}${minute%60?`${minute%60} мин`:''}`.trim() || '0 мин';
const dateLabel=value=>value?new Intl.DateTimeFormat('ru',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z')):'Дата пока не выбрана';
const minute=value=>/^\d\d:\d\d$/.test(value)?Number(value.slice(0,2))*60+Number(value.slice(3)):null;
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
  let answers=wizardDefaults(workshop.getState(),catalog),step=1,proposal=null,revision=null,sequence=0,saving=false,attempt=null,assessments=[];
  const node=(tag,text,className)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;if(className)element.className=className;return element;};
  const point=id=>catalog.poi.find(row=>row.slug===id);
  const multi=()=>answers.area==='whole-trip';
  const announce=text=>{status.textContent=text;};
  const focusTitle=()=>{$('[data-wizard-title]').focus({preventScroll:true});mount.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});};

  function summary() {
    const date=form.elements.wizard_date.value || null;
    $('[data-wizard-settings-summary]').textContent=`${dateLabel(date)} · ${form.elements.wizard_start.value}–${form.elements.wizard_end.value} · изменить`;
  }

  function routes() {
    const rows=multi()?wizardStarters(catalog):wizardRoutes(catalog).filter(route=>route.area===answers.area);
    const key=multi()?'starter':'route',id=row=>multi()?row.id:row.slug;
    if(!rows.some(row=>id(row)===answers[key]))answers[key]=rows[0]?id(rows[0]):null;
    const choices=rows.map(route=>{
      const label=node('label',undefined,'wizard-choice wizard-route'),radio=node('input'),copy=node('span');
      radio.type='radio';radio.name=multi()?'wizard_starter':'wizard_route';radio.value=id(route);radio.required=true;radio.checked=id(route)===answers[key];
      copy.append(node('strong',route.name),node('small',multi()?route.description:`${route.minutes?`Около ${duration(route.minutes)} · `:''}${stopLabel(route.stops.length)}`));
      copy.append(node('span',multi()?'Калининград · Зеленоградск · Куршская коса. На косе — на машине.':route.start_note,'wizard-choice-note'));const mark=node('span','→','wizard-choice-mark');mark.setAttribute('aria-hidden','true');label.append(radio,copy,mark);return label;
    });
    $('[data-wizard-routes]').replaceChildren(...choices);
    const separate=(multi()?journeyIsOccupied:dayIsOccupied)(workshop.getState());
    $('[data-wizard-placement]').textContent=multi()?(separate?'У Вас уже есть планы. Добавим все новые дни рядом с ними — проверьте первую дату.':'Начнём новую поездку. Каждый день потом можно изменить.'):
      separate?'Выбранный день уже занят. Эта прогулка станет отдельным днём — проверьте её дату.':'Прогулка заполнит свободный выбранный день.';
    $('[data-wizard-date-label]').textContent=multi()?'Первый день, если знаете дату':'Дата, если знаете';
    $('[data-wizard-start-label]').textContent=multi()?'Начало каждого дня':'Начало прогулки';
    $('[data-wizard-settings-note]').textContent=multi()?'Время задаётся для каждого дня. Переезды между городами, жильё и билеты добавьте в поездку отдельно.':'Если в поездке указано место ночёвки, учтём дорогу от него. Билеты, обед и долгие остановки можно добавить после сохранения.';
    $('[data-wizard-preview-label]').textContent=multi()?'Посмотреть план →':'Посмотреть день →';
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
    if(multi() && step>1){$('[data-wizard-title]').textContent=step===2?'Сколько дней у Вас есть?':'Ваша поездка по дням';$('[data-wizard-lead]').textContent=step===2?'В плане будут город, море и дюны. Выберите длину поездки — затем посмотрим каждый день.':'Откройте день, чтобы увидеть остановки и расчёт времени. Любую часть плана можно изменить после сохранения.';}
    all('[data-wizard-progress-label]').forEach((label,index)=>{label.textContent=(multi()?['Выбор','Дни','План']:['Место','Прогулка','Ваш день'])[index];});
    $('[data-wizard-change-label]').textContent=multi()?'← Изменить план':'← Изменить прогулку';
    $('[data-wizard-saved]').hidden=true;save.disabled=false;
    if(step===2)routes();
    if(step===3)preview();
    if(focus)focusTitle();
  }

  function orderedStops(schedule=null,trip=proposal.trip,route=proposal.route) {
    const list=node('ol',undefined,'wizard-timeline');list.dataset.wizardTimeline='';
    for(const [index,id]of trip.places.entries()) {
      const place=point(id),row=schedule?.stops.find(stop=>stop.id===id),li=node('li'),time=node('span',undefined,'wizard-time');
      time.textContent=row?row.begins===null?`Не раньше ${clock(row.earliest_begin)}`:clock(row.begins):String(index+1).padStart(2,'0');
      const copy=node('div'),link=node('a',place.name);link.href=new URL(`poi/${id}/`,base).href;
      copy.append(link,node('p',`${trip.schedule.stops[id].visit} мин. на остановку`,'wizard-stop-duration'));
      const note=route?.stops.find(stop=>stop.poi===id)?.note;if(note)copy.append(node('p',note,'wizard-stop-note'));
      if(row?.issues.length) {
        const issues=node('ul',undefined,'wizard-issues');
        for(const issue of row.issues){const text=issueText[issue.code] || 'Этот участок требует уточнения.';const line=node('li',text);line.dataset.wizardIssue=issue.code;issues.append(line);}copy.append(issues);
      }
      li.append(time,copy);list.append(li);
    }
    return list;
  }

  function renderResult(schedule=null,error=false) {
    if(proposal.kind==='journey'){renderJourney(schedule,error);return;}
    const day=selectedDay(proposal.trip),heading=node('h3',proposal.route.name,'wizard-result-title');
    const meta=node('p',`${proposal.placement==='separate'?'Отдельный день':'Выбранный день'} · ${dateLabel(day.date)} · начало в ${clock(answers.start)}`,'wizard-result-meta');
    const brief=node('p',proposal.route.description,'wizard-result-copy');
    const timing=node('p',undefined,'wizard-calculation');timing.dataset.wizardCalculation='';
    if(schedule) {
      const lower=schedule.finish===null;
      timing.textContent=`${lower?'Окончание не раньше':'По расчёту — до'} ${clock(lower?schedule.earliest_finish:schedule.finish)}. ${schedule.status==='overrun' || schedule.status==='conflict'?'В выбранное время день не помещается. Измените время или прогулку.':lower?'Для точного времени не хватает данных о дороге.':'Дорога и посещения могут занять больше времени; перед выходом сверьте условия.'}`;
      timing.dataset.wizardCalculation=schedule.status;
    } else timing.textContent=error?'Время сейчас не рассчиталось. Порядок остановок можно сохранить и уточнить позже.':'Считаем дорогу и остановки…';
    const access=node('p',proposal.route.access_note,'wizard-access-note');
    const assumptions=node('details',undefined,'wizard-evidence');assumptions.append(node('summary','Что учтено в этом дне'));
    assumptions.append(node('p',proposal.route.geometry_source || 'Линия прогулки рассчитана по карте. Проход на месте ещё нужно сверить.'));
    if(proposal.route.verified_at)assumptions.append(node('p',`Данные маршрута: ${dateLabel(proposal.route.verified_at)}.`));
    assumptions.append(node('p','Время известного посещения взято из карточки. На отдельную тропу заложено время прогулки; на остальные остановки без отдельной оценки — 30 минут. После сохранения это можно изменить. Запас между остановками — 10 минут.'));
    const bases=[];if(day.start_at)bases.push(`Начало дня: ${baseName(day.start_at,catalog)}.`);if(day.night_at)bases.push(`Возвращение: ${baseName(day.night_at,catalog)}.`);
    if(bases.length)assumptions.append(node('p',bases.join(' ')));
    else assumptions.append(node('p','Начало у первой остановки. Дорога до неё и от конца прогулки здесь не рассчитана.'));
    const protection=node('p',proposal.placement==='separate'?'В выбранном дне уже есть Ваши планы. Сохраним их целиком, а прогулку добавим отдельным днём.':'Сохраним этот день в общей поездке. Регистрация не нужна.','wizard-save-note');
    result.replaceChildren(meta,heading,brief,timing,orderedStops(schedule),access,assumptions,protection);
    save.textContent=proposal.placement==='separate'?'Добавить отдельный день':'Сохранить день в поездке';
  }

  function renderJourney(schedules=null,error=false) {
    const introduction=node('div',undefined,'wizard-journey-intro');
    introduction.append(node('p',dateLabel(answers.date),'wizard-result-meta'),node('h3',`${proposal.starter.name} на Балтике`,'wizard-result-title'),node('p',proposal.starter.description,'wizard-result-copy'));
    introduction.append(node('p','На Куршской косе нужна машина: эти дни начинаются и заканчиваются у променада Зеленоградска. Переезды между городами и ночёвки пока не входят в план.','wizard-access-note'));
    const days=proposal.targetIds.map((id,index)=>{
      const trip=chooseTripDay(proposal.trip,id),day=selectedDay(trip),schedule=schedules?.get(id),card=node('details',undefined,'wizard-day');
      card.dataset.wizardDay=id;card.open=index===0;
      const heading=node('summary'),number=node('span',String(index+1).padStart(2,'0'),'wizard-day-number'),copy=node('span');
      const areas=[...new Set(day.places.map(place=>point(place).area_name).filter(Boolean))];
      copy.append(node('strong',areas.join(' · ') || point(day.places[0]).name),node('small',`${dateLabel(day.date)} · ${day.schedule.mode==='car'?'На машине':'Пешком'} · ${stopLabel(day.places.length)}`));
      heading.append(number,copy,node('span','+','wizard-day-toggle'));card.append(heading);
      const body=node('div',undefined,'wizard-day-body'),timing=node('p',undefined,'wizard-calculation');timing.dataset.wizardCalculation=schedule?.status || 'pending';
      if(schedule){const lower=schedule.finish===null;timing.textContent=`${lower?'Окончание не раньше':'По расчёту — до'} ${clock(lower?schedule.earliest_finish:schedule.finish)}. ${['overrun','conflict'].includes(schedule.status)?'День не помещается в выбранное время. Его можно сократить или начать раньше.':lower?'Для точного времени не хватает данных о дороге.':'Перед выходом сверьте проход, часы и билеты.'}`;}
      else timing.textContent=error?'Время сейчас не рассчиталось. Сохраните остановки и уточните план позже.':'Считаем дорогу и остановки…';
      body.append(timing,orderedStops(schedule,trip,null));
      const bases=day.start_at?`Старт и возвращение: ${baseName(day.start_at,catalog)}.`:'Начало у первой остановки. Дорога до неё и от конца прогулки здесь не рассчитана.';
      body.append(node('p',bases,'wizard-access-note'));card.append(body);return card;
    });
    const evidence=node('details',undefined,'wizard-evidence');evidence.append(node('summary','Как рассчитан план'),node('p','Дорога каждого дня оценена по общей карте маршрутов. Время посещения берём из карточек; где оценки нет — оставляем 30 минут. Между остановками добавлен запас 10 минут. Всё это можно изменить в поездке.'),node('p','Часы работы на будущую дату, билеты, питание и переезды между днями требуют отдельной проверки. Расчёт не подтверждает бронь или доступ на тропу.'));
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
      const [{loadScheduler},{loadTripTravelMatrix}]=await Promise.all([import('./trip-scheduler.mjs?v=16'),import('./travel-estimates.mjs?v=6')]);
      const calculate=await loadScheduler(base);
      const trips=proposal.kind==='journey'?proposal.targetIds.map(id=>chooseTripDay(proposal.trip,id)):[proposal.trip];
      const schedules=await Promise.all(trips.map(async trip=>{const matrix=await loadTripTravelMatrix(base,trip,catalog).catch(()=>null);return calculate(planInput(trip,catalog,matrix));}));
      if(ticket!==sequence || step!==3)return;
      assessments=schedules.map(assessSchedule);
      renderResult(proposal.kind==='journey'?new Map(proposal.targetIds.map((id,index)=>[id,schedules[index]])):schedules[0]);
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
    for(const field of [form.elements.wizard_date,form.elements.wizard_start,form.elements.wizard_end])if(!field.checkValidity()){$('[data-wizard-settings]').open=true;field.reportValidity();return;}
    const route=form.querySelector('input[name="wizard_route"]:checked'),starter=form.querySelector('input[name="wizard_starter"]:checked');
    answers={...answers,route:route?.value || answers.route,starter:starter?.value || answers.starter,date:form.elements.wizard_date.value || null,start:minute(form.elements.wizard_start.value),end:minute(form.elements.wizard_end.value)};
    if(answers.start>=answers.end){form.elements.wizard_end.setCustomValidity('Конец дня должен быть позже начала прогулки.');form.elements.wizard_end.reportValidity();return;}
    try {prepareWizardPlan(workshop.getState(),answers,catalog);show(3);}catch {announce('Проверьте план, дату и время. Все дни должны помещаться в выбранный календарь.');}
  });
  form.addEventListener('input',()=>{
    form.elements.wizard_end.setCustomValidity('');
    if(step===2)answers={...answers,route:form.querySelector('input[name="wizard_route"]:checked')?.value || answers.route,starter:form.querySelector('input[name="wizard_starter"]:checked')?.value || answers.starter,
      date:form.elements.wizard_date.value || null,start:minute(form.elements.wizard_start.value),end:minute(form.elements.wizard_end.value)};
    summary();
  });
  all('[data-wizard-back]').forEach(button=>button.addEventListener('click',()=>show(step-1)));
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
    sequence++;proposal=null;attempt=null;assessments=[];answers=wizardDefaults(workshop.getState(),catalog);form.hidden=false;
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
