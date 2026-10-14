import {validateTransportProfile,calculateTransport,transportReceipt,transportGuide,transportClock} from './transport-page-state.mjs?v=2026101305';
import {loadScheduler} from './trip-scheduler.mjs?v=2026101305';
import {formatKopecks as money} from './trip-money.mjs?v=2026101305';
import {saveTransportPlan} from './trip-transport-plans-state.mjs?v=2026101305';
import {transportStates,transportStatus,transportDate,transportTotal,transportContextText} from './trip-transport-plans-view.mjs?v=2026101305';
import {hasRoadConnection,roadOrigins,roadConnectionRows} from './transport-road-connection.mjs?v=2026101305';
import {railConnectionRows} from './transport-rail-connection.mjs?v=2026101305';
import {recordTransportAction} from './transport-useful-actions.mjs?v=2026101305';
import {loadTrip} from './trip-memory-bootstrap.mjs?v=2026101305';
import {createTripMemory} from './trip-memory.mjs?v=2026101305';
import {createScenarioJournal} from './scenario-journal.mjs?v=2026101305';
import {tripJournalBindings} from './scenario-bindings.mjs?v=2026101305';
import {resolveTripDayLink,plannerDayUrl} from './trip-day-link.mjs?v=2026101305';

const mount=document.querySelector('[data-transport-profile]'),form=document.querySelector('#transport-form');
const base=new URL('./',import.meta.url),node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const icon=(name,cls)=>{const img=node('img',undefined,cls);img.src=new URL(`assets/icons/${name}.svg`,base);img.alt='';img.width=32;img.height=32;return img;};
const download=(bytes,name,type)=>{const a=node('a');a.href=URL.createObjectURL(new Blob([bytes],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
async function init(){
 if(!mount||!form)return;
 const status=document.querySelector('#transport-status'),result=document.querySelector('#transport-result'),submit=form.querySelector('[type=submit]'),actionsMount=document.querySelector('#transport-actions'),detailsMount=document.querySelector('#transport-plan-details'),dialog=document.querySelector('#transport-settings-dialog'),dateLabel=document.querySelector('[data-transport-date]');
 const json=async path=>{const response=await fetch(new URL(path,base));if(!response.ok)throw Error('transport_data_unavailable');return response.json();};
 let profile,tables,receipt=null,generation=0,pdfAbort,memoryPromise;
 let storage;try{storage=globalThis.localStorage;}catch{storage={getItem(){throw Error('unavailable');},setItem(){throw Error('unavailable');}};}
 const memory=()=>memoryPromise??=(async()=>{const catalog=await json('data/catalog.json'),initial=loadTrip(storage,catalog),store=createTripMemory(catalog,initial,storage);await store.ready;return {catalog,store};})();
 const metric=action=>recordTransportAction({profile:profile.id,action},storage);
 const journal=createScenarioJournal(storage);let attempt;
 const begin=()=>{attempt ||= journal.begin('transport');return attempt;};
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kaliningrad',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 form.elements.date.value=['year','month','day'].map(key=>parts.find(p=>p.type===key).value).join('-');
 const setDate=date=>{dateLabel.dateTime=date;dateLabel.textContent=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(`${date}T12:00:00Z`));};
 setDate(form.elements.date.value);
 const fill=answers=>{
  if(form.elements.origin)form.elements.origin.value=answers.origin||'baltiysk';
  for(const [key,value] of Object.entries(answers)){
   if(!form.elements[key])continue;
   const rail=answers.origin==='kaliningrad-rail',road=hasRoadConnection(answers);
   const control=key==='ready'?(rail?form.elements.rail_ready:road?form.elements.road_ready:form.elements.ready):key==='boarding'&&rail?form.elements.rail_ferry_boarding:form.elements[key];
   control.value=['ready','road_return_at'].includes(key)?transportClock(value):String(value);
  }
 };
 document.querySelector('[data-transport-edit]').addEventListener('click',()=>dialog.showModal());
 document.querySelector('[data-transport-close]').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('close',()=>{if(receipt)fill(receipt.answers);controls();});
 dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close();});
 try{
  const [manifest,bus,services,rail]=await Promise.all([json('data/transport-pages.json'),json('data/kosa-bus-210.json'),json('data/transport-services.json'),json('data/rail-services.json')]);
  if(manifest.version!==1||services.version!==1||bus.version!==1)throw Error('transport_data_invalid');
  profile=validateTransportProfile(manifest.profiles.find(p=>p.id===mount.dataset.transportProfile));tables={bus,services,rail};
  submit.disabled=false;status.textContent='Начало — у остановки или причала. Дорога от жилья сюда в расчёт не входит.';
  document.documentElement.dataset.transportReady='true';
 }catch{status.textContent='Расчёт не загрузился. Расписание и ссылки доступны ниже.';result.append(node('p',status.textContent));document.documentElement.dataset.transportReady='error';return;}
 const heading=text=>{const n=node('h2',text);n.id='transport-result-title';return n;};
 function controls(){
  if(!profile)return;
  const rail=form.elements.origin?.value==='kaliningrad-rail',road=hasRoadConnection({origin:form.elements.origin?.value}),busRoad=form.elements.origin?.value==='kaliningrad-bus';
  form.querySelectorAll('[data-rail-fields]').forEach(n=>n.hidden=!rail);
  form.querySelectorAll('[data-local-ready]').forEach(n=>n.hidden=rail||road);
  form.querySelectorAll('[data-local-boarding]').forEach(n=>n.hidden=rail);
  form.querySelectorAll('[data-road-fields]').forEach(n=>n.hidden=!road);
  form.querySelectorAll('[data-road-bus]').forEach(n=>n.hidden=!busRoad);
  if(form.elements.road_ready){form.elements.road_ready.required=road;form.elements.road_return_at.required=busRoad;}
  if(form.querySelector('[data-crossing-label]')&&profile.adapter==='ferry')form.querySelector('[data-crossing-label]').textContent='На паром';
  const help=form.querySelector('[data-road-help]');if(help&&road)help.textContent=form.elements.origin.value==='kaliningrad-car'?'Можно оставить машину в Балтийске и переправиться пешком или взять её на паром. Задайте своё время дороги и путь от парковки.':form.elements.origin.value==='kaliningrad-bike'?'Задайте время велодороги в обе стороны и запас до причала. Это полный день с дорогой из Калининграда; на косе можно продолжить с велосипедом.':'Время дороги и пересадок — ваш план. Измените его под выбранный рейс или место отправления.';
  form.elements.ready.required=!rail&&!road;if(form.elements.rail_ready)form.elements.rail_ready.required=rail;
  if(form.elements.origin){form.elements.mode.value=rail?'foot':form.elements.mode.value;form.elements.mode.disabled=rail;}
  const bus=profile.adapter==='bus210'&&form.elements.mode.value==='foot';
  form.querySelectorAll('[data-bus-fields]').forEach(n=>n.hidden=!bus);
  form.querySelectorAll('[data-forest-fields]').forEach(n=>n.hidden=!bus||form.elements.walks.value!=='two');
  form.querySelectorAll('[data-bike-fields]').forEach(n=>n.hidden=form.elements.mode.value!=='bike');
  form.querySelectorAll('[data-car-fields]').forEach(n=>n.hidden=form.elements.mode.value!=='car');
  form.elements.exempt.max=profile.adapter==='ferry'?Math.floor(Number(form.elements.people.value)/2):form.elements.people.value;
  if(profile.adapter==='ferry'){form.elements.bikes.max=Number(form.elements.people.value)-Number(form.elements.exempt.value);form.elements.bikes.disabled=form.elements.mode.value!=='bike';}
 }
 controls();form.addEventListener('input',controls);
 form.elements.origin?.addEventListener('change',()=>{
  const bike=form.elements.origin.value==='kaliningrad-bike';
  form.elements.mode.value=bike?'bike':'foot';
  form.elements.road_minutes.value=form.elements.road_return_minutes.value=bike?'240':'90';
  form.elements.road_ready.value=bike?'06:00':'07:30';controls();
 });
 const read=()=>{
  const v=name=>Number(form.elements[name].value),origin=form.elements.origin?.value,rail=origin==='kaliningrad-rail',road=hasRoadConnection({origin});
  const time=name=>{const value=form.elements[name].value;return value?Number(value.slice(0,2))*60+Number(value.slice(3)):NaN;};
  return {date:form.elements.date.value,ready:time(rail?'rail_ready':road?'road_ready':'ready'),boarding:v(rail?'rail_ferry_boarding':'boarding'),shore:v('shore'),people:v('people'),exempt:v('exempt'),bikes:v('bikes'),mode:form.elements.mode.value,walks:form.elements.walks.value,forest:v('forest'),...(profile.adapter==='ferry'?{vehicle_weight:v('vehicle_weight'),origin,...(rail?{station_walk:v('station_walk'),rail_boarding:v('rail_boarding')}:{}) ,...(road?{road_minutes:v('road_minutes'),road_return_minutes:v('road_return_minutes'),road_transfer:v('road_transfer'),...(origin==='kaliningrad-bus'?{road_return_at:time('road_return_at')}:{})}:{})}:{})};
 };
 function render(frozen,ticket,restored){
  receipt=structuredClone(frozen);setDate(frozen.date);result.replaceChildren();detailsMount.replaceChildren();actionsMount.replaceChildren();result.toggleAttribute('data-rail',!!frozen.rail_connection||!!frozen.road_connection);
  const pageUrl=new URL(location.href);if(restored)pageUrl.searchParams.set('trip-day',restored.day.id);else pageUrl.searchParams.delete('trip-day');history.replaceState(null,'',pageUrl);
  const header=node('header',undefined,'transport-plan-heading'),title=node('div');title.append(heading(profile.adapter==='bus210'?'Куршская коса':'Балтийская коса'),node('p','Маршрут дня','transport-plan-label'));
  const motto=node('p','Море. Лес. Дюны.\nВпечатления.','transport-plan-motto');header.append(icon('geo-alt-filled','transport-plan-pin'),title,motto);result.append(header);
  if(frozen.road_connection||frozen.rail_connection||frozen.state!=='candidate'&&frozen.state!=='circular_candidate'){const summary=node('p',frozen.rail_connection?.state==='connected'?'Поезд и паром подобраны туда и обратно.':transportStatus(frozen)||'Проверьте выбранные рейсы по таблице.','transport-visible-status');summary.dataset.state=frozen.road_connection?.state||frozen.rail_connection?.state||frozen.state;result.append(summary);}
  if(profile.adapter==='ferry'){
   const meta=node('div',undefined,'transport-ferry-meta');const origin=node('button',frozen.road_connection?`Из Калининграда ${roadOrigins[frozen.answers.origin].phrase} · изменить`:frozen.rail_connection?'Из Калининграда поездом · изменить':'Из Балтийска · изменить','transport-origin');origin.type='button';origin.addEventListener('click',()=>{dialog.showModal();form.elements.origin.focus();});if(!frozen.road_connection&&!frozen.rail_connection)result.append(origin);
   const choices=node('div',undefined,'transport-origin-choices');choices.setAttribute('role','group');choices.setAttribute('aria-label','Из Калининграда');
   choices.append(node('span','Из Калининграда','transport-choice-label'));
   for(const [value,label] of [['kaliningrad-rail','Поезд'],...Object.entries(roadOrigins).map(([value,m])=>[value,m.label])]){
    const button=node('button',label);button.type='button';button.setAttribute('aria-pressed',String(frozen.answers.origin===value));
    button.addEventListener('click',()=>{dialog.showModal();if(form.elements.origin.value!==value){form.elements.origin.value=value;form.elements.origin.dispatchEvent(new Event('change'));}controls();form.elements.origin.focus();});choices.append(button);
   }result.append(choices);
   meta.append(node('span',transportTotal(frozen.price,frozen.rail_connection,frozen.road_connection)),node('span',`${frozen.answers.shore} мин на косе`));result.append(meta);
  }
  const assessment=node('p',transportStatus(frozen)||'Проверьте выбранные рейсы по таблице.','transport-result-heading');assessment.dataset.state=frozen.state;detailsMount.append(assessment,node('p',`${transportDate(frozen.date)} · ${frozen.answers.people} чел.`,'transport-plan-date'));
  if(restored){const note=transportContextText(restored.entry,restored.day);if(note)detailsMount.append(node('p',note,'transport-plan-context'));}
  const timeline=node('ol',undefined,'transport-timeline');
  for(const row of frozen.rows.filter(row=>row.kind==='transport'&&row.id!=='backup')){
   const li=node('li'),pictogram=node('span',undefined,'transport-step-icon'),walk=['efa','shore'].includes(row.id)||/пеш|прогул|месте|троп|осмотр/i.test(row.title);
   pictogram.setAttribute('aria-hidden','true');pictogram.append(icon(walk?'walk-filled':profile.adapter==='bus210'?'bus-front-filled':'ship'));
   let title=row.title,text=row.text;
   if(profile.adapter==='bus210'&&frozen.answers.walks==='one'){
    const out=frozen.rows.find(r=>r.id==='out'),back=frozen.rows.find(r=>r.id==='back');
    if(row.id==='out'){title='Автобус к Эфе';text=`${transportClock(row.time)} из Зеленоградска.\nУ Эфы — ${transportClock(out?frozen.rows.find(r=>r.id==='efa')?.time:null)}. К остановке — ${transportClock(row.time-frozen.answers.boarding)}.`;}
    if(row.id==='efa'){title='Прогулка по косе';text=`Дюны, лес и смотровые площадки.\n${frozen.answers.shore} минут на прогулку, до ${transportClock(row.time+frozen.answers.shore)}.`;}
    if(row.id==='back'){title='Обратный автобус';text=`${transportClock(back.time)} от Эфы. Возвращение\nв Зеленоградск — ${transportClock(frozen.finish)}.`;}
   }
   const rail=frozen.rail_connection,road=frozen.road_connection;
   if(road&&row.id==='out'){title=`${roadOrigins[road.origin].label} и паром на косу`;text=`Ваш выезд ${transportClock(road.departure)} · Балтийск около ${transportClock(road.arrival)}.\n${road.transfer_minutes} мин до причала; паром ${transportClock(row.time)}.`;}
   if(road&&row.id==='back'){title='Обратно в Калининград';text=road.return_arrival!==null?`В Балтийске — около ${transportClock(frozen.circular.finish_estimate)}.\n${roadOrigins[road.origin].label}: выезд ${transportClock(road.return_departure)}; Калининград около ${transportClock(road.return_arrival)}.`:transportStatus(frozen);}
   if(rail&&row.id==='out'){title='Поезд и паром на косу';text=rail.outward?`${transportClock(rail.outward.departure)} → ${transportClock(rail.outward.arrival)} · поезд до Балтийска.\n${rail.walking_minutes} мин пешком; паром ${transportClock(row.time)}.`:'Поезд из Калининграда не подобран. Измените дату или начните раньше.';}
   if(rail&&row.id==='back'){title='Паром и поезд обратно';text=rail.inbound?`В Балтийске — около ${transportClock(frozen.circular.finish_estimate)}.\nПоезд ${transportClock(rail.inbound.departure)} → ${transportClock(rail.inbound.arrival)} · Южный вокзал.`:'Возвращение поездом не складывается. Измените прогулку или дату.';}
   li.append(pictogram,node('h3',title),node('p',text));
   if((rail||road)&&['out','back'].includes(row.id)){
    const details=node('details',undefined,'transport-shore-walk'),list=node('div',undefined,'transport-walk-stops'),rows=(road?roadConnectionRows(frozen):railConnectionRows(frozen))[row.id==='out'?'before':'after'];
    details.append(node('summary',road?(row.id==='out'?'Дорога до парома':'Обратная дорога'):row.id==='out'?'Поезд и пересадка':'Путь к обратному поезду'));
    for(const item of rows){const card=node('section',undefined,'transport-walk-stop');card.append(node('h4',item.title),node('p',item.text));if(item.source){const link=node('a',`Источник · ${item.source.name}`);link.href=item.source.url;card.append(link);}list.append(card);}
    if(row.id==='out')list.append(node('p',`У причала перед паромом — ${transportClock(row.time===null?null:row.time-frozen.answers.boarding)}. Запас: ${frozen.answers.boarding} мин. Время дороги и пересадок можно изменить в настройках.`,'transport-walk-note'));
    details.append(list);li.append(details);
   }
   if(row.id==='shore'&&frozen.shore_walk){
    const walk=frozen.shore_walk,details=node('details',undefined,'transport-shore-walk');
    details.append(node('summary',walk.title),node('p','Время на переходы и остановки — ориентир GoDune.','transport-walk-note'));
    const stops=node('div',undefined,'transport-walk-stops');
    for(const stop of walk.steps){
     const card=node('section',undefined,'transport-walk-stop'),top=node('div',undefined,'transport-walk-stop-top');
     top.append(node('h4',stop.title),node('span',`${stop.minutes} мин`));card.append(top,node('p',stop.text));
     if(stop.map_url){const link=node('a','Найти место на карте →');link.href=stop.map_url;card.append(link);}
     const source=node('a',`Источник · ${stop.source.name}`);source.href=stop.source.url;source.className='transport-walk-source';card.append(source);stops.append(card);
    }
    details.append(stops);li.append(details);
   }
   timeline.append(li);
  }
  result.append(timeline);
  const footer=node('footer',undefined,'transport-card-footer'),grass=node('img'),caption=node('p','Один день —\nбольше, чем кажется');grass.src=new URL('assets/identity/reference-card-reeds-v2.webp',base);grass.alt='';grass.width=300;grass.height=85;footer.append(grass,caption);result.append(footer);
  const backup=frozen.rows.find(row=>row.kind==='transport'&&row.id==='backup');
  if(backup){const planB=node('details',undefined,'transport-plan-b');planB.append(node('summary',profile.adapter==='ferry'?`Запасной паром · к причалу в ${transportClock(backup.time)}`:`План Б · автобус в ${transportClock(backup.time)}`),node('p',backup.text));detailsMount.append(planB);}
  const budget=node('details',undefined,'transport-budget'),list=node('dl');budget.append(node('summary',transportTotal(frozen.price,frozen.rail_connection)));
  for(const row of frozen.price.rows){const line=node('div');line.append(node('dt',row.label),node('dd',row.cost===null?'Уточняется':money(row.cost)));list.append(line);}
  budget.append(node('h3','Стоимость на компанию'),list);detailsMount.append(budget);
  const source=node('p',undefined,'transport-source'),link=node('a','Источник расписания');link.href=frozen.source.url;source.append(link,document.createTextNode(` · проверен ${frozen.source.checked_at}`));detailsMount.append(source);
  const actions=node('div',undefined,'transport-result-actions'),save=node('button',undefined,'transport-primary'),saveText=node('span','Сохранить в Мой день'),pdf=node('button',undefined,'transport-secondary'),saved=node('div',undefined,'transport-saved'),feedback=node('p',undefined,'transport-action-status');
  save.type=pdf.type='button';save.append(icon('bookmark'),saveText,icon('arrow-right','transport-action-arrow'));pdf.append(icon('file-text-filled'),node('span','Скачать буклет PDF'));saved.setAttribute('role','status');saved.hidden=true;feedback.setAttribute('role','status');feedback.hidden=true;
  const notify=text=>{status.textContent=text;feedback.textContent=text;feedback.hidden=false;};
  let savedDayId=null;
  const showSaved=id=>{
   savedDayId=id;save.disabled=true;saveText.textContent='День сохранён ✓';
   const copy=node('div',undefined,'transport-saved-copy');copy.append(node('p','План сохранён в Мой день'),node('span','Вы всегда можете открыть его позже.'));
   const open=node('a','Открыть Мой день');open.href=plannerDayUrl(base,id);open.append(icon('arrow-right'));
   saved.replaceChildren(icon('circle-check-filled','transport-saved-check'),copy,open);saved.hidden=false;
   const url=new URL(location.href);url.searchParams.set('trip-day',id);history.replaceState(null,'',url);
  };
  if(restored)showSaved(restored.day.id);
  save.addEventListener('click',async()=>{
   if(ticket!==generation||!receipt)return;const actionAttempt=begin();save.disabled=true;saveText.textContent='Сохраняем…';feedback.hidden=true;
   try{
    const {catalog,store}=await memory();
    // Save the displayed immutable receipt, never the unsent settings in the dialog.
    const completed=await store.change(trip=>saveTransportPlan(trip,catalog,frozen),{label:'Транспортный расчёт'});
    if(!completed.saved||completed.conflict){await journal.event(actionAttempt,'refused',{reason:'storage'});if(ticket===generation)notify(completed.conflict?'Поездка уже изменилась. Повторите сохранение.':completed.compatibility?.message||'Сохранение не завершилось. Скачайте PDF, чтобы забрать расчёт с собой.');return;}
    metric('saved');await journal.event(actionAttempt,'saved',{bindings:await tripJournalBindings(store.get())});if(ticket!==generation)return;
    showSaved(completed.state.itinerary.active);save.dataset.saved='true';status.textContent='Расчёт записан. Он будет в вашем дне и в личном буклете.';
   }catch{await journal.event(actionAttempt,'failed',{reason:'storage'});if(ticket===generation)notify('Расчёт не сохранился. Попробуйте ещё раз или скачайте PDF.');}
   finally{if(ticket===generation&&!savedDayId){save.disabled=false;saveText.textContent='Сохранить в Мой день';}}
  });
  pdf.addEventListener('click',async()=>{
   if(ticket!==generation||!receipt)return;const actionAttempt=begin();pdfAbort?.abort();pdfAbort=new AbortController();const signal=pdfAbort.signal;pdf.disabled=true;
   try{
    const {makeTripGuidePdf}=await import('./trip-guide-pdf.mjs?v=2026101403');signal.throwIfAborted();
    const file=await makeTripGuidePdf({snapshot:transportGuide(frozen),media:{maps:{},photos:{},overview:{},qrs:{},source:{snapshot_at:null},warnings:[]},base:base.href,format:matchMedia('(max-width: 700px)').matches?'phone':'print'},{signal,onProgress:text=>{if(ticket===generation)notify(text);}});
    if(ticket!==generation)return;download(file.bytes,`${profile.id}-${frozen.date}.pdf`,'application/pdf');metric('pdf_ready');await journal.event(actionAttempt,'pdf_ready');notify('PDF готов. Буклет сохранён в загрузки.');
   }catch(error){await journal.event(actionAttempt,error.name==='AbortError'?'refused':'failed',{reason:error.name==='AbortError'?'cancelled':'pdf'});if(error.name!=='AbortError'&&ticket===generation)notify('PDF не собрался. Расчёт остаётся на странице; попробуйте ещё раз.');}
   finally{if(ticket===generation)pdf.disabled=false;}
  });
  actions.append(save,pdf);actionsMount.append(actions,saved,feedback);result.dataset.state=frozen.state;
 }
 async function calculate(){
  const ticket=++generation;pdfAbort?.abort();submit.disabled=true;status.textContent='Считаем отправление и возвращение…';
  try{
   const answers=read(),engine=await loadScheduler(base),calculation=calculateTransport(profile,answers,tables,engine);if(ticket!==generation)return;
   render(transportReceipt(profile,answers,calculation),ticket);metric('calculated');await journal.event(attempt,'calculated',{criteria:{calculated:null,conflicts_shown:true,return_accounted:null}});status.textContent='Расчёт готов. Сохраните его в свой день или заберите PDF.';if(dialog.open)dialog.close();
  }catch{await journal.event(attempt,'failed',{reason:'calculation'});if(ticket===generation){receipt=null;delete result.dataset.state;actionsMount.replaceChildren();result.replaceChildren(heading('Расчёт нужно повторить'),node('p','Проверьте дату, состав компании и время. Исходные таблицы доступны ниже.'));status.textContent='Поездка пока не рассчитана.';}}
  finally{if(ticket===generation)submit.disabled=false;}
 }
 form.addEventListener('submit',event=>{event.preventDefault();attempt=journal.begin('transport');journal.event(attempt,'selected');calculate();});
 const dayId=new URL(location.href).searchParams.get('trip-day');
 if(dayId!==null){const ticket=generation;let issue='Сохранённый расчёт не удалось прочитать.';try{
  const {store}=await memory(),trip=store.get(),target=resolveTripDayLink(trip,dayId,profile.id);if(ticket!==generation)return;
  if(target.state==='ready'){const {day,entry}=target;fill(entry.receipt.answers);controls();render(entry.receipt,ticket,{trip,day,entry});metric('reopened');status.textContent='Открыт сохранённый расчёт.';return;}
  issue=target.state==='missing_plan'?'В этом дне больше нет расчёта поездки на косу.':'Этот сохранённый день не найден.';
 }catch{ /* Keep a missing or unreadable saved plan distinct from a fresh calculation. */ }
  status.textContent=issue;result.replaceChildren(heading('Вернёмся к вашему маршруту'),node('p',issue));detailsMount.replaceChildren();
  const choices=node('div',undefined,'transport-result-actions'),open=node('a','Выбрать день в планировщике','transport-secondary'),fresh=node('button','Собрать новый маршрут','transport-primary');open.href=new URL('planner/#my-trip',base);fresh.type='button';fresh.addEventListener('click',()=>{attempt=journal.begin('transport');journal.event(attempt,'selected');calculate();});choices.append(fresh,open);actionsMount.replaceChildren(choices);return;
 }
 await calculate();
}
init();
