import {selectedDay,journeyDays,ensureJourney,chooseTripDay} from './trip-days-state.mjs';
import {selectMenuChoice,removeMenuChoice} from './trip-menu-choices-state.mjs';
import {validMenuChoice,menuChoiceRows} from './trip-menu-choices-contract.mjs';
import {menuChoiceGuide} from './trip-menu-choices-view.mjs?v=2';
import {formatKopecks} from './trip-money.mjs';
import {prepareMenuChoice,confirmMenuChoice,quoteMenuDay,menuQuoteText} from './trip-menu-preview.mjs?v=2';
import {loadScheduler} from './trip-scheduler.mjs?v=42';
import {dayChangeBaseline,inspectTripDayChange} from './trip-day-change-state.mjs?v=2';
import {dayChangeText} from './trip-day-change-view.mjs?v=1';
import {loadTripTravelMatrix} from './travel-estimates.mjs?v=12';

import {linkedMenuExpense,menuExpenseText} from './trip-menu-expenses-contract.mjs';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const button=(text,cls='menu-choice-button')=>{const n=el('button',text,cls);n.type='button';return n;};
const quantity=value=>Number.isSafeInteger(value)&&value>0;
const compact=value=>value.replace(/\s/g,'');
const dateLabel=date=>date?new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z')):'';
export function menuChoiceMutationFeedback(result,action='update'){
 if(result?.conflict)return 'День изменился. Проверьте свежий выбор.';
 if(action==='remove')return result?.saved?'Блюдо убрано из дня.':'Блюдо убрано из черновика этой вкладки. Скачать его можно вместе с буклетом.';
 return result?.saved?'Выбор блюда сохранён.':'Выбор пока в этой вкладке. Скачать его можно вместе с буклетом.';
}
export function loadMenuChoiceStyles(base){
 if(document.querySelector('[data-menu-choice-styles]'))return;
 const link=el('link');link.rel='stylesheet';link.href=new URL('menu-choices.css?v=2',base);link.dataset.menuChoiceStyles='';document.head.append(link);
}
function quantityField(value){
 const label=el('label','Порции','menu-choice-quantity'),input=el('input');
 input.type='number';input.name='quantity';input.min='1';input.step='1';input.value=value;input.inputMode='numeric';input.required=true;
 label.append(input);return {label,input};
}
function target(trip){
 const day=selectedDay(trip),index=journeyDays(trip).findIndex(row=>row.id===day.id);
 return {id:day.id,date:day.date,label:`День ${index+1}${day.date?' · '+dateLabel(day.date):''}`};
}
export function menuChoiceFromTemplate(template,trip,count,now=new Date().toISOString()){
 if(!validMenuChoice(template)||!quantity(count))throw Error('invalid_menu_choice');
 return {...structuredClone(template),quantity:count,planned_date:selectedDay(trip).date,selected_at:now};
}
// A stale page or a mixed service-worker version cannot silently change the
// price, place or item behind the row the visitor is looking at.
export function menuTemplateMatchesRow(template,row,article){
 if(!validMenuChoice(template))return false;
 const price=template.price,display=price.amount_kopecks!==null?formatKopecks(price.amount_kopecks):price.from_kopecks!==null?'от '+formatKopecks(price.from_kopecks):price.label?.trim()||'Уточните цену';
 const source=article.querySelector('.food-source');
 return row.querySelector('.food-item-name')?.textContent===template.name
  &&row.querySelector('small')?.textContent===(template.portion?.trim()?template.portion:'Порция не указана')
  &&compact(row.querySelector('strong')?.textContent||'')===compact(display)
  &&source?.querySelector('time')?.getAttribute('datetime')===template.source.observed_at
  &&source?.querySelector('a')?.href===new URL(template.source.url).href;
}

