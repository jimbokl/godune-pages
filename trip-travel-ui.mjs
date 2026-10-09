import {journeyDays,selectedDay} from './trip-days-state.mjs?v=25';
import {travelContext,markVisited,selectTravelDay,travelSnapshot,travelCoverage} from './trip-travel-state.mjs?v=11';
import {baseName,baseId} from './personal-points.mjs?v=3';
import {BOOKING_KINDS,BOOKING_STATUSES,bookingProblem} from './trip-bookings-state.mjs?v=2';
import {loadScheduler} from './trip-scheduler.mjs?v=42';
import {planInput} from './trip-schedule-state.mjs?v=17';
import {loadTripTravelMatrix} from './travel-estimates.mjs?v=11';
import {offlinePaths} from './offline.mjs?v=6';
import {availableMaps} from './offline-map.mjs?v=10';
const clock=minute=>`${minute>=1440?`+${Math.floor(minute/1440)} дн. `:''}${String(Math.floor(minute/60)%24).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
const date=value=>value?new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',timeZone:'Europe/Kaliningrad'}).format(new Date(value+'T12:00:00Z')):'Дата пока не выбрана';
const node=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
const issues={unknown_travel:'Время дороги ещё нужно уточнить.',unknown_approach:'Подход к месту ещё нужно уточнить.',unknown_return:'Возвращение ещё нужно уточнить.',after_deadline:'Позже выбранного конца дня.',closed:'На это время место закрыто.',no_window:'Время посещения не подошло.',unknown_hours:'Часы работы ещё нужно проверить.'};
export function initTravel(workshop,catalog,base){
  const root=document.querySelector('#travel-day');if(!root)return;
  const $=id=>root.querySelector(`#${id}`),status=$('travel-status');let sequence=0,busy=false,currentContext='';
  const announce=message=>{status.textContent=message;};
  const resume=node('a','Уточнить остаток дня →','day-kosa-edit');resume.href=new URL('planner/#day-progress',base).href;resume.hidden=true;$('travel-when').after(resume);
  async function intent(id,value,context){
    if(busy)return;busy=true;let applied=false;
    try{await workshop.setState(trip=>{const next=markVisited(trip,id,value,context);applied=next!==trip;return next;},value?'Остановка отмечена.':'Отметка снята.');
      announce(applied?(workshop.isSaved()?'Отметка сохранена в вашей поездке.':'Браузер не сохраняет поездку. Скачайте файл, чтобы забрать отметки.'):'День изменился в другой вкладке. Проверьте остановку и отметьте её ещё раз.');
    }catch{announce('Отметку пока не удалось сохранить. Ваш прежний день на месте.');}
    finally{busy=false;render();}
  }
  $('travel-select').addEventListener('change',async event=>{
    const id=event.target.value,context=currentContext;let applied=false;
    try{await workshop.setState(trip=>{const next=selectTravelDay(trip,id,context);applied=next!==trip;return next;},'Выбран другой день.');
      announce(applied?'Выбран другой день.':'День изменился в другой вкладке. Проверьте выбор.');
    }catch{announce('День пока не удалось переключить. Прежний выбор сохранён.');}render();
  });
  $('travel-mark').addEventListener('click',event=>{const button=event.currentTarget;intent(button.dataset.point,true,button.dataset.context);});
  root.addEventListener('click',event=>{const button=event.target.closest('[data-travel-visited]');if(button)intent(button.dataset.travelVisited,button.dataset.value==='true',button.dataset.context);});
  function render(){
    const trip=workshop.getState(),snapshot=travelSnapshot(trip,catalog),{places,next,done,day,raw,context}=snapshot,ticket=++sequence;
    currentContext=context;root.dataset.travelReady='true';root.dataset.planReady='loading';
    const select=$('travel-select');select.replaceChildren(...journeyDays(trip).map((d,index)=>{const option=node('option',`День ${index+1} · ${date(d.date)}`);option.value=d.id;return option;}));select.value=raw.id;select.disabled=false;
    $('travel-count').textContent=`${done} из ${places.length}`;$('travel-progress').max=Math.max(places.length,1);$('travel-progress').value=done;
    $('travel-empty').hidden=places.length>0;$('travel-active').hidden=!places.length;
    $('travel-eyebrow').textContent=next?'Следующая остановка':'Все остановки отмечены';
    $('travel-number').textContent=next?String(places.indexOf(next)+1).padStart(2,'0'):'✓';
    const title=$('travel-title');title.textContent=next?.name||'День остаётся с вами';title.href=next?new URL(`poi/${next.slug}/`,base).href:new URL('planner/',base).href;
    $('travel-note').textContent=next?.description||'Остановки пройдены. Проверьте дорогу к поезду или к месту ночёвки.';
    const mark=$('travel-mark');mark.hidden=!next;mark.disabled=busy;mark.dataset.point=next?.slug||'';mark.dataset.context=context;
    const map=$('travel-map');map.dataset.mapFocus=next?.slug||baseId(day.night_at)||'';
    resume.hidden=!snapshot.visited.size;
    $('travel-when').textContent=places.length?'Считаем время вашего плана…':'';
    const focused=document.activeElement?.dataset.travelVisited;
    $('travel-stops').replaceChildren(...places.map((place,index)=>{
      const li=node('li');li.dataset.travelStop=place.slug;li.dataset.visited=String(snapshot.visited.has(place.slug));
      li.append(node('span',String(index+1).padStart(2,'0'),'travel-step-number'));
      const copy=node('div'),link=node('a',place.name);link.href=new URL(`poi/${place.slug}/`,base).href;
      const time=node('p','Считаем план…','travel-step-time');time.dataset.travelTime=place.slug;copy.append(link,time);li.append(copy);
      const visited=snapshot.visited.has(place.slug),button=node('button',visited?'Уже были ✓':'Отметить','travel-check');
      button.type='button';button.dataset.travelVisited=place.slug;button.dataset.value=String(!visited);button.dataset.context=context;button.disabled=busy;
      button.setAttribute('aria-pressed',String(visited));button.setAttribute('aria-label',`${visited?'Снять отметку':'Отметить посещение'}: ${place.name}`);li.append(button);return li;
    }));
    if(focused)Array.from($('travel-stops').querySelectorAll('button')).find(b=>b.dataset.travelVisited===focused)?.focus({preventScroll:true});
    $('travel-bases').textContent=[day.start_at?`Начало: ${baseName(day.start_at,catalog)}.`:'',day.night_at?`К ночи: ${baseName(day.night_at,catalog)}.`:day.end_at?'':'Возвращение пока не выбрано. Добавьте его в планировщике.',day.end_at?`Вылет / отъезд: ${baseName(day.end_at,catalog)}.`:''].filter(Boolean).join(' ');
    const notes=$('travel-day-note');notes.textContent=raw.note;notes.hidden=!raw.note;
    $('travel-bookings').replaceChildren(...(raw.bookings||[]).map(row=>{const li=node('li');
      li.append(node('strong',`${BOOKING_KINDS[row.kind]} · ${row.name}`),node('p',`${BOOKING_STATUSES[row.status]} · ${date(row.date)}${row.time===null?'':` · ${clock(row.time)}`}${row.location?` · ${baseName(row.location,catalog)}`:''}`));
      const warning=bookingProblem(row,raw);if(warning)li.append(node('p',warning,'travel-warning'));return li;
    }));$('travel-records').hidden=!(raw.bookings?.length);
    updateCoverage(ticket,trip);
    if(!places.length){root.dataset.planReady='empty';return;}
    Promise.all([loadScheduler(base),loadTripTravelMatrix(base,trip,catalog).catch(()=>null)]).then(([engine,matrix])=>{
      if(ticket!==sequence)return;const result=engine(planInput(trip,catalog,matrix));let blocked=false;
      const messages=new Map();
      for(const item of result.stops){
        const warnings=[...new Set(item.issues.map(issue=>issues[issue.code]||'Время этой остановки нужно проверить в планировщике.'))];
        const time=blocked?'Возвращение с предыдущей остановки не подтверждено.':item.begins===null?`По плану не раньше ${clock(item.earliest_begin)}. Точное время ещё неизвестно.`:`По плану · ${clock(item.begins)}.`;
        messages.set(item.id,[time,...warnings].join(' '));
        if(item.excursion?.conflict)blocked=true;
      }
      for(const el of root.querySelectorAll('[data-travel-time]'))el.textContent=messages.get(el.dataset.travelTime)||(trip.schedule?.progress?.completed.includes(el.dataset.travelTime)?'Уже были. Время посещения не записано.':'Время ещё нужно уточнить.');
      $('travel-when').textContent=next?messages.get(next.slug)||'Время ещё нужно уточнить.':'Отметки сохраняют ваш путь. Время возвращения проверьте по плану.';
      root.dataset.planReady='true';
    }).catch(error=>{if(ticket!==sequence)return;
      const message=error.message?.startsWith('progress_')?'Время или отметки изменились. Откройте «Продолжить с этого места» в планировщике и уточните остаток дня.':error.message?.includes('departure_before_day')?'Вылет с запасом не оставляет времени этому дню. Измените время в планировщике.':error.message?.includes('arrival_after_day')?'Прибытие позже конца выбранного дня. Измените время в планировщике.':'Расчёт времени пока недоступен. Остановки и отметки работают; проверьте время в планировщике.';
      $('travel-when').textContent=message;root.querySelectorAll('[data-travel-time]').forEach(el=>el.textContent='Время пока неизвестно.');root.dataset.planReady='error';
    });
  }
  async function updateCoverage(ticket,trip){
    root.dataset.coverageReady='loading';
    $('travel-offline-status').textContent='Проверяем скачанные карту и карточки…';
    const [paths,maps]=await Promise.all([offlinePaths(base),availableMaps(base)]);if(ticket!==sequence)return;
    const c=travelCoverage(trip,catalog,paths,maps,base);
    $('travel-offline-status').textContent=!c.points?'Выберите места и сохраните PDF своего дня в планировщике.':
      c.page&&c.cards===c.total&&c.covered===c.points?'Экран, карточки и карта ваших точек скачаны. Дороги и входы проверьте на карте перед выходом.':
      `Скачано карточек: ${c.cards} из ${c.total}. Карта покрывает ${c.covered} из ${c.points} точек.${c.page?'':' Этот экран ещё не скачан.'} Возьмите PDF своего дня в планировщике: карты и координаты уже внутри.`;
    root.dataset.coverageReady='true';
  }
  for(const name of ['godune:trip-change','godune:memory-cleared','godune:offline-change','online','offline'])window.addEventListener(name,render);
  render();announce('Выберите день. Отмечайте места по мере прогулки.');
}
