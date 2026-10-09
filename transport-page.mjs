import {validateTransportProfile,calculateTransport,transportReceipt,transportGuide,transportClock} from './transport-page-state.mjs?v=1';
import {loadScheduler} from './trip-scheduler.mjs?v=40';
import {formatKopecks as money} from './trip-money.mjs';
import {saveTransportPlan} from './trip-transport-plans-state.mjs';
import {transportStates,transportDate,transportTotal,transportContextText} from './trip-transport-plans-view.mjs';
import {recordTransportAction} from './transport-useful-actions.mjs';
import {loadTrip} from './trip-memory-bootstrap.mjs?v=3';
import {createTripMemory} from './trip-memory.mjs?v=24';

const mount=document.querySelector('[data-transport-profile]'),form=document.querySelector('#transport-form');
const base=new URL('./',import.meta.url),node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const download=(bytes,name,type)=>{const a=node('a');a.href=URL.createObjectURL(new Blob([bytes],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
async function init(){
 if(!mount||!form)return;
 const status=document.querySelector('#transport-status'),result=document.querySelector('#transport-result'),submit=form.querySelector('[type=submit]');
 const json=async path=>{const response=await fetch(new URL(path,base));if(!response.ok)throw Error('transport_data_unavailable');return response.json();};
 let profile,tables,receipt=null,generation=0,pdfAbort,memoryPromise;
 let storage;try{storage=globalThis.localStorage;}catch{storage={getItem(){throw Error('unavailable');},setItem(){throw Error('unavailable');}};}
 const memory=()=>memoryPromise??=(async()=>{const catalog=await json('data/catalog.json'),initial=loadTrip(storage,catalog),store=createTripMemory(catalog,initial,storage);await store.ready;return {catalog,store};})();
 const metric=action=>recordTransportAction({profile:profile.id,action},storage);
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kaliningrad',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 form.elements.date.value=['year','month','day'].map(key=>parts.find(p=>p.type===key).value).join('-');
 try{
  const [manifest,bus,services]=await Promise.all([json('data/transport-pages.json'),json('data/kosa-bus-210.json'),json('data/transport-services.json')]);
  if(manifest.version!==1||services.version!==1||bus.version!==1)throw Error('transport_data_invalid');
  profile=validateTransportProfile(manifest.profiles.find(p=>p.id===mount.dataset.transportProfile));tables={bus,services};
  submit.disabled=false;status.textContent='Начало — у остановки или причала. Дорога от жилья сюда в расчёт не входит.';
  document.documentElement.dataset.transportReady='true';
 }catch{status.textContent='Расчёт не загрузился. Расписание и ссылки доступны ниже.';document.documentElement.dataset.transportReady='error';return;}
 const heading=text=>{const n=node('h2',text);n.id='transport-result-title';return n;};
 const controls=()=>{
  const bus=profile.adapter==='bus210'&&form.elements.mode.value==='foot';
  form.querySelectorAll('[data-bus-fields]').forEach(n=>n.hidden=!bus);
  form.querySelectorAll('[data-forest-fields]').forEach(n=>n.hidden=!bus||form.elements.walks.value!=='two');
  form.querySelectorAll('[data-bike-fields]').forEach(n=>n.hidden=form.elements.mode.value!=='bike');
  form.elements.exempt.max=form.elements.people.value;
 };
 controls();
 form.addEventListener('input',()=>{
  controls();generation++;pdfAbort?.abort();receipt=null;delete result.dataset.state;
  result.replaceChildren(heading('Отправление и возвращение'),node('p','Настройки изменились. Рассчитайте поездку заново.'));
  status.textContent='Новые настройки ещё не рассчитаны.';submit.disabled=false;
 });
 const read=()=>{const v=name=>Number(form.elements[name].value),time=form.elements.ready.value;return {date:form.elements.date.value,ready:Number(time.slice(0,2))*60+Number(time.slice(3)),boarding:v('boarding'),shore:v('shore'),people:v('people'),exempt:v('exempt'),bikes:v('bikes'),mode:form.elements.mode.value,walks:form.elements.walks.value,forest:v('forest')};};
 function render(frozen,ticket,restored){
  receipt=structuredClone(frozen);result.replaceChildren(heading(restored?'Сохранённый транспортный план':'Ваш транспортный план'));
  result.append(node('p',`${transportDate(frozen.date)} · ${frozen.answers.people} чел.`,'transport-plan-date'));
  const assessment=node('p',transportStates[frozen.state]||'Проверьте выбранные рейсы по таблице.','transport-result-heading');assessment.dataset.state=frozen.state;result.append(assessment);
  if(restored){const note=transportContextText(restored.entry,restored.day);if(note)result.append(node('p',note,'transport-plan-context'));}
  const timeline=node('ol',undefined,'transport-timeline');
  for(const row of frozen.rows.filter(row=>row.kind==='transport')){const li=node('li');li.append(node('span',transportClock(row.time),'transport-time'),node('h3',row.title),node('p',row.text));timeline.append(li);}
  result.append(timeline);
  const budget=node('section',undefined,'transport-budget'),list=node('dl');budget.append(node('h3','Стоимость на компанию'));
  for(const row of frozen.price.rows){const line=node('div');line.append(node('dt',row.label),node('dd',row.cost===null?'Уточняется':money(row.cost)));list.append(line);}
  budget.append(list,node('p',transportTotal(frozen.price),'transport-budget-total'));result.append(budget);
  const actions=node('div',undefined,'transport-result-actions'),save=node('button','Сохранить в Мой день','transport-primary'),pdf=node('button','Скачать памятку PDF ↓','transport-secondary'),saved=node('div',undefined,'transport-saved');
  save.type=pdf.type='button';saved.setAttribute('role','status');saved.hidden=true;
  save.addEventListener('click',async()=>{
   if(ticket!==generation||!receipt)return;save.disabled=true;save.textContent='Сохраняем…';
   try{
    const {catalog,store}=await memory();
    // This action keeps the original receipt even when settings change during the write.
    const completed=await store.change(trip=>saveTransportPlan(trip,catalog,frozen),{label:'Транспортный расчёт'});
    if(!completed.saved){if(ticket===generation)status.textContent=completed.compatibility?.message||'Сохранение не завершилось. Скачайте PDF, чтобы забрать расчёт с собой.';return;}
    metric('saved');if(ticket!==generation)return;
    saved.replaceChildren(node('p','Сохранено в Мой день.'));const open=node('a','Открыть Мой день →');open.href=new URL('planner/#my-trip',base);saved.append(open);saved.hidden=false;
    save.textContent='Сохранено';save.dataset.saved='true';status.textContent='Расчёт записан. Он будет в вашем дне и в личном буклете.';
   }catch{if(ticket===generation)status.textContent='Расчёт не сохранился. Попробуйте ещё раз или скачайте PDF.';}
   finally{if(ticket===generation&&!save.dataset.saved){save.disabled=false;save.textContent='Сохранить в Мой день';}}
  });
  pdf.addEventListener('click',async()=>{
   if(ticket!==generation||!receipt)return;pdfAbort?.abort();pdfAbort=new AbortController();const signal=pdfAbort.signal;pdf.disabled=true;
   try{
    const {makeTripGuidePdf}=await import('./trip-guide-pdf.mjs?v=21');signal.throwIfAborted();
    const file=await makeTripGuidePdf({snapshot:transportGuide(frozen),media:{maps:{},photos:{},overview:{},qrs:{},source:{snapshot_at:null},warnings:[]},base:base.href,format:'print'},{signal,onProgress:text=>{if(ticket===generation)status.textContent=text;}});
    if(ticket!==generation)return;download(file.bytes,`${profile.id}-${frozen.date}.pdf`,'application/pdf');metric('pdf_ready');status.textContent='PDF готов: транспортный план, суммы и источники в одном файле.';
   }catch(error){if(error.name!=='AbortError'&&ticket===generation)status.textContent='PDF не собрался. Расчёт остаётся на странице; попробуйте ещё раз.';}
   finally{if(ticket===generation)pdf.disabled=false;}
  });
  actions.append(save,pdf);result.append(actions,saved);
  const source=node('p',undefined,'transport-source'),link=node('a','Источник расписания');link.href=frozen.source.url;source.append(link,document.createTextNode(` · проверен ${frozen.source.checked_at}`));result.append(source);result.dataset.state=frozen.state;
 }
 form.addEventListener('submit',async event=>{
  event.preventDefault();const ticket=++generation;receipt=null;pdfAbort?.abort();submit.disabled=true;status.textContent='Считаем отправление и возвращение…';
  try{
   const answers=read(),engine=await loadScheduler(base),calculation=calculateTransport(profile,answers,tables,engine);if(ticket!==generation)return;
   render(transportReceipt(profile,answers,calculation),ticket);metric('calculated');status.textContent='Расчёт готов. Сохраните его в свой день или заберите PDF.';
  }catch{if(ticket===generation){delete result.dataset.state;result.replaceChildren(heading('Расчёт нужно повторить'),node('p','Проверьте дату, состав компании и время. Исходные таблицы доступны ниже.'));status.textContent='Поездка пока не рассчитана.';}}
  finally{if(ticket===generation)submit.disabled=false;}
 });
 const dayId=new URL(location.href).searchParams.get('trip-day');
 if(dayId){const ticket=generation;try{
  const {store}=await memory(),trip=store.get(),day=trip.itinerary?.days.find(d=>d.id===dayId),entry=day?.transport_plans?.entries.find(e=>e.id===profile.id);if(ticket!==generation)return;
  if(!entry){status.textContent=store.compatibility?.message||'Сохранённого расчёта в этом дне нет. Можно собрать новый.';return;}
  for(const [key,value] of Object.entries(entry.receipt.answers)){if(form.elements[key])form.elements[key].value=key==='ready'?transportClock(value):String(value);}
  controls();render(entry.receipt,ticket,{trip,day,entry});metric('reopened');status.textContent='Открыт сохранённый расчёт. Измените настройки и нажмите «Рассчитать», чтобы обновить его.';
 }catch{status.textContent='Сохранённый расчёт не прочитан. Можно собрать новый по таблицам ниже.';}}
}
init();
