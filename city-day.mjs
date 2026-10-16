import {loadCityBudget,cityReferenceBudget,withCityReferenceBudget,cityReferenceMatches} from './city-day-budget.mjs?v=2026101703';
import {referenceBudgetText,checkedReferenceBudget} from './day-reference-budget.mjs?v=2026101702';
import {renderReferenceBudget} from './day-reference-budget-ui.mjs?v=2026101702';
import {dayPeople} from './trip-party.mjs?v=2026101305';
import {cityDayConfig,cityRainPlan} from './city-day-config.mjs?v=2026101703';
import {withCityDayPlan,cityDayWeather} from './city-day-state.mjs?v=2026101703';
import {selectMenuChoice} from './trip-menu-choices-state.mjs?v=2026101305';
import {initGastroMenus} from './gastro-menu-picker.mjs?v=2026101406';
import {routeDayTarget,saveRouteDay} from './route-day.mjs?v=2026101602';
import {selectedDay} from './trip-days-state.mjs?v=2026101305';
import {loadSunClock} from './sun-clock.mjs?v=2026101305';
import {cityTimeline,cityDayPreview} from './city-day-timeline.mjs?v=2026101703';
import {loadTripTravelMatrix} from './travel-estimates.mjs?v=2026101305';
import {selectedDay as previewDay} from './trip-days-state.mjs?v=2026101305';
import {serviceDay} from './service-calendar.mjs?v=2026101305';
const clock=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(Math.floor(n%60)).padStart(2,'0')}`;
const localDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kaliningrad',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function initCityDay({workshop,catalog,base}){
 const root=document.querySelector('[data-city-day]'),form=root?.querySelector('[data-route-day-settings]'),route=catalog.routes.find(r=>r.slug===document.body.dataset.route);if(!root||!form||!route)return;
 const config=cityDayConfig(route.slug);
 let busy=false,revision=0;
 const getId=()=>new URL(location.href).searchParams.get('trip-day');
 const setBusy=v=>{if(v&&busy)return false;busy=v;return true;};
 const saveDay=async()=>{const id=getId(),target=routeDayTarget(workshop.getState(),route,id);if(target?.state==='ready')return;
  const selection={outward:root.querySelector('[data-city-rail-outward]').value,inbound:root.querySelector('[data-city-rail-inbound]').value,weather:root.querySelector('[data-city-weather]').value};
  const resources=await loadCityBudget(base);
  const result=await workshop.setState(trip=>withCityReferenceBudget(withCityDayPlan(saveRouteDay(trip,route,catalog,{date:form.elements.date.value||localDate(),time:form.elements.time.value||config.start}),catalog,selection),catalog,resources),'День сохранён вместе с выбором блюд.');
  if(result.conflict)throw Error('route_day_conflict');const url=new URL(location.href);url.searchParams.set('trip-day',selectedDay(workshop.getState()).id);history.replaceState(history.state,'',url);window.dispatchEvent(new Event('godune:trip-change'));
 };
 const budgetWorkshop={getState:()=>workshop.getState(),setState:async(change,message)=>{const resources=await loadCityBudget(base);return workshop.setState(current=>withCityReferenceBudget(change(current),catalog,resources),message);}};
 initGastroMenus({workshop:budgetWorkshop,catalog,base,saveDay,getId,setBusy});
 async function sync(){
  root.querySelector('[data-city-rain]').dataset.active=String(root.querySelector('[data-city-weather]').value==='rain');
  const choiceDay=routeDayTarget(workshop.getState(),route,getId())?.day,choices=choiceDay?.menu_choices||[];
  const rain=root.querySelector('[data-city-rain-note]');if(rain)rain.textContent=cityRainPlan(config,catalog,form.elements.date.value||localDate()).note;
  const ticket=++revision,date=form.elements.date.value||localDate(),start=(form.elements.time.value||'09:00').split(':').map(Number);
  const wet=root.querySelector('[data-city-weather]').value==='rain';
  root.querySelector('.city-timeline').dataset.ready='false';
  const service=catalog.rail_services?.find(s=>s.id===config.service);
  if(service){const table=serviceDay(service,date),saved=routeDayTarget(workshop.getState(),route,getId())?.day?.schedule?.rail;
   for(const [direction,selector,fallback] of [['outward','[data-city-rail-outward]',config.outward],['inbound','[data-city-rail-inbound]',config.inbound]]){
    const select=root.querySelector(selector),previous=select.value,rows=table[direction]||[];
    const outward=table.outward?.find(r=>r.id===root.querySelector('[data-city-rail-outward]').value);
    const available=rows.filter(r=>direction!=='inbound'||!outward||r.departure>outward.arrival);
    select.replaceChildren();select.disabled=!!table.reason||!available.length;
    if(select.disabled){select.add(new Option(table.reason?'Расписание у КППК':'Нет обратного рейса после прибытия',''));continue;}
    for(const r of rows){const option=new Option(`${r.departure} → ${r.arrival}`,r.id);option.disabled=!available.includes(r);select.add(option);}
    select.value=(available.find(r=>r.id===previous)||available.find(r=>r.id===saved?.[direction]?.id)||available.find(r=>r.departure===fallback)||available[0]).id;
   }
   const p=root.querySelector('[data-city-rail-return]'),note=root.querySelector('[data-city-rail-date]');
   const outwardCopy=root.querySelector('[data-city-rail-out]');if(table.reason||!table.inbound?.length){outwardCopy.textContent='На выбранную дату найдите отправление с Южного вокзала в расписании КППК. Начало прогулки задайте после прибытия.';p.textContent='Для этой даты выберите обратный рейс по расписанию КППК.';note.textContent=`Дата поездки: ${date} · расписание у перевозчика по ссылке ниже`;}else{const morning=table.outward.find(r=>r.departure===config.outward)||table.outward[0],fast=table.outward.find(r=>r.departure==='11:12');outwardCopy.textContent=`${morning.departure} → ${morning.arrival} с Южного вокзала`;const last=table.inbound.at(-1);p.textContent=`${last.departure} → ${last.arrival} на Южный вокзал`;note.textContent=`Для ${date} · расписание КППК с ${service.valid_from} · время Калининграда`;}
  }
  try{
   const {calculate,menus}=await loadCityBudget(base);if(ticket!==revision)return;
   const selection={weather:wet?'rain':'sun',outward:root.querySelector('[data-city-rail-outward]').value,inbound:root.querySelector('[data-city-rail-inbound]').value};
   const draft=cityDayPreview(workshop.getState(),route,catalog,{id:getId(),date,time:form.elements.time.value||config.start},selection),day=previewDay(draft);
   const matrix=await loadTripTravelMatrix(base,draft,catalog).catch(()=>null);if(ticket!==revision)return;
   const timeline=cityTimeline(calculate,draft,catalog,matrix),list=root.querySelector('.city-timeline');
   for(const row of timeline.rows){
    const time=root.querySelector(`[data-city-stop="${row.id}"]`);if(!time)continue;
    list.append(time.closest('.city-timeline-stop'));
    time.textContent=row.minute===null?'Уточняется':row.minute<1440?clock(row.minute):'След. день';
    time.dataset.begins=row.minute??'';time.dataset.leaves=row.leaves??'';
    time.dataset.cityOffset=row.minute===null?'':row.minute-(start[0]*60+start[1]);
    root.querySelector(`[data-city-dwell="${row.id}"]`).textContent=`${row.visit} мин здесь${row.pause?` · ${row.pause} мин пауза`:''}`;
    const wait=root.querySelector(`[data-city-wait="${row.id}"]`);wait.hidden=!row.wait;wait.textContent=`Ожидание: ${row.wait} мин`;
    const leg=root.querySelector(`[data-city-leg="${row.id}"]`),next=catalog.poi.find(p=>p.slug===row.to);
    leg.textContent=`↓ ${row.walk===null?'Время перехода уточняется':`${row.walk} мин пешком`}${row.meters===null?'':` · ${Math.round(row.meters)} м`}${row.to?` · ${next?.name||row.to}`:''} · ${row.reserve} мин запаса`;
   }
   if(config.museum==='murarium'){
    const stop=day.schedule.stops.murarium,note=root.querySelector('[data-city-stop="murarium"]').closest('.city-timeline-stop').querySelector('.city-stop-note');
    const inside=stop&&day.places.includes('murarium')&&stop.visit_scope!=='outside';
    note.textContent=inside?`В плане — ${stop.visit} минут внутри музея кошек. Перед выездом проверьте часы и последний вход; дорога к музею остаётся на улице.`:'Башню осматриваем снаружи. Посещение музея в этот день не включено.';
    if(wet&&choiceDay&&stop&&day.places.includes('murarium')&&stop.visit_scope==='outside'&&cityRainPlan(config,catalog,date).open){
     rain.textContent=`В сохранённом дне Мурариум — снаружи, ${stop.visit} минут; променад — ${day.schedule.stops['promenad-zelenogradsk']?.visit??'не задано'} минут. ${cityRainPlan(config,catalog,date).note} Нажмите «Сохранить план на дождь», чтобы применить этот вариант.`;
     for(const button of root.querySelectorAll('[data-route-day-save]'))button.textContent='Сохранить план на дождь →';
    }
   }
   root.querySelector('[data-city-return]').textContent=timeline.returnAt===null?'Уточняется':timeline.returnAt<1440?clock(timeline.returnAt):'След. день';
   list.dataset.ready='true';
   const quote=choiceDay?.reference_budget&&cityReferenceMatches(choiceDay.reference_budget,day,draft.itinerary?.people||1)?checkedReferenceBudget(calculate,choiceDay.reference_budget):cityReferenceBudget(calculate,{catalog,menus,route:route.slug,date,people:dayPeople(day,draft.itinerary?.people||1),party:day.party||null,...selection,choices:day.menu_choices||[]});
   root.querySelector('[data-city-total]').textContent=referenceBudgetText(quote.variants.base);
   root.querySelector('[data-city-budget]').textContent=choices.length?'Учтены выбранные порции на группу. Состав и источники — в бюджете ниже.':'Поезда и обед из двух блюд. Состав, варианты и источники — в бюджете ниже.';
   renderReferenceBudget(root.querySelector('[data-day-budget]'),quote);
  }catch{root.querySelector('[data-city-budget]').textContent='Не удалось обновить ориентир. Ниже сохранён состав на дату сборки страницы.';}
  try{const calculate=await loadSunClock(base),sun=calculate(date,config.lat,config.lon);if(ticket!==revision)return;root.querySelector('[data-city-sunset]').textContent=sun.sunset===null?'Солнце не заходит':clock(sun.sunset);const label=root.querySelector('[data-city-sunset-date]');label.textContent=date;label.dateTime=date;}
  catch{/* Keep the sourced static solar calculation when the runtime is unavailable. */}
 }
 const initial=routeDayTarget(workshop.getState(),route,getId());if(initial?.state==='ready'){form.elements.date.value=initial.day.date||localDate();const n=initial.day.schedule?.start??540;form.elements.time.value=clock(n);root.querySelector('[data-city-weather]').value=cityDayWeather(initial.day);}else if(!form.elements.date.value)form.elements.date.value=localDate();
 document.addEventListener('input',event=>{if(event.target.form===form)sync();});window.addEventListener('godune:trip-change',()=>queueMicrotask(sync));sync();
 const food=new Set(config.food),sea=new Set(config.sea);
 root.querySelectorAll('[data-city-layer]').forEach(button=>button.addEventListener('click',()=>{
  const layer=button.dataset.cityLayer;root.querySelectorAll('[data-city-layer]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  const show=id=>layer==='all'||layer==='food'&&food.has(id)||layer==='sea'&&sea.has(id)||layer==='city'&&!food.has(id)&&!sea.has(id);
  root.querySelectorAll('.route-pin').forEach((pin,i)=>{pin.dataset.dimmed=String(!show(route.stops[i].poi));});
  root.querySelectorAll('.route-legend li').forEach((li,i)=>{li.hidden=!show(route.stops[i].poi);});
 }));
 root.querySelectorAll('[data-city-taste]').forEach(button=>button.addEventListener('click',async()=>{
  const block=root.querySelector('[data-gastro-menu]');let menu=block.querySelector('select');
  if(!menu){block.querySelector('[data-gastro-load-menu]')?.click();for(let i=0;i<60&&!menu;i++){await new Promise(r=>setTimeout(r,100));menu=block.querySelector('select');}}
  if(!menu)return;
  const response=await fetch(new URL('data/gastro-menu-choices.json',base));if(!response.ok)return;const data=await response.json(),pattern=new RegExp(button.dataset.cityTaste,'i'),rows=data.venues[config.venue],matches=rows.filter(r=>pattern.test(r.name));
  const status=root.querySelector('[data-city-taste-status]');root.querySelectorAll('[data-city-taste]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  if(!matches.length){status.textContent='Такого блюда в загруженном меню нет. Выберите другой раздел.';return;}
  const option=[...menu.options].find(o=>o.value===matches[0].category);if(option){menu.value=option.value;menu.dispatchEvent(new Event('change'));}
  status.textContent=`В ${config.venueLabel}: ${matches.slice(0,3).map(r=>r.name).join(', ')}. Добавьте блюдо из меню в свой день.`;block.scrollIntoView({block:'center',behavior:'smooth'});
 }));
 root.querySelector('[data-city-meal-preset]')?.addEventListener('click',async event=>{if(!setBusy(true))return;const button=event.currentTarget;button.disabled=true;try{const response=await fetch(new URL('data/gastro-menu-choices.json',base));if(!response.ok)throw Error('menu');const data=await response.json(),rows=data.venues[config.venue],names=config.preset,chosen=names.map(name=>rows.find(r=>r.name===name));if(chosen.some(r=>!r))throw Error('preset_missing');await saveDay();await budgetWorkshop.setState(trip=>{let next=trip;for(const row of chosen)next=selectMenuChoice(next,{...structuredClone(row),planned_date:selectedDay(next).date,selected_at:new Date().toISOString()},catalog);return next;},'Обед сохранён в день и PDF.');sync();}catch{root.querySelector('[data-city-budget]').textContent='Обед не сохранился. Выберите блюда из меню ниже.';}finally{button.disabled=false;setBusy(false);}});
}
