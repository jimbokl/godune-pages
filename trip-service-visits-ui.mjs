import {loadScheduler} from './trip-scheduler.mjs?v=42';
import {selectedDay} from './trip-days-state.mjs?v=27';
import {serviceVisitRows,serviceVisitContext,serviceVisitTargets,replaceServiceVisit,changeServiceVisitNote,removeServiceVisit} from './trip-service-visits-state.mjs?v=5';
import {hasServiceVisits} from './trip-service-visits-contract.mjs?v=1';
import {initServiceDayCheck} from './trip-service-day-ui.mjs?v=12';
import {serviceExpenseButton} from './trip-service-expenses-ui.mjs';
import {validTimeline} from './trip-service-timeline-state.mjs';
import {dayJourneyBoundaries,usesJourneyBoundaries} from './day-journey-boundaries.mjs?v=4';
import {formatKopecks} from './trip-money.mjs';
import {rentalFactsElement} from './trip-rental-view.mjs';
import {serviceSelectionElement} from './trip-service-selection-view.mjs?v=1';
import {prepareServiceAdd,confirmServiceAdd} from './trip-service-add-state.mjs?v=3';
import {dayChangeBaseline,inspectTripDayChange} from './trip-day-change-state.mjs?v=3';
import {dayChangeText} from './trip-day-change-view.mjs?v=1';
import {loadTripTravelMatrix} from './travel-estimates.mjs?v=13';
import {dayOutcome} from './day-outcome.mjs?v=1';

const categories={bike_rental:'Прокат',bath:'Баня',pool:'Бассейн',gym:'Тренировка',market:'Рынок',workshop:'Мастерская',dining:'Еда',water_activity:'Водный отдых'};
const states={fits:'По времени и условиям подходит',does_not_fit:'Нужно изменить план',needs_info:'Есть что уточнить'};
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const button=(text,cls='visit-secondary')=>{const n=node('button',text,cls);n.type='button';return n;};
const errorText=error=>/[А-Яа-яЁё]/.test(error?.message||'')?error.message:'Не получилось изменить посещение. Попробуйте ещё раз.';
const dateText=date=>{try{return new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));}catch{return 'дата не указана';}};
const clock=n=>n==null?'Время пока неизвестно':`${String(Math.floor(n/60)%24).padStart(2,'0')}:${String(n%60).padStart(2,'0')}${n>=1440?' следующего дня':''}`;
const money=n=>n==null?'Полная цена пока неизвестна':formatKopecks(n);
function style(){if(document.querySelector('[data-visit-styles]'))return;const link=node('link');link.rel='stylesheet';link.href=new URL('trip-service-visits.css?v=3',import.meta.url);link.dataset.visitStyles='';document.head.append(link);}
function summary(visit,result){
 const wrap=node('div',undefined,'visit-summary');wrap.append(node('p',categories[visit.category],'visit-category'),node('h3',visit.name));
 wrap.append(node('p',`${clock(visit.selection.visit.input.arrival)} → ${clock(result.summary.departure)} · ${money(result.summary.cost_total)}`,'visit-facts'));
 if(visit.address)wrap.append(node('p',visit.address,'visit-address'));
 const selection=serviceSelectionElement(visit);if(selection)wrap.append(selection);
 wrap.append(node('p',states[result.state],'visit-assessment'));
 const rental=rentalFactsElement(visit,result);if(rental)wrap.append(rental);return wrap;
}
let memoryPromise;
async function pageMemory(base){
 if(!memoryPromise)memoryPromise=(async()=>{
  const response=await fetch(new URL('data/catalog.json',base));if(!response.ok)throw Error('Каталог не загрузился. Попробуйте ещё раз.');
  const catalog=await response.json();if(!Array.isArray(catalog.poi)||!Array.isArray(catalog.routes))throw Error('Каталог не загрузился. Попробуйте ещё раз.');
  const [{createTripMemory},{loadTrip}]=await Promise.all([import('./trip-memory.mjs?v=26'),import('./workshop.mjs?v=110')]);
  let storage;try{storage=localStorage;}catch{storage=null;}
  const memory=createTripMemory(catalog,loadTrip(storage,catalog),storage);await memory.ready;
  addEventListener('storage',()=>memory.sync());document.addEventListener('visibilitychange',()=>{if(!document.hidden)memory.sync();});
  return {memory,catalog};
 })().catch(error=>{memoryPromise=null;throw error;});
 return memoryPromise;
}

