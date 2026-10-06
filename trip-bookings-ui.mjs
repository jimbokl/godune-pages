import {loadScheduler} from './trip-scheduler.mjs?v=22';
import {BOOKING_KINDS,BOOKING_STATUSES,bookingRows,bookingEffects,bookingProblem,saveBooking,deleteBooking,nextBookingId} from './trip-bookings-state.mjs?v=2';
import {ensureJourney,selectedDay} from './trip-days-state.mjs?v=22';
import {baseName} from './personal-points.mjs?v=3';
import {pickPersonalPoint} from './personal-point-picker.mjs?v=6';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const clock=n=>n===null?'Время ещё не записано':`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
const date=d=>d?new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z')):'Дата ещё не выбрана';
const context=t=>JSON.stringify({id:selectedDay(t).id,date:t.date,places:t.places,bookings:bookingRows(t)});
export function initTripBookings({section,read,commit,base,catalog}){
 const panel=section.closest('#my-trip')?.querySelector('#trip-bookings') || el('section',undefined,'trip-bookings');panel.id='trip-bookings';panel.className='trip-bookings';panel.setAttribute('aria-labelledby','booking-title');
 panel.innerHTML=`<div class="booking-heading"><div><p class="eyebrow">То, что уже намечено</p><h3 id="booking-title">Опорные точки дня</h3><p>Когда приезжаете, где ночуете, к какому часу нужен билет. Остальную прогулку соберём вокруг. <a href="${new URL('stay/',base).href}">Проверить базу поездки →</a></p></div><span class="booking-count" aria-label="Количество записей"></span></div><div class="booking-create" role="group" aria-label="Добавить запись"><button type="button" data-booking-add="arrival"><span aria-hidden="true">↘</span> Прибытие</button><button type="button" data-booking-add="lodging"><span aria-hidden="true">⌂</span> Ночёвка</button><button type="button" data-booking-add="activity"><span aria-hidden="true">◷</span> Экскурсия / билет</button><button type="button" data-booking-add="departure"><span aria-hidden="true">↗</span> Вылет / отъезд</button></div><div class="booking-flight-summary" role="status"></div><div class="booking-list"></div><p class="booking-feedback" role="status"></p>`;
 section.querySelector('#journey-details').before(panel);
 const dialog=el('dialog',undefined,'booking-dialog');dialog.id='booking-dialog';dialog.setAttribute('aria-labelledby','booking-dialog-title');
 dialog.innerHTML=`<div class="dialog-top"><p class="eyebrow">Ваша запись</p><button type="button" class="icon-button" data-booking-close aria-label="Закрыть запись">×</button></div><h2 id="booking-dialog-title"></h2><p class="booking-dialog-intro">Запишите то, что знаете. Пустые поля можно заполнить позже.</p><form id="booking-form"><div class="booking-fields"></div><fieldset class="booking-private"><legend>Только для вас</legend><p>Номер брони и личная заметка хранятся в этом браузере и файле поездки. В ссылку они не попадут.</p><label>Номер брони<input name="reference" type="text" autocomplete="off"></label><label>Личная заметка<textarea name="private_note" rows="2"></textarea></label></fieldset><p class="booking-error" role="alert"></p><div class="booking-form-actions"><button type="submit" class="button button-dark">Сохранить запись</button><button type="button" data-booking-close class="button button-light">Вернуться</button></div><p class="booking-local-note">Статус отмечаете вы. Сайт не проверяет бронь у заведения и не списывает оплату.</p></form>`;
 document.body.append(dialog);const $=s=>dialog.querySelector(s),feedback=s=>panel.querySelector('.booking-feedback').textContent=s;
 let draft,expected,lastFocus;
 function field(caption,name,type,value){const label=el('label',caption),input=el(type==='select'?'select':'input');input.name=name;if(type!=='select')input.type=type;input.value=value??'';label.append(input);$('.booking-fields').append(label);return input;}
 function select(caption,name,rows,value){const input=field(caption,name,'select','');for(const [v,t]of rows){const option=el('option',t);option.value=v;input.append(option);}input.value=value||'';return input;}
 function open(kind,row){
  const trip=read(),day=selectedDay(trip);expected=context(trip);lastFocus=document.activeElement;
  draft=row?structuredClone(row):{id:nextBookingId(trip),kind,name:'',status:'planned',date:day.date,time:null,duration:60,buffer:60,location:null,target:null,binding:'none',private:{reference:'',note:''}};
  $('#booking-dialog-title').textContent=row?'Изменить запись':BOOKING_KINDS[kind];$('.booking-fields').replaceChildren();$('.booking-error').textContent='';
  const name=field('Название','name','text',draft.name);name.required=true;name.placeholder=kind==='departure'?'Например, вылет из Храброво в Москву':kind==='arrival'?'Например, самолёт в Храброво':kind==='lodging'?'Название жилья':'Название экскурсии или билета';
  select('Как сейчас обстоят дела','status',Object.entries(BOOKING_STATUSES),draft.status);
  field('Дата записи','date','date',draft.date);
  field(kind==='departure'?'Время вылета / отъезда':kind==='arrival'?'Время прибытия':kind==='lodging'?'Заселение не раньше':'Начало по билету','time','time',draft.time===null?'':clock(draft.time));
  if(kind==='activity') {const duration=field('Длительность, мин','duration','number',draft.duration);duration.min='1';duration.max='1440';duration.required=true;
   select('Остановка вашего дня','target',[['','Пока не выбрана'],...day.places.map(id=>[id,catalog.poi.find(p=>p.slug===id)?.name||id])],draft.target);
  }else{
   select('Место из каталога','location',[['','Пока не выбрано'],...(typeof draft.location==='object'&&draft.location?[['__personal__',draft.location.name]]:[]),...catalog.poi.map(p=>[p.slug,p.name])],typeof draft.location==='object'&&draft.location?'__personal__':draft.location);
   const pick=el('button','Выбрать адрес на нашей карте','booking-pick');pick.type='button';pick.dataset.bookingPick='true';$('.booking-fields').append(pick);
   if(kind==='arrival'||kind==='departure'){const buffer=field(kind==='departure'?'За сколько минут быть в аэропорту':'Запас после прибытия, мин','buffer','number',draft.buffer);buffer.min='0';buffer.max='1440';buffer.required=true;}
  }
  const label=el('label',undefined,'booking-use'),use=el('input');use.type='checkbox';use.name='use';use.checked=draft.binding!=='none';
  label.append(use,el('span',kind==='departure'?'Завершить день здесь до отъезда':kind==='arrival'?'Начать день отсюда после прибытия':kind==='lodging'?'Вернуться сюда к ночи':'Учитывать фиксированное время билета'));$('.booking-fields').append(label);
  const note=el('p',kind==='departure'?'Учтём обратную дорогу и ваш запас на аэропорт. Дата и время — местные, Калининград UTC+2. Условия регистрации проверьте у авиакомпании.':kind==='arrival'?'Время — местное, Калининград UTC+2. Учтём дорогу от этой точки. Запас оставьте на багаж и выход из аэропорта.':kind==='lodging'?'Учтём дорогу к жилью и, если записано, ожидание заселения.': 'Учтём ожидание и покажем опоздание. Часы входа и сеансы места проверяются отдельно.','booking-binding-note');$('.booking-fields').append(note);
  const previous=bookingRows(trip).find(r=>r.id!==draft.id&&r.status!=='cancelled'&&r.binding!=='none'&&r.kind===kind);
  if(previous){const note=el('p',kind==='activity'?'Для каждой остановки учитываем один билет. Прежняя запись той же остановки останется в списке.':`Если включить связь, вместо «${previous.name}» используем эту запись. Прежняя останется в списке.`,'booking-binding-note');$('.booking-fields').append(note);}
  $('[name=reference]').value=draft.private.reference;$('[name=private_note]').value=draft.private.note;
  dialog.showModal();name.focus();
 }
 function close(){dialog.close();lastFocus?.isConnected?lastFocus.focus({preventScroll:true}):panel.querySelector('[data-booking-add]')?.focus({preventScroll:true});}
 dialog.addEventListener('cancel',e=>{e.preventDefault();close();});dialog.addEventListener('click',async e=>{
  if(e.target.closest('[data-booking-close]'))return close();
  const pick=e.target.closest('[data-booking-pick]');if(!pick)return;
  const initial=$('[name=location]').value==='__personal__'?draft.location:$('[name=location]').value||null;
  const point=await pickPersonalPoint({base,initial,caption:draft.kind==='arrival'?'Откуда начнём после посадки':draft.kind==='departure'?'Куда вернуться до вылета':'Адрес вашего жилья',focusPlace:catalog.poi.find(p=>p.slug===read().places[0])});
  if(!point)return;draft.location=point;const select=$('[name=location]');let option=select.querySelector('[value=__personal__]');if(!option){option=el('option');option.value='__personal__';select.prepend(option);}option.textContent=point.name;select.value='__personal__';pick.focus();
 });
 $('#booking-form').addEventListener('submit',async e=>{
  e.preventDefault();const f=new FormData(e.target),t=f.get('time');const row={...draft,name:f.get('name').trim(),status:f.get('status'),date:f.get('date')||null,time:t?Number(t.slice(0,2))*60+Number(t.slice(3)):null,private:{reference:f.get('reference'),note:f.get('private_note')}};
  if(draft.kind==='activity'){row.duration=Number(f.get('duration'));row.target=f.get('target')||null;}else{row.location=f.get('location')==='__personal__'?draft.location:f.get('location')||null;if(draft.kind==='arrival'||draft.kind==='departure')row.buffer=Number(f.get('buffer'));}
  row.binding=f.get('use')?(row.kind==='arrival'?'start':row.kind==='lodging'?'night':row.kind==='departure'?'end':'stop'):'none';
  const problem=bookingProblem(row,selectedDay(read()));if(problem){$('.booking-error').textContent=problem;return;}
  let stale=false,invalid=false;const submit=$('[type=submit]');submit.disabled=true;
  try{await commit(current=>{if(context(current)!==expected){stale=true;return current;}const next=saveBooking(ensureJourney(current),row);if(!bookingRows(next).some(r=>JSON.stringify(r)===JSON.stringify(row))){invalid=true;return current;}return next;},'Запись сохранена.');
   if(stale||invalid){$('.booking-error').textContent=stale?'День уже изменился в другой вкладке. Закройте форму и откройте запись ещё раз.':'Проверьте дату, время и длительность записи.';return;}
   close();feedback('Запись сохранена. Расходы и оплаты ведутся отдельно в бюджете.');
  }finally{submit.disabled=false;}
 });
 panel.addEventListener('click',async e=>{
  const add=e.target.closest('[data-booking-add]');if(add)return open(add.dataset.bookingAdd);
  const button=e.target.closest('[data-booking-action]');if(!button)return;const row=bookingRows(read()).find(r=>r.id===button.dataset.bookingId);if(!row)return;
  if(button.dataset.bookingAction==='edit')return open(row.kind,row);
  if(!window.confirm(`Удалить запись «${row.name}»? Расходы в бюджете останутся.`))return;
  const before=JSON.stringify(row),day=selectedDay(read()).id;let stale=false;
  await commit(current=>{if(selectedDay(current).id!==day||JSON.stringify(bookingRows(current).find(r=>r.id===row.id))!==before){stale=true;return current;}return deleteBooking(current,row.id);},'Запись удалена.');feedback(stale?'Запись уже изменилась. Проверьте свежую версию.':'Запись удалена. Время и адрес дня снова считаются по его настройкам.');panel.querySelector('[data-booking-add]')?.focus({preventScroll:true});
 });
 let sequence=0;
 const engine=loadScheduler(base);engine.catch(()=>{});
 function render(trip){
  const ticket=++sequence,summary=panel.querySelector('.booking-flight-summary');summary.textContent='';
  const bound=bookingEffects(trip);
  if(bound.start||bound.end){summary.textContent='Считаем время после посадки и до отъезда…';engine.then(plan=>{if(ticket!==sequence)return;const times=plan.arrival({version:1,arrival:bound.start?{time:bound.start.time,buffer:bound.start.buffer}:null,departure:bound.end?{time:bound.end.time,buffer:bound.end.buffer}:null});summary.textContent=[times.ready_at!==null?`После прибытия можно выходить не раньше ${clock(times.ready_at)}.`:'',times.airport_by!==null?`К отъезду нужно вернуться к ${clock(times.airport_by)}.`:'',times.available_minutes!==null?`Между ними ${times.available_minutes} мин — вместе с дорогой и остановками.`:'',times.conflict?'Время прибытия с запасом позже возвращения. Нужен другой день.':''].filter(Boolean).join(' ');}).catch(()=>{if(ticket===sequence)summary.textContent='Расчёт границ пока не загрузился. Записи и ваш план сохранены.';});}

  const rows=bookingRows(trip),day=selectedDay(trip),list=panel.querySelector('.booking-list');list.replaceChildren();panel.querySelector('.booking-count').textContent=rows.length;
  if(!rows.length){list.append(el('p','Пока день свободен. Добавьте прибытие, жильё или билет — и у прогулки появятся свои ориентиры.','booking-empty'));return;}
  const effects=bookingEffects(trip);
  for(const row of rows){
   const card=el('article',undefined,'booking-card');card.dataset.bookingId=row.id;card.dataset.bookingStatus=row.status;
   const head=el('div',undefined,'booking-card-top'),type=el('span',BOOKING_KINDS[row.kind],'booking-kind'),status=el('span',row.status==='booked'?'Вы отметили бронь':BOOKING_STATUSES[row.status],'booking-status');head.append(type,status);card.append(head,el('h4',row.name),el('p',`${date(row.date)} · ${clock(row.time)}`,'booking-when'));
   if(row.kind==='arrival')card.append(el('p',`После прибытия: ${row.buffer} мин запаса`));
   if(row.kind==='departure')card.append(el('p',`До отъезда: ${row.buffer} мин запаса · время Калининграда`));
   if(row.kind==='activity')card.append(el('p',`${row.duration} мин · ${row.target?catalog.poi.find(p=>p.slug===row.target)?.name||'Остановка больше не в каталоге':'Остановка ещё не выбрана'}`));
   else card.append(el('p',row.location?baseName(row.location,catalog):'Адрес ещё не выбран','booking-address'));
   const problem=bookingProblem(row,day);card.dataset.bookingBound=String(!problem&&row.status!=='cancelled'&&row.binding!=='none');
   card.append(el('p',problem||(row.status==='cancelled'?'Отмена записи убирает её время и адрес из расчёта. Возврат денег записывается отдельно.':row.binding==='none'?'Сохранено для вас. Время и адрес пока не меняют день.':row.binding==='start'?`День начнётся не раньше ${clock(effects.start.time+effects.start.buffer)}.`:row.binding==='end'?`Вернуться к ${clock(effects.end.time-effects.end.buffer)}. Дорога включена в день.`:row.binding==='night'?'Сюда вернёмся после последней остановки.':'Это время учтено в расписании.'),problem?'booking-warning':'booking-binding'));
   if(row.private.reference||row.private.note)card.append(el('p','Есть личные сведения · в ссылку не попадут','booking-private-hint'));
   const actions=el('div',undefined,'booking-card-actions');for(const [action,title]of [['edit','Изменить'],['delete','Удалить']]){const b=el('button',title);b.type='button';b.dataset.bookingAction=action;b.dataset.bookingId=row.id;actions.append(b);}card.append(actions);list.append(card);
  }
 }
 return {render};
}
