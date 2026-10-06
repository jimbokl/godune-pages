import {updateSchedule,cleanSchedule,defaultSchedule} from './trip-schedule-state.mjs?v=16';
import {resolveVisitCalendar,validVisitDate} from './visit-calendar.mjs?v=4';
import {resolveKitchenCalendar} from './kitchen-calendar.mjs';

import {resolveRail} from './trip-rail-state.mjs?v=6';
import {foodTrip,anchorRequest} from './gastro-day.mjs?v=10';
import {selectedDay,dayHasContent,addTripDay,changeDayDetails,ensureJourney} from './trip-days-state.mjs?v=21';
import {baseName,isPersonalPoint} from './personal-points.mjs?v=3';
import {loadTripTravelMatrix} from './travel-estimates.mjs?v=9';

export const clock = minute => `${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
export function gastroDay(settings,anchored=false) {
  if(!settings.date && !anchored)return null;
  if(settings.date && !validVisitDate(settings.date))throw Error('invalid_date');
  if(typeof settings.time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.time))throw Error('invalid_time');
  const budget=Number(settings.max_minutes);
  if(!Number.isInteger(budget)||budget<30||budget>720)throw Error('invalid_budget');
  const start=Number(settings.time.slice(0,2))*60+Number(settings.time.slice(3));
  return {start,end:Math.min(1440,start+budget),reserve:10};
}

export function calculate(wasm,input) {
  const bytes=new TextEncoder().encode(JSON.stringify(input));
  const pointer=wasm.gastro_alloc(bytes.length);let output,length;
  try {
    new Uint8Array(wasm.memory.buffer,pointer,bytes.length).set(bytes);
    output=wasm.gastro_plan(pointer,bytes.length);
    length=new DataView(wasm.memory.buffer).getUint32(output,true);
    const result=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(new Uint8Array(wasm.memory.buffer,output+4,length)));
    if(!result.ok)throw Error(result.error);
    return result.tours;
  } finally {
    wasm.gastro_free(pointer,bytes.length);
    if(output!==undefined && length!==undefined)wasm.gastro_free(output,length+4);
  }
}
export function planRequest(food,settings,context={}) {
  const day=gastroDay(settings,!!(settings.anchors?.start_at || settings.anchors?.night_at));
  const rail=resolveRail(foodTrip(food,settings),context.catalog);
  if(day && rail?.input)day.rail=rail.input;
  const dated=!!settings.date;
  return {venues:food.venues.map(v=>{
    const calendar=dated?resolveVisitCalendar({hours:v.visit_hours},settings.date):null;
    const kitchen=dated?resolveKitchenCalendar({gastronomy:v,visit_conditions:v.visit_kitchen?[v.visit_kitchen]:[]},settings.date):null;
    return {id:v.slug,roles:v.roles,themes:v.themes,visit:v.visit,available:v.available,
      ...(day?{opening:calendar?.windows ?? null,opening_needs_check:calendar?.needsCheck || false,kitchen:kitchen?.input ?? {ordering:null,needs_check:false}}:{})};
  }),legs:food.legs,theme:settings.theme,max_minutes:Number(settings.max_minutes),stops:Number(settings.stops),start:settings.start||null,
    ...(day?{day}:{}),...anchorRequest(food,settings,context.catalog,context.matrix)};
}
// Existing points keep their order. Food stops join the same durable trip draft.
export function appendTour(current,tour,food,settings={}) {
  if(!current.places.length && !current.routes.length && (settings.anchors || settings.rail))return saveTourDay(current,tour,food,settings);
  let next={...current,places:[...new Set([...current.places,...tour.places])]};
  if(!current.places.length && !current.routes.length) {
    const day=gastroDay(settings);
    // Replace the day as a whole: changing its start before its end could
    // temporarily make an evening interval invalid and retain the old start.
    next={...next,schedule:{...(cleanSchedule(next.schedule,next.places)||defaultSchedule()),mode:'foot',...(day||{})}};
    if(day) {
      next={...next,date:settings.date,month:Number(settings.date.slice(5,7))};
    }
  }
  for(const id of tour.places) {
    if(current.places.includes(id))continue;
    const v=food.venues.find(v=>v.slug===id);
    if(v)next=updateSchedule(next,'visit',v.visit,id);
  }
  return next;
}
// Save the calculated day intact. An occupied day remains a separate day.
export function saveTourDay(current,tour,food,settings) {
  const prepared=foodTrip(food,settings,tour.places);
  const selected=selectedDay(current);
  if(JSON.stringify(current.places)===JSON.stringify(prepared.places) && current.date===prepared.date
    && JSON.stringify(current.schedule)===JSON.stringify(prepared.schedule)
    && JSON.stringify(selected.start_at)===JSON.stringify(settings.anchors?.start_at || null)
    && JSON.stringify(selected.night_at)===JSON.stringify(settings.anchors?.night_at || null))return current;
  let next=dayHasContent(current) || current.routes.length ? addTripDay(current) : ensureJourney(current);
  next=changeDayDetails(next,{start_at:settings.anchors?.start_at || null,night_at:settings.anchors?.night_at || null,
    wave:{version:1,theme:'gastro',pace:'full',recipe:null}});
  const day=selectedDay(next);
  Object.assign(day,{date:prepared.date,places:[...prepared.places],schedule:structuredClone(prepared.schedule)});
  return {...next,date:prepared.date,month:prepared.month,places:[...prepared.places],schedule:structuredClone(prepared.schedule)};
}
export async function initGastronomy(base,workshop) {
  const form=document.querySelector('#gastro-form');if(!form)return;
  const status=document.querySelector('#gastro-status'),results=document.querySelector('#gastro-results');
  const [response,catalogResponse,wasmResponse]=await Promise.all([
    fetch(new URL('data/gastronomy.json',base)),fetch(new URL('data/catalog.json',base)),fetch(new URL('assets/gastro.wasm?v=1',base))
  ]);
  if(!response.ok||!catalogResponse.ok||!wasmResponse.ok)throw Error('food_engine');
  const [food,catalog,{instance}]=await Promise.all([response.json(),catalogResponse.json(),wasmResponse.arrayBuffer().then(b=>WebAssembly.instantiate(b))]);
  const make=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
  const themes={all:'Вкусы города',fish:'Рыбная прогулка',baltic:'Балтика за столом',italian:'Итальянская остановка'};
  const state=workshop.getState();
  if(validVisitDate(state.date))form.elements.date.value=state.date;
  if(state.schedule)form.elements.time.value=clock(state.schedule.start);
  let revision=0,ownSaving=false;
  const basesKey=()=>{const d=selectedDay(workshop.getState());return JSON.stringify([d.id,d.start_at,d.night_at]);};
  let basis=basesKey();
  function syncBases() {
    const day=selectedDay(workshop.getState());
    for(const [name,field,empty] of [['origin','start_at','С первого кафе'],['destination','night_at','Закончим у последнего кафе']]) {
      const select=form.elements[name],value=day[field];select.replaceChildren();
      select.add(new Option(empty,''));
      if(isPersonalPoint(value))select.add(new Option(value.name,'personal'));
      catalog.poi.forEach(p=>select.add(new Option(`${p.name} · ${p.area_name}`,p.slug)));
      select.value=isPersonalPoint(value)?'personal':value || '';
    }
    form.querySelector('[data-food-same-home]').disabled=!day.start_at;
    document.querySelector('#food-base-note').textContent=[day.start_at,day.night_at].some(isPersonalPoint)
      ? 'Жильё сохранится в вашем дне. Координаты войдут в файл или ссылку, если вы поделитесь поездкой. Путь от двери до ближайшей дороги пока не проверен.'
      : 'Начало и возвращение сохранятся в вашем дне. На прогулку заложим и дорогу между ними.';
  }
  syncBases();
  function invalidate(message='Начало или возвращение изменились. Нажмите «Найти мою прогулку», чтобы пересчитать весь путь.') {
    revision++;form.setAttribute('aria-busy','false');form.querySelector('[type=submit]').disabled=false;
    results.replaceChildren();status.textContent=message;
  }
  window.addEventListener('godune:trip-change',()=>{
    const next=basesKey();if(next===basis)return;basis=next;syncBases();if(!ownSaving)invalidate();
  });
  window.addEventListener('godune:memory-clearing',()=>{basis='';invalidate();});
  async function setBases(changes) {
    await workshop.setState(current=>changeDayDetails(current,changes),'Начало и возвращение сохранены в вашем дне.');
  }
  for(const [name,field] of [['origin','start_at'],['destination','night_at']])form.elements[name].addEventListener('change',async()=>{
    const value=form.elements[name].value;if(value==='personal')return;
    await setBases({[field]:value || null});
  });
  form.querySelector('[data-food-same-home]').addEventListener('click',()=>setBases({night_at:selectedDay(workshop.getState()).start_at}));
  form.querySelectorAll('[data-food-personal]').forEach(button=>{
    button.disabled=false;button.addEventListener('click',async()=>{
      button.disabled=true;const field=button.dataset.foodPersonal,dayId=selectedDay(workshop.getState()).id;
      try {
        const {pickPersonalPoint}=await import('./personal-point-picker.mjs?v=6');
        const chosen=await pickPersonalPoint({base,initial:selectedDay(workshop.getState())[field],focusPlace:catalog.poi.find(p=>p.slug===food.venues[0].slug),caption:field==='start_at'?'Где начнём прогулку?':'Куда вернёмся после прогулки?'});
        if(chosen && selectedDay(workshop.getState()).id===dayId)await setBases({[field]:chosen});
        else if(chosen)status.textContent='Вы выбрали другой день. Отметьте жильё для него ещё раз.';
      } catch {status.textContent='Карта выбора не загрузилась. Можно выбрать место из списка.';}
      finally{button.disabled=false;}
    });
  });
  function render(tours,settings,request) {
    results.replaceChildren(...tours.slice(0,3).map((tour,index)=>{
      const card=make('article',undefined,'food-tour');
      card.append(make('p',`Прогулка ${String(index+1).padStart(2,'0')}`,'inner-kicker'),make('h3',themes[settings.theme]),
        make('p',`${tour.total_minutes} минут с остановками · ${tour.walking_minutes} минут пешком · ${(tour.distance_m/1000).toFixed(1).replace('.',',')} км по дорогам`,'food-tour-facts'));
      if(tour.schedule) {
        const date=settings.date?new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(settings.date+'T12:00:00Z')):'Дату выберете позже';
        card.append(make('p',`${date} · ${settings.time}–${clock(tour.schedule.finish)}`,'food-tour-date'),
          make('p',`${tour.schedule.reserve_minutes} минут запаса на дорогу${tour.schedule.wait_minutes?` · ${tour.schedule.wait_minutes} минут до открытия`:''}`,'food-tour-facts'));
      }
      const list=make('ol');
      function anchor(field,id,label) {
        const value=settings.anchors?.[field];if(!value)return;
        const stop=tour.schedule?.stops.find(s=>s.id===id),li=make('li',`${label} · ${baseName(value,catalog)}`,'food-anchor');
        if(stop)li.prepend(make('span',clock(id==='__day_origin'?stop.leaves:stop.begins),'food-stop-time'));
        if(isPersonalPoint(value))li.append(make('span','От двери до дороги — пока не проверено','food-hours-unknown'));
        list.append(li);
      }
      function road(leg) {return `${leg.minutes} минут пешком${tour.schedule?' + 10 минут запаса':''}`;}
      anchor('start_at','__day_origin','Начало');
      if(request.origin)list.lastChild.append(make('small',`↓ ${road(request.origin.legs.find(l=>l.venue===tour.places[0]))}`,'food-tour-leg'));
      tour.places.forEach((id,i)=>{
        const v=food.venues.find(v=>v.slug===id),li=make('li'),a=make('a',v.name);li.value=i+1;a.href=new URL(`poi/${id}/`,base);
        li.append(a,make('span',`${v.visit} минут за столом`));list.append(li);
        if(tour.schedule) {
          const stop=tour.schedule.stops.find(s=>s.id===id);li.prepend(make('span',`${clock(stop.begins)}–${clock(stop.visit_ends)}`,'food-stop-time'));
          if(stop.wait)li.append(make('span',`До открытия — ${stop.wait} минут`,'food-stop-wait'));
          if(stop.issues.some(issue=>issue.code==='unknown_opening'))li.append(make('span','Часы ещё не подтверждены','food-hours-unknown'));
          else {
            const calendar=resolveVisitCalendar({hours:v.visit_hours},settings.date),source=make('a','По расписанию ресторана ↗','food-hours-source');
            source.href=calendar.source.url;source.target='_blank';source.rel='noopener';li.append(source);
            if(calendar.needsCheck)li.append(make('span','Часы на выбранный день уточните перед выходом','food-hours-unknown'));
          }
          if(stop.issues.some(issue=>issue.code==='unknown_kitchen'))li.append(make('span','До какого часа принимают заказ — уточните у кафе','food-hours-unknown'));
          else if(v.visit_kitchen) {
            const kitchen=resolveKitchenCalendar({gastronomy:v,visit_conditions:[v.visit_kitchen]},settings.date).calendar;
            const source=make('a',`Приём заказов: ${kitchen.windows.map(w=>`${clock(w.open)}–${clock(w.last_entry??w.close)}`).join('; ')} ↗`,'food-hours-source');
            source.href=kitchen.source.url;source.target='_blank';source.rel='noopener';li.append(source);
            if(kitchen.needsCheck)li.append(make('span','Последний заказ на дату прогулки стоит сверить','food-hours-unknown'));
          }
        }
        const leg=i<tour.places.length-1?food.legs.find(l=>l.from===id&&l.to===tour.places[i+1]):request.destination?.legs.find(l=>l.venue===id);
        if(leg)li.append(make('small',`↓ ${road(leg)}`,'food-tour-leg'));
      });
      anchor('night_at','__day_night','Возвращение');
      if(tour.schedule?.rail)card.append(make('p',`Электричка обратно в ${clock(tour.schedule.rail.inbound_departure)} · у станции с запасом к ${clock(tour.schedule.rail.earliest_ready)}`,'food-tour-facts'));
      function saveButton(text,exact) {
        const save=make('button',text,`button ${exact?'food-day-save':'food-append'}`);save.type='button';save.dataset[exact?'gastroDaySave':'gastroSave']=String(index);
        save.addEventListener('click',async()=>{save.disabled=true;ownSaving=true;
          try {
            const existing=workshop.getState(),hasTrip=existing.places.length||existing.routes.length;
            const message=exact?'Гастродень сохранён целиком. Откройте «Мой маршрут», чтобы взять его с собой.':hasTrip?'Остановки добавлены в конец маршрута. Его дата, время и прежние настройки сохранены.':'Прогулка сохранена. Начало, возвращение и время — в вашем маршруте.';
            await workshop.setState(current=>exact?saveTourDay(current,tour,food,settings):appendTour(current,tour,food,settings),message);
            save.textContent=workshop.isSaved()?'Сохранено ✓':'Добавлено в этой вкладке';status.textContent=message;
          } catch {status.textContent='Сохранить день не получилось. Попробуйте ещё раз.';}
          finally{save.disabled=false;ownSaving=false;}
        });return save;
      }
      // A captured preview stays in this tab. Personal coordinates never enter
      // the map URL or persistent trip until the visitor saves the day.
      let map;
      if(settings.anchors?.start_at || settings.anchors?.night_at) {
        map=make('button','Посмотреть весь путь на карте ↗','food-preview-action');map.type='button';map.dataset.foodPreview=String(index);
        map.addEventListener('click',()=>window.dispatchEvent(new CustomEvent('godune:food-preview',{detail:foodTrip(food,settings,tour.places)})));
      } else {
        map=make('a','Путь на нашей карте ↗','text-action');const mapUrl=new URL('./',base);mapUrl.searchParams.set('foodtour',tour.places.join(','));map.href=mapUrl;
      }
      card.append(list,saveButton('Сохранить гастродень',true),saveButton('Добавить остановки в мой день +',false),map);return card;
    }));
  }
  async function submit() {
    const captured=++revision,settings=Object.fromEntries(new FormData(form)),day=selectedDay(workshop.getState());
    settings.anchors=structuredClone({start_at:day.start_at,night_at:day.night_at});
    settings.rail=day.date===settings.date?structuredClone(day.schedule?.rail || null):null;
    const anchored=!!(day.start_at||day.night_at),submit=form.querySelector('[type=submit]');
    form.setAttribute('aria-busy','true');submit.disabled=true;results.replaceChildren();
    status.textContent=anchored?'Считаем дорогу от начала прогулки до столиков и обратно…':'Подбираем остановки…';
    try {
      gastroDay(settings,anchored);
      const matrix=anchored?await loadTripTravelMatrix(base,foodTrip(food,settings),catalog).catch(()=>null):null;
      if(captured!==revision)return;
      const request=planRequest(food,settings,{catalog,matrix}),tours=calculate(instance.exports,request);
      render(tours,settings,request);
      const missing=['origin','destination'].some(k=>request[k]&&!request[k].legs.length);
      status.textContent=tours.length?`Нашлось прогулок: ${tours.length}. ${tourTiming(settings,anchored)}`:missing
        ? 'Дорога к выбранному началу или обратно пока не подтверждена. Выберите другую точку либо попробуйте загрузить дороги снова.'
        : 'В выбранное время прогулка не складывается. Начните раньше, добавьте час или выберите две остановки.';
    } catch {if(captured===revision)status.textContent='Проверьте дату и время начала прогулки.';}
    finally{if(captured===revision){form.setAttribute('aria-busy','false');submit.disabled=false;}}
  }
  function tourTiming(settings,anchored) {const rail=resolveRail(foodTrip(food,settings),catalog);if(rail?.input)return 'Время электричек, путь от станции и запас на возвращение учтены. Расписание и столики уточните перед выходом.';return settings.date?'Время показано по Калининграду. Часы кухни и столик уточните перед выходом.':anchored?'Время показано по Калининграду. Выберите дату, чтобы сверить часы ресторанов.':'Выберите дату, чтобы увидеть время каждой остановки.';}
  form.addEventListener('submit',event=>{event.preventDefault();submit();});
  form.addEventListener('change',event=>{
    if(!['origin','destination'].includes(event.target.name))invalidate('Выбор изменился. Нажмите «Найти мою прогулку», чтобы пересчитать день.');
  });
  document.querySelectorAll('[data-food-filter]').forEach(button=>button.addEventListener('click',()=>{
    const theme=button.dataset.foodFilter;let count=0;
    document.querySelectorAll('[data-food-themes]').forEach(card=>{card.hidden=theme!=='all'&&!card.dataset.foodThemes.split(' ').includes(theme);if(!card.hidden)count++;});
    document.querySelectorAll('[data-food-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    document.querySelector('#food-filter-status').textContent=`Мест в подборке: ${count}`;
  }));
  await submit();document.documentElement.dataset.gastroReady='true';
}