// Loaded only when the author asks to use their saved day as a search context.
export async function savedServiceDay(base){
 const {memory,catalog}=await pageMemory(base);await memory.sync();
 if(memory.compatibility)throw Error(`Проверьте сохранённую поездку: ${memory.compatibility.message}`);
 const trip=memory.get();
 const {effectiveBookingDay}=await import('./trip-bookings-state.mjs?v=3');
 return {trip,catalog,day:effectiveBookingDay(selectedDay(trip))};
}

export async function pickServiceVisit(metadata,selection,base,opener){
 style();
 const [{memory,catalog},engine]=await Promise.all([pageMemory(base),loadScheduler(base)]);
 const prepared=engine.serviceTrip({version:1,id:'visit-1',...structuredClone(metadata),selection:structuredClone(selection),note:'',saved_at:new Date().toISOString()});
 await memory.sync();
 const dialog=node('dialog',undefined,'visit-dialog');dialog.setAttribute('aria-labelledby','visit-dialog-title');
 const close=button('×','visit-close');close.setAttribute('aria-label','Закрыть');
 const heading=node('h2','Добавить в день');heading.id='visit-dialog-title';
 const form=node('form',undefined,'visit-picker'),dayLabel=node('label','Выберите день'),select=node('select');select.name='day';
 for(const day of serviceVisitTargets(memory.get(),selection.visit.input.date)){
  const option=node('option',`День ${day.number} · ${dateText(selection.visit.input.date)}`);option.value=day.id;select.append(option);
 }
 const extra=node('option',`Новый день · ${dateText(selection.visit.input.date)}`);extra.value='';select.append(extra);dayLabel.append(select);
 const noteLabel=node('label','Заметка для себя'),note=node('textarea');note.name='note';note.rows=3;note.placeholder='Например, что взять с собой';noteLabel.append(note);
 const review=node('div',undefined,'visit-add-review');review.setAttribute('aria-live','polite');
 const save=node('button','Добавить в этот день','visit-primary');save.type='submit';save.disabled=true;
 const retry=button('Проверить день ещё раз');retry.hidden=true;
 const status=node('p',undefined,'visit-feedback');status.setAttribute('role','status');
 const receipt=node('div',undefined,'visit-receipt');receipt.hidden=true;
 const open=node('a','Открыть мой день →','visit-primary');open.href=new URL('planner/#my-trip',base);receipt.append(open);
 const download=button('Скачать файл поездки');download.hidden=true;
 download.addEventListener('click',async()=>{const {downloadTripFile}=await import('./trip-file.mjs?v=31');downloadTripFile(memory.get(),catalog);});
 form.append(dayLabel,review,noteLabel,save);dialog.append(close,heading,summary(prepared.visit,prepared.assessment),form,status,retry,receipt,download);document.body.append(dialog);
 close.addEventListener('click',()=>dialog.close());
 // Escape and the close button restore focus to the original card.
 let pending=false,sequence=0,preview;
 dialog.addEventListener('close',()=>{sequence++;dialog.remove();opener?.focus({preventScroll:true});},{once:true});
 dialog.addEventListener('cancel',event=>{if(pending)event.preventDefault();});
 async function update(){
  const ticket=++sequence;preview=null;save.disabled=true;retry.hidden=true;review.replaceChildren();status.textContent='Проверяем, как посещение впишется в день…';
  try{
   await memory.sync();if(ticket!==sequence)return;
   if(memory.compatibility)throw Error(`Проверьте сохранённую поездку: ${memory.compatibility.message}`);
   const original=memory.get(),candidate=prepareServiceAdd(engine,original,prepared,select.value||null);
   const baseline=dayChangeBaseline(original,candidate.trip,candidate.targetId);
   const [beforeMatrix,matrix]=await Promise.all([baseline,candidate.trip].map(day=>day.places.length?loadTripTravelMatrix(base,day,catalog).catch(()=>null):null));
   if(ticket!==sequence)return;
   review.append(node('h3',candidate.alreadyAdded?'Уже в вашем дне':'После добавления'));
   try{
    const change=inspectTripDayChange(engine,baseline,candidate.trip,catalog,beforeMatrix,matrix),check=change.after;review.dataset.addDayState=check.state;
    review.append(node('p',dayOutcome(check),'visit-add-outcome'));
    for(const line of dayChangeText(change))review.append(node('p',line,'visit-facts'));
    const budget=check.services_budget;
    review.append(node('p',`Услуги на вашу группу: ${budget.cost_total!==null?money(budget.cost_total):budget.cost_lower_bound>0?'не меньше '+money(budget.cost_lower_bound)+' · полная сумма неизвестна':'полная сумма неизвестна'}`,'visit-facts'));
    if(budget.deposit_total>0||budget.deposit_unknown>0)review.append(node('p',`Возвратный залог: ${budget.deposit_total!==null?money(budget.deposit_total):'полная сумма неизвестна'}`,'visit-facts'));
    const issues=node('ul',undefined,'visit-day-issues');
    for(const overlap of check.overlaps)issues.append(node('li',`Посещения пересекаются на ${overlap.minutes} мин.`));
    if(check.issues.some(row=>row.code==='outside_day_window'))issues.append(node('li','Посещение выходит за время дня или выбранные рейсы.'));
    if(check.issues.some(row=>row.code==='service_connections_unknown'))issues.append(node('li','Дорога к посещению ещё не выбрана. Весь день пока не рассчитан.'));
    if(issues.childElementCount)review.append(issues);
   }catch{
    review.dataset.addDayState='unknown';review.append(node('p','Полный день пока не рассчитан. Посещение можно сохранить и выбрать дорогу в «Моём дне».','visit-add-outcome'));
   }
   preview=candidate;save.textContent=candidate.alreadyAdded?'Открыть этот день':'Добавить в этот день';save.disabled=false;status.textContent='';
  }catch(error){if(ticket===sequence){status.textContent=errorText(error);retry.hidden=false;}}
 }
 select.addEventListener('change',()=>update());retry.addEventListener('click',()=>update());
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(pending||!preview)return;pending=true;save.disabled=true;close.disabled=true;select.disabled=true;note.disabled=true;retry.hidden=true;
  status.textContent='Сохраняем посещение…';
  try{
   const result=await memory.change(current=>confirmServiceAdd(current,preview,note.value),{label:'Посещение добавлено в день'});
   if(result.conflict){preview=null;status.textContent='Поездка изменилась в другой вкладке. Проверьте день ещё раз.';retry.hidden=false;return;}
   form.hidden=true;receipt.hidden=!result.saved;
   status.textContent=result.saved?`Сохранено в вашем дне · ${dateText(selection.visit.input.date)}.`:'Посещение осталось в этой вкладке. Браузер не смог сохранить его. Скачайте файл поездки.';
   download.hidden=result.saved;
   if(result.saved&&opener){opener.textContent='В вашем дне ✓';opener.dataset.visitSaved='true';}
   (result.saved?open:download).focus();document.dispatchEvent(new CustomEvent('godune:useful-action',{detail:'service_visit_added'}));
  }catch(error){preview=null;status.textContent=errorText(error);retry.hidden=false;}
  finally{pending=false;save.disabled=!preview;close.disabled=false;select.disabled=false;note.disabled=false;}
 });
 dialog.showModal();select.focus();await update();return dialog;
}

