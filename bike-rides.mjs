import {bikeSettings,selectBikeRides,appendBikeDay,bikeGuard} from './bike-rides-state.mjs?v=3';
import {bikeStopKinds,selectBikeStops,addBikeStop,removeBikeStop} from './bike-stops-state.mjs?v=1';
import {bikeDistance} from './bike-route-profile.mjs';
import {loadScheduler} from './trip-scheduler.mjs?v=42';
import {loadTravelMatrix} from './travel-estimates.mjs?v=13';
const base=new URL('./',import.meta.url),root=document.querySelector('[data-bike-rides]');
const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
const names={fits:'По вашим условиям',needs_info:'Нужно уточнить',does_not_fit:'Не подходят'};
const clock=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
const duration=n=>n==null?'Время не рассчитано':n<60?`${n} мин`:`${Math.floor(n/60)} ч${n%60?' '+n%60+' мин':''}`;
const dateLabel=date=>new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric'}).format(new Date(date+'T12:00:00'));
if(root){
 const form=root.querySelector('form'),status=root.querySelector('[role=status]'),list=root.querySelector('[data-bike-results]'),tabs=root.querySelector('[data-bike-tabs]');
 const field=name=>form.elements.namedItem(name),submit=form.querySelector('[type=submit]');
 let ctx,pending,rows=[],guard,revision,sequence=0,busy=false,saving=false,currentSettings;
 const stopViews=new Map();
 field('date').value=new Date().toLocaleDateString('sv-SE');
 const initial=new URL(location.href).searchParams;
 for(const name of ['area','available','max_km','surface','adults','children','date','start','journey','start_at','end_at','return_by','return_buffer'])if(initial.has(name)){
  const el=field(name),value=initial.get(name);
  if(el.tagName!=='SELECT'||[...el.options].some(option=>option.value===value))el.value=value;
 }
 field('trailer').checked=initial.get('trailer')==='1';
 const journeyCaption=()=>{
  const returning=field('journey').value==='loop'||field('end_at').value;
  root.querySelector('[data-bike-journey-caption]').textContent=returning?'Считаем весь путь с возвращением, остановками и запасом.':'Считаем путь в одну сторону, остановки и паузы.';
  field('end_at').options[0].textContent=field('journey').value==='loop'?'К месту старта':'Без возвращения';
 };
 form.addEventListener('input',journeyCaption);journeyCaption();
 const getSettings=()=>{const minutes=value=>{const [h,m]=value.split(':').map(Number);return h*60+m;};return bikeSettings({
  ...Object.fromEntries(new FormData(form)),start:minutes(field('start').value),return_by:field('return_by').value?minutes(field('return_by').value):null,trailer:field('trailer').checked});};
 async function load(){
  if(!pending)pending=(async()=>{
   const [{createTripMemory},{loadTrip},catalogResponse,ridesResponse,matrix,engine]=await Promise.all([
    import('./trip-memory.mjs?v=26'),import('./trip-memory-bootstrap.mjs?v=5'),
    fetch(new URL('data/catalog.json',base),{cache:'no-cache'}),fetch(new URL('data/bike-rides.json',base),{cache:'no-cache'}),loadTravelMatrix(base),loadScheduler(base)]);
   if(!catalogResponse.ok||!ridesResponse.ok)throw Error('Не удалось открыть места и прогулки. Нажмите «Подобрать прогулку», чтобы повторить.');
   const catalog=await catalogResponse.json(),rides=await ridesResponse.json();let storage;try{storage=localStorage;}catch{}
   const memory=createTripMemory(catalog,loadTrip(storage,catalog),storage);await memory.ready;
   if(memory.compatibility)throw Error('Сначала откройте сохранённую поездку в «Моём дне».');
   window.addEventListener('storage',()=>memory.sync());document.addEventListener('visibilitychange',()=>{if(!document.hidden)memory.sync();});
   return {catalog,rides,matrix,engine,memory};
  })().catch(error=>{pending=null;throw error;});
  return pending;
 }
 function show(state){
  for(const button of tabs.children)button.setAttribute('aria-pressed',String(button.dataset.state===state));
  list.replaceChildren(...rows.filter(row=>row.state===state).map(card));
 }
 function drawTabs(){
  tabs.replaceChildren(...Object.entries(names).filter(([state])=>rows.some(row=>row.state===state)).map(([state,name])=>{
   const button=node('button',`${name} · ${rows.filter(row=>row.state===state).length}`);button.type='button';button.dataset.state=state;button.setAttribute('aria-pressed','false');button.addEventListener('click',()=>show(state));return button;
  }));
 }
 function card(row){
  const article=node('article',undefined,'bike-card');article.dataset.ride=row.id;
  const point=ctx.catalog.poi.find(p=>p.slug===row.ride.image_poi);
  if(point?.photos?.[0]){const img=node('img');img.src=new URL(point.photos[0],base);img.alt='';img.loading='lazy';img.width=960;img.height=480;article.append(img);}
  const content=node('div',undefined,'bike-card-body'),heading=node('h3',row.ride.name),metrics=node('div',undefined,'bike-metrics');
  metrics.append(node('span',row.distance_m==null?'Длина не рассчитана':bikeDistance(row.distance_m)),node('span',duration(row.duration_minutes)));
  const area=ctx.catalog.poi.find(p=>p.slug===row.ride.stops[0].poi)?.area_name||'';
  content.append(node('p',area,'inner-kicker'),heading,metrics,node('p',row.ride.description));
  const stops=node('ol',undefined,'bike-stops');
  const boundary=(id,title,time,text)=>{const p=ctx.catalog.poi.find(p=>p.slug===id),li=node('li',undefined,'bike-boundary'),link=node('a',`${title} · ${p.name}`);link.href=new URL(`poi/${id}/`,base);li.append(link,node('small',`${time==null?'Время неизвестно':clock(time)} · ${text}`));stops.append(li);};
  const origin=row.trip.itinerary.days[0].start_at;
  if(origin)boundary(origin,'Выезд',row.input.start,'Дорога к первой остановке включена');
  const original=new Set(row.ride.stops.map(s=>s.poi));
  for(const id of row.trip.places){
   const point=ctx.catalog.poi.find(p=>p.slug===id),time=row.plan.stops.find(s=>s.id===id),visit=row.trip.schedule.stops[id]?.visit,li=node('li'),link=node('a',point.name);
   link.href=new URL(`poi/${point.slug}/`,base);li.append(link,node('small',`${time?.begins!=null?clock(time.begins)+' · ':''}${visit?visit+' мин на остановку':'Начало прогулки'}`));
   if(!original.has(id)){const remove=node('button','Убрать остановку ×','bike-stop-remove');remove.type='button';remove.dataset.removeStop=id;remove.setAttribute('aria-label',`Убрать остановку ${point.name}`);remove.addEventListener('click',()=>{
    try{replaceRide(row,removeBikeStop(row,id,currentSettings,ctx.catalog,ctx.matrix,ctx.engine));}catch(error){status.textContent=error.message;}
   });li.append(remove);}
   stops.append(li);
  }
  if(row.returning)boundary(row.returning.at,'Возвращение',row.returning.arrival,`до ${clock(row.returning.by)} · запас ${row.returning.buffer} мин`);
  content.append(stops,node('p',`${row.returning?'Весь путь с возвращением':'В одну сторону'} · ${row.trip.places.some(id=>!original.has(id))?'с выбранными остановками':'осмотр снаружи'}`,'bike-caption'));
  if(row.returning?.slack!=null){const p=node('p',row.returning.slack<0?`К сроку с запасом опаздываем на ${-row.returning.slack} мин.`:`До срока остаётся ещё ${row.returning.slack} мин сверх запаса.`, 'bike-return');p.dataset.state=row.returning.slack<0?'late':'fits';content.append(p);}
  content.append(stopPicker(row));
  const facts=node('div',undefined,'bike-facts');
  if(row.excluded.length||row.reasons.length){const issues=node('ul');for(const text of [...row.excluded,...row.reasons])issues.append(node('li',text));facts.append(issues);}
  const dismount=row.facts.find(text=>text.startsWith('Пешком с велосипедом'));
  if(dismount)facts.append(node('p',dismount));
  const details=node('details'),summary=node('summary','Покрытие и расчёт дороги');details.append(summary);
  for(const text of row.facts.filter(text=>text!==dismount))details.append(node('p',text));
  details.append(node('p',`${row.duration_minutes==null?'Известная часть расчёта':`Из ${duration(row.duration_minutes)}`}: остановки — ${row.plan.visit_minutes} мин, дорога — ${row.plan.travel_minutes} мин, запас — ${row.plan.reserve_minutes} мин.`));
  const source=ctx.matrix.source,sourceLink=node('a',`${source.name} · проверка ${dateLabel(source.checked_at)}`,'bike-source');
  sourceLink.href=source.url;sourceLink.target='_blank';sourceLink.rel='noopener';details.append(sourceLink);facts.append(details);content.append(facts);
  const actions=node('div',undefined,'bike-actions');
  if(row.state!=='does_not_fit'){
   const add=node('button',row.state==='needs_info'?'Добавить с пометками →':'Сохранить в Мой день →','bike-save');add.type='button';add.addEventListener('click',()=>save(row));actions.append(add);
   const gpx=node('button','Скачать трек GPX ↓','bike-gpx'),feedback=node('p',undefined,'bike-gpx-status');gpx.type='button';feedback.setAttribute('role','status');
   gpx.addEventListener('click',async()=>{
    if(gpx.disabled)return;gpx.disabled=true;gpx.textContent='Собираем трек…';feedback.textContent='';const ticket=sequence,settings=currentSettings;let module;
    try{module=await import('./day-gpx-ui.mjs?v=1');const result=await module.downloadDayGpx({trip:row.trip,catalog:ctx.catalog,matrix:ctx.matrix,engine:ctx.engine,base,stillCurrent:()=>ticket===sequence&&settings===currentSettings&&rows.includes(row)&&article.isConnected});feedback.textContent=module.gpxReady(result);}
    catch(error){feedback.textContent=module?module.gpxMessage(error):'Трек пока не собрался. Попробуйте ещё раз; ваш день на месте.';}
    finally{gpx.textContent='Скачать трек GPX ↓';gpx.disabled=false;}
   });actions.append(gpx,feedback);
  }else actions.append(node('p','Измените время или условия выше.','bike-caption'));
  content.append(actions);article.append(content);return article;
 }
 function replaceRide(before,after,addedId=null){
  if(busy||saving)return;
  const index=rows.findIndex(r=>r===before);if(index<0)throw Error('Прогулка изменилась. Повторите подбор.');
  rows[index]=after;drawTabs();show(after.state);
  status.textContent=after.returning?.arrival!=null?`Прогулка пересчитана. Возвращение ${clock(after.returning.arrival)}.`:'Прогулка пересчитана с выбранными остановками.';
  const article=list.querySelector(`[data-ride="${after.id}"]`);
  (addedId?article?.querySelector(`[data-remove-stop="${addedId}"]`):article?.querySelector('.bike-stop-picker summary'))?.focus();
 }
 function stopPicker(row){
  const view=stopViews.get(row.id)||{kind:'water',visit:10,open:false};stopViews.set(row.id,view);
  const details=node('details',undefined,'bike-stop-picker'),summary=node('summary','Остановка по пути');details.append(summary);details.open=view.open;
  details.append(node('p','Добавьте паузу — пересчитаем дорогу и возвращение.','bike-caption'));
  const choices=node('div',undefined,'bike-stop-kinds');choices.setAttribute('aria-label','Для чего остановиться');
  const controls=node('div',undefined,'bike-stop-time'),label=node('label','На месте, мин'),input=node('input');input.type='number';input.min='1';input.max='240';input.step='1';input.value=String(view.visit);label.append(input);controls.append(label);
  const results=node('div',undefined,'bike-stop-choices'),message=node('p','', 'bike-caption');message.setAttribute('role','status');
  const paths={water:'M12 3C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-12Z',rest:'M4 6h16v7H4zM2 16h20M5 13v8M19 13v8',food:'M5 3v6m3-6v6M2 3v6a3 3 0 0 0 6 0M5 12v9M17 3v18M17 3c-4 3-4 9 0 9',toilet:'M8 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM16 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM5 10h6v7H9v5H7v-5H5zM13 10h6v7h-2v5h-2v-5h-2z',repair:'M21 3l-5 5-3-3 5-5a7 7 0 0 0-9 9L2 16a3 3 0 0 0 4 4l7-7a7 7 0 0 0 8-10Z'};
  function render(){
   results.replaceChildren();message.textContent='';
   for(const button of choices.children)button.setAttribute('aria-pressed',String(button.dataset.kind===view.kind));
   if(!input.checkValidity()){message.textContent='Укажите от 1 до 240 минут на остановку.';return;}
   try{
    const found=selectBikeStops(row,currentSettings,ctx.catalog,ctx.matrix,ctx.engine,{kind:view.kind,visit:view.visit});
    if(!found.length){message.textContent=`${bikeStopKinds[view.kind].name}: новых точек для этой прогулки пока нет.`;return;}
    for(const [index,candidate]of found.entries()){
     const box=node('div',undefined,'bike-stop-choice'),title=node('a',candidate.point.name);title.href=new URL(`poi/${candidate.point.slug}/`,base);box.append(title);
     box.hidden=index>=3;
     const extra=candidate.extra_minutes,road=candidate.extra_distance_m;
     box.append(node('p',`${view.visit} мин на месте · ${extra==null?'полное время неизвестно':extra>=0?'+'+extra+' мин ко дню':Math.abs(extra)+' мин меньше ко дню'}${road==null?'':` · ${road>=0?'+':'−'}${bikeDistance(Math.abs(road))}`}`,'bike-caption'));
     if(candidate.preview.returning?.arrival!=null)box.append(node('p',`Возвращение ${clock(candidate.preview.returning.arrival)}`,'bike-stop-arrival'));
     box.append(node('p',candidate.capability.text,'bike-caption'));
     const facts=[...candidate.preview.excluded,...candidate.preview.reasons];if(facts.length)box.append(node('p',facts.join(' '),'bike-caption'));
     const add=node('button',candidate.preview.state==='does_not_fit'?'Добавить — день не помещается':'Добавить остановку +','bike-stop-add');add.type='button';add.addEventListener('click',()=>{
      try{replaceRide(row,addBikeStop(row,candidate),candidate.point.slug);}catch(error){message.textContent=error.message;}
     });box.append(add);
     const source=node('a',`Источник · ${dateLabel(candidate.capability.source.checked_at)}`,'bike-source');source.href=candidate.capability.source.url;source.target='_blank';source.rel='noopener';box.append(source);results.append(box);
    }
    if(found.length>3){const more=node('button',`Ещё мест: ${found.length-3}`,'bike-stop-more');more.type='button';more.addEventListener('click',()=>{for(const box of results.querySelectorAll('[hidden]'))box.hidden=false;more.remove();});results.append(more);}
   }catch(error){message.textContent=error.message||'Не удалось рассчитать остановки.';}
  }
  for(const [kind,{name,minutes}]of Object.entries(bikeStopKinds)){
   const button=node('button'),svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS(svg.namespaceURI,'path');
   svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');path.setAttribute('d',paths[kind]);svg.append(path);button.append(svg,node('span',name));button.type='button';button.dataset.kind=kind;button.setAttribute('aria-pressed',String(kind===view.kind));button.addEventListener('click',()=>{view.kind=kind;view.visit=minutes;input.value=String(minutes);render();});choices.append(button);
  }
  input.addEventListener('input',()=>{view.visit=Number(input.value);render();});
  details.append(choices,controls,message,results);
  details.addEventListener('toggle',()=>{view.open=details.open;if(details.open)render();});
  if(details.open)render();
  return details;
 }
 async function save(row){
  if(busy||saving)return;saving=true;for(const el of form.elements)el.disabled=true;list.querySelectorAll('button').forEach(el=>el.disabled=true);
  try{
   await ctx.memory.sync();
   const result=await ctx.memory.change(current=>appendBikeDay(current,row,ctx.catalog,guard),{expectedRevision:revision,label:'Добавлена велопрогулка'});
   if(result.conflict)throw Error('Поездка изменилась. Повторите подбор перед сохранением.');
   rows=[];sequence++;tabs.replaceChildren();list.replaceChildren();
   status.replaceChildren(node('span',result.saved?'Велопрогулка сохранена. ':'Прогулка добавлена только в этой вкладке. '));
   const open=node('a','Открыть Мой день и скачать буклет →');open.href=new URL('planner/',base);status.append(open);
   if(!result.saved){const download=node('button','Скачать файл поездки','bike-save');download.type='button';download.addEventListener('click',()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(ctx.memory.get(),null,2)],{type:'application/json'})),link=node('a');link.href=url;link.download='godune-trip.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
   });status.append(download);}
  }catch(error){status.textContent=error.message||'Не удалось добавить прогулку. Повторите подбор.';}
  finally{saving=false;for(const el of form.elements)el.disabled=false;list.querySelectorAll('button').forEach(el=>el.disabled=false);}
 }
 async function calculate(event){
  event?.preventDefault();if(busy||saving)return;
  if(!form.reportValidity()){status.textContent='Проверьте дату, время и состав компании.';return;}
  let settings;try{settings=getSettings();}catch(error){status.textContent=error.message;return;}
  busy=true;submit.disabled=true;const ticket=++sequence;status.textContent='Считаем дорогу, остановки и запас времени…';
  try{
   ctx=await load();await ctx.memory.sync();
   const found=selectBikeRides(ctx.rides,settings,ctx.catalog,ctx.matrix,ctx.engine);if(ticket!==sequence)return;
   rows=found;currentSettings=settings;stopViews.clear();guard=bikeGuard(ctx.memory.get());revision=ctx.memory.revision;
   const url=new URL(location.href);url.search='';for(const [name,value]of new FormData(form))url.searchParams.set(name,String(value));if(settings.trailer)url.searchParams.set('trailer','1');history.replaceState(null,'',url);
   drawTabs();
   status.textContent=rows.length?`${dateLabel(settings.date)} · начало ${clock(settings.start)}. ${settings.journey==='loop'&&!settings.end_at?'Возвращение к старту учтено. ':''}Выберите прогулку — она добавится отдельным днём.`:'Для этого направления пока нет прогулок. Выберите соседний город.';
   if(rows.length)show(rows[0].state);else list.replaceChildren();
  }catch(error){if(ticket===sequence){status.textContent=error.message||'Расчёт пока не загрузился. Нажмите «Подобрать прогулку», чтобы повторить.';}}
  finally{busy=false;submit.disabled=false;}
 }
 form.addEventListener('input',()=>{sequence++;rows=[];tabs.replaceChildren();list.replaceChildren();status.textContent='Условия изменились. Нажмите «Подобрать прогулку».';});
 form.addEventListener('submit',calculate);submit.disabled=false;calculate();
}
