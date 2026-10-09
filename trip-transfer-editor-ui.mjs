import {selectedDay} from './trip-days-state.mjs?v=25';
import {transferEditorPairs,publishedTransferRoutes,buildTransferChoice,setJourneyBoundary} from './trip-transfer-editor-state.mjs?v=6';
import {bookingEffects} from './trip-bookings-state.mjs?v=2';
import {canConfigureJourneyBoundaries} from './day-journey-boundaries.mjs?v=3';
import {baseName} from './personal-points.mjs?v=3';
import {pickPersonalPoint} from './personal-point-picker.mjs?v=6';
import {saveTransferConnection,removeTransferConnection,transferConnectionGuard} from './trip-transfer-connections-state.mjs';
import {loadScheduler} from './trip-scheduler.mjs?v=40';
import {inspectTripServiceDay} from './trip-service-day-state.mjs?v=5';
import {loadTripTravelMatrix} from './travel-estimates.mjs?v=11';
import {transferClock} from './trip-service-transfer-view.mjs';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const button=(text,cls='transfer-secondary')=>{const n=el('button',text,cls);n.type='button';return n;};
const minutes=input=>input.value.trim()===''?null:Number(input.value);
const message=e=>/[А-Яа-яЁё]/.test(e?.message||'')?e.message:'Дорога пока не прочитана. Ваш день на месте.';
function numeric(label,value=null){const field=el('label',undefined,'transfer-field'),input=el('input');input.type='number';input.min='0';input.max='1440';input.step='1';input.inputMode='numeric';if(value!==null)input.value=String(value);field.append(el('span',label),input);return {field,input};}
function select(label,rows,value){const field=el('label',undefined,'transfer-field'),input=el('select');for(const [id,name] of rows){const option=el('option',name);option.value=id;input.append(option);}if(value!==undefined)input.value=value;field.append(el('span',label),input);return {field,input};}
function styles(base){if(document.querySelector('[data-transfer-editor-css]'))return;const css=el('link');css.rel='stylesheet';css.href=new URL('trip-transfer-editor.css?v=2',base);css.dataset.transferEditorCss='';document.head.append(css);}
export function initTransferEditor({host,read,commit,catalog,base}){
 const opener=button('Дорога дня','wave-tools-link');host.append(opener);
 const status=el('p',undefined,'transfer-receipt');status.setAttribute('role','status');host.after(status);
 let dialog,loading=false;
 async function open(){
  if(loading||dialog?.open)return;loading=true;opener.disabled=true;status.textContent='';styles(base);
  const snapshot=structuredClone(read()),day=selectedDay(snapshot),guard=transferConnectionGuard(snapshot);
  try{
   const pairs=transferEditorPairs(snapshot,catalog);
   if(day.kosa_plan)throw Error('Дорога на косу уже выбрана в настройках этого дня.');
   const [engine,matrix,bus]=await Promise.all([loadScheduler(base),loadTripTravelMatrix(base,snapshot,catalog).catch(()=>null),fetch(new URL('data/kosa-bus-210.json',base)).then(r=>r.ok?r.json():null).catch(()=>null)]);
   const routes=publishedTransferRoutes(catalog,day.date,bus);
   dialog=el('dialog',undefined,'transfer-dialog');dialog.setAttribute('aria-labelledby','transfer-editor-title');
   const form=el('form'),heading=el('h2','Дорога дня');heading.id='transfer-editor-title';
   const close=button('Закрыть','transfer-close'),top=el('div',undefined,'transfer-heading');top.append(heading,close);form.append(top);
   close.addEventListener('click',()=>dialog.close());
   dialog.append(form);document.body.append(dialog);
   const ownedDialog=dialog;let reopen=false;
   ownedDialog.addEventListener('close',()=>{ownedDialog.remove();if(dialog===ownedDialog)dialog=null;opener.focus({preventScroll:true});if(reopen)queueMicrotask(open);},{once:true});
   const configureBoundaries=canConfigureJourneyBoundaries(day);
   if(configureBoundaries){
   const boundaries=el('section',undefined,'transfer-boundaries'),bookings=bookingEffects(snapshot);
   boundaries.append(el('h3','Начало и возвращение'));
   for(const [field,label,booking] of [['start_at','Начать день',bookings.start],['night_at','Вернуться к вечеру',bookings.night]]){
    const value=booking?.location||day[field],row=el('div',undefined,'transfer-boundary'),copy=el('div');
    copy.append(el('strong',label),el('span',value?baseName(value,catalog):'Точка ещё не выбрана'));
    if(booking)copy.append(el('small',`Из записи «${booking.name}»`));
    const edit=button(value?'Изменить':'Выбрать'),clear=button('Убрать');clear.hidden=!value;clear.setAttribute('aria-label',`Убрать: ${label.toLowerCase()}`);row.append(copy,edit,clear);boundaries.append(row);
    async function change(remove=false){
     if(transferConnectionGuard(read())!==guard){status.textContent='День изменился. Откройте дорогу заново.';dialog.close();return;}
     const point=remove?null:await pickPersonalPoint({base,initial:value,caption:label,focusPlace:catalog.poi.find(p=>p.slug===day.places[0]),saveLabel:'Выбрать точку'});
     if(!remove&&!point)return;
     edit.disabled=true;clear.disabled=true;
     try{
      const result=await commit(t=>setJourneyBoundary(t,field,point,guard),'Точка дня сохранена.');
      if(result.conflict)throw Error('День изменился. Откройте дорогу заново.');
      status.textContent=result.saved?'Точка дня сохранена.':'Точка открыта в этой вкладке. Скачайте файл поездки через «Ещё».';
      reopen=true;ownedDialog.close();
     }catch(error){status.textContent=message(error);edit.disabled=false;clear.disabled=false;}
    }
    edit.addEventListener('click',()=>change());clear.addEventListener('click',()=>change(true));
   }
   if(bookings.end)boundaries.append(el('p',`Отъезд: ${baseName(bookings.end.location,catalog)} · ${transferClock(bookings.end.time)}. Запас ${bookings.end.buffer} мин.`, 'transfer-source'));
   form.append(boundaries);
   }
   if(!pairs.length){form.append(el('p',configureBoundaries?'Добавьте остановку и выберите начало или возвращение, чтобы настроить дорогу.':'Добавьте ещё остановку, чтобы настроить дорогу между местами.','transfer-preview'));dialog.showModal();close.focus();return;}
   const pairField=select('Участок пути',pairs.map(p=>[p.key,p.name]));form.append(pairField.field);
   const date=el('p',day.date?new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(day.date+'T12:00:00Z')):'Сначала укажите дату дня.','transfer-date');form.append(date);
   const tabs=el('div',undefined,'transfer-tabs');tabs.setAttribute('aria-label','Способ дороги');
   const direct=button('Своим ходом'),transport=button('Транспорт');tabs.append(direct,transport);form.append(tabs);
   const fields=el('div',undefined,'transfer-chain'),preview=el('p',undefined,'transfer-preview');preview.setAttribute('role','status');form.append(fields,preview);
   const note=el('textarea');note.rows=2;const noteField=el('label',undefined,'transfer-field');noteField.append(el('span','Заметка для себя'),note);form.append(noteField);
   const actions=el('div',undefined,'transfer-actions'),save=button('Сохранить дорогу','transfer-primary');save.type='submit';const remove=button('Убрать выбранную дорогу'),cancel=button('Отмена');actions.append(save,remove,cancel);form.append(actions);
   const feedback=el('p',undefined,'transfer-feedback');feedback.setAttribute('role','status');form.append(feedback);
   cancel.addEventListener('click',()=>dialog.close());
   dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const rect=dialog.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)dialog.close();});
   let type='direct',modeField,duration,rideFields=[],lastWalk,pending=false,obsolete=false;
   const pair=()=>pairs.find(p=>p.key===pairField.input.value);
   const pickedRides=()=>rideFields.map(row=>{const route=routes.find(r=>r.id===row.route.input.value);return {route,ride:route?.rides.find(r=>r.id===row.ride.input.value)};});
   function choice(){return buildTransferChoice({trip:snapshot,catalog,pair:pair(),mode:modeField?.input.value||'foot',minutes:duration?minutes(duration.input):null,rides:type==='transport'?pickedRides():[],walks:type==='transport'?[...rideFields.map(row=>minutes(row.walk.input)),minutes(lastWalk.input)]:[],boarding:rideFields.map(row=>minutes(row.boarding.input)),note:note.value});}
   function inspect(){
    if(pending)return;
    obsolete=rideFields.some(row=>row.obsolete);
    save.disabled=!pair().available||!day.date||obsolete||type==='transport'&&!routes.length;
    if(!pair().available){preview.textContent='Сначала выберите точку входа или выхода у посещения.';return;}
    if(!day.date){preview.textContent='Дату можно выбрать в настройках дня.';return;}
    if(obsolete){preview.textContent='Сохранённого рейса больше нет в этой таблице. Выберите актуальный рейс перед заменой.';return;}
    if(transferConnectionGuard(read())!==guard){save.disabled=true;preview.textContent='День изменился. Закройте окно и откройте дорогу заново.';return;}
    try{
     const next=saveTransferConnection(snapshot,choice(),engine,guard),result=inspectTripServiceDay(engine,next,catalog,matrix);
     const selected=result.itinerary?.connections.find(c=>c.selection&&c.selection.from.kind===pair().from.kind&&c.selection.from.id===pair().from.id&&c.selection.to.kind===pair().to.kind&&c.selection.to.id===pair().to.id);
     const journey=selected?.journey;
     const missed=journey?.transfers.find(t=>['missed','risk','cancelled','blocked','conflict'].includes(t.status));
     const departureOnly=journey?.transfers.find(t=>t.status==='unknown'&&t.departure!=null&&t.ride?.arrival==null);
     preview.dataset.state=missed?'conflict':journey?.state||'needs_info';
     preview.textContent=missed?({missed:'На выбранный рейс не успеваем.',risk:'По вашей оценке есть риск опоздать на посадку.',cancelled:'Выбранный рейс отменён.',blocked:'Этот участок недоступен.',conflict:'В цепочке есть противоречие.'}[missed.status]):journey?.finish!=null?`Прибытие: ${transferClock(journey.finish)}${journey.finish_precision==='estimate'?' · по вашей оценке дороги':''}. ${journey.wait_minutes?`Ожидание: ${journey.wait_minutes} мин. `:''}${journey.state==='fits'?'':'Часть условий ещё нужно уточнить.'}`:departureOnly?`Отправление: ${transferClock(departureOnly.departure)}. Время прибытия не опубликовано.`:'Не хватает времени подхода или условий рейса. Выбор можно сохранить и дополнить.';
    }catch(error){console.warn('GoDune transfer preview:',error.message);save.disabled=true;preview.textContent=message(error);preview.dataset.state='needs_info';}
   }
   function rideCard(saved=null,walk=null){
    const card=el('section',undefined,'transfer-leg');card.append(el('h3',rideFields.length?'Пересадка':'До остановки'));
    const approach=numeric(rideFields.length?'Сколько идти между остановками · мин':'Сколько идти до остановки · мин',walk);card.append(approach.field);
    const routeField=select('Маршрут',[['','Выберите маршрут'],...routes.map(r=>[r.id,r.name])]);card.append(routeField.field);
    const row={card,walk:approach,route:routeField,ride:null,obsolete:false,boarding:numeric('Запас на посадку · мин',saved?.boarding_minutes??10)},source=el('p',undefined,'transfer-source');
    const removeRide=button('Убрать пересадку');removeRide.hidden=!rideFields.length;
    card.append(row.boarding.field,source,removeRide);
    function changeRoute(selectedRide){
     row.ride?.field.remove();const route=routes.find(r=>r.id===row.route.input.value);
     row.ride=select('Выберите рейс',[['','Выберите время'],...(route?.rides||[]).map(r=>[r.id,`${transferClock(r.departure)} → ${transferClock(r.arrival)}`])],selectedRide);
     row.boarding.field.before(row.ride.field);
     source.replaceChildren();if(route){const link=el('a',`Источник расписания · ${route.source.checked_at}`);link.href=route.source.reference;link.target='_blank';link.rel='noopener';source.append(link);if(route.note)source.append(el('span',route.note));if(route.state==='unknown')source.append(el('span','Календарь движения на эту дату не опубликован.'));}
     row.ride.input.addEventListener('change',()=>{row.obsolete=false;inspect();});
    }
    routeField.input.addEventListener('change',()=>{row.obsolete=false;changeRoute();inspect();});
    if(saved){const route=routes.find(r=>r.rides.some(v=>v.id===saved.id&&v.departure===saved.departure&&v.arrival===saved.arrival));if(route)routeField.input.value=route.id;else row.obsolete=true;}
    changeRoute(saved?.id);
    removeRide.addEventListener('click',()=>{rideFields=rideFields.filter(r=>r!==row);card.remove();inspect();});
    rideFields.push(row);fields.append(card);
   }
   function renderFields(loadSaved=false){
    fields.replaceChildren();rideFields=[];modeField=null;duration=null;obsolete=false;
    const saved=loadSaved?pair().saved:null;note.value=loadSaved?saved?.note||'':note.value;remove.hidden=!pair().saved;
    direct.setAttribute('aria-pressed',String(type==='direct'));transport.setAttribute('aria-pressed',String(type==='transport'));
    if(type==='direct'){
     modeField=select('Как добраться',[['foot','Пешком'],['bike','На велосипеде'],['car','На машине']],saved?.steps[0]?.mode||'foot');
     duration=numeric('Ваша оценка времени в пути · мин',saved?.graph.links[0]?.claim?.minutes??null);fields.append(modeField.field,duration.field);
    }else{
     if(!routes.length)fields.append(el('p','Для этой даты в базе пока нет рейсов.'));
     const chosen=saved?.steps.filter(s=>s.kind==='ride')||[];
     if(chosen.length)chosen.forEach((step,i)=>rideCard(step.ride,saved.graph.links[i]?.claim?.minutes??null));else rideCard();
     const add=button('+ Ещё пересадка');fields.append(add);add.addEventListener('click',()=>{rideCard();fields.insertBefore(rideFields.at(-1).card,add);inspect();});
     lastWalk=numeric('Сколько идти от остановки до места · мин',saved?.graph.links.at(-1)?.claim?.minutes??null);fields.append(lastWalk.field);
    }
    inspect();
   }
   pairField.input.addEventListener('change',()=>{type=pair().saved?.steps.some(s=>s.kind==='ride')?'transport':'direct';renderFields(true);});
   direct.addEventListener('click',()=>{type='direct';renderFields();});transport.addEventListener('click',()=>{type='transport';renderFields();});
   form.addEventListener('input',inspect);form.addEventListener('change',inspect);
   async function write(transform,text,action='day_transfer_saved'){
    if(pending)return;pending=true;form.querySelectorAll('button,input,select,textarea').forEach(n=>n.disabled=true);feedback.textContent='Сохраняем дорогу…';
    try{const result=await commit(transform,text);if(result.conflict)throw Error('День изменился. Откройте дорогу заново.');status.textContent=result.saved?text:'Выбор открыт в этой вкладке. Скачайте файл поездки через «Ещё».';dialog.close();document.dispatchEvent(new CustomEvent('godune:useful-action',{detail:action}));}
    catch(error){feedback.textContent=message(error);pending=false;form.querySelectorAll('button,input,select,textarea').forEach(n=>n.disabled=false);inspect();}
   }
   form.addEventListener('submit',e=>{e.preventDefault();try{const selected=choice();write(t=>saveTransferConnection(t,selected,engine,guard),'Дорога сохранена в вашем дне.');}catch(error){feedback.textContent=message(error);}});
   remove.addEventListener('click',()=>write(t=>removeTransferConnection(t,pair().saved.id,guard),'Выбранная дорога убрана.','day_transfer_removed'));
   type=pair().saved?.steps.some(s=>s.kind==='ride')?'transport':'direct';renderFields(true);dialog.showModal();pairField.input.focus();
  }catch(error){status.textContent=message(error);}
  finally{loading=false;opener.disabled=false;}
 }
 opener.addEventListener('click',open);
 return {render(){try{const day=selectedDay(read());opener.hidden=!!day.kosa_plan;}catch{opener.hidden=true;}}};
}
