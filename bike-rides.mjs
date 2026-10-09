import {bikeSettings,selectBikeRides,appendBikeDay,bikeGuard} from './bike-rides-state.mjs?v=1';
import {bikeDistance} from './bike-route-profile.mjs';
import {loadScheduler} from './trip-scheduler.mjs?v=42';
import {loadTravelMatrix} from './travel-estimates.mjs?v=12';
const base=new URL('./',import.meta.url),root=document.querySelector('[data-bike-rides]');
const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
const names={fits:'По вашим условиям',needs_info:'Нужно уточнить',does_not_fit:'Не подходят'};
const clock=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
const duration=n=>n==null?'Время не рассчитано':n<60?`${n} мин`:`${Math.floor(n/60)} ч${n%60?' '+n%60+' мин':''}`;
const dateLabel=date=>new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric'}).format(new Date(date+'T12:00:00'));
if(root){
 const form=root.querySelector('form'),status=root.querySelector('[role=status]'),list=root.querySelector('[data-bike-results]'),tabs=root.querySelector('[data-bike-tabs]');
 const field=name=>form.elements.namedItem(name),submit=form.querySelector('[type=submit]');
 let ctx,pending,rows=[],guard,revision,sequence=0,busy=false,saving=false;
 field('date').value=new Date().toLocaleDateString('sv-SE');
 const initial=new URL(location.href).searchParams;
 for(const name of ['area','available','max_km','surface','adults','children','date','start'])if(initial.has(name)){
  const el=field(name),value=initial.get(name);
  if(el.tagName!=='SELECT'||[...el.options].some(option=>option.value===value))el.value=value;
 }
 field('trailer').checked=initial.get('trailer')==='1';
 const getSettings=()=>{const [hour,minute]=field('start').value.split(':').map(Number);return bikeSettings({
  ...Object.fromEntries(new FormData(form)),start:hour*60+minute,trailer:field('trailer').checked});};
 async function load(){
  if(!pending)pending=(async()=>{
   const [{createTripMemory},{loadTrip},catalogResponse,ridesResponse,matrix,engine]=await Promise.all([
    import('./trip-memory.mjs?v=25'),import('./trip-memory-bootstrap.mjs?v=4'),
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
 function card(row){
  const article=node('article',undefined,'bike-card');article.dataset.ride=row.id;
  const point=ctx.catalog.poi.find(p=>p.slug===row.ride.image_poi);
  if(point?.photos?.[0]){const img=node('img');img.src=new URL(point.photos[0],base);img.alt='';img.loading='lazy';img.width=960;img.height=480;article.append(img);}
  const content=node('div',undefined,'bike-card-body'),heading=node('h3',row.ride.name),metrics=node('div',undefined,'bike-metrics');
  metrics.append(node('span',row.distance_m==null?'Длина не рассчитана':bikeDistance(row.distance_m)),node('span',duration(row.duration_minutes)));
  const area=ctx.catalog.poi.find(p=>p.slug===row.ride.stops[0].poi)?.area_name||'';
  content.append(node('p',area,'inner-kicker'),heading,metrics,node('p',row.ride.description));
  const stops=node('ol',undefined,'bike-stops');
  for(const stop of row.ride.stops){
   const point=ctx.catalog.poi.find(p=>p.slug===stop.poi),time=row.plan.stops.find(s=>s.id===stop.poi),li=node('li'),link=node('a',point.name);
   link.href=new URL(`poi/${point.slug}/`,base);li.append(link,node('small',`${time?.begins!=null?clock(time.begins)+' · ':''}${stop.visit_minutes?stop.visit_minutes+' мин на остановку':'Начало прогулки'}`));stops.append(li);
  }
  content.append(stops,node('p','В одну сторону · осмотр снаружи','bike-caption'));
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
  }else actions.append(node('p','Измените время или условия выше.','bike-caption'));
  content.append(actions);article.append(content);return article;
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
   rows=found;guard=bikeGuard(ctx.memory.get());revision=ctx.memory.revision;
   const url=new URL(location.href);url.search='';for(const [name,value]of new FormData(form))url.searchParams.set(name,String(value));if(settings.trailer)url.searchParams.set('trailer','1');history.replaceState(null,'',url);
   tabs.replaceChildren(...Object.entries(names).filter(([state])=>rows.some(row=>row.state===state)).map(([state,name])=>{
    const button=node('button',`${name} · ${rows.filter(row=>row.state===state).length}`);button.type='button';button.dataset.state=state;button.setAttribute('aria-pressed','false');button.addEventListener('click',()=>show(state));return button;
   }));
   status.textContent=rows.length?`${dateLabel(settings.date)} · начало ${clock(settings.start)}. Выберите прогулку — она добавится отдельным днём.`:'Для этого направления пока нет прогулок. Выберите соседний город.';
   if(rows.length)show(rows[0].state);else list.replaceChildren();
  }catch(error){if(ticket===sequence){status.textContent=error.message||'Расчёт пока не загрузился. Нажмите «Подобрать прогулку», чтобы повторить.';}}
  finally{busy=false;submit.disabled=false;}
 }
 form.addEventListener('input',()=>{sequence++;rows=[];tabs.replaceChildren();list.replaceChildren();status.textContent='Условия изменились. Нажмите «Подобрать прогулку».';});
 form.addEventListener('submit',calculate);submit.disabled=false;calculate();
}