export function initServiceVisits({mount,read,commit,base,catalog,onExpense}){
 if(!mount)return {render(){}};
 const section=node('section',undefined,'trip-service-visits');section.hidden=true;section.setAttribute('aria-labelledby','service-visits-heading');
 const heading=node('h3','Ваши посещения');heading.id='service-visits-heading';heading.tabIndex=-1;
 const list=node('div',undefined,'visit-list'),feedback=node('p',undefined,'visit-feedback');feedback.setAttribute('role','status');section.append(heading,list,feedback);
 const preferences=mount.querySelector('#journey-preferences');if(preferences)preferences.before(section);else(mount.querySelector('.workshop-main')||mount).append(section);
 const settings=node('details',undefined,'visit-settings'),settingsTitle=node('summary','Заметки и условия посещений');settings.append(settingsTitle,list);feedback.before(settings);
 const onSettings=entry=>{
  const target=entry.kind==='service'?[...list.querySelectorAll('[data-saved-visit]')].find(n=>n.dataset.savedVisit===entry.id):[...mount.querySelectorAll('[data-plan-point]')].find(n=>n.dataset.planPoint===entry.id);
  if(entry.kind==='service')settings.open=true;
  for(let parent=target?.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
  if(target){target.tabIndex=-1;target.focus({preventScroll:true});target.scrollIntoView({block:'nearest',behavior:'auto'});}
 };
 const check=initServiceDayCheck({heading,read,commit,base,catalog,onSettings,onExpense});
 let sequence=0,last,currentDay,wasMixed;
 section.addEventListener('focusout',()=>queueMicrotask(()=>render()));
 async function render(){
  const day=selectedDay(read());
  const mixed=validTimeline(day.timeline)||usesJourneyBoundaries(day,catalog);
  section.hidden=!hasServiceVisits(day)&&!Object.hasOwn(day,'timeline')&&!Object.hasOwn(day,'transfer_connections')&&!mixed;if(!section.hidden)style();
  heading.textContent=mixed?'Ваш день по порядку':'Ваши посещения';settingsTitle.hidden=!mixed;
  if(mixed!==wasMixed){settings.open=!mixed;wasMixed=mixed;}
  check.render();
  // Keep the editor when focus moves from its field to Save or Cancel, too.
  // A newer tab's note is checked against the original snapshot on submit.
  if(currentDay===day.id&&section.querySelector('.visit-note-editor:not([hidden])'))return;
  const rows=serviceVisitRows(day),stamp=JSON.stringify([day.id,day.date,rows,day.costs,read().itinerary?.days.map(d=>[d.id,d.date])]);if(stamp===last)return;last=stamp;currentDay=day.id;
  const ticket=++sequence;
  if(!rows.length){list.replaceChildren();return;}style();
  const items=rows.map(visit=>{
   const article=node('article',undefined,'saved-visit');article.dataset.savedVisit=visit?.id||'';
   const context=serviceVisitContext(visit,day),content=node('div');
   content.append(node('p',categories[visit?.category]||'Посещение','visit-category'),node('h4',typeof visit?.name==='string'?visit.name:'Сохранённое посещение'));
   const detail=node('p','Проверяем выбранное посещение…','visit-facts'),rental=node('div');content.append(detail,rental);
   const selection=serviceSelectionElement(visit);if(selection)detail.before(selection);
   if(context==='unsupported')detail.textContent='Сохранено в другой версии. Файл поездки сохранит эти сведения.';
   else if(context!=='ready')detail.textContent=`Выбрано на ${dateText(visit.selection.visit.input.date)}. ${day.date?'Дата дня изменилась.':'Выберите дату дня, чтобы пересчитать.'}`;
   if(visit?.note)content.append(node('p',visit.note,'visit-note'));
   article.append(content);
   if(context==='unsupported')return {article};
   const controls=node('div',undefined,'visit-actions'),edit=button('Заметка'),remove=button('Убрать');controls.append(edit,remove);article.append(controls);
   if(read().itinerary?.days.length>1){
    const move=button('В другой день');controls.prepend(move);
    move.addEventListener('click',async()=>{
     move.disabled=true;
     try{const {openServiceMove}=await import('./trip-service-move-ui.mjs?v=3');await openServiceMove({read,commit,base,catalog,sourceId:day.id,visitId:visit.id,opener:move});}
     catch(error){feedback.textContent=errorText(error);}finally{move.disabled=false;}
    });
   }
   const expense=serviceExpenseButton({day,visit,onExpense});if(expense)controls.prepend(expense);
   const editor=node('form',undefined,'visit-note-editor');editor.hidden=true;const label=node('label','Заметка для себя'),field=node('textarea');field.rows=3;field.value=visit.note;label.append(field);
   const save=node('button','Сохранить заметку','visit-primary');save.type='submit';const cancel=button('Отмена');editor.append(label,save,cancel);article.append(editor);
   edit.addEventListener('click',()=>{editor.hidden=false;field.focus();});cancel.addEventListener('click',()=>{editor.hidden=true;edit.focus();render();});
   editor.addEventListener('submit',async event=>{
    event.preventDefault();save.disabled=true;
    try{
     const result=await commit(current=>{
      const latest=current.itinerary?.days.find(d=>d.id===day.id)?.service_visits?.find(v=>v.id===visit.id);
      if(!latest||latest.note!==visit.note)throw Error('Заметка изменилась в другой вкладке. Закройте её и откройте заново.');
      return changeServiceVisitNote(current,visit.id,field.value,day.id);
     },'Заметка сохранена.');
     if(!result.conflict){editor.hidden=true;last=null;await render();heading.focus({preventScroll:true});}
    }catch(error){feedback.textContent=errorText(error);}finally{save.disabled=false;}
   });
   remove.addEventListener('click',async()=>{
    remove.disabled=true;
    try{await commit(current=>removeServiceVisit(current,visit.id,day.id),'Посещение убрано из дня.');const target=section.hidden?mount.querySelector('#my-trip-title'):heading;target?.setAttribute('tabindex','-1');target?.focus({preventScroll:true});}
    catch(error){feedback.textContent=errorText(error);}finally{remove.disabled=false;}
   });
   if(context==='date_changed'){
    const recalc=button('Пересчитать на дату дня');controls.prepend(recalc);
    recalc.addEventListener('click',async()=>{
     recalc.disabled=true;
     try{
      const engine=await loadScheduler(base),updated=structuredClone(visit);updated.selection.visit.input.date=day.date;
      updated.selection.participants.booking={status:'not_booked',notice_minutes:null};updated.saved_at=new Date().toISOString();
      const prepared=engine.serviceTrip(updated);
      await commit(current=>{
       const latest=current.itinerary?.days.find(d=>d.id===day.id);
       if(latest?.date!==day.date||JSON.stringify(latest.service_visits?.find(v=>v.id===visit.id))!==JSON.stringify(visit))throw Error('Посещение изменилось. Проверьте его заново.');
       return replaceServiceVisit(current,prepared,visit.id,day.id);
      },'Посещение пересчитано на дату дня.');
     }catch(error){feedback.textContent=errorText(error);}finally{recalc.disabled=false;}
    });
   }
   return {article,detail,rental,visit,context};
  });
  list.replaceChildren(...items.map(item=>item.article));
  try{
   const engine=await loadScheduler(base);if(ticket!==sequence)return;
   for(const item of items)if(item.context==='ready')try{
    const result=engine.serviceTrip(item.visit).assessment;
    item.detail.textContent=`${clock(item.visit.selection.visit.input.arrival)} → ${clock(result.summary.departure)} · ${money(result.summary.cost_total)}. ${states[result.state]}.`;
    const facts=rentalFactsElement(item.visit,result);item.rental.replaceChildren(...(facts?[facts]:[]));
   }catch{item.detail.textContent='Сведения о посещении нужно проверить. Сохранённый выбор остаётся в файле поездки.';}
  }catch{if(ticket===sequence)for(const item of items)if(item.context==='ready')item.detail.textContent='Расчёт не загрузился. Посещение остаётся в вашем дне.';}
 }
 return {render};
}
