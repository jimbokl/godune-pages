import {updateSchedule} from './trip-schedule-state.mjs';
import {resolveVisitCalendar,validVisitDate} from './visit-calendar.mjs?v=2';

export const clock = minute => `${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
export function gastroDay(settings) {
  if(!settings.date)return null;
  if(!validVisitDate(settings.date))throw Error('invalid_date');
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
export function planRequest(food,settings) {
  const day=gastroDay(settings);
  return {venues:food.venues.map(v=>{
    const calendar=day?resolveVisitCalendar({hours:v.visit_hours},settings.date):null;
    return {id:v.slug,roles:v.roles,themes:v.themes,visit:v.visit,available:v.available,
      ...(day?{opening:calendar.windows,opening_needs_check:calendar.needsCheck}:{})};
  }),legs:food.legs,theme:settings.theme,max_minutes:Number(settings.max_minutes),stops:Number(settings.stops),start:settings.start||null,
    ...(day?{day}:{})};
}
// Existing points keep their order. Food stops join the same durable trip draft.
export function appendTour(current,tour,food,settings={}) {
  let next={...current,places:[...new Set([...current.places,...tour.places])]};
  if(!current.places.length && !current.routes.length) {
    next=updateSchedule(next,'mode','foot');
    const day=gastroDay(settings);
    if(day) {
      next={...next,date:settings.date,month:Number(settings.date.slice(5,7))};
      for(const key of ['start','end','reserve'])next=updateSchedule(next,key,day[key]);
    }
  }
  for(const id of tour.places) {
    if(current.places.includes(id))continue;
    const v=food.venues.find(v=>v.slug===id);
    if(v)next=updateSchedule(next,'visit',v.visit,id);
  }
  return next;
}
export async function initGastronomy(base,workshop) {
  const form=document.querySelector('#gastro-form');if(!form)return;
  const status=document.querySelector('#gastro-status'),results=document.querySelector('#gastro-results');
  const response=await fetch(new URL('data/gastronomy.json',base));
  if(!response.ok)throw Error('food_catalog');
  const food=await response.json();
  const wasmResponse=await fetch(new URL('assets/gastro.wasm',base));
  if(!wasmResponse.ok)throw Error('food_engine');
  const {instance}=await WebAssembly.instantiate(await wasmResponse.arrayBuffer());
  const make=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
  const themes={all:'Вкусы города',fish:'Рыбная прогулка',baltic:'Балтика за столом',italian:'Итальянская остановка'};
  const state=workshop.getState();
  if(validVisitDate(state.date))form.elements.date.value=state.date;
  if(state.schedule)form.elements.time.value=clock(state.schedule.start);
  function render(tours,theme,settings={}) {
    results.replaceChildren(...tours.slice(0,3).map((tour,index)=>{
      const card=make('article',undefined,'food-tour');
      card.append(make('p',`Прогулка ${String(index+1).padStart(2,'0')}`,'inner-kicker'),make('h3',themes[theme]),
        make('p',`${tour.total_minutes} минут с остановками · ${tour.walking_minutes} минут пешком · ${(tour.distance_m/1000).toFixed(1).replace('.',',')} км`,'food-tour-facts'));
      if(tour.schedule) {
        const date=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(settings.date+'T12:00:00Z'));
        card.append(make('p',`${date} · ${settings.time}–${clock(tour.schedule.finish)}`,'food-tour-date'),
          make('p',`${tour.schedule.reserve_minutes} минут запаса на дорогу${tour.schedule.wait_minutes?` · ${tour.schedule.wait_minutes} минут до открытия`:''}`,'food-tour-facts'));
      }
      const list=make('ol');
      tour.places.forEach((id,i)=>{
        const v=food.venues.find(v=>v.slug===id),li=make('li'),a=make('a',v.name),small=make('span',`${v.visit} минут за столом`);
        a.href=new URL(`poi/${id}/`,base);li.append(a,small);list.append(li);
        if(tour.schedule) {
          const stop=tour.schedule.stops[i],time=make('span',`${clock(stop.begins)}–${clock(stop.visit_ends)}`,'food-stop-time');
          li.prepend(time);
          if(stop.wait)li.append(make('span',`До открытия — ${stop.wait} минут`,'food-stop-wait'));
          if(stop.issues.some(issue=>issue.code==='unknown_opening'))li.append(make('span','Часы ещё не подтверждены','food-hours-unknown'));
          else {
            const source=make('a','По расписанию ресторана ↗','food-hours-source');source.href=v.visit_hours.source.url;source.target='_blank';source.rel='noopener';li.append(source);
            if(stop.issues.some(issue=>issue.code==='opening_needs_check'))li.append(make('span','Часы на выбранный день уточните перед выходом','food-hours-unknown'));
          }
        }
        if(i<tour.places.length-1){const leg=food.legs.find(l=>l.from===id && l.to===tour.places[i+1]);li.append(make('small',`↓ ${leg.minutes} минут пешком${tour.schedule?' + 10 минут запаса':''}`,'food-tour-leg'));}
      });
      const save=make('button','Добавить в мой маршрут +','button button-dark');save.type='button';save.dataset.gastroSave=String(index);
      save.addEventListener('click',async()=>{save.disabled=true;
        try {
          const existing=workshop.getState(),hasTrip=existing.places.length||existing.routes.length;
          const message=hasTrip?'Остановки добавлены в конец маршрута. Его дата, время и прежние настройки сохранены.':tour.schedule?'Прогулка сохранена. Дата и время — в вашем маршруте.':'Остановки и время за столом добавлены в ваш маршрут.';
          await workshop.setState(current=>appendTour(current,tour,food,settings),message);
          save.textContent=workshop.isSaved()?'Остановки сохранены ✓':'Добавлено в этой вкладке';
          status.textContent=message;
        }
        finally{save.disabled=false;}
      });
      const map=make('a','Путь на нашей карте ↗','text-action');
      const mapUrl=new URL('./',base);mapUrl.searchParams.set('foodtour',tour.places.join(','));map.href=mapUrl;
      card.append(list,save,map);return card;
    }));
  }
  form.addEventListener('submit',event=>{
    event.preventDefault();
    try {
      const settings=Object.fromEntries(new FormData(form)),tours=calculate(instance.exports,planRequest(food,settings));
      render(tours,settings.theme,settings);
      status.textContent=tours.length?`Нашлось прогулок: ${tours.length}. ${settings.date?'Время показано по Калининграду. Часы кухни и столик уточните перед выходом.':'Выберите дату, чтобы увидеть время каждой остановки.'}`:'В выбранное время прогулка не складывается. Начните раньше, добавьте час или выберите две остановки.';
    } catch(error) {status.textContent='Проверьте дату и время начала прогулки.';}
  });
  document.querySelectorAll('[data-food-filter]').forEach(button=>button.addEventListener('click',()=>{
    const theme=button.dataset.foodFilter;let count=0;
    document.querySelectorAll('[data-food-themes]').forEach(card=>{card.hidden=theme!=='all'&&!card.dataset.foodThemes.split(' ').includes(theme);if(!card.hidden)count++;});
    document.querySelectorAll('[data-food-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    document.querySelector('#food-filter-status').textContent=`Мест в подборке: ${count}`;
  }));
  if(form.elements.date.value)render(calculate(instance.exports,planRequest(food,Object.fromEntries(new FormData(form)))),'all',Object.fromEntries(new FormData(form)));
  else render(food.tours,'all');
  form.querySelector('[type=submit]').disabled=false;
  status.textContent='Выберите вкус и время — прогулки появятся здесь.';
  document.documentElement.dataset.gastroReady='true';
}
