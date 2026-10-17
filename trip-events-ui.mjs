import {loadScheduler} from './trip-scheduler.mjs?v=2026101706';
import {selectedDay} from './trip-days-state.mjs?v=2026101706';
import {serviceVisitTargets} from './trip-service-visits-state.mjs?v=2026101706';
import {timelineOrder} from './trip-service-timeline-state.mjs?v=2026101706';
import {eventRegionalStart} from './trip-events-contract.mjs?v=2026101706';
import {prepareEventAdd,confirmEventAdd,selectedEventContext} from './trip-events-state.mjs?v=2026101706';
import {loadTripTravelMatrix} from './travel-estimates.mjs?v=2026101305';
import {dayChangeBaseline,inspectTripDayChange} from './trip-day-change-state.mjs?v=2026101706';
import {dayChangeText} from './trip-day-change-view.mjs?v=2026101705';
import {dayOutcome} from './day-outcome.mjs?v=2026101705';
const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const button=text=>{const n=node('button',text);n.type='button';n.className='visit-secondary';return n;};
const message=e=>/[А-Яа-яЁё]/.test(e?.message||'')?e.message:'Не получилось проверить событие. Попробуйте ещё раз.';
const clock=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
function styles(){if(document.querySelector('[data-visit-styles]'))return;const n=node('link');n.rel='stylesheet';n.href=new URL('trip-service-visits.css?v=3',import.meta.url);n.dataset.visitStyles='';document.head.append(n);}
// The workshop owns the only memory. Opening and reviewing this dialog are pure.
export function initTripEvents({read,commit,base,catalog}){
 let opened=false,lastContext;
 async function propose({event,venue,date},opener){
  if(opened||!event)return;
  opened=true;styles();
  const dialog=node('dialog');dialog.className='visit-dialog';dialog.setAttribute('aria-labelledby','trip-event-title');
  const heading=node('h2','Событие в вашем дне');heading.id='trip-event-title';
  const close=button('Закрыть'),title=node('h3',event.title),status=node('p');status.setAttribute('role','status');
  const form=node('form');form.className='visit-picker';
  const dayLabel=node('label','Выберите день'),days=node('select');days.name='event-day';dayLabel.append(days);
  const positionLabel=node('label','Место в порядке остановок'),position=node('select');position.name='event-position';positionLabel.append(position);
  const noteLabel=node('label','Заметка для себя'),note=node('textarea');note.rows=3;noteLabel.append(note);
  const review=node('div');review.className='visit-add-review';review.setAttribute('aria-live','polite');
  const save=node('button','Сохранить в моём дне');save.type='submit';save.className='visit-primary';save.disabled=true;
  const retry=button('Проверить заново');retry.hidden=true;
  form.append(dayLabel,positionLabel,review,noteLabel,save);dialog.append(close,heading,title,form,status,retry);document.body.append(dialog);
  let preview,sequence=0,pending=false,currentEvent=event,currentVenue=venue,engine;
  close.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('cancel',e=>{if(pending)e.preventDefault();});
  dialog.addEventListener('close',()=>{sequence++;opened=false;dialog.remove();opener?.focus({preventScroll:true});},{once:true});
  dialog.showModal();close.focus();
  async function latest(){
   const response=await fetch(new URL('data/events.json',base),{cache:'no-cache'});
   if(!response.ok)throw Error('Афишу не удалось перепроверить. Сохранится датированный снимок; актуальность нужно уточнить.');
   const registry=await response.json(),found=registry.events?.find(row=>row.id===event.id);
   if(!found)throw Error('Событие больше не найдено в афише. Проверьте источник перед добавлением.');
   const {normalizeEvent}=await import('./events-engine.mjs?v=2026101706');
   return {event:normalizeEvent(found,registry),venue:registry.venues?.[found.venue_id]??venue};
  }
  function positions(){
   position.replaceChildren();const auto=node('option','Перед более поздним посещением');auto.value='auto';position.append(auto);
   const target=read().itinerary?.days?.find(d=>d.id===days.value);
   for(const row of target?timelineOrder(target):[]){const name=row.kind==='place'?catalog.poi.find(p=>p.slug===row.id)?.name:target.service_visits?.find(v=>v.id===row.id)?.name;const n=node('option',`Перед: ${name||'остановкой'}`);n.value=JSON.stringify(row);position.append(n);}
   const end=node('option','После всех остановок');end.value='end';position.append(end);
  }
  async function update(){
   const ticket=++sequence;preview=null;save.disabled=true;retry.hidden=true;review.replaceChildren();status.textContent='Проверяем дороги, посещения и возвращение…';
   try{
    engine??=await loadScheduler(base);if(ticket!==sequence)return;
    const before=position.value==='auto'?undefined:position.value==='end'?null:JSON.parse(position.value);
    const original=read(),candidate=prepareEventAdd(engine,original,currentEvent,{venue:currentVenue,date:eventRegionalStart(currentEvent)?.date,targetId:days.value||null,before});
    const baseline=dayChangeBaseline(original,candidate.trip,candidate.targetId);
    const [beforeMatrix,matrix]=await Promise.all([baseline,candidate.trip].map(t=>loadTripTravelMatrix(base,t,catalog).catch(()=>null)));
    if(ticket!==sequence)return;
    const start=eventRegionalStart(currentEvent);review.append(node('p',`${start.date} · начало ${clock(start.minute)} · калининградское время`));
    if(date&&date!==start.date)review.append(node('p',`В выбранную дату ${date} событие уже продолжается. Добавляется его исходное начало ${start.date}; посещение части события нужно уточнить отдельно.`));
    if(currentEvent.end_time===null)review.append(node('p','Время окончания неизвестно. Ужин и возвращение после события пока нельзя подтвердить.'));
    if(!candidate.visit.event.place_id)review.append(node('p','Площадка пока не связана с картой. Дорогу нужно уточнить.'));
    try{
     const change=inspectTripDayChange(engine,baseline,candidate.trip,catalog,beforeMatrix,matrix);review.dataset.addDayState=change.after.state;
     review.append(node('p',dayOutcome(change.after)));for(const line of dayChangeText(change))review.append(node('p',line));
     if(change.after.state==='conflict')review.append(node('p','Выберите другое место события в порядке остановок или оставьте его в отдельном дне. Ужин и возвращение сохраняются.'));
    }catch{review.dataset.addDayState='unknown';review.append(node('p','Полный день пока не рассчитан. После сохранения уточните дорогу и возвращение в «Моём дне».'));}
    review.append(node('p','Цена и условия билета — по источнику; цена «от» не считается полной суммой на группу.'));
    const source=node('a','Источник события');source.href=currentEvent.source_url;source.target='_blank';source.rel='noopener';review.append(source,node('p',`Сведения проверены: ${currentEvent.verified_at}`));
    preview=candidate;save.disabled=false;save.textContent=candidate.alreadyAdded?'Открыть этот день':'Сохранить в моём дне';status.textContent='';
   }catch(e){if(ticket===sequence){status.textContent=message(e);retry.hidden=false;}}
  }
  days.addEventListener('change',()=>{positions();update();});position.addEventListener('change',()=>update());
  retry.addEventListener('click',async()=>{try{const fresh=await latest();currentEvent=fresh.event;currentVenue=fresh.venue;await update();}catch(e){status.textContent=message(e);}});
  form.addEventListener('submit',async e=>{
   e.preventDefault();if(!preview||pending)return;pending=true;save.disabled=true;close.disabled=true;
   try{
    // Online source changes invalidate a reviewed snapshot. Offline saving retains
    // the original evidence date and exposes uncertainty instead of renewing it.
    let fresh;try{fresh=await latest();}catch(error){if(navigator.onLine)throw error;}
    const result=await commit(trip=>confirmEventAdd(trip,preview,note.value,fresh||{}),'Событие сохранено в вашем дне.');
    if(result.conflict){preview=null;throw Error('Поездка изменилась. Проверьте день заново перед сохранением.');}
    form.hidden=true;retry.hidden=true;status.textContent=result.saved?'Событие сохранено в вашем дне.':'Событие осталось в этой вкладке. Скачайте файл поездки, чтобы сохранить его.';
    const link=node('a','Открыть мой день →');link.href=new URL('planner/#my-trip',base);dialog.append(link);link.focus();
   }catch(error){preview=null;status.textContent=message(error);retry.hidden=false;}
   finally{pending=false;close.disabled=false;save.disabled=!preview;}
  });
  try{
   const start=eventRegionalStart(event);if(!start)throw Error('Уточните время начала события по источнику.');
   for(const day of serviceVisitTargets(read(),start.date)){const option=node('option',`День ${day.number} · ${start.date}`);option.value=day.id;days.append(option);}
   const extra=node('option',`Новый день · ${start.date}`);extra.value='';days.append(extra);const active=selectedDay(read());if(active.date===start.date&&[...days.options].some(option=>option.value===active.id))days.value=active.id;positions();await update();
  }catch(error){status.textContent=message(error);}
 }
 window.addEventListener('godune:event-proposal',e=>{propose(e.detail||{},e.detail?.opener||document.activeElement);});
 const controller={render(){const context=selectedEventContext(read(),catalog),key=JSON.stringify(context);if(key!==lastContext){lastContext=key;window.dispatchEvent(new CustomEvent('godune:nearby-context',{detail:context}));}}};
 window.addEventListener('godune:nearby-context-request',()=>{lastContext=undefined;controller.render();});
 return controller;
}
