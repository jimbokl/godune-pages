import {journeyDays,selectedDay,chooseTripDay,addTripDay,removeTripDay,movePlaceToDay,changeDayDetails,budgetInput,COST_KINDS} from './trip-days-state.mjs?v=3';
import {parseKopecks,costText,rubles} from './trip-budget-state.mjs?v=1';
import {loadScheduler} from './trip-scheduler.mjs?v=7';
import {loadTripTravelMatrix,TRAVEL_MODES,travelMode} from './travel-estimates.mjs?v=4';
import {isPersonalPoint,baseName} from './personal-points.mjs?v=1';
import {pickPersonalPoint} from './personal-point-picker.mjs?v=1';
import {planInput} from './trip-schedule-state.mjs?v=6';
import {TRIP_STARTERS,addTripStarter} from './trip-starters.mjs?v=2';
const dateLabel=date=>date?new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z')):'Дата пока не выбрана';
const clock=n=>`${n>=1440?`+${Math.floor(n/1440)} дн. `:''}${String(Math.floor(n/60)%24).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
const button=(text,action,id)=>{const b=el('button',text,'journey-button');b.type='button';b.dataset.journeyAction=action;if(id)b.dataset.journeyId=id;return b;};
const plural=(n,one,few,many)=>n%100>=11&&n%100<=14?many:n%10===1?one:n%10>=2&&n%10<=4?few:many;
const stopsLabel=n=>`${n} ${plural(n,'остановка','остановки','остановок')}`;
export function initTripDays({mount,read,commit,base,catalog}) {
  if(!mount)return {render(){},moveControl(){return null;}};
  const section=el('section',undefined,'trip-journey');section.setAttribute('aria-labelledby','journey-title');
  section.innerHTML=`<div class="journey-heading"><div><p class="eyebrow">Один день — своё приключение</p><h3 id="journey-title">Ваши дни на Балтике</h3></div><span id="journey-count" class="journey-count"></span></div>
    <details class="journey-starters"><summary>Взять готовый план на 3, 5 или 7 дней <span aria-hidden="true">+</span></summary><div id="journey-starters" class="journey-starter-options"></div><p class="journey-note">Калининград, Зеленоградск и коса. Это основа для вашей поездки: остановки, дни и транспорт можно менять. Дни добавятся к вашему черновику. Переезд между городами в начале дня, адрес жилья, билеты и часы работы уточните отдельно.</p></details>
    <nav id="journey-days" class="journey-days" aria-label="Выбрать день поездки"></nav>
    <div class="journey-tools"><button class="journey-button" type="button" data-journey-action="add">+ Ещё день</button><button class="journey-button" type="button" data-journey-action="copy">Скопировать этот день</button><button class="journey-button journey-delete" type="button" data-journey-action="remove">Удалить день</button></div>
    <details class="journey-details" id="journey-details"><summary>Начало, ночёвка и бюджет <span aria-hidden="true">+</span></summary><div class="journey-details-body"><form id="journey-bases" class="journey-bases"></form><form id="journey-costs" class="journey-costs"></form></div></details>
    <details class="journey-overview" id="journey-overview"><summary>Вся поездка <span id="journey-total" role="status"></span></summary><p class="journey-note">Время зависит от выбранных остановок, дороги и часов работы. Цены — ваши оценки; пока есть пустые суммы, полный бюджет неизвестен.</p><ol id="journey-overview-days"></ol></details><p id="journey-feedback" class="journey-note" role="status"></p>`;
  (mount.querySelector('.workshop-main') || mount).prepend(section);
  const $=selector=>section.querySelector(selector);let sequence=0;
  $('#journey-starters').replaceChildren(...TRIP_STARTERS.map(starter=>{
    const b=button(starter.name,'starter',starter.id);b.className='journey-starter';b.append(el('span',starter.description));return b;
  }));
  const feedback=text=>{$('#journey-feedback').textContent=text;};
  function label(form,caption,name,type,value) {
    const wrapper=el('label',caption),field=el(type==='textarea'?'textarea':'input');
    if(type!=='textarea')field.type=type;field.name=name;field.value=value;wrapper.append(field);form.append(wrapper);return field;
  }
  function renderForms(trip) {
    const day=selectedDay(trip),bases=$('#journey-bases'),costs=$('#journey-costs');bases.replaceChildren();costs.replaceChildren();
    for(const form of [bases,costs])form.dataset.day=day.id;
    bases.append(el('h4','Откуда выйдем, куда вернёмся'));
    for(const [name,caption] of [['start_at','Начать здесь'],['night_at','К ночи вернуться сюда']]) {
      const wrapper=el('div',undefined,'journey-base-field'),captionLabel=el('label',caption),select=el('select');select.name=name;select.id=`journey-${name}`;captionLabel.htmlFor=select.id;wrapper.append(captionLabel);const none=el('option','Пока не выбрано');none.value='';select.append(none);
      for(const place of catalog.poi) {const option=el('option',`${place.name} · ${place.area_name}`);option.value=place.slug;select.append(option);}
      if(isPersonalPoint(day[name])){const own=el('option',day[name].name);own.value='__personal__';select.prepend(own);}
      select.value=isPersonalPoint(day[name])?'__personal__':day[name] || '';wrapper.append(select);
      const pick=button(isPersonalPoint(day[name])?'Передвинуть свою точку на карте':'Выбрать свою точку на карте','personal',name);pick.className='journey-pick-point';wrapper.append(pick);bases.append(wrapper);
    }
    label(bases,'Адрес ночёвки или заметка для себя','note','textarea',day.note).rows=2;
    bases.append(el('p','Выберите ориентир или отметьте своё жильё на нашей карте. Дорога считается по ближайшим доступным улицам и тропам; вход и короткий путь до двери нужно сверить. Свои точки и заметка попадут в файл и ссылку поездки.','journey-note'));
    const saveBases=el('button','Сохранить начало и ночёвку','journey-save');saveBases.type='submit';bases.append(saveBases);
    costs.append(el('h4','Сколько взять с собой'));
    const people=label(costs,'Сколько вас','people','number',trip.itinerary?.people || 1);people.min='1';people.max='4294967295';people.step='1';people.required=true;
    const rows=el('div',undefined,'journey-cost-rows');
    for(const [kind,caption]of Object.entries(COST_KINDS)) {
      const row=el('fieldset',undefined,'journey-cost-row');row.append(el('legend',caption));const cost=day.costs[kind];
      const money=label(row,'Сумма, ₽',`${kind}-amount`,'text',costText(cost?.amount ?? null));money.inputMode='decimal';money.placeholder='Ещё не знаю';
      const qty=label(row,'Количество',`${kind}-quantity`,'number',cost?.quantity || 1);qty.min='1';qty.max='4294967295';qty.step='1';qty.required=true;
      const wrapper=el('label','Эта сумма'),scope=el('select');scope.name=`${kind}-scope`;
      for(const [value,text]of [['group','На всех'],['person','На человека']]) {const option=el('option',text);option.value=value;scope.append(option);}scope.value=cost?.scope || 'group';wrapper.append(scope);row.append(wrapper);rows.append(row);
    }costs.append(rows);
    costs.append(el('p','Укажите цену и сколько раз её оплачиваете. Пусто — расход ещё неизвестен. Ноль — бесплатно. Все суммы относятся к выбранному дню.','journey-note'));
    const save=el('button','Сохранить оценки','journey-save');save.type='submit';costs.append(save);
    const summary=el('p',undefined,'journey-budget-day');summary.id='journey-budget-day';summary.setAttribute('role','status');costs.append(summary);
  }
  async function renderTotals(trip,ticket) {
    $('#journey-total').textContent='Считаем…';
    try {
      const engine=await loadScheduler(base);if(ticket!==sequence)return;
      const matrices=await Promise.all(journeyDays(trip).map(day=>loadTripTravelMatrix(base,chooseTripDay(trip,day.id),catalog).catch(()=>null)));if(ticket!==sequence)return;
      const budget=engine.budget(budgetInput(trip));
      $('#journey-total').textContent=budget.total===null?`${rubles(budget.known)} известно · полный бюджет пока неизвестен`:`${rubles(budget.total)} на всех · ${rubles(budget.per_person)} на человека`;
      const active=budget.days.find(day=>day.id===selectedDay(trip).id),daySummary=$('#journey-budget-day');
      daySummary.textContent=active.total===null?`Этот день: ${rubles(active.known)} известно. Не заполнено категорий: ${active.unknown}.`:`Оценка этого дня: ${rubles(active.total)} на всех.`;
      section.dataset.budgetReady='true';
      $('#journey-overview-days').replaceChildren(...journeyDays(trip).map((day,index)=>{
        const li=el('li'),select=button(`День ${index+1} · ${dateLabel(day.date)}`,'choose',day.id);li.append(select);
        const summary=el('p',undefined,'journey-day-note');
        const total=budget.days.find(row=>row.id===day.id);
        let text=`${stopsLabel(day.places.length)} · ${TRAVEL_MODES[travelMode(chooseTripDay(trip,day.id))]}`;
        if(day.places.length) {
          const result=engine(planInput(chooseTripDay(trip,day.id),catalog,matrices[index]));
          text+=` · ${result.finish===null?'не раньше':'окончание около'} ${clock(result.earliest_finish)}`;
          if(['conflict','overrun'].includes(result.status))text+=' · не всё помещается';
          if(result.finish===null)text+=' · дорогу нужно уточнить';
        }else text+=' · выберите места';
        text+=total.total===null?` · ${rubles(total.known)} известно`:` · ${rubles(total.total)}`;summary.textContent=text;li.append(summary);
        for(const [field,caption]of [['start_at','От'],['night_at','К ночи']])if(day[field])li.append(el('p',`${caption}: ${baseName(day[field],catalog)}`,'journey-day-note'));
        return li;
      }));
    }catch(error) {if(ticket!==sequence)return;section.dataset.budgetReady='error';$('#journey-overview-days').replaceChildren();$('#journey-total').textContent=error.message==='budget_overflow'?'Суммы слишком велики для расчёта. Проверьте цены и количество.':'Расчёт пока не открылся. Ваши суммы сохранены.';}
  }
  function render() {
    const trip=read(),days=journeyDays(trip),day=selectedDay(trip),ticket=++sequence;
    const focused=document.activeElement?.closest('.trip-journey')?document.activeElement.name:null;
    const selection=focused && document.activeElement.type==='text'?document.activeElement.selectionStart:null;
    $('#journey-count').textContent=`${days.length} ${plural(days.length,'день','дня','дней')}`;
    $('#journey-days').replaceChildren(...days.map((row,index)=>{
      const b=button('', 'choose',row.id);b.className='journey-day';b.setAttribute('aria-pressed',String(row.id===day.id));
      b.append(el('span',`День ${index+1}`,'journey-day-number'),el('span',dateLabel(row.date),'journey-day-date'),el('span',stopsLabel(row.places.length),'journey-day-points'));return b;
    }));
    section.querySelector('[data-journey-action="remove"]').hidden=days.length===1;
    renderForms(trip);section.dataset.budgetReady='false';
    if(trip.itinerary || $('#journey-details').open || $('#journey-overview').open)renderTotals(trip,ticket);
    else {section.dataset.budgetReady='true';$('#journey-total').textContent='Бюджет ещё не заполнен';}
    if(focused) {const field=[...section.querySelectorAll('[name]')].find(el=>el.name===focused);field?.focus({preventScroll:true});if(selection!==null)field?.setSelectionRange(selection,selection);}
  }
  for(const id of ['#journey-details','#journey-overview'])$(id).addEventListener('toggle',()=>{
    if($(id).open){section.dataset.budgetReady='false';renderTotals(read(),++sequence);}
  });
  async function choose(id) {await commit(current=>chooseTripDay(current,id),'День открыт.');section.querySelector(`[data-journey-action="choose"][data-journey-id="${id}"]`)?.focus({preventScroll:true});}
  section.addEventListener('click',async event=>{
    const node=event.target.closest('[data-journey-action]');if(!node)return;
    const action=node.dataset.journeyAction;
    if(action==='personal'){
      const day=selectedDay(read()),field=node.dataset.journeyId;
      const before=JSON.stringify(day[field]);
      const point=await pickPersonalPoint({base,initial:day[field],caption:field==='start_at'?'Откуда начнётся ваш день':'Куда вернёмся к ночи',focusPlace:catalog.poi.find(p=>p.slug===day.places[0])});
      if(!point)return;let stale=false;
      await commit(current=>{if(selectedDay(current).id!==day.id||JSON.stringify(selectedDay(current)[field])!==before){stale=true;return current;}return changeDayDetails(current,{[field]:point});},'Ваша точка сохранена.');
      feedback(stale?'День или точка уже изменились. Откройте выбор точки ещё раз.':'Точка сохранена. Первый расчёт загрузит дорожный граф; следующие работают в браузере.');return;
    }
    if(action==='choose')return choose(node.dataset.journeyId);
    if(action==='starter'){
      await commit(current=>addTripStarter(current,node.dataset.journeyId,catalog),'Готовый план стал частью вашей поездки.');
      feedback('Дни добавлены. Выберите день: меняйте остановки, время и транспорт под себя.');
      return;
    }
    const currentId=selectedDay(read()).id;
    if(action==='remove' && !window.confirm('Удалить этот день вместе с остановками, заметкой и оценками расходов? Другие дни останутся.'))return;
    await commit(current=>action==='add'?addTripDay(current):action==='copy'?addTripDay(current,true):removeTripDay(current,currentId),action==='remove'?'День удалён.':'Новый день открыт.');
    section.querySelector(`[data-journey-id="${selectedDay(read()).id}"]`)?.focus({preventScroll:true});
  });
  section.addEventListener('submit',async event=>{
    event.preventDefault();const form=event.target,values=new FormData(form),day=form.dataset.day;let changes;
    try {
      if(form.id==='journey-bases'){const current=selectedDay(read());changes={start_at:values.get('start_at')==='__personal__'?current.start_at:values.get('start_at') || null,night_at:values.get('night_at')==='__personal__'?current.night_at:values.get('night_at') || null,note:values.get('note')};}
      else {
        const costs=Object.fromEntries(Object.keys(COST_KINDS).map(kind=>[kind,{amount:parseKopecks(values.get(`${kind}-amount`)),quantity:Number(values.get(`${kind}-quantity`)),scope:values.get(`${kind}-scope`)}]));
        changes={people:Number(values.get('people')),costs};
      }
    }catch(error){feedback(error.message);return;}
    let stale=false;
    await commit(current=>{if(selectedDay(current).id!==day){stale=true;return current;}return changeDayDetails(current,changes);},'Настройки дня сохранены.');
    feedback(stale?'В другой вкладке уже выбран другой день. Откройте нужный и сохраните ещё раз.':form.id==='journey-costs'?'Ваши оценки сохранены.':'Начало, ночёвка и заметка сохранены.');
  });
  function moveControl(id,name) {
    const days=journeyDays(read()),source=selectedDay(read()).id;if(days.length<2)return null;
    const wrapper=el('label','Перенести в другой день','trip-day-move'),select=el('select');select.setAttribute('aria-label',`Перенести ${name} в другой день`);
    const none=el('option','Выберите день');none.value='';select.append(none);
    days.forEach((day,index)=>{if(day.id===selectedDay(read()).id)return;const option=el('option',`День ${index+1} · ${dateLabel(day.date)}`);option.value=day.id;select.append(option);});
    select.addEventListener('change',async()=>{const target=select.value;if(!target)return;
      await commit(current=>selectedDay(current).id===source?movePlaceToDay(current,id,target):current,`${name}: остановка перенесена.`);
      const button=section.querySelector(`[data-journey-id="${source}"]`);button?.focus({preventScroll:true});
    });wrapper.append(select);return wrapper;
  }
  return {render,moveControl};
}
