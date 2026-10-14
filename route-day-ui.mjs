import {routeDayTarget,routeDaySettings,saveRouteDay} from './route-day.mjs?v=2026101305';
import {selectedDay,chooseTripDay} from './trip-days-state.mjs?v=2026101305';
import {plannerDayUrl} from './trip-day-link.mjs?v=2026101305';

export function initRouteDay({workshop,catalog,base}){
 const route=catalog.routes.find(row=>row.slug===document.body.dataset.route);
 const form=document.querySelector('[data-route-day-settings]'),buttons=[...document.querySelectorAll('[data-route-day-save]')],pdf=document.querySelector('[data-route-day-pdf]'),status=document.querySelector('[data-route-day-status]'),context=document.querySelector('[data-route-day-context]'),open=document.querySelector('[data-route-day-open]');
 if(!route||!form||!buttons.length)return;
 let id=new URL(location.href).searchParams.get('trip-day'),busy=false,dirty=false;
 const initial=routeDayTarget(workshop.getState(),route,id);
 const linkDay=value=>{id=value;const url=new URL(location.href);url.searchParams.set('trip-day',id);history.replaceState(history.state,'',url);};
 if(initial?.state==='ready')linkDay(initial.day.id);
 function enabled(value){for(const button of [...buttons,pdf,...form.querySelectorAll('input')])button.disabled=!value;}
 function sync(){
  if(busy)return;
  const target=id?routeDayTarget(workshop.getState(),route,id):null;
  if(target&&target.state!=='ready'){
   enabled(false);context.textContent='Этот день не найден. Выберите сохранённый день в «Моём дне».';
   for(const button of buttons)button.textContent='День не найден';
   open.href=new URL('planner/',base).href;return;
  }
  enabled(true);
  for(const button of buttons)button.textContent=target?(dirty?'Сохранить изменения →':'День сохранён ✓'):'Сохранить день →';
  if(!target){context.textContent='Выберите дату и начало прогулки.';return;}
  const day=target.day,value=routeDaySettings(day);
  if(!dirty){form.elements.date.value=value.date||'';form.elements.time.value=value.time;}
  context.textContent=`${day.name||route.name} · мест в плане: ${day.places.length}.`;
  open.href=plannerDayUrl(base,id).href;
  const overview=document.querySelector('.journey-overview');overview.replaceChildren();
  for(const place of day.places){
   const poi=catalog.poi.find(p=>p.slug===place),li=document.createElement('li'),a=document.createElement('a'),strong=document.createElement('strong'),small=document.createElement('span');
   a.href=plannerDayUrl(base,id).href;strong.textContent=poi?.name||place;small.textContent=`${day.schedule?.stops[place]?.visit??30} мин`;
   a.append(strong,small);li.append(a);overview.append(li);
  }
 }
 async function save(){
  const settings={id,date:form.elements.date.value||null,time:form.elements.time.value,edit:dirty};
  const result=await workshop.setState(current=>saveRouteDay(current,route,catalog,settings),'Прогулка сохранена в Мой день.');
  if(result.conflict)throw Error('route_day_conflict');
  linkDay(selectedDay(workshop.getState()).id);dirty=false;return result;
 }
 async function submit(){
  if(busy||!form.reportValidity())return;busy=true;enabled(false);
  try{const result=await save();status.textContent=result.saved?'День сохранён. Время, остановки и заметки можно изменить в «Моём дне».':'День открыт в этой вкладке. Скачайте буклет, чтобы взять его с собой.';}
  catch{status.textContent='Не удалось сохранить день. Проверьте выбор и попробуйте ещё раз.';}
  finally{busy=false;sync();}
 }
 for(const button of buttons)button.addEventListener('click',submit);
 form.addEventListener('submit',event=>{event.preventDefault();submit();});
 form.addEventListener('input',()=>{dirty=true;for(const button of buttons)button.textContent='Сохранить изменения →';});
 pdf.addEventListener('click',async()=>{
  if(busy||!form.reportValidity())return;busy=true;enabled(false);pdf.textContent='Собираем буклет…';
  try{
   if(!id||dirty)await save();
   const current=workshop.getState(),target=routeDayTarget(current,route,id);
   if(target?.state!=='ready')throw Error('linked_day_missing');
   const trip=chooseTripDay(current,id),signature=JSON.stringify(current);
   const {downloadPersonalGuide}=await import('./trip-guide-ui.mjs?v=2026101402');
   const result=await downloadPersonalGuide({trip,catalog,base,scope:'day',format:'phone',onProgress:text=>{status.textContent=text;},stillCurrent:()=>JSON.stringify(workshop.getState())===signature});
   status.textContent=`Буклет готов: ${result.pages} стр. Ищите PDF в загрузках.`;
  }catch(error){status.textContent=error.message==='guide_trip_changed'?'День изменился. Соберите свежий буклет.':'Буклет пока не собрался. Готовый PDF прогулки доступен ниже.';}
  finally{busy=false;pdf.textContent='Собрать мой PDF ↓';sync();}
 });
 window.addEventListener('godune:trip-change',sync);sync();
}
