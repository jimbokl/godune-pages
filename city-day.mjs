import {cityDayConfig,cityRainPlan,cityRailTotal} from './city-day-config.mjs?v=2026101606';
import {withCityDayPlan,cityDayWeather} from './city-day-state.mjs?v=2026101604';
import {selectMenuChoice} from './trip-menu-choices-state.mjs?v=2026101305';
import {initGastroMenus} from './gastro-menu-picker.mjs?v=2026101406';
import {routeDayTarget,saveRouteDay} from './route-day.mjs?v=2026101602';
import {selectedDay} from './trip-days-state.mjs?v=2026101305';
import {loadSunClock} from './sun-clock.mjs?v=2026101305';
import {cityTimeline} from './city-day-timeline.mjs?v=2026101605';
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
  const result=await workshop.setState(trip=>withCityDayPlan(saveRouteDay(trip,route,catalog,{date:form.elements.date.value||localDate(),time:form.elements.time.value||config.start}),catalog,selection),'День сохранён вместе с выбором блюд.');
  if(result.conflict)throw Error('route_day_conflict');const url=new URL(location.href);url.searchParams.set('trip-day',selectedDay(workshop.getState()).id);history.replaceState(history.state,'',url);window.dispatchEvent(new Event('godune:trip-change'));
 };
 initGastroMenus({workshop,catalog,base,saveDay,getId,setBusy});
 async function sync(){
  root.querySelector('[data-city-rain]').dataset.active=String(root.querySelector('[data-city-weather]').value==='rain');
  const choiceDay=routeDayTarget(workshop.getState(),route,getId())?.day,choices=choiceDay?.menu_choices||[],total=choices.reduce((n,c)=>n+(c.price?.amount_kopecks||0)*c.quantity,0),unpriced=choices.some(c=>c.price?.amount_kopecks==null),money=n=>new Intl.NumberFormat('ru-RU').format(n);
  const rain=root.querySelector('[data-city-rain-note]');if(rain)rain.textContent=cityRainPlan(config,catalog,form.elements.date.value||localDate()).note;
  const ticket=++revision,date=form.elements.date.value||localDate(),start=(form.elements.time.value||'09:00').split(':').map(Number);
  const wet=root.querySelector('[data-city-weather]').value==='rain',rainPlan=cityRainPlan(config,catalog,date),visits={};
  if(config.museum&&wet){visits['ozero-tihoe']=45;visits['promenad-svetlogorsk']=20;visits[config.museum]=rainPlan.open?90:10;}
  const timeline=cityTimeline(route,{start:start[0]*60+start[1],venue:config.venue,opens:config.museum?900:720,visits});
  for(const row of timeline.rows){const time=root.querySelector(`[data-city-stop="${row.id}"]`);time.textContent=row.minute<1440?clock(row.minute):'След. день';time.dataset.cityOffset=row.minute-(start[0]*60+start[1]);root.querySelector(`[data-city-dwell="${row.id}"]`).textContent=`${row.visit} мин здесь`;const wait=root.querySelector(`[data-city-wait="${row.id}"]`);wait.hidden=!row.wait;wait.textContent=`Пауза до открытия зала: ${row.wait} мин`;}
  root.querySelector('[data-city-return]').textContent=timeline.returnAt<1440?clock(timeline.returnAt):'След. день';
  const service=catalog.rail_services?.find(s=>s.id===config.service);
  if(service){const table=serviceDay(service,date),saved=routeDayTarget(workshop.getState(),route,getId())?.day?.schedule?.rail;
   for(const [direction,selector,fallback] of [['outward','[data-city-rail-outward]',config.outward],['inbound','[data-city-rail-inbound]',config.inbound]]){const select=root.querySelector(selector),previous=select.value,rows=table[direction];select.replaceChildren();select.disabled=!!table.reason||!rows?.length;if(select.disabled){select.add(new Option('Расписание у КППК',''));continue;}for(const r of rows)select.add(new Option(`${r.departure} → ${r.arrival}`,r.id));select.value=rows.some(r=>r.id===previous)?previous:rows.some(r=>r.id===saved?.[direction]?.id)?saved[direction].id:(rows.find(r=>r.departure===fallback)||rows[0]).id;}
   const p=root.querySelector('[data-city-rail-return]'),note=root.querySelector('[data-city-rail-date]');
   const outwardCopy=root.querySelector('[data-city-rail-out]');if(table.reason||!table.inbound?.length){outwardCopy.textContent='На выбранную дату найдите отправление с Южного вокзала в расписании КППК. Начало прогулки задайте после прибытия.';p.textContent='Для этой даты выберите обратный рейс по расписанию КППК.';note.textContent=`Дата поездки: ${date} · расписание у перевозчика по ссылке ниже`;}else{const morning=table.outward.find(r=>r.departure===config.outward)||table.outward[0],fast=table.outward.find(r=>r.departure==='11:12');outwardCopy.textContent=`${morning.departure} → ${morning.arrival} с Южного вокзала`;const last=table.inbound.at(-1);p.textContent=`${last.departure} → ${last.arrival} на Южный вокзал`;note.textContent=`Для ${date} · расписание КППК с ${service.valid_from} · время Калининграда`;}
  }
  const outward=service?.outward?.find(r=>r.id===root.querySelector('[data-city-rail-outward]').value),inbound=service?.inbound?.find(r=>r.id===root.querySelector('[data-city-rail-inbound]').value);
  const preset=Number(root.dataset.cityPresetKopecks)||0;
  const railTotal=cityRailTotal(service,outward,inbound,date),amount=railTotal===null?null:(railTotal+total)/100;
  root.querySelector('[data-city-total]').textContent=amount===null?`${money(total/100)} ₽ + дорога`:choices.length?`${money(amount)} ₽ + прочие покупки`:`${money((railTotal+preset)/100)} ₽ · базовый день`;
  root.querySelector('[data-city-budget]').textContent=choices.length?`Выбрано блюд: ${choices.length} · ${money(total/100)} ₽${unpriced?' за позиции с указанной ценой':''}. ${railTotal===null?'Билеты на выбранные поезда считаются отдельно.':`Поезда туда и обратно: ${money(railTotal/100)} ₽.`}`:railTotal===null?'Выберите блюда — их стоимость появится здесь.':'Поезда туда и обратно: '+money(railTotal/100)+' ₽. Обед из двух блюд: '+money(preset/100)+' ₽. Кофе, напитки и другие покупки — отдельно.';
  try{const calculate=await loadSunClock(base),sun=calculate(date,config.lat,config.lon);if(ticket!==revision)return;root.querySelector('[data-city-sunset]').textContent=sun.sunset===null?'Солнце не заходит':clock(sun.sunset);root.querySelector('[data-city-sunset-date]').textContent=` · ${date}`;}
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
 root.querySelector('[data-city-meal-preset]')?.addEventListener('click',async event=>{if(!setBusy(true))return;const button=event.currentTarget;button.disabled=true;try{const response=await fetch(new URL('data/gastro-menu-choices.json',base));if(!response.ok)throw Error('menu');const data=await response.json(),rows=data.venues[config.venue],names=config.preset,chosen=names.map(name=>rows.find(r=>r.name===name));if(chosen.some(r=>!r))throw Error('preset_missing');await saveDay();await workshop.setState(trip=>{let next=trip;for(const row of chosen)next=selectMenuChoice(next,{...structuredClone(row),planned_date:selectedDay(next).date,selected_at:new Date().toISOString()},catalog);return next;},'Обед сохранён в день и PDF.');sync();}catch{root.querySelector('[data-city-budget]').textContent='Обед не сохранился. Выберите блюда из меню ниже.';}finally{button.disabled=false;setBusy(false);}});
}