export function initTripMenuChoices({mount,read,commit,catalog,base,onExpense}){
 loadMenuChoiceStyles(base);
 const section=el('section',undefined,'trip-menu-choices');section.setAttribute('aria-labelledby','trip-menu-choices-title');
 const heading=el('h4','Что попробовать');heading.id='trip-menu-choices-title';
 const list=el('ul',undefined,'trip-menu-choice-list'),status=el('p','','menu-choice-feedback');status.setAttribute('role','status');
 const summary=el('p','','menu-choice-total');
 section.append(heading,summary,list,status);mount.querySelector('.journey-tools, #journey-details').after(section);let sequence=0;
 function render(trip){
  const ticket=++sequence;
  const rows=menuChoiceGuide(selectedDay(trip));section.hidden=!rows.length;
  summary.textContent='';
  if(rows.length)loadScheduler(base).then(engine=>{if(ticket===sequence)summary.textContent=menuQuoteText(quoteMenuDay(engine,selectedDay(trip)));}).catch(()=>{
   if(ticket!==sequence)return;summary.replaceChildren(el('span','Стоимость порций не рассчитана. '));const retry=button('Повторить','menu-choice-link');retry.addEventListener('click',()=>render(read()));summary.append(retry);
  });
  list.replaceChildren(...rows.map(row=>{
   const item=el('li'),name=el('strong',row.name),place=el('p',row.place,'menu-choice-place'),price=el('p',row.price,'menu-choice-price');
   const details=el('p',[row.portion,`${row.quantity} порц.`].filter(Boolean).join(' · '),'menu-choice-detail');
   const actions=el('div',undefined,'menu-choice-actions'),edit=button('Изменить порции','menu-choice-link'),remove=button('Убрать','menu-choice-link');
   const form=el('form',undefined,'menu-choice-edit');form.hidden=true;const {label,input}=quantityField(row.quantity),save=button('Сохранить');save.type='submit';form.append(label,save);
   edit.setAttribute('aria-expanded','false');edit.addEventListener('click',()=>{form.hidden=!form.hidden;edit.setAttribute('aria-expanded',String(!form.hidden));if(!form.hidden)input.focus();});
   const expected=target(trip),snapshot=JSON.stringify(menuChoiceRows(selectedDay(trip)));
   async function update(change,action='update'){
    remove.disabled=save.disabled=true;
    try{
     const result=await commit(current=>{
      if(target(current).id!==expected.id||target(current).date!==expected.date||JSON.stringify(menuChoiceRows(selectedDay(current)))!==snapshot)throw Error('menu_choice_context_changed');
      return change(current);
     },'Выбор блюда сохранён.');
     status.textContent=menuChoiceMutationFeedback(result,action);
    }catch{status.textContent='День изменился. Проверьте свежий выбор и повторите действие.';render(read());}
    finally{remove.disabled=save.disabled=false;}
   }
   remove.addEventListener('click',async()=>{await update(current=>removeMenuChoice(current,row.id,catalog),'remove');});
   form.addEventListener('submit',async event=>{event.preventDefault();const count=input.valueAsNumber;if(!quantity(count))return;await update(current=>selectMenuChoice(current,{...row.choice,quantity:count},catalog));});
   if(onExpense){
    const expense=button(linkedMenuExpense(selectedDay(trip),row.id)?'Открыть расход':'Учесть в бюджете');expense.dataset.menuExpense=row.id;
    expense.addEventListener('click',async()=>{expense.disabled=true;try{const result=await onExpense(row.id,JSON.stringify(trip));status.textContent=result?.message||'';}catch{status.textContent='Расход пока не добавлен. Попробуйте ещё раз.';}finally{expense.disabled=false;}});
    actions.append(expense);item.append(el('p',menuExpenseText(selectedDay(trip),row.id),'menu-choice-budget'));
   }
   actions.append(edit,remove);item.prepend(name,place,details,price);
   if(!row.poi)item.append(el('p','Отдельно от остановок','menu-choice-detail'));
   item.append(actions,form);return item;
  }));
 }
 return {render};
}

