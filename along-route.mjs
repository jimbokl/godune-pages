import {alongContext,alongCandidates,insertionVariants,alongInput,confirmAlong,alongGuard} from './along-route-state.mjs?v=4';
import {alongServiceCandidates,serviceInsertionVariants,scheduleServiceInsertion,serviceTypeNames} from './along-route-services-state.mjs';
import {formatKopecks} from './trip-money.mjs';
import {rentalDetails} from './trip-rental-view.mjs';
import {dayPeople} from './trip-party.mjs?v=1';
import {selectedDay,journeyDays,ensureJourney} from './trip-days-state.mjs?v=27';
import {loadScheduler} from './trip-scheduler.mjs?v=42';
import {loadTripTravelMatrix} from './travel-estimates.mjs?v=13';
import {dayChangeText} from './trip-day-change-view.mjs?v=1';
const base=new URL('./',import.meta.url),root=document.querySelector('[data-along-route]');
const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
const names={fits:'Подходит по расчёту',needs_info:'Нужно уточнить',does_not_fit:'Не помещается'};
const errorText=error=>({service_day_rail_unresolved:'Обновите обратную электричку в «Моём дне», затем повторите подбор.',service_day_generated_unresolved:'Измените этот день в транспортном планировщике.'}[error.message]||error.message||'Подбор пока не загрузился. Попробуйте снова.');
const dateLabel=date=>date?new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long'}).format(new Date(date+'T12:00:00')):'без даты';
if(root){
 const form=root.querySelector('form'),status=root.querySelector('[role=status]'),list=root.querySelector('[data-along-results]'),tabs=root.querySelector('[data-along-tabs]'),summary=root.querySelector('[data-along-summary]');
 const field=name=>form.elements.namedItem(name),submit=form.querySelector('[type=submit]');
 let ctx,pending,sequence=0,rows=[],variants=[],original,guard,context,revision,busy=false;
 async function load(){
  if(!pending)pending=(async()=>{
   const [{createTripMemory},{loadTrip},response,serviceResponse,engine]=await Promise.all([
    import('./trip-memory.mjs?v=26'),import('./trip-memory-bootstrap.mjs?v=5'),fetch(new URL('data/catalog.json',base),{cache:'no-cache'}),fetch(new URL('data/along-services.json',base),{cache:'no-cache'}),loadScheduler(base)]);
   if(!response.ok)throw Error('Не удалось открыть места и прогулки.');const catalog=await response.json();let storage;try{storage=localStorage;}catch{}
   if(!serviceResponse.ok)throw Error('Не удалось открыть услуги.');const services=await serviceResponse.json();
   if(services.version!==1||!Array.isArray(services.entries))throw Error('Обновите страницу, чтобы открыть услуги.');
   const memory=createTripMemory(catalog,loadTrip(storage,catalog),storage);await memory.ready;
   if(memory.compatibility)throw Error('Сначала откройте сохранённую поездку в планировщике.');
   window.addEventListener('storage',()=>memory.sync());document.addEventListener('visibilitychange',()=>{if(!document.hidden)memory.sync();});
   return {catalog,services:services.entries,memory,engine};
  })().catch(error=>{pending=null;throw error;});
  return pending;
 }
 function choices(trip,initial=false){
  const chosen=field('context').value,days=journeyDays(ensureJourney(trip));
  const group=node('optgroup');group.label='Ваша поездка';
  for(const [i,day] of days.entries())if(day.places.length||day.service_visits?.length){
   const option=node('option',`День ${i+1} · ${dateLabel(day.date)}`);option.value=`day:${day.id}`;group.append(option);
  }
  const publicGroup=node('optgroup');publicGroup.label='Готовые прогулки с осмотром снаружи';
  for(const route of ctx.catalog.routes){const option=node('option',route.name);option.value=`route:${route.slug}`;publicGroup.append(option);}
  field('context').replaceChildren(...(group.children.length?[group]:[]),publicGroup);
  if(initial&&group.children.length){const active=`day:${selectedDay(ensureJourney(trip)).id}`;field('context').value=[...group.children].some(row=>row.value===active)?active:group.firstElementChild.value;}
  else if([...field('context').options].some(option=>option.value===chosen))field('context').value=chosen;
  else if(!initial&&chosen){const option=node('option','День удалён — выберите другой');option.value=chosen;field('context').prepend(option);field('context').value=chosen;}
  else if(group.children.length){const active=`day:${selectedDay(ensureJourney(trip)).id}`;field('context').value=[...group.children].some(row=>row.value===active)?active:group.firstElementChild.value;}
  syncDate(trip);
  if(initial)field('people').value=dayPeople(selectedDay(ensureJourney(trip)),trip.itinerary?.people||1);
 }
 function syncDate(trip){
  const day=journeyDays(ensureJourney(trip)).find(d=>`day:${d.id}`===field('context').value);
  field('date').readOnly=!!day?.date;
  if(day?.date)field('date').value=day.date;
  else if(!field('date').value)field('date').value=new Date().toLocaleDateString('sv-SE');
 }
 function invalidate(){sequence++;rows=[];tabs.replaceChildren();list.replaceChildren();summary.textContent='';status.textContent='Выберите условия и нажмите «Найти остановку».';}
 function filter(state){
  for(const button of tabs.children)button.setAttribute('aria-pressed',String(button.dataset.state===state));
  list.replaceChildren(...rows.filter(row=>row.state===state).map(card));
 }
 function card(row){
  const variant=variants.find(v=>v.id===row.id),service=variant.service,point=service||ctx.catalog.poi.find(p=>p.slug===row.candidate);
  const article=node('article',undefined,'along-card');article.dataset.candidate=row.candidate;
  if(point.photos?.[0]){const img=node('img');img.src=new URL(point.photos[0],base);img.alt='';img.loading='lazy';img.width=720;img.height=440;article.append(img);}
  const content=node('div',undefined,'along-card-body'),eyebrow=node('p',`${service?serviceTypeNames[service.category]:point.category_name} · ${point.area_name}`,'inner-kicker');
  const heading=node('h3'),link=node('a',point.name);link.href=new URL(service?service.href.replace(/^\//,''):`poi/${point.slug}/`,base);heading.append(link);
  if(service?.photo){const img=node('img');img.src=new URL(service.photo.src,base);img.alt=service.photo.alt;img.loading='lazy';img.width=720;img.height=440;article.append(img);}
  const order=selectedDay(variant.trip).timeline?.order||variant.trip.places.map(id=>({kind:'place',id}));
  const previous=order[variant.position-1],after=order[variant.position+1];
  const label=entry=>entry?.kind==='place'?ctx.catalog.poi.find(p=>p.slug===entry.id)?.name:entry?selectedDay(variant.trip).service_visits?.find(v=>v.id===entry.id)?.name:null;
  const position=previous?`После: ${label(previous)||'посещения'}`:after?`Перед: ${label(after)||'посещением'}`:'Первая остановка';
  content.append(eyebrow,heading,node('p',position,'along-position'));
  const details=node('ul',undefined,'along-impact');for(const text of dayChangeText(row.change))details.append(node('li',text));content.append(details);
  if(service)serviceFacts(content,row,variant);
  else{
   const stop=variant.trip.schedule.stops[point.slug],price=point.price;
   const cost=node('p',stop.visit_scope==='outside'?'Осмотр снаружи · билет внутрь не включён':price?.text||'Стоимость посещения нужно уточнить.','along-price');content.append(cost);
   const source=stop.visit_scope==='outside'?null:price?.source,reference=source?.url||point.source_url;
   if(reference){const a=node('a',`Источник${(source?.checked_at||point.verified_at)?' · '+dateLabel(source?.checked_at||point.verified_at):''}`,'along-source');a.href=reference;a.target='_blank';a.rel='noopener';content.append(a);}
  }
  const actions=node('div',undefined,'along-actions'),add=node('button',context.startsWith('day:')?'Добавить в этот день':'Сохранить новый день','along-save');add.type='button';
  add.addEventListener('click',async()=>{
   if(busy)return;busy=true;list.querySelectorAll('button').forEach(b=>b.disabled=true);submit.disabled=true;
   try{
    await ctx.memory.sync();
    if(alongGuard(ctx.memory.get())!==guard)throw Error('Поездка изменилась. Повторите подбор — новые данные уже загружены.');
    const result=await ctx.memory.change(current=>confirmAlong(current,{guard,context,trip:variant.trip},ctx.catalog),{expectedRevision:revision});
    if(result.conflict)throw Error('Поездка изменилась. Повторите подбор перед добавлением.');
    sequence++;rows=[];tabs.replaceChildren();list.replaceChildren();summary.textContent='';
    status.replaceChildren(node('span',result.saved?'Остановка сохранена. ':'День пока сохранён только в этой вкладке. '));
    const open=node('a','Открыть Мой день →');open.href=new URL('planner/',base);status.append(open);
    if(!result.saved){const file=node('button','Скачать файл поездки');file.type='button';file.addEventListener('click',()=>{
     const url=URL.createObjectURL(new Blob([JSON.stringify(ctx.memory.get(),null,2)],{type:'application/json'})),a=node('a');a.href=url;a.download='godune-trip.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    });status.append(file);}
    choices(ctx.memory.get());
   }catch(error){status.textContent=errorText(error);choices(ctx.memory.get());}
   finally{busy=false;submit.disabled=false;list.querySelectorAll('button').forEach(b=>b.disabled=false);}
  });
  actions.append(add,link.cloneNode(true));actions.lastChild.textContent='Подробнее →';content.append(actions);article.append(content);return article;
 }
 function serviceFacts(content,row,variant){
  const visit=selectedDay(variant.trip).service_visits.find(v=>v.id===variant.visitId),assessment=row.change.after.visits.find(v=>v.id===variant.visitId)?.assessment;
  content.append(node('p',variant.service.description,'along-price'));
  const facts=node('dl',undefined,'along-service-facts'),put=(label,value)=>facts.append(node('dt',label),node('dd',value));
  const money=value=>value==null?'Нужно уточнить':formatKopecks(value);
  put('Стоимость',money(assessment?.summary.cost_total));put('Залог',money(assessment?.quote?.deposit.total));put('При выдаче или входе',money(assessment?.summary.upfront_total));
  const input=visit.selection.visit.input,price=visit.selection.price||input.price,charge=price?.tariff.base;
  if(charge?.rate.kind==='fixed')put('Тариф',`${formatKopecks(charge.rate.amount)}${charge.billing.kind==='duration'?` за ${charge.billing.step_minutes} мин`:charge.billing.kind==='session'?' за сеанс':''} · ${{unit:'за единицу',person:'за гостя',group:'за группу'}[charge.scope]}`);
  put('Гостей',String(visit.selection.participants.party_size??visit.selection.participants.people?.length));
  if(visit.selection.visit.kind==='rental'&&price)put('Инвентаря',String(price.selection.units));
  content.append(facts);
  const cycle=rentalDetails(visit,assessment);
  if(cycle.length){const details=node('details',undefined,'along-options'),title=node('summary','Получение и возврат'),list=node('dl',undefined,'along-service-facts');
   for(const fact of cycle)list.append(node('dt',fact.label==='Вернуться к базе'?'Завершить прогулку':fact.label),node('dd',fact.value));
   details.append(title,list);content.append(details);}
  const sources=[...new Map((visit.provenance?.facts||[]).map(f=>[f.source.reference+'|'+f.source.checked_at,f.source])).values()];
  if(sources.length){const details=node('details',undefined,'along-options'),title=node('summary','Источники и дата проверки');details.append(title);
   for(const [i,source] of sources.entries()){const a=node('a',`Источник ${i+1} · ${dateLabel(source.checked_at)}`,'along-source');a.href=source.reference;a.target='_blank';a.rel='noopener';details.append(a);}content.append(details);}
 }
 form.addEventListener('input',invalidate);
 field('context').addEventListener('change',()=>{if(ctx)syncDate(ctx.memory.get());});
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;busy=true;submit.disabled=true;const ticket=++sequence;
  status.textContent='Проверяем дорогу, посещение и возвращение…';
  try{
   ctx=await load();await ctx.memory.sync();original=ctx.memory.get();guard=alongGuard(original);revision=ctx.memory.revision;context=field('context').value;
   const before=alongContext(original,ctx.catalog,{context,date:field('date').value});
   const type=field('type').value,candidates=type==='services'?[]:alongCandidates(before,ctx.catalog,type,ctx.services);
   const settings={visit:Number(field('visit').value),scope:field('scope').value,people:Number(field('people').value),units:Number(field('units').value)};
   const matrix=await loadTripTravelMatrix(base,before,ctx.catalog).catch(()=>null);
   variants=[...candidates.flatMap(point=>insertionVariants(before,point,ctx.catalog,settings)),
    ...alongServiceCandidates(before,ctx.catalog,ctx.services,type).flatMap(entry=>serviceInsertionVariants(ctx.engine,before,entry,ctx.catalog,settings,undefined,matrix))];
   if(selectedDay(before).start_at?.kind==='personal'||selectedDay(before).night_at?.kind==='personal'||selectedDay(before).bookings?.length){
    await Promise.all(variants.map(async row=>{row.matrix=await loadTripTravelMatrix(base,row.trip,ctx.catalog).catch(()=>null);}));
    variants=variants.map(row=>row.service?scheduleServiceInsertion(ctx.engine,row,ctx.catalog,row.matrix):row);
   }
   const found=ctx.engine.alongRoute(alongInput(ctx.engine,before,variants,ctx.catalog,matrix,Number(field('available').value)));
   if(ticket!==sequence)return;rows=found;
   tabs.replaceChildren(...Object.entries(names).filter(([state])=>rows.some(row=>row.state===state)).map(([state,label])=>{
    const button=node('button',`${label} · ${rows.filter(row=>row.state===state).length}`);button.type='button';button.dataset.state=state;button.setAttribute('aria-pressed','false');button.addEventListener('click',()=>filter(state));return button;
   }));
   summary.textContent=`Остановок в плане: ${before.places.length+(selectedDay(before).service_visits?.length||0)} · ${field('visit').value} мин на посещение · до ${field('available').value} мин дополнительно`;
   status.textContent=rows.length?'Выберите остановку. День изменится только после добавления.':'Все места этого типа уже выбраны или находятся в другом городе. Попробуйте другой тип остановки.';
   if(rows.length)filter(rows[0].state);
  }catch(error){if(ticket===sequence)status.textContent=errorText(error);}
  finally{busy=false;submit.disabled=false;}
 });
 load().then(result=>{ctx=result;choices(ctx.memory.get(),true);submit.disabled=false;root.dataset.ready='true';status.textContent='Выберите прогулку или свой сохранённый день.';}).catch(()=>{
  submit.disabled=false;status.textContent='Не удалось открыть подбор. Нажмите «Найти остановку», чтобы повторить загрузку.';
 });
}
