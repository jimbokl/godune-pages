import {withCityDayPlan,cityDayWeather} from './city-day-state.mjs?v=2026101602';
import {selectMenuChoice} from './trip-menu-choices-state.mjs?v=2026101305';
import {initGastroMenus} from './gastro-menu-picker.mjs?v=2026101406';
import {routeDayTarget,saveRouteDay} from './route-day.mjs?v=2026101601';
import {selectedDay} from './trip-days-state.mjs?v=2026101305';
import {loadSunClock} from './sun-clock.mjs?v=2026101305';
import {serviceDay} from './service-calendar.mjs?v=2026101305';
const clock=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(Math.floor(n%60)).padStart(2,'0')}`;
const localDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kaliningrad',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function initCityDay({workshop,catalog,base}){
 const root=document.querySelector('[data-city-day]'),form=root?.querySelector('[data-route-day-settings]'),route=catalog.routes.find(r=>r.slug===document.body.dataset.route);if(!root||!form||!route)return;
 let busy=false,revision=0;
 const getId=()=>new URL(location.href).searchParams.get('trip-day');
 const setBusy=v=>{if(v&&busy)return false;busy=v;return true;};
 const saveDay=async()=>{const id=getId(),target=routeDayTarget(workshop.getState(),route,id);if(target?.state==='ready')return;
  const selection={outward:root.querySelector('[data-city-rail-outward]').value,inbound:root.querySelector('[data-city-rail-inbound]').value,weather:root.querySelector('[data-city-weather]').value};
  const result=await workshop.setState(trip=>withCityDayPlan(saveRouteDay(trip,route,catalog,{date:form.elements.date.value||localDate(),time:form.elements.time.value||'09:00'}),catalog,selection),'День сохранён вместе с выбором блюд.');
  if(result.conflict)throw Error('route_day_conflict');const url=new URL(location.href);url.searchParams.set('trip-day',selectedDay(workshop.getState()).id);history.replaceState(history.state,'',url);window.dispatchEvent(new Event('godune:trip-change'));
 };
 initGastroMenus({workshop,catalog,base,saveDay,getId,setBusy});
 async function sync(){
  root.querySelector('[data-city-rain]').hidden=root.querySelector('[data-city-weather]').value!=='rain';
  const choiceDay=routeDayTarget(workshop.getState(),route,getId())?.day,choices=choiceDay?.menu_choices||[],total=choices.reduce((n,c)=>n+(c.price?.amount_kopecks||0),0);const unpriced=choices.some(c=>!Number.isFinite(c.price?.amount_kopecks));root.querySelector('[data-city-budget]').textContent=unpriced?`Выбрано блюд: ${choices.length}. Сумма позиций с ценой — ${new Intl.NumberFormat('ru-RU').format(total/100)} ₽; итог зависит от остальных блюд.`:choices.length?`Выбрано блюд: ${choices.length} · ${new Intl.NumberFormat('ru-RU').format(total/100)} ₽. Со скорым поездом туда и обратно: ${new Intl.NumberFormat('ru-RU').format(total/100+222)} ₽, без прочих покупок.`:'Скорый поезд туда и обратно — 222 ₽. Еда считается по выбранным блюдам.';
  const ticket=++revision,date=form.elements.date.value||localDate(),start=(form.elements.time.value||'09:00').split(':').map(Number);
  root.querySelectorAll('[data-city-offset]').forEach(t=>{const minute=start[0]*60+start[1]+Number(t.dataset.cityOffset);t.textContent=minute<1440?clock(minute):'На следующий день';});
  const service=catalog.rail_services?.find(s=>s.id==='kaliningrad-south-zelenogradsk');
  if(service){const table=serviceDay(service,date),saved=routeDayTarget(workshop.getState(),route,getId())?.day?.schedule?.rail;
   for(const [direction,selector,fallback] of [['outward','[data-city-rail-outward]','08:00'],['inbound','[data-city-rail-inbound]','20:03']]){const select=root.querySelector(selector),previous=select.value,rows=table[direction];select.replaceChildren();select.disabled=!!table.reason||!rows?.length;if(select.disabled){select.add(new Option('Расписание у КППК',''));continue;}for(const r of rows)select.add(new Option(`${r.departure} → ${r.arrival}`,r.id));select.value=rows.some(r=>r.id===previous)?previous:rows.some(r=>r.id===saved?.[direction]?.id)?saved[direction].id:(rows.find(r=>r.departure===fallback)||rows[0]).id;}
   const p=root.querySelector('[data-city-rail-return]'),note=root.querySelector('[data-city-rail-date]');
   const outwardCopy=root.querySelector('[data-city-rail-out]');if(table.reason||!table.inbound?.length){outwardCopy.textContent='На выбранную дату найдите отправление с Южного вокзала в расписании КППК. Начало прогулки задайте после прибытия.';p.textContent='Для этой даты выберите обратный рейс по расписанию КППК.';note.textContent=`Дата поездки: ${date} · расписание у перевозчика по ссылке ниже`;}else{const morning=table.outward.find(r=>r.departure==='08:00')||table.outward[0],fast=table.outward.find(r=>r.departure==='11:12');outwardCopy.textContent=`Для утреннего старта: ${morning.departure} → ${morning.arrival} с Южного вокзала.${fast?` Днём есть скорый рейс ${fast.departure} → ${fast.arrival}.`:''}`;const last=table.inbound.at(-1);p.textContent=`Вечером: ${table.inbound.filter(r=>r.departure>='17:00').map(r=>r.departure).join(', ')}. Последний поезд — ${last.departure}, прибытие на Южный вокзал в ${last.arrival}.`;note.textContent=`Для ${date} · расписание КППК с ${service.valid_from} · время Калининграда`;}
  }
  try{const calculate=await loadSunClock(base),sun=calculate(date,54.9635752,20.4808171);if(ticket!==revision)return;root.querySelector('[data-city-sunset]').textContent=sun.sunset===null?'Солнце не заходит':clock(sun.sunset);}
  catch{if(ticket===revision)root.querySelector('[data-city-sunset]').textContent='Время не рассчиталось';}
 }
 const initial=routeDayTarget(workshop.getState(),route,getId());if(initial?.state==='ready'){form.elements.date.value=initial.day.date||localDate();const n=initial.day.schedule?.start??540;form.elements.time.value=clock(n);root.querySelector('[data-city-weather]').value=cityDayWeather(initial.day);}else if(!form.elements.date.value)form.elements.date.value=localDate();
 form.addEventListener('input',sync);window.addEventListener('godune:trip-change',()=>queueMicrotask(sync));sync();
 const food=new Set(['kofeynya-slou','restoran-telegraf']),sea=new Set(['byuvet-luizy','promenad-zelenogradsk']);
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
  const response=await fetch(new URL('data/gastro-menu-choices.json',base));if(!response.ok)return;const data=await response.json(),pattern=new RegExp(button.dataset.cityTaste,'i'),rows=data.venues['restoran-telegraf'],matches=rows.filter(r=>pattern.test(r.name));
  const status=root.querySelector('[data-city-taste-status]');root.querySelectorAll('[data-city-taste]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  if(!matches.length){status.textContent='Такого блюда в загруженном меню нет. Выберите другой раздел.';return;}
  const option=[...menu.options].find(o=>o.value===matches[0].category);if(option){menu.value=option.value;menu.dispatchEvent(new Event('change'));}
  status.textContent=`В «Телеграфе»: ${matches.slice(0,3).map(r=>r.name).join(', ')}. Добавьте блюдо из меню в свой день.`;block.scrollIntoView({block:'center',behavior:'smooth'});
 }));
 root.querySelector('[data-city-meal-preset]').addEventListener('click',async event=>{if(!setBusy(true))return;const button=event.currentTarget;button.disabled=true;try{const response=await fetch(new URL('data/gastro-menu-choices.json',base));if(!response.ok)throw Error('menu');const data=await response.json(),rows=data.venues['restoran-telegraf'],names=['Балтийская уха','Скумбрия на ржаном хлебе'],chosen=names.map(name=>rows.find(r=>r.name===name));if(chosen.some(r=>!r))throw Error('preset_missing');await saveDay();await workshop.setState(trip=>{let next=trip;for(const row of chosen)next=selectMenuChoice(next,{...structuredClone(row),planned_date:selectedDay(next).date,selected_at:new Date().toISOString()},catalog);return next;},'Обед сохранён в день и PDF.');sync();}catch{root.querySelector('[data-city-budget]').textContent='Обед не сохранился. Выберите блюда из меню ниже.';}finally{button.disabled=false;setBusy(false);}});
}