export function menuChoiceKey(explicit,m,c,i){
 if(explicit!==undefined)return /^\d+:\d+:\d+$/.test(explicit)?explicit:null;
 return `${m}:${c}:${i}`;
}
export function initDiningMenuChoices(root,base,{lazy=false}={}){
 const cache=new Map();let contextPromise,opened;
 async function context(){
  if(!contextPromise)contextPromise=(async()=>{
   const [{createTripMemory},{loadTrip},response]=await Promise.all([import('./trip-memory.mjs?v=25'),import('./trip-memory-bootstrap.mjs?v=4'),fetch(new URL('data/catalog.json',base),{cache:'no-cache'})]);
   if(!response.ok)throw Error('catalog_load');const catalog=await response.json();let storage;try{storage=localStorage;}catch{}
   const memory=createTripMemory(catalog,loadTrip(storage,catalog),storage);await memory.ready;
   document.addEventListener('visibilitychange',()=>{if(!document.hidden)memory.sync();});
   window.addEventListener('storage',()=>memory.sync());const engine=await loadScheduler(base);return {catalog,memory,engine};
  })().catch(error=>{contextPromise=null;throw error;});
  return contextPromise;
 }
 function openChoice(row,template,ctx){
  opened?.remove();loadMenuChoiceStyles(base);
  const form=el('form',undefined,'menu-choice-form'),status=el('p','','menu-choice-feedback');status.setAttribute('role','status');
  const dayLabel=el('label','В какой день','menu-choice-day'),daySelect=el('select');daySelect.name='menu-day';dayLabel.append(daySelect);
  const {label,input}=quantityField(menuChoiceRows(selectedDay(ctx.memory.get())).find(choice=>choice.menu_item_id===template.menu_item_id)?.quantity||1);
  const review=el('div',undefined,'menu-choice-review'),total=el('p','','menu-choice-total'),effect=el('p','','menu-choice-effect'),timing=el('p','','menu-choice-timing');review.append(total,effect,timing);
  const save=button('Добавить в день');save.type='submit';const cancel=button('Закрыть','menu-choice-link');
  cancel.addEventListener('click',()=>{++sequence;form.remove();row.querySelector('[data-menu-choose]').focus();});
  form.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();cancel.click();}});
  const actions=el('div',undefined,'menu-choice-actions');actions.append(save,cancel);form.append(dayLabel,label,review,actions,status);row.append(form);opened=form;
  let preview,revision,sequence=0;
  function refreshTargets(wanted=daySelect.value){
   const trip=ensureJourney(ctx.memory.get());daySelect.replaceChildren(...journeyDays(trip).map((day,index)=>{const option=el('option',`День ${index+1}${day.date?' · '+dateLabel(day.date):' · без даты'}`);option.value=day.id;return option;}));
   const extra=el('option','+ Новый день');extra.value='new';daySelect.append(extra);
   daySelect.value=[...daySelect.options].some(option=>option.value===wanted)?wanted:selectedDay(trip).id;
  }
  async function refreshPreview(){
   const ticket=++sequence;preview=null;save.disabled=true;total.textContent='';effect.textContent='';timing.textContent='';
   try{
    const trip=ctx.memory.get(),candidate=prepareMenuChoice(trip,template,input.valueAsNumber,daySelect.value,ctx.catalog);
    total.textContent=menuQuoteText(quoteMenuDay(ctx.engine,candidate.day));
    const exists=menuChoiceRows(candidate.day).some(choice=>choice.menu_item_id===template.menu_item_id)&&journeyDays(ensureJourney(trip)).some(day=>day.id===candidate.targetId&&menuChoiceRows(day).some(choice=>choice.menu_item_id===template.menu_item_id));
    const point=template.place?.poi_id,old=journeyDays(ensureJourney(trip)).find(day=>day.id===candidate.targetId);
    effect.textContent=point?(old?.places.includes(point)?'Заведение уже есть в остановках этого дня.':'Заведение добавится в остановки этого дня.'):'Блюдо сохранится в буклете; заведение пока отдельно от остановок.';
    preview=candidate;revision=ctx.memory.revision;save.disabled=false;save.textContent=exists?'Обновить порции':'Добавить в день';
    if(!point)return;
    save.disabled=true;timing.textContent='Сверяем время дня…';
    const projected=chooseTripDay(candidate.trip,candidate.targetId),baseline=dayChangeBaseline(trip,candidate.trip,candidate.targetId);
    const [beforeMatrix,matrix]=await Promise.all([baseline,projected].map(day=>loadTripTravelMatrix(base,day,ctx.catalog).catch(()=>null)));
    if(ticket!==sequence||!form.isConnected)return;
    const change=inspectTripDayChange(ctx.engine,baseline,projected,ctx.catalog,beforeMatrix,matrix),check=change.after;
    timing.textContent=dayChangeText(change).join(' ');
    timing.dataset.menuDayState=check.state;
    save.disabled=false;
   }catch(error){
    if(ticket!==sequence||!form.isConnected)return;
    if(preview){timing.textContent='Блюдо сохранится; время дня пока не рассчитано.';timing.dataset.menuDayState='needs_info';save.disabled=false;}
    else{status.textContent='Не удалось рассчитать выбор. Проверьте порции и повторите.';const retry=button('Повторить','menu-choice-link');retry.addEventListener('click',()=>{status.textContent='';refreshPreview();});status.append(retry);}
   }
  }
  refreshTargets();refreshPreview();input.focus();
  input.addEventListener('input',()=>{status.textContent='';refreshPreview();});
  daySelect.addEventListener('change',()=>{status.textContent='';refreshPreview();});
  form.addEventListener('submit',async event=>{
   event.preventDefault();if(!preview||save.disabled)return;const chosen=preview,expectedRevision=revision;
   save.disabled=daySelect.disabled=input.disabled=cancel.disabled=true;status.textContent='Сохраняем…';
   try{
    await ctx.memory.sync();
    const confirmed=confirmMenuChoice(ctx.memory.get(),chosen);
    const result=await ctx.memory.change(current=>{confirmMenuChoice(current,chosen);return confirmed;},{expectedRevision,label:'Блюдо добавлено в день'});
    if(result.conflict)throw Error('menu_choice_context_changed');
    refreshTargets(chosen.targetId);
    status.replaceChildren(el('span',result.saved?`Добавлено: ${daySelect.selectedOptions[0].textContent}.`:'Выбор пока в этой вкладке.'));
    if(result.saved){const link=el('a','Открыть поездку →');link.href=new URL('planner/#my-trip',base);status.append(link);}
    await refreshPreview();
   }catch{
    await ctx.memory.sync();refreshTargets();status.textContent='Поездка изменилась. Проверьте обновлённый день и нажмите ещё раз.';await refreshPreview();
   }finally{daySelect.disabled=input.disabled=cancel.disabled=false;save.disabled=!preview;}
  });
 }
 async function enhance(menu){
  const card=menu.closest('[data-dining-card]');if(!card||card.dataset.menuClosed==='true'||menu.dataset.menuChoicesReady==='true')return;
  loadMenuChoiceStyles(base);
  if(menu.dataset.menuChoicesLoading==='true')return;menu.dataset.menuChoicesLoading='true';
  let feedback=menu.querySelector('[data-menu-choice-load]');
  if(!feedback){feedback=el('p','','menu-choice-feedback');feedback.dataset.menuChoiceLoad='';feedback.setAttribute('role','status');menu.querySelector('.dining-menu-body').prepend(feedback);}
  try{
   const id=card.dataset.id;let request=cache.get(id);
   if(!request){request=fetch(new URL(`data/menu-choices/${encodeURIComponent(id)}.json`,base),{cache:'no-cache'}).then(async r=>{if(!r.ok)throw Error('menu_load');return r.json();}).catch(error=>{cache.delete(id);throw error;});cache.set(id,request);}
   const data=await request;if(data.version!==1||data.directory_id!==id||!data.items||Array.isArray(data.items))throw Error('menu_version');
   let count=0;
   menu.querySelectorAll('.food-menu-source').forEach((article,m)=>article.querySelectorAll('.food-menu-category').forEach((category,c)=>{
    let installed=false;
    function controls(){
     if(installed||!category.open)return;installed=true;
     [...category.querySelector('.food-menu-items').children].forEach((row,i)=>{
      const template=data.items[menuChoiceKey(row.dataset.menuKey,m,c,i)];if(!menuTemplateMatchesRow(template,row,article))return;
      const action=button('В день +','menu-choice-add');action.dataset.menuChoose=template.menu_item_id;action.setAttribute('aria-label',`Добавить ${template.name} в день`);
      action.addEventListener('click',async()=>{action.disabled=true;try{const ctx=await context();await ctx.memory.sync();openChoice(row,template,ctx);}catch{feedback.textContent='Поездка пока не загрузилась. Нажмите «В день +» ещё раз.';}finally{action.disabled=false;}});row.append(action);
     });
    }
    category.addEventListener('toggle',controls);controls();count+=Object.keys(data.items).some(key=>key.startsWith(`${m}:${c}:`))?1:0;
   }));
   menu.dataset.menuChoicesReady='true';feedback.textContent=count?'Выберите блюдо — добавим его в ваш день.':'';
  }catch{
   feedback.replaceChildren(el('span','Добавление в день пока не загрузилось. '));const retry=button('Повторить','menu-choice-link');retry.addEventListener('click',()=>enhance(menu));feedback.append(retry);
  }finally{delete menu.dataset.menuChoicesLoading;}
 }
 const observer=lazy&&typeof IntersectionObserver!=='undefined'?new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){if(entry.target.open)enhance(entry.target);observer.unobserve(entry.target);}}):null;
 root.querySelectorAll('[data-dining-menu]').forEach(menu=>{menu.addEventListener('toggle',()=>{if(menu.open)enhance(menu);});if(observer)observer.observe(menu);else if(menu.open)enhance(menu);});
}
