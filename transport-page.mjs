import {validateTransportProfile,calculateTransport,transportReceipt,transportGuide,transportClock} from './transport-page-state.mjs?v=1';
import {loadScheduler} from './trip-scheduler.mjs?v=42';
import {formatKopecks as money} from './trip-money.mjs';
import {saveTransportPlan} from './trip-transport-plans-state.mjs';
import {transportStates,transportDate,transportTotal,transportContextText} from './trip-transport-plans-view.mjs';
import {recordTransportAction} from './transport-useful-actions.mjs';
import {loadTrip} from './trip-memory-bootstrap.mjs?v=5';
import {createTripMemory} from './trip-memory.mjs?v=26';

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
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kaliningrad',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 form.elements.date.value=['year','month','day'].map(key=>parts.find(p=>p.type===key).value).join('-');
 const setDate=date=>{dateLabel.dateTime=date;dateLabel.textContent=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(`${date}T12:00:00Z`));};
 setDate(form.elements.date.value);
 const fill=answers=>{for(const [key,value] of Object.entries(answers)){if(form.elements[key])form.elements[key].value=key==='ready'?transportClock(value):String(value);}};
 document.querySelector('[data-transport-edit]').addEventListener('click',()=>dialog.showModal());
 document.querySelector('[data-transport-close]').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('close',()=>{if(receipt)fill(receipt.answers);controls();});
 dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close();});
 try{
  const [manifest,bus,services]=await Promise.all([json('data/transport-pages.json'),json('data/kosa-bus-210.json'),json('data/transport-services.json')]);
  if(manifest.version!==1||services.version!==1||bus.version!==1)throw Error('transport_data_invalid');
  profile=validateTransportProfile(manifest.profiles.find(p=>p.id===mount.dataset.transportProfile));tables={bus,services};
  submit.disabled=false;status.textContent='Начало — у остановки или причала. Дорога от жилья сюда в расчёт не входит.';
  document.documentElement.dataset.transportReady='true';
 }catch{status.textContent='Расчёт не загрузился. Расписание и ссылки доступны ниже.';result.append(node('p',status.textContent));document.documentElement.dataset.transportReady='error';return;}
 const heading=text=>{const n=node('h2',text);n.id='transport-result-title';return n;};
 function controls(){
  if(!profile)return;
  const bus=profile.adapter==='bus210'&&form.elements.mode.value==='foot';
  form.querySelectorAll('[data-bus-fields]').forEach(n=>n.hidden=!bus);
  form.querySelectorAll('[data-forest-fields]').forEach(n=>n.hidden=!bus||form.elements.walks.value!=='two');
  form.querySelectorAll('[data-bike-fields]').forEach(n=>n.hidden=form.elements.mode.value!=='bike');
  form.elements.exempt.max=form.elements.people.value;
 }
 controls();form.addEventListener('input',controls);
 const read=()=>{const v=name=>Number(form.elements[name].value),time=form.elements.ready.value;return {date:form.elements.date.value,ready:Number(time.slice(0,2))*60+Number(time.slice(3)),boarding:v('boarding'),shore:v('shore'),people:v('people'),exempt:v('exempt'),bikes:v('bikes'),mode:form.elements.mode.value,walks:form.elements.walks.value,forest:v('forest')};};
 function render(frozen,ticket,restored){
  receipt=structuredClone(frozen);setDate(frozen.date);result.replaceChildren();detailsMount.replaceChildren();actionsMount.replaceChildren();
  const header=node('header',undefined,'transport-plan-heading'),title=node('div');title.append(heading(profile.adapter==='bus210'?'Куршская коса':'Балтийская коса'),node('p','Маршрут дня','transport-plan-label'));
  const motto=node('p','Море. Лес. Дюны.\nВпечатления.','transport-plan-motto');header.append(icon('geo-alt-filled','transport-plan-pin'),title,motto);result.append(header);
  if(frozen.state!=='candidate'){result.append(node('p',transportStates[frozen.state]||'Проверьте выбранные рейсы по таблице.','transport-visible-status'));}
  const assessment=node('p',transportStates[frozen.state]||'Проверьте выбранные рейсы по таблице.','transport-result-heading');assessment.dataset.state=frozen.state;detailsMount.append(assessment,node('p',`${transportDate(frozen.date)} · ${frozen.answers.people} чел.`,'transport-plan-date'));
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
   li.append(pictogram,node('h3',title),node('p',text));timeline.append(li);
  }
  result.append(timeline);
  const footer=node('footer',undefined,'transport-card-footer'),grass=node('img'),caption=node('p','Один день —\nбольше, чем кажется');grass.src=new URL('assets/identity/reference-card-reeds-v2.webp',base);grass.alt='';grass.width=300;grass.height=85;footer.append(grass,caption);result.append(footer);
  const backup=frozen.rows.find(row=>row.kind==='transport'&&row.id==='backup');
  if(backup){const planB=node('details',undefined,'transport-plan-b');planB.append(node('summary',`План Б · автобус в ${transportClock(backup.time)}`),node('p',backup.text));detailsMount.append(planB);}
  const budget=node('details',undefined,'transport-budget'),list=node('dl');budget.append(node('summary',transportTotal(frozen.price)));
  for(const row of frozen.price.rows){const line=node('div');line.append(node('dt',row.label),node('dd',row.cost===null?'Уточняется':money(row.cost)));list.append(line);}
  budget.append(node('h3','Стоимость на компанию'),list);detailsMount.append(budget);
  const source=node('p',undefined,'transport-source'),link=node('a','Источник расписания');link.href=frozen.source.url;source.append(link,document.createTextNode(` · проверен ${frozen.source.checked_at}`));detailsMount.append(source);
  const actions=node('div',undefined,'transport-result-actions'),save=node('button',undefined,'transport-primary'),saveText=node('span','Сохранить в Мой день'),pdf=node('button',undefined,'transport-secondary'),saved=node('div',undefined,'transport-saved'),feedback=node('p',undefined,'transport-action-status');
  save.type=pdf.type='button';save.append(icon('bookmark'),saveText,icon('arrow-right','transport-action-arrow'));pdf.append(icon('file-text-filled'),node('span','Скачать буклет PDF'));saved.setAttribute('role','status');saved.hidden=true;feedback.setAttribute('role','status');feedback.hidden=true;
  const notify=text=>{status.textContent=text;feedback.textContent=text;feedback.hidden=false;};
  const showSaved=()=>{
   const copy=node('div',undefined,'transport-saved-copy');copy.append(node('p','План сохранён в Мой день'),node('span','Вы всегда можете открыть его позже.'));
   const open=node('a','Открыть Мой день');open.href=new URL('planner/#my-trip',base);open.append(icon('arrow-right'));
   saved.replaceChildren(icon('circle-check-filled','transport-saved-check'),copy,open);saved.hidden=false;
  };
  if(restored)showSaved();
  save.addEventListener('click',async()=>{
   if(ticket!==generation||!receipt)return;save.disabled=true;saveText.textContent='Сохраняем…';feedback.hidden=true;
   try{
    const {catalog,store}=await memory();
    // Save the displayed immutable receipt, never the unsent settings in the dialog.
    const completed=await store.change(trip=>saveTransportPlan(trip,catalog,frozen),{label:'Транспортный расчёт'});
    if(!completed.saved){if(ticket===generation)notify(completed.compatibility?.message||'Сохранение не завершилось. Скачайте PDF, чтобы забрать расчёт с собой.');return;}
    metric('saved');if(ticket!==generation)return;
    showSaved();save.dataset.saved='true';status.textContent='Расчёт записан. Он будет в вашем дне и в личном буклете.';
   }catch{if(ticket===generation)notify('Расчёт не сохранился. Попробуйте ещё раз или скачайте PDF.');}
   finally{if(ticket===generation){save.disabled=false;saveText.textContent='Сохранить в Мой день';}}
  });
  pdf.addEventListener('click',async()=>{
   if(ticket!==generation||!receipt)return;pdfAbort?.abort();pdfAbort=new AbortController();const signal=pdfAbort.signal;pdf.disabled=true;
   try{
    const {makeTripGuidePdf}=await import('./trip-guide-pdf.mjs?v=25');signal.throwIfAborted();
    const file=await makeTripGuidePdf({snapshot:transportGuide(frozen),media:{maps:{},photos:{},overview:{},qrs:{},source:{snapshot_at:null},warnings:[]},base:base.href,format:'print'},{signal,onProgress:text=>{if(ticket===generation)notify(text);}});
    if(ticket!==generation)return;download(file.bytes,`${profile.id}-${frozen.date}.pdf`,'application/pdf');metric('pdf_ready');notify('PDF готов. Буклет сохранён в загрузки.');
   }catch(error){if(error.name!=='AbortError'&&ticket===generation)notify('PDF не собрался. Расчёт остаётся на странице; попробуйте ещё раз.');}
   finally{if(ticket===generation)pdf.disabled=false;}
  });
  actions.append(save,pdf);actionsMount.append(actions,saved,feedback);result.dataset.state=frozen.state;
 }
 async function calculate(){
  const ticket=++generation;pdfAbort?.abort();submit.disabled=true;status.textContent='Считаем отправление и возвращение…';
  try{
   const answers=read(),engine=await loadScheduler(base),calculation=calculateTransport(profile,answers,tables,engine);if(ticket!==generation)return;
   render(transportReceipt(profile,answers,calculation),ticket);metric('calculated');status.textContent='Расчёт готов. Сохраните его в свой день или заберите PDF.';if(dialog.open)dialog.close();
  }catch{if(ticket===generation){receipt=null;delete result.dataset.state;actionsMount.replaceChildren();result.replaceChildren(heading('Расчёт нужно повторить'),node('p','Проверьте дату, состав компании и время. Исходные таблицы доступны ниже.'));status.textContent='Поездка пока не рассчитана.';}}
  finally{if(ticket===generation)submit.disabled=false;}
 }
 form.addEventListener('submit',event=>{event.preventDefault();calculate();});
 const dayId=new URL(location.href).searchParams.get('trip-day');
 if(dayId){const ticket=generation;try{
  const {store}=await memory(),trip=store.get(),day=trip.itinerary?.days.find(d=>d.id===dayId),entry=day?.transport_plans?.entries.find(e=>e.id===profile.id);if(ticket!==generation)return;
  if(entry){fill(entry.receipt.answers);controls();render(entry.receipt,ticket,{trip,day,entry});metric('reopened');status.textContent='Открыт сохранённый расчёт.';return;}
 }catch{status.textContent='Сохранённый расчёт не прочитан. Можно собрать новый по таблицам ниже.';}}
 await calculate();
}
init();
