import {dayYandexRouteUrl,updateYandexRoute} from './yandex-route.mjs?v=2026101601';
import {fishWalkTarget,fishWalkSettings,saveFishWalkDay} from './fish-walk-day.mjs?v=2026101707';
import {selectedDay,chooseTripDay} from './trip-days-state.mjs?v=2026101707';
import {plannerDayUrl} from './trip-day-link.mjs?v=2026101707';
import {initGastroMenus} from './gastro-menu-picker.mjs?v=2026101707';

export async function initFishWalk({workshop,base,catalog}) {
  const button=document.querySelector('[data-fish-save]'),booklet=document.querySelector('[data-fish-booklet]'),status=document.querySelector('[data-fish-status]');
  const form=document.querySelector('[data-fish-settings]'),context=document.querySelector('[data-fish-context]'),open=document.querySelector('[data-fish-open]');
  const response=await fetch(new URL('data/gastronomy.json',base));
  if(!response.ok)throw Error('food_unavailable');
  const food=await response.json(),scenario=document.querySelector('[data-gastro-tour]')?.dataset.gastroTour;
  const tour=scenario?food.curated_tours?.find(t=>t.id===scenario):food.fish_tour;
  if(!tour || tour.places.length!==3)throw Error('fish_walk_unavailable');
  let id=new URL(location.href).searchParams.get('trip-day'),busy=false,dirty=false;
  const initial=fishWalkTarget(workshop.getState(),tour,id);
  if(initial?.state==='ready'){
    id=initial.day.id;
    const url=new URL(location.href);url.searchParams.set('trip-day',id);history.replaceState(history.state,'',url);
  }else if(!initial&&form){
    const start=new URL(location.href).searchParams.get('start');
    if(start&&/^([01]\d|2[0-3]):[0-5]\d$/.test(start))form.elements.time.value=start;
  }
  const enabled=value=>{button.disabled=!value;if(booklet)booklet.disabled=!value;for(const input of form?.querySelectorAll('input')||[])input.disabled=!value;};
  const settings=()=>({id,date:form?.elements.date.value||null,time:form?.elements.time.value||'12:00',edit:dirty});
  function sync(){
    if(busy)return;
    const target=id?fishWalkTarget(workshop.getState(),tour,id):null;
    if(target)updateYandexRoute(document.querySelector('[data-yandex-route]'),target.state==='ready'?dayYandexRouteUrl(target.day,catalog):null);
    if(target&&target.state!=='ready'){
      enabled(false);if(context)context.textContent='Этот день не найден. Выберите другой день в «Моём дне».';
      button.textContent='День не найден';if(open)open.href=new URL('planner/',base).href;return;
    }
    enabled(true);
    if(target){
      const day=target.day,value=fishWalkSettings(day);
      if(!dirty&&form){form.elements.date.value=value.date||'';form.elements.time.value=value.time;}
      if(open)open.href=plannerDayUrl(base,id).href;
      button.textContent=dirty?'Сохранить изменения →':'День сохранён ✓';
      if(context)context.textContent=`${day.name||'Ваш день'} · мест в плане: ${day.places.length}${day.menu_choices?.length?` · блюд в плане: ${day.menu_choices.length}`:''}.`;
      const heading=document.querySelector('.fish-pocket>h2+p');if(heading)heading.textContent=day.name||'Ваш день';
      const overview=document.querySelector('.fish-overview');
      if(overview){overview.replaceChildren();for(const place of day.places){
        const poi=catalog.poi.find(p=>p.slug===place),venue=food.venues.find(v=>v.slug===place),li=document.createElement('li'),a=document.createElement('a'),strong=document.createElement('strong'),small=document.createElement('span');
        a.href=plannerDayUrl(base,id).href;strong.textContent=poi?.name||venue?.name||place;
        const visit=day.schedule?.stops[place]?.visit??venue?.visit??30;small.textContent=`${visit} мин`;
        a.append(strong,small);li.append(a);overview.append(li);
      }}
    }else{button.textContent='Сохранить день →';if(context)context.textContent='Выберите дату и начало прогулки.';}
  }
  function remember(){
    id=selectedDay(workshop.getState()).id;dirty=false;
    const url=new URL(location.href);url.searchParams.set('trip-day',id);history.replaceState(history.state,'',url);
  }
  async function save(){
    if(form&&!form.reportValidity())throw Error('invalid_settings');
    const value=settings(),result=await workshop.setState(current=>saveFishWalkDay(current,tour,food,value),'Гастро-прогулка сохранена.');
    if(result.conflict)throw Error('fish_day_conflict');
    remember();return result;
  }
  async function submit(){
    if(busy||form&&!form.reportValidity())return;busy=true;enabled(false);
    try{
      const result=await save();
      status.textContent=result.saved?'День сохранён. Блюда и остановки можно выбрать в «Моём дне».':'День открыт в этой вкладке. Сохраните буклет, чтобы взять его с собой.';
    }catch(error){status.textContent=error.message==='linked_day_missing'?'День уже удалён. Выберите другой в «Моём дне».':'Не удалось сохранить прогулку. Проверьте выбор и попробуйте ещё раз.';}
    finally{busy=false;sync();}
  }
  button.addEventListener('click',submit);
  form?.addEventListener('submit',event=>{event.preventDefault();submit();});
  form?.addEventListener('input',()=>{dirty=true;button.textContent='Сохранить изменения →';});
  booklet?.addEventListener('click',async()=>{
    if(busy||form&&!form.reportValidity())return;busy=true;enabled(false);booklet.textContent='Собираем буклет…';
    try{
      if(!id||dirty)await save();
      const current=workshop.getState(),target=fishWalkTarget(current,tour,id);
      if(target?.state!=='ready')throw Error('linked_day_missing');
      // Export this saved identity, even if another day is active in another tab.
      const trip=chooseTripDay(current,id),signature=JSON.stringify(current);
      const {downloadPersonalGuide}=await import('./trip-guide-ui.mjs?v=2026101707');
      const result=await downloadPersonalGuide({trip,catalog,base,scope:'day',format:'phone',onProgress:text=>{status.textContent=text;},stillCurrent:()=>JSON.stringify(workshop.getState())===signature});
      status.textContent=`Буклет готов: ${result.pages} стр. Ищите PDF в загрузках.`;
    }catch(error){status.textContent=error.message==='guide_trip_changed'?'День изменился. Соберите свежий буклет.':error.message==='linked_day_missing'?'День уже удалён. Выберите другой в «Моём дне».':'Буклет пока не собрался. Попробуйте ещё раз.';}
    finally{busy=false;booklet.textContent='Собрать буклет ↓';sync();}
  });
  window.addEventListener('godune:trip-change',sync);
  initGastroMenus({workshop,base,catalog,saveDay:save,getId:()=>id,setBusy:value=>{
    if(value&&busy)return false;busy=value;enabled(!value);if(!value)sync();return true;
  }});
  document.querySelectorAll('.fish-overview a[href^="#"]').forEach(link=>link.addEventListener('click',()=>{
    const stop=document.querySelector(link.hash+' .fish-stop-details');if(stop)stop.open=true;
  }));
  sync();
}
