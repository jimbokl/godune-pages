import {applyWizardDay,dayIsOccupied,prepareWizardDay,wizardDefaults,wizardRoutes} from './planning-wizard-state.mjs?v=1';
import {selectedDay} from './trip-days-state.mjs?v=12';
import {planInput} from './trip-schedule-state.mjs?v=9';
import {baseName} from './personal-points.mjs?v=3';

const clock=minute=>`${minute>=1440?`+${Math.floor(minute/1440)} дн. `:''}${String(Math.floor(minute/60)%24).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
const duration=minute=>`${Math.floor(minute/60)?`${Math.floor(minute/60)} ч `:''}${minute%60?`${minute%60} мин`:''}`.trim() || '0 мин';
const dateLabel=value=>value?new Intl.DateTimeFormat('ru',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z')):'Дата пока не выбрана';
const minute=value=>/^\d\d:\d\d$/.test(value)?Number(value.slice(0,2))*60+Number(value.slice(3)):null;
const stopLabel=count=>`${count} ${count%100>=11&&count%100<=14?'остановок':count%10===1?'остановка':count%10>=2&&count%10<=4?'остановки':'остановок'}`;
const titles=['Где хочется провести день?','Какая прогулка Вам ближе?','Ваш день складывается'];
const leads=['Выберите прогулку. Посмотрим, как складывается день, и сохраним его в Вашей поездке.',
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
  let answers=wizardDefaults(workshop.getState(),catalog),step=1,proposal=null,revision=null,sequence=0,saving=false;
  const node=(tag,text,className)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;if(className)element.className=className;return element;};
  const point=id=>catalog.poi.find(row=>row.slug===id);
  const announce=text=>{status.textContent=text;};
  const focusTitle=()=>{$('[data-wizard-title]').focus({preventScroll:true});mount.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});};

  function summary() {
    const date=form.elements.wizard_date.value || null;
    $('[data-wizard-settings-summary]').textContent=`${dateLabel(date)} · ${form.elements.wizard_start.value}–${form.elements.wizard_end.value} · изменить`;
  }

  function routes() {
    const rows=wizardRoutes(catalog).filter(route=>route.area===answers.area);
    if(!rows.some(route=>route.slug===answers.route))answers.route=rows[0]?.slug || null;
    const choices=rows.map(route=>{
      const label=node('label',undefined,'wizard-choice wizard-route'),radio=node('input'),copy=node('span');
      radio.type='radio';radio.name='wizard_route';radio.value=route.slug;radio.required=true;radio.checked=route.slug===answers.route;
      copy.append(node('strong',route.name),node('small',`${route.minutes?`Около ${duration(route.minutes)} · `:''}${stopLabel(route.stops.length)}`));
      copy.append(node('span',route.start_note,'wizard-choice-note'));const mark=node('span','→','wizard-choice-mark');mark.setAttribute('aria-hidden','true');label.append(radio,copy,mark);return label;
    });
    $('[data-wizard-routes]').replaceChildren(...choices);
    const separate=dayIsOccupied(workshop.getState());
    $('[data-wizard-placement]').textContent=separate?'Выбранный день уже занят. Эта прогулка станет отдельным днём — проверьте её дату.':'Прогулка заполнит свободный выбранный день.';
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
    $('[data-wizard-saved]').hidden=true;save.disabled=false;
    if(step===2)routes();
    if(step===3)preview();
    if(focus)focusTitle();
  }

  function orderedStops(schedule=null) {
    const list=node('ol',undefined,'wizard-timeline');list.dataset.wizardTimeline='';
    for(const [index,id]of proposal.trip.places.entries()) {
      const place=point(id),row=schedule?.stops.find(stop=>stop.id===id),li=node('li'),time=node('span',undefined,'wizard-time');
      time.textContent=row?row.begins===null?`Не раньше ${clock(row.earliest_begin)}`:clock(row.begins):String(index+1).padStart(2,'0');
      const copy=node('div'),link=node('a',place.name);link.href=new URL(`poi/${id}/`,base).href;
      copy.append(link,node('p',`${proposal.trip.schedule.stops[id].visit} мин. на остановку`,'wizard-stop-duration'));
      const note=proposal.route.stops.find(stop=>stop.poi===id)?.note;if(note)copy.append(node('p',note,'wizard-stop-note'));
      if(row?.issues.length) {
        const issues=node('ul',undefined,'wizard-issues');
        for(const issue of row.issues){const text=issueText[issue.code] || 'Этот участок требует уточнения.';const line=node('li',text);line.dataset.wizardIssue=issue.code;issues.append(line);}copy.append(issues);
      }
      li.append(time,copy);list.append(li);
    }
    return list;
  }

  function renderResult(schedule=null,error=false) {
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

  async function preview() {
    const ticket=sequence;
    try {proposal=prepareWizardDay(workshop.getState(),answers,catalog);revision=workshop.getRevision();}
    catch {proposal=null;save.disabled=true;result.replaceChildren();announce('Прогулка сейчас недоступна. Вернитесь к выбору дня.');return;}
    save.disabled=true;renderResult();mount.dataset.wizardCalculating='true';announce('');
    try {
      const [{loadScheduler},{loadTripTravelMatrix}]=await Promise.all([import('./trip-scheduler.mjs?v=13'),import('./travel-estimates.mjs?v=6')]);
      const [calculate,matrix]=await Promise.all([loadScheduler(base),loadTripTravelMatrix(base,proposal.trip,catalog).catch(()=>null)]);
      if(ticket!==sequence || step!==3)return;
      renderResult(calculate(planInput(proposal.trip,catalog,matrix)));
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
      answers.area=field.value;show(2);return;
    }
    if(step!==2)return;
    form.elements.wizard_end.setCustomValidity('');
    for(const field of [form.elements.wizard_date,form.elements.wizard_start,form.elements.wizard_end])if(!field.checkValidity()){$('[data-wizard-settings]').open=true;field.reportValidity();return;}
    const route=form.querySelector('input[name="wizard_route"]:checked');
    answers={...answers,route:route?.value || null,date:form.elements.wizard_date.value || null,start:minute(form.elements.wizard_start.value),end:minute(form.elements.wizard_end.value)};
    if(answers.start>=answers.end){form.elements.wizard_end.setCustomValidity('Конец дня должен быть позже начала прогулки.');form.elements.wizard_end.reportValidity();return;}
    try {prepareWizardDay(workshop.getState(),answers,catalog);show(3);}catch {announce('Проверьте прогулку, дату и время.');}
  });
  form.addEventListener('input',()=>{
    form.elements.wizard_end.setCustomValidity('');
    if(step===2)answers={...answers,route:form.querySelector('input[name="wizard_route"]:checked')?.value || null,
      date:form.elements.wizard_date.value || null,start:minute(form.elements.wizard_start.value),end:minute(form.elements.wizard_end.value)};
    summary();
  });
  all('[data-wizard-back]').forEach(button=>button.addEventListener('click',()=>show(step-1)));
  save.addEventListener('click',async()=>{
    if(saving || save.disabled || !proposal)return;
    saving=true;save.disabled=true;mount.setAttribute('aria-busy','true');let intent;
    try {
      const committed=await workshop.setState(current=>{intent=applyWizardDay(current,proposal,catalog,{separate:proposal.placement==='separate'});return intent.state;},'Прогулка сохранена в поездке.',{expectedRevision:revision});
      if(committed.conflict || !intent?.applied){announce('Поездка уже изменилась. Обновите предложение перед сохранением.');revision=-1;return;}
      $('[data-wizard-form]').hidden=true;$('[data-wizard-progress="3"]').setAttribute('aria-current','step');
      $('[data-wizard-saved]').hidden=false;
      announce(committed.saved?'День сохранён в этом браузере. Можно открыть его в дороге.':'День открыт в этой вкладке, но браузер не сохранил его. В настройках поездки скачайте файл, прежде чем закрывать страницу.');
      $('[data-wizard-title]').textContent='Ваш день готов';$('[data-wizard-saved] a').focus({preventScroll:true});
    } catch {announce('Не удалось сохранить день. Ответы здесь — попробуйте ещё раз.');}
    finally {saving=false;mount.removeAttribute('aria-busy');save.disabled=false;changed();}
  });

  function reset() {
    sequence++;proposal=null;answers=wizardDefaults(workshop.getState(),catalog);form.hidden=false;
    all('input[name="wizard_area"]').forEach(input=>{input.checked=input.value===answers.area;});
    announce('');show(1);
  }
  $('[data-wizard-again]').addEventListener('click',reset);
  const cleared=()=>{reset();announce('Память поездки очищена. Можно выбрать новую прогулку.');};
  window.addEventListener('godune:trip-change',changed);window.addEventListener('godune:memory-cleared',cleared);
  all('input[name="wizard_area"]').forEach(input=>{input.checked=input.value===answers.area;});
  $('[data-wizard-fallback]').hidden=true;$('[data-wizard-shell]').hidden=false;mount.dataset.wizardReady='true';
  show(1,{focus:false});
  return {reset,destroy(){sequence++;window.removeEventListener('godune:trip-change',changed);window.removeEventListener('godune:memory-cleared',cleared);}};
}
