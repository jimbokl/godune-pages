import {restContext,rainStops,restVariants,restInput,confirmRest} from './rest-day-state.mjs?v=1';
import {alongGuard} from './along-route-state.mjs?v=5';
import {selectedDay,ensureJourney,journeyDays} from './trip-days-state.mjs?v=27';
import {timelineOrder} from './trip-service-timeline-state.mjs';
import {loadScheduler} from './trip-scheduler.mjs?v=42';
import {loadTripTravelMatrix} from './travel-estimates.mjs?v=13';
import {dayChangeText} from './trip-day-change-view.mjs?v=1';
import {formatKopecks} from './trip-money.mjs';
import {dayPeople} from './trip-party.mjs?v=1';
import {scheduleServiceInsertion} from './along-route-services-state.mjs?v=1';
import {dayJourneyBoundaries,canConfigureJourneyBoundaries} from './day-journey-boundaries.mjs?v=4';
const base=new URL('./',import.meta.url),root=document.querySelector('[data-rest-day]');
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const labels={fits:'Подходит по расчёту',needs_info:'Нужно уточнить',does_not_fit:'Не помещается'};
const time=v=>v==null?'Нужно уточнить':`${String(Math.floor(v/60)%24).padStart(2,'0')}:${String(v%60).padStart(2,'0')}${v>=1440?' · следующий день':''}`;
const dateLabel=v=>v?new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long'}).format(new Date(v+'T12:00:00')):'без даты';
if(root){
 const form=root.querySelector('form'),field=n=>form.elements.namedItem(n),submit=form.querySelector('[type=submit]');
 const status=root.querySelector('[role=status]'),results=root.querySelector('[data-rest-results]'),tabs=root.querySelector('[data-rest-tabs]');
 const remove=root.querySelector('[data-rest-remove]'),removeList=root.querySelector('[data-rest-remove-list]'),returnLabel=root.querySelector('[data-rest-return]');
 let ctx,pending,busy=false,sequence=0,rows=[],variants=[],guard,revision,context;
 async function load(){
  if(!pending)pending=(async()=>{
   const [{createTripMemory},{loadTrip},c,s,engine]=await Promise.all([import('./trip-memory.mjs?v=26'),import('./trip-memory-bootstrap.mjs?v=5'),fetch(new URL('data/catalog.json',base),{cache:'no-cache'}),fetch(new URL('data/along-services.json',base),{cache:'no-cache'}),loadScheduler(base)]);
   if(!c.ok||!s.ok)throw Error('Не удалось открыть места. Повторите подбор.');
   const catalog=await c.json(),registry=await s.json();if(registry.version!==1||!Array.isArray(registry.entries))throw Error('Обновите страницу, чтобы открыть места.');
   let storage;try{storage=localStorage;}catch{}
   const memory=createTripMemory(catalog,loadTrip(storage,catalog),storage);await memory.ready;
   if(memory.compatibility)throw Error('Сначала откройте сохранённую поездку в «Моём дне».');
   window.addEventListener('storage',()=>memory.sync());document.addEventListener('visibilitychange',()=>{if(!document.hidden)memory.sync();});
   return {catalog,entries:registry.entries,engine,memory};
  })().catch(e=>{pending=null;throw e;});return pending;
 }
 function invalidate(){sequence++;rows=[];variants=[];tabs.replaceChildren();results.replaceChildren();status.textContent='Нажмите «Сравнить варианты», чтобы обновить план.';}
 function controls(trip,initial=false){
  const chosen=field('context').value,days=journeyDays(ensureJourney(trip));
  form.querySelector('optgroup[data-saved-days]')?.remove();
  const group=node('optgroup');group.label='Ваши дни';group.dataset.savedDays='';
  for(const [i,day] of days.entries())if(day.places.length||day.service_visits?.length){const o=node('option',`День ${i+1} · ${dateLabel(day.date)}`);o.value='day:'+day.id;group.append(o);}
  if(group.children.length)field('context').prepend(group);
  const requested=new URL(location.href).searchParams.get('context');
  if(initial&&requested&&[...field('context').options].some(o=>o.value===requested))field('context').value=requested;
  else if(initial&&group.children.length){const active='day:'+selectedDay(ensureJourney(trip)).id;field('context').value=[...group.children].some(o=>o.value===active)?active:group.firstElementChild.value;}
  else if([...field('context').options].some(o=>o.value===chosen))field('context').value=chosen;
  if(initial)field('people').value=dayPeople(selectedDay(ensureJourney(trip)),trip.itinerary?.people||2);
  syncContext(trip);
 }
 function syncContext(trip){
  const day=journeyDays(ensureJourney(trip)).find(d=>'day:'+d.id===field('context').value);
  field('date').readOnly=!!day?.date;
  if(day?.date)field('date').value=day.date;
  else if(!field('date').value)field('date').value=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Kaliningrad'});
  let before;try{before=restContext(trip,ctx.catalog,{context:field('context').value,date:field('date').value});}
  catch(e){remove.hidden=true;removeList.replaceChildren();returnLabel.textContent=e.message;return;}
  const d=selectedDay(before),start=typeof d.start_at==='string'?ctx.catalog.poi.find(p=>p.slug===d.start_at):null;
  const bounds=dayJourneyBoundaries(d,ctx.catalog),destination=(bounds.rows.find(r=>r.entry.kind==='destination')||bounds.rows.find(r=>r.entry.id==='__day_night'))?.anchor;
  const area=start?.area||ctx.catalog.poi.find(p=>before.places.includes(p.slug))?.area;
  const selectedReturn=field('returnTo').value;field('returnTo').replaceChildren();
  const def=node('option','По настройкам дня');def.value='';field('returnTo').append(def);
  for(const p of ctx.catalog.poi.filter(p=>!area||p.area===area)){const o=node('option',p.name);o.value=p.slug;field('returnTo').append(o);}
  if([...field('returnTo').options].some(o=>o.value===selectedReturn))field('returnTo').value=selectedReturn;
  field('returnTo').disabled=!canConfigureJourneyBoundaries(d);
  returnLabel.textContent=`${start?'Начало: '+start.name+'. ':''}${destination?'Вернёмся: '+destination.name+'.':'Выберите точку возвращения в настройках дня.'}`;
  const stops=rainStops(before,ctx.catalog);remove.hidden=root.dataset.restDay!=='rain'||!stops.length;
  removeList.replaceChildren(...stops.map(p=>{const label=node('label'),input=node('input');input.type='checkbox';input.name='remove';input.value=p.slug;input.checked=true;label.append(input,node('span',p.name));return label;}));
 }
 function render(state){
  for(const b of tabs.children)b.setAttribute('aria-pressed',String(b.dataset.state===state));
  results.replaceChildren(...rows.filter(r=>r.state===state).map(card));
 }
 function card(row){
  const variant=variants.find(v=>v.id===row.id),day=selectedDay(variant.trip),article=node('article',undefined,'rest-card');article.dataset.variant=row.id;
  const top=node('div',undefined,'rest-card-top'),kind={bath:'Баня',pool:'Бассейн',gym:'Спортзал'}[variant.activity.category];
  top.append(node('p',kind+' + обед','inner-kicker'),node('span',labels[row.state],'rest-state'));article.append(top);
  article.append(node('h2',variant.activity.name));
  const sequence=node('ol',undefined,'rest-timeline');
  const link=(name,url)=>{const a=node('a',name);a.href=new URL(url.replace(/^\//,''),base);return a;};
  const put=(label,title,url,copy)=>{const item=node('li'),body=node('div');body.append(node('p',label,'rest-step-label'),url?link(title,url):node('strong',title));if(copy)body.append(node('p',copy));item.append(body);sequence.append(item);};
  put('01 · Отдых',variant.activity.name,variant.activity.href,`${field('activityMinutes').value} мин · ${variant.activity.area_name}`);
  put('02 · Обед',variant.meal.name,variant.meal.service?.href||`poi/${variant.meal.id}/`,`${field('mealMinutes').value} мин на месте`);
  const bounds=dayJourneyBoundaries(day,ctx.catalog),endpoint=(bounds.rows.find(r=>r.entry.kind==='destination')||bounds.rows.find(r=>r.entry.id==='__day_night'))?.anchor?.name;
  put('03 · Возвращение',endpoint||'Точка возвращения не выбрана',null,`Конец дня: ${time(row.change.after_timing.finish)}`);
  article.append(sequence);
  const impacts=node('ul',undefined,'rest-impact');for(const t of dayChangeText(row.change).slice(0,3))impacts.append(node('li',t));article.append(impacts);
  const details=node('details',undefined,'rest-details');details.append(node('summary','План, стоимость и условия'));
  const full=node('ol',undefined,'rest-full-plan');for(const e of timelineOrder(day)){
   const name=e.kind==='place'?ctx.catalog.poi.find(p=>p.slug===e.id)?.name:day.service_visits?.find(v=>v.id===e.id)?.name;full.append(node('li',name||'Остановка'));
  }details.append(full);
  if(variant.removed.length){details.append(node('p','Переносим прогулки: '+variant.removed.map(id=>ctx.catalog.poi.find(p=>p.slug===id)?.name).join(', ')));}
  const money=v=>v==null?'нужно уточнить':formatKopecks(v),facts=node('dl',undefined,'rest-facts');
  facts.append(node('dt','Конец прежнего дня'),node('dd',time(row.change.before_timing.finish)));
  for(const id of variant.visitIds){const v=day.service_visits.find(v=>v.id===id),a=row.change.after.visits.find(v=>v.id===id)?.assessment;facts.append(node('dt',v.name),node('dd',`${money(a?.summary.cost_total)} · залог: ${money(a?.quote?.deposit.total)}`));}
  details.append(facts);const all=node('ul');for(const t of dayChangeText(row.change))all.append(node('li',t));details.append(all);
  const sources=node('p');sources.append(link('Условия места отдыха →',variant.activity.href));details.append(sources);article.append(details);
  const button=node('button',context.startsWith('day:')?'Выбрать этот вариант':'Сохранить новый день','rest-save');button.type='button';
  button.addEventListener('click',()=>save(variant));article.append(button);return article;
 }
 async function save(variant){
  if(busy)return;busy=true;results.querySelectorAll('button').forEach(b=>b.disabled=true);submit.disabled=true;
  try{
   await ctx.memory.sync();if(alongGuard(ctx.memory.get())!==guard)throw Error('Поездка изменилась. Сравните варианты ещё раз.');
   const result=await ctx.memory.change(current=>confirmRest(current,{guard,context,trip:variant.trip},ctx.catalog),{expectedRevision:revision});
   if(result.conflict)throw Error('Поездка изменилась. Повторите подбор перед сохранением.');
   sequence++;results.replaceChildren();tabs.replaceChildren();status.replaceChildren(node('strong',result.saved?'День сохранён. ':'День сохранён только в этой вкладке. '));
   const open=node('a','Открыть Мой день и скачать буклет →');open.href=new URL('planner/',base);status.append(open);
   if(!result.saved){const file=node('button','Скачать файл поездки');file.type='button';file.addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(ctx.memory.get(),null,2)],{type:'application/json'})),a=node('a');a.href=url;a.download='godune-trip.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});status.append(file);}
   controls(ctx.memory.get());
  }catch(e){invalidate();status.textContent=e.message;controls(ctx.memory.get());}
  finally{busy=false;submit.disabled=false;results.querySelectorAll('button').forEach(b=>b.disabled=false);}
 }
 form.addEventListener('input',invalidate);
 field('context').addEventListener('change',()=>{if(ctx)syncContext(ctx.memory.get());});
 field('date').addEventListener('change',()=>{if(ctx)syncContext(ctx.memory.get());});
 field('returnTo').addEventListener('change',()=>{
  if(!ctx)return;
  const p=ctx.catalog.poi.find(p=>p.slug===field('returnTo').value);
  if(p)returnLabel.textContent='Вернёмся: '+p.name+'.';else syncContext(ctx.memory.get());
 });
 form.addEventListener('submit',async e=>{
  e.preventDefault();if(busy)return;busy=true;submit.disabled=true;const ticket=++sequence;results.replaceChildren();tabs.replaceChildren();status.textContent='Собираем варианты с обедом и возвращением…';
  try{
   ctx=await load();await ctx.memory.sync();const original=ctx.memory.get();guard=alongGuard(original);revision=ctx.memory.revision;context=field('context').value;
   const before=restContext(original,ctx.catalog,{context,date:field('date').value,returnTo:field('returnTo').value});
   const nullable=name=>field(name).value===''?null:Number(field(name).value);
   const timing=prefix=>{const values={stages:{approach:0,return_walk:0}};for(const key of ['prepare','collect','change_before','change_after','complete']){
    const value=nullable(prefix+'_'+key);if(value!==null)(['collect','complete'].includes(key)?values.stages:values)[key]=value;
   }return values;};
   const settings={mode:root.dataset.restDay,people:Number(field('people').value),activityMinutes:Number(field('activityMinutes').value),mealMinutes:Number(field('mealMinutes').value),
    remove:[...form.querySelectorAll('[name=remove]:checked')].map(n=>n.value),roads:[0,1,2].map(i=>nullable('road'+i)),visit_timing:timing('activity'),meal_timing:timing('meal')};
   const matrix=await loadTripTravelMatrix(base,before,ctx.catalog).catch(()=>null);
   variants=restVariants(ctx.engine,before,ctx.catalog,ctx.entries,settings,matrix);
   // Personal origins require their own directed road matrix per variant.
   if(typeof selectedDay(before).start_at==='object'&&selectedDay(before).start_at||typeof selectedDay(before).night_at==='object'&&selectedDay(before).night_at){
    await Promise.all(variants.map(async v=>{v.matrix=await loadTripTravelMatrix(base,v.trip,ctx.catalog).catch(()=>null);
     for(const visitId of v.visitIds)v.trip=scheduleServiceInsertion(ctx.engine,{trip:v.trip,visitId},ctx.catalog,v.matrix).trip;
    }));
   }
   const found=ctx.engine.alongRoute(restInput(ctx.engine,before,variants,ctx.catalog,matrix));if(ticket!==sequence)return;rows=found;
   if(!rows.length){status.textContent='Для этого места пока нет пары «отдых + обед». Выберите Калининград или Светлогорск — там уже есть реальные варианты.';return;}
   tabs.replaceChildren(...Object.entries(labels).filter(([state])=>rows.some(r=>r.state===state)).map(([state,label])=>{const b=node('button',`${label} · ${rows.filter(r=>r.state===state).length}`);b.type='button';b.dataset.state=state;b.setAttribute('aria-pressed','false');b.addEventListener('click',()=>render(state));return b;}));
   render(rows[0].state);status.textContent='Сравните варианты. Поездка изменится после вашего выбора.';
  }catch(e){if(ticket===sequence)status.textContent=({service_day_rail_unresolved:'Обновите обратную электричку в «Моём дне» и повторите подбор.',service_day_generated_unresolved:'Этот день меняется в транспортном планировщике.'}[e.message]||e.message);}
  finally{busy=false;submit.disabled=false;}
 });
 load().then(c=>{ctx=c;controls(ctx.memory.get(),true);root.dataset.ready='true';submit.disabled=false;status.textContent='Выберите место или свой день. Остальное соберём в варианты.';}).catch(e=>{submit.disabled=false;status.textContent=e.message;});
}
