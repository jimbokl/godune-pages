import {loadScheduler} from './trip-scheduler.mjs?v=42';
import {budgetInput} from './trip-days-state.mjs?v=26';
import {serviceMoveTargets,prepareServiceMove,confirmServiceMove,inspectServiceMoveDay} from './trip-service-move-state.mjs?v=2';
import {loadTripTravelMatrix} from './travel-estimates.mjs?v=12';
import {dayOutcome} from './day-outcome.mjs?v=1';
import {rentalFactsElement} from './trip-rental-view.mjs';
import {formatKopecks} from './trip-money.mjs';

const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const button=(text,cls='visit-secondary')=>{const n=node('button',text,cls);n.type='button';return n;};
const dateText=date=>date?new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z')):'без даты';
const clock=n=>n==null?'пока неизвестно':`${String(Math.floor(n/60)%24).padStart(2,'0')}:${String(n%60).padStart(2,'0')}${n>=1440?' следующего дня':''}`;
const money=n=>n==null?'сумма неизвестна':formatKopecks(n);
const errorText=error=>/[А-Яа-яЁё]/.test(error?.message||'')?error.message:'Не получилось проверить перенос. Попробуйте ещё раз.';

export async function openServiceMove({read,commit,base,catalog,sourceId,visitId,opener}){
 const targets=serviceMoveTargets(read(),sourceId);if(!targets.length)return;
 const dialog=node('dialog',undefined,'visit-dialog visit-move-dialog');dialog.setAttribute('aria-labelledby','visit-move-title');
 const close=button('×','visit-close');close.setAttribute('aria-label','Закрыть');
 const title=node('h2','Перенести в другой день');title.id='visit-move-title';
 const form=node('form',undefined,'visit-picker'),label=node('label','В какой день?'),select=node('select');select.name='move_day';
 for(const day of targets){const option=node('option',`День ${day.number} · ${dateText(day.date)}`);option.value=day.id;select.append(option);}
 label.append(select);
 const review=node('div',undefined,'visit-move-review');review.setAttribute('aria-live','polite');
 const save=node('button','Перенести и открыть день','visit-primary');save.type='submit';save.disabled=true;
 const cancel=button('Отмена'),status=node('p',undefined,'visit-feedback');status.setAttribute('role','status');
 const retry=button('Проверить ещё раз');retry.hidden=true;
 const download=button('Скачать файл поездки');download.hidden=true;
 download.addEventListener('click',async()=>{const {downloadTripFile}=await import('./trip-file.mjs?v=30');downloadTripFile(read(),catalog);});
 form.append(label,review,save,cancel);dialog.append(close,title,form,status,retry,download);document.body.append(dialog);
 let sequence=0,preview,pending=false;
 const returnFocus=()=>{const target=opener?.isConnected?opener:document.querySelector('#my-trip-title');target?.setAttribute('tabindex','-1');target?.focus({preventScroll:true});};
 close.addEventListener('click',()=>dialog.close());cancel.addEventListener('click',()=>dialog.close());
 dialog.addEventListener('cancel',event=>{if(pending)event.preventDefault();});
 dialog.addEventListener('close',()=>{sequence++;dialog.remove();returnFocus();},{once:true});
 async function update(){
  const ticket=++sequence;preview=null;save.disabled=true;retry.hidden=true;review.replaceChildren();status.textContent='Проверяем новый день…';
  try{
   const engine=await loadScheduler(base);if(ticket!==sequence)return;
   const draft=structuredClone(read()),prepared=prepareServiceMove(engine,draft,visitId,sourceId,select.value);
   const matrix=prepared.trip.places.length?await loadTripTravelMatrix(base,prepared.trip,catalog).catch(()=>null):null;
   if(ticket!==sequence)return;
   const {visit,assessment}=prepared,summary=node('div',undefined,'visit-summary');
   summary.append(node('h3',visit.name),node('p',`${dateText(visit.selection.visit.input.date)} · ${clock(visit.selection.visit.input.arrival)} → ${clock(assessment.summary.departure)}`,'visit-facts'),node('p',`По выбранному тарифу: ${money(assessment.summary.cost_total)}`,'visit-facts'));
   const rental=rentalFactsElement(visit,assessment);if(rental)summary.append(rental);
   if(assessment.state!=='fits')summary.append(node('p',assessment.state==='does_not_fit'?'Время или условия не подходят. Измените посещение перед выходом.':'Часть времени или условий посещения нужно уточнить.','visit-assessment'));
   review.append(summary);
   try{
    const check=inspectServiceMoveDay(engine,prepared,catalog,matrix),result=node('p',dayOutcome(check),'visit-move-outcome');result.dataset.moveDayState=check.state;review.append(result);
    const issues=node('ul',undefined,'visit-day-issues');
    for(const overlap of check.overlaps)issues.append(node('li',`Посещения пересекаются на ${overlap.minutes} мин.`));
    if(check.issues.some(row=>row.code==='outside_day_window'))issues.append(node('li','Посещение выходит за время дня или выбранные рейсы.'));
    if(check.issues.some(row=>row.code==='service_connections_unknown'))issues.append(node('li','Дорогу между остановками нужно выбрать в новом дне.'));
    if(issues.childElementCount)review.append(issues);
   }catch{review.append(node('p','Полный день пока не рассчитан. После переноса проверьте дорогу и возвращение.','visit-move-outcome'));}
   const notes=[];
   if(prepared.bookingReset)notes.push('Запись на прежнюю дату не переносится. Новую запись нужно подтвердить отдельно.');
   if(prepared.expenses)notes.push('Записанные расходы, платежи и возвраты перейдут вместе с посещением. Их суммы сохранятся.');
   if(prepared.unresolvedExpenses)notes.push('Часть расходов останется в исходном дне: их формат или общий бюджет категории не позволяют перенести суммы автоматически.');
   if(prepared.roads)notes.push('Выбранные пересадки останутся в исходном дне. Дорогу к посещению выберите заново.');
   for(const note of notes)review.append(node('p',note,'visit-day-footnote'));
   if(prepared.expenses)try{
    const ledger=engine.budget(budgetInput(prepared.trip)),target=ledger.days.find(day=>day.id===prepared.targetId);
    if(target)review.append(node('p',`Расходы нового дня: ${money(target.total)}`,'visit-facts'));
   }catch{/* The unchanged ledger remains available in the day itself. */}
   preview=prepared;save.disabled=false;status.textContent='';
  }catch(error){if(ticket===sequence){status.textContent=errorText(error);retry.hidden=false;}}
 }
 retry.addEventListener('click',()=>update());
 select.addEventListener('change',()=>update());
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(pending||!preview)return;pending=true;save.disabled=true;select.disabled=true;close.disabled=true;cancel.disabled=true;status.textContent='Переносим посещение…';
  try{
   const result=await commit(current=>confirmServiceMove(current,preview),'Посещение перенесено в выбранный день.');
   if(result.conflict){preview=null;status.textContent='Поездка изменилась. Проверьте перенос заново.';retry.hidden=false;return;}
   form.hidden=true;
   if(result.saved){status.textContent='Посещение перенесено и сохранено. Открыт новый день.';close.disabled=false;close.focus();}
   else{status.textContent='Перенос остался в этой вкладке. Браузер не смог сохранить его. Скачайте файл поездки.';download.hidden=false;download.focus();}
  }catch(error){preview=null;status.textContent=errorText(error);retry.hidden=false;}
  finally{pending=false;select.disabled=false;close.disabled=false;cancel.disabled=false;save.disabled=!preview;}
 });
 dialog.showModal();select.focus();await update();return dialog;
}
