import {eventDurationEstimateText} from './trip-events-duration.mjs?v=2026101707';
import {eventPath,calendarDate,regionClock,eventTiming,eventInterval,eventsForDate,eventCacheState,coverageForDate} from './events-engine.mjs?v=2026102001';

const CACHE_PREFIX='godune:nearby:152:';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeURL=value=>{try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}};
const dateLabel=date=>calendarDate(date)?new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Kaliningrad'}).format(new Date(`${date}T12:00:00+02:00`)):String(date||'Дата не указана');
const timeLabel=value=>value?new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Kaliningrad'}).format(new Date(value)):'';
const evidenceLabel=value=>{const date=String(value||'').slice(0,10);return calendarDate(date)?dateLabel(date):'дата сверки не указана';};
const coverageText={verified_partial:'',no_verified_events:'На эту дату пока нет проверенных событий в нашей подборке.',not_published:'Площадка ещё не опубликовала программу на эту дату.',fetch_failed:'Не удалось обновить афишу. Проверьте программу по ссылке площадки.',outside_window:'Дата вне подготовленной подборки. Проверьте программу у площадки.',unknown:'Полнота афиши на эту дату не подтверждена.'};

/** Display the Rust report. Source dates, links and original values are intact. */
export function applyFreshnessReport(doc,report){
  for(const panel of doc.querySelectorAll('[data-fact-subject]')){
    let review=false;
    for(const row of panel.querySelectorAll('[data-fact-path]')){
      const fact=report.facts?.find(f=>f.subject?.id===panel.dataset.factSubject&&f.subject?.kind===(panel.dataset.factKind||'place')&&f.path===row.dataset.factPath);
      if(!fact)continue;
      row.dataset.factFreshness=fact.freshness;
      const text=fact.effective_status==='conflict'?'источники расходятся — уточните перед визитом':fact.freshness==='needs_review'?'данные устарели — уточните перед визитом':fact.freshness==='not_yet_valid'?'эти сведения ещё не действуют':fact.freshness==='outside_validity'?'указанный срок действия закончился':fact.freshness==='current'&&fact.effective_status==='confirmed'?'':'не подтверждено — уточните перед визитом';
      const label=row.querySelector('[data-fact-state]');if(label&&label.textContent!==text)label.textContent=text;
      review||=fact.freshness==='needs_review';
      let hint=row.querySelector('[data-fact-visit-hint]');
      const applicability={beyond_review_horizon:'К дате поездки сведения потребуют повторной проверки.',before_validity:'На дату поездки эти сведения ещё не действуют.',after_validity:'На дату поездки срок этих сведений закончится.'}[fact.visit_applicability];
      if(applicability){if(!hint){hint=doc.createElement('span');hint.dataset.factVisitHint='';row.append(hint);}hint.textContent=' '+applicability;}
      else hint?.remove();
      row.hidden=!text&&!applicability;
    }
    panel.hidden=![...panel.querySelectorAll('[data-fact-path]')].some(row=>!row.hidden);
    panel.dataset.factNeedsReview=String(review);panel.dataset.factAsOf=report.as_of;
  }
}

/** Pure presentation selection; all date/interval/cache decisions use Events152. */
export function nearbyModel({buckets=new Map(),index=null,city,date=null,now=new Date(),places=[]}) {
  const clock=regionClock(now), dates=date?[date]:(clock.tomorrow_primary?[clock.tomorrow,clock.date]:[clock.date,clock.tomorrow]);
  const seen=new Set(),days=[];
  for(const day of dates){
    const entry=buckets.get(day), data=entry?.data||{events:[]};
    const cache=eventCacheState(entry?.meta||{},now,{date:day,revision:index?.revision});
    const snapshot=cache.dated_snapshot12h||cache.unknown_age||cache.date_mismatch||cache.revision_mismatch||(entry?.failed&&cache.expired6h);
    const all=eventsForDate(data,day,{now}),today=day===clock.date;
    const candidates=all.filter(e=>!today||eventTiming(e,now).eligible_today);
    const local=candidates.filter(e=>e.city===city),regional=candidates.filter(e=>e.city!==city&&e.regional_major===true);
    const continuing=local.filter(e=>seen.has(e.id));
    const events=local.filter(e=>!seen.has(e.id)).slice(0,3);
    const majors=regional.filter(e=>!seen.has(e.id)).slice(0,2);
    for(const e of [...events,...majors])seen.add(e.id);
    const fallback=events.length<2?places.slice(0,3-events.length):[];
    const unknown=today&&!snapshot?all.filter(e=>e.city===city&&eventTiming(e,now).phase==='unknown_end').slice(0,2):[];
    const coverage=entry?.failed?'fetch_failed':data.coverage?.status||coverageForDate(index||{},day).status;
    const heading=date?`На ${dateLabel(day)}`:snapshot?`Подборка на ${dateLabel(day)}`:day===clock.tomorrow?'Завтра':'Сегодня';
    days.push({date:day,heading,events,majors,continuing,fallback,unknown,coverage,cache,snapshot,meta:entry?.meta,failed:entry?.failed});
  }
  // A known ending within the last 12h is history, never an active suggestion.
  const recent=(date?[]:eventsForDate(buckets.get(clock.date)?.data||{events:[]},clock.date,{now})).filter(e=>{
    const interval=eventInterval(e),end=interval.end?Date.parse(interval.end):NaN;
    return e.city===city&&eventTiming(e,now).phase==='ended'&&Number.isFinite(end)&&now.getTime()-end<=12*3600000;
  }).slice(-2);
  return {clock,days,recent};
}

export function createNearbyCache({storage,fetcher,base,now=()=>new Date()}) {
  const memory=new Map();
  const key=url=>CACHE_PREFIX+url.href;
  function read(url){
    if(memory.has(url.href))return memory.get(url.href);
    try{const value=JSON.parse(storage?.getItem(key(url))||'null');if(value?.data&&value.meta){memory.set(url.href,value);return value;}}catch{}
    return null;
  }
  function write(url,entry){memory.set(url.href,entry);try{storage?.setItem(key(url),JSON.stringify(entry));}catch{}}
  async function load(path,expected={},force=false){
    const url=new URL(path,base),cached=read(url);
    const state=eventCacheState(cached?.meta||{},now(),expected);
    if(cached&&!force&&!state.expired6h&&!state.date_mismatch&&!state.revision_mismatch&&!state.unknown_age)return cached;
    try{
      const response=await fetcher(url.href,{cache:'no-cache'});
      if(!response.ok)throw Error(`HTTP ${response.status}`);
      const data=await response.json();
      if(data?.version!==2||data.timezone!=='Europe/Kaliningrad')throw Error('Некорректная афиша');
      if(expected.date&&data.date!==expected.date)throw Error('Дата афиши не совпала');
      if(expected.revision&&data.revision!==expected.revision)throw Error('Обновление афиши ещё не завершено');
      if(expected.date&&!Array.isArray(data.events))throw Error('Нет списка событий');
      if(!expected.date&&(!calendarDate(data.window?.from)||!calendarDate(data.window?.to)||data.window.from>data.window.to||!data.dates||typeof data.dates!=='object'||Array.isArray(data.dates)||typeof data.revision!=='string'||!data.revision.trim()))throw Error('Нет календаря афиши');
      const entry={data,meta:{fetched_at:now().toISOString(),date:data.date||null,revision:data.revision}};
      write(url,entry);return entry;
    }catch(error){return cached?{...cached,failed:true,error:error.message}:{data:null,meta:{},failed:true,error:error.message};}
  }
  return {load,read};
}

function eventTime(event){
  const interval=eventInterval(event);
  if(!interval.start)return 'Время начала не подтверждено';
  const span=interval.end_date&&interval.end_date!==interval.start_date?`${dateLabel(interval.start_date)} — ${dateLabel(interval.end_date)}`:'';
  return `${span?span+' · ':''}${timeLabel(interval.start)}${interval.end?' — '+timeLabel(interval.end):' · окончание не подтверждено'}`;
}
function priceLabel(event){
  const price=event.price_range;if(!price)return 'Цена не подтверждена';
  const money=n=>new Intl.NumberFormat('ru-RU').format(n)+' ₽';
  return price.kind==='from'?`От ${money(price.min)}`:price.kind==='range'?`${money(price.min)}–${money(price.max)}`:price.min===0?'Бесплатно':money(price.min);
}
function card(event,day,model,history=false,freshness=null,base){
  const timing=eventTiming(event,model.clockNow),url=safeURL(event.source_url),current=!day?.snapshot&&timing.now;
  const fact=freshness?.facts?.filter(f=>f.subject?.id===event.id)||[];
  const needsReview=fact.some(f=>f.freshness==='needs_review');
  const badge=history||timing.phase==='ended'?'Завершилось':timing.phase==='past_unknown_end'?'Дата начала прошла; окончание неизвестно':day?.snapshot?'Датированный снимок':needsReview?'Требует проверки':current?'Сейчас':timing.needs_info?'Время окончания уточняется':'';
  const source=history||timing.phase==='ended'?'':url?`<a href="${escape(url)}" rel="noopener noreferrer">Программа площадки</a>`:'<span>Ссылка на программу не подтверждена</span>';
  const estimate=eventDurationEstimateText(event);
  const canAdd=!history&&event.status!=='cancelled'&&event.status!=='postponed'&&day.date>=model.clock.date&&timing.phase!=='ended';
  return `<li class="nearby-card" data-event-id="${escape(event.id)}" data-snapshot="${!!day?.snapshot}" data-freshness="${needsReview?'needs_review':'unknown'}"><p class="nearby-eyebrow">${escape(event.city_name||event.city)} · ${escape(event.category||event.kind||'Событие')}</p>${badge?`<span class="nearby-badge${current?' nearby-badge-now':''}">${badge}</span>`:''}<h4><a href="${escape(new URL(eventPath(event.id),base).href)}">${escape(event.title)}</a></h4><p class="nearby-time">${escape(eventTime(event))}</p>${estimate?`<p data-event-duration-estimate>${escape(estimate)}</p>`:''}<p>${escape(event.venue||'Площадка уточняется')}</p><p>${escape(priceLabel(event))}</p><p class="nearby-evidence">Сведения о событии: ${escape(evidenceLabel(event.verified_at))}.</p>${source}${canAdd?`<button type="button" data-nearby-add="${escape(event.id)}" data-event-date="${day.date}">Рассмотреть в плане</button>`:''}</li>`;
}
function placeCard(place,base){
  const url=safeURL(place.source_url);
  return `<li class="nearby-card nearby-place"><p class="nearby-eyebrow">${escape(place.city_name||place.city)} · место для прогулки</p><h4><a href="${escape(new URL(`poi/${encodeURIComponent(place.slug)}/`,base).href)}">${escape(place.name)}</a></h4><p>Часы работы и доступ на дату поездки не подтверждены. Уточните перед визитом.</p>${place.verified_at?`<p class="nearby-evidence">Сведения о месте: ${escape(evidenceLabel(place.verified_at))}. Это не сверка часов работы.</p>`:''}${url?`<a href="${escape(url)}" rel="noopener noreferrer">Источник сведений о месте</a>`:''}</li>`;
}

export function renderNearby(model,{base,freshness=null,now=new Date()}){
  model={...model,clockNow:now};
  // Identical undated catalog suggestions need one list. Keep both dates when
  // events, unknown endings, coverage or snapshot conditions differ.
  const fallbackKey=day=>day.events.length||day.majors.length||day.continuing.length||day.unknown.length?null:JSON.stringify([day.fallback,day.coverage,day.snapshot,!!day.failed]);
  const days=model.days.filter((day,i)=>i===0||fallbackKey(day)===null||fallbackKey(day)!==fallbackKey(model.days[i-1]));
  return days.map(day=>`<section class="nearby-day" data-nearby-date="${day.date}"${day.date===model.clock.tomorrow?' data-tomorrow':''}><h3>${escape(day.heading)}<time class="nearby-date" datetime="${day.date}">${dateLabel(day.date)}</time></h3>${coverageText[day.coverage]!==''?`<p>${escape(coverageText[day.coverage]||coverageText.unknown)}</p>`:''}${day.snapshot?'<p>Время актуальности снимка не позволяет подтвердить, что событие идёт сейчас. Уточните программу у площадки.</p>':''}${day.continuing.length?`<p>Продолжается: ${day.continuing.map(e=>`${escape(e.title)} (${escape(eventTime(e))})`).join('; ')}. Карточка показана один раз.</p>`:''}<ul class="nearby-grid">${day.events.map(e=>card(e,day,model,false,freshness,base)).join('')}${day.fallback.map(p=>placeCard(p,base)).join('')}</ul>${day.majors.length?`<h4>Ещё в области</h4><ul class="nearby-grid">${day.majors.map(e=>card(e,day,model,false,freshness,base)).join('')}</ul>`:''}${day.unknown.length?`<aside class="nearby-unknown"><p>Начало по расписанию уже прошло; окончание неизвестно:</p><p>${day.unknown.map(e=>`<a href="${escape(new URL(eventPath(e.id),base).href)}">${escape(e.title)}</a> · ${escape(timeLabel(eventInterval(e).start))}${safeURL(e.source_url)?` · <a href="${escape(safeURL(e.source_url))}">Уточнить у площадки</a>`:''}`).join('<br>')}</p></aside>`:''}</section>`).join('')+(model.recent.length?`<section class="nearby-history" aria-label="Недавно завершилось"><h3>Недавно завершилось</h3><ul class="nearby-grid">${model.recent.map(e=>card(e,null,model,true,freshness,base)).join('')}</ul></section>`:'');
}

export function mountNearbyEvents(root,{now=()=>new Date(),fetcher=globalThis.fetch.bind(globalThis),storage,clock=true,factEngine=null}={}){
  const doc=root.ownerDocument,win=doc.defaultView,base=new URL(root.dataset.base||'./',doc.baseURI);
  if(storage===undefined){try{storage=win.localStorage;}catch{storage=null;}}
  const cache=createNearbyCache({storage,fetcher,base,now});
  const config=JSON.parse(root.querySelector('[data-nearby-places]')?.textContent||'{"cities":[]}');
  // The planner owns the selected Trip. Other pages own their local city/date;
  // a saved day in another page must not silently change their suggestions.
  const plannerPage=new URL(doc.baseURI).pathname===new URL('planner/',base).pathname;
  const routeForm=doc.querySelector?.('[data-route-day-settings]');
  const content=root.querySelector('[data-nearby-content]'),status=root.querySelector('[data-nearby-status]'),select=root.querySelector('[name=nearby-city]');
  let city=root.dataset.city||select.value,date=null,dateInvalid=false,index=null,buckets=new Map(),token=0,timer=null,disposed=false,freshness=null,enginePromise=null,facts=null,lastDates='',busy=false;
  function places(){return config.cities.find(c=>c.id===city)?.places||[];}
  function currentDates(){const c=regionClock(now());return date?[date]:[c.date,c.tomorrow];}
  function render(){
    if(disposed)return;
    if(dateInvalid){content.innerHTML='<p>Дата прогулки не указана или не распознана. Выберите дату в плане; афишу на этот день нужно уточнить.</p>';status.textContent='Дата афиши неизвестна. Время — Калининград (UTC+2).';root.dataset.clockDate=regionClock(now()).date;root.dataset.selectedDate='';root.dataset.dateState='unknown';return;}
    const active=doc.activeElement,focus=active?.dataset?.nearbyAdd,focusDate=active?.dataset?.eventDate;
    const model=nearbyModel({buckets,index,city,date,now:now(),places:places()});
    const html=renderNearby(model,{base,freshness,now:now()});
    if(content.innerHTML!==html){content.innerHTML=html;if(focus){const same=[...content.querySelectorAll('[data-nearby-add]')].find(b=>b.dataset.nearbyAdd===focus&&b.dataset.eventDate===focusDate);same?.focus({preventScroll:true});}}
    const hasSnapshot=model.days.some(d=>d.snapshot),failed=model.days.some(d=>d.failed),timestamps=model.days.map(d=>d.meta?.fetched_at).filter(value=>typeof value==='string'&&Number.isFinite(Date.parse(value))).sort();
    const note=`${date?'Выбранный день поездки. ':''}${failed?'Нет связи с афишей. ':''}${hasSnapshot?'Датированная подборка; текущий статус не подтверждён. ':''}Время — Калининград (UTC+2).${timestamps.length?' Копия получена '+new Intl.DateTimeFormat('ru-RU',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Kaliningrad'}).format(new Date(timestamps[0]))+'.':''}`;
    if(status.textContent!==note)status.textContent=note;
    root.dataset.clockDate=model.clock.date;root.dataset.tomorrowPrimary=String(model.clock.tomorrow_primary);root.dataset.selectedDate=date||'';
    root.dataset.dateState=date?'selected':'live';
  }
  async function evaluateFacts(){
    try{
      if(!facts){const response=await fetcher(new URL('data/facts.json',base).href);if(!response.ok)return;facts=await response.json();}
      if(!enginePromise)enginePromise=factEngine?Promise.resolve(factEngine):import('./trip-scheduler.mjs?v=2026101707').then(m=>m.loadScheduler(base));
      const engine=await enginePromise;
      if(!engine.factFreshness)return;
      const snapshot=facts.snapshot||facts;
      if(!Array.isArray(snapshot.facts))return;
      freshness=engine.factFreshness({version:1,as_of:regionClock(now()).date,...(date?{visit_date:date}:{}),snapshot});applyFreshnessReport(doc,freshness);render();
    }catch{enginePromise=null;}
  }
  async function refresh(force=false){
    if(dateInvalid)return;
    const mine=++token;busy=true;
    // Revalidate once per mount so a newly installed offline pack can replace
    // an unexpired index; date buckets still use their six-hour/revision checks.
    const idx=await cache.load('data/events/index.json',{},force||index===null);
    if(disposed||mine!==token)return;
    index=idx.data;
    const dates=currentDates();lastDates=dates.join(',');
    const entries=await Promise.all(dates.map(async day=>{
      if(index&&coverageForDate(index,day).status==='outside_window')return [day,{data:{events:[],coverage:{status:'outside_window'}},meta:{},failed:false}];
      // Use our canonical derived path, never a data-supplied external URL.
      return [day,await cache.load(`data/events/${day}.json`,{date:day,...(index?.revision?{revision:index.revision}:{})},force)];
    }));
    if(disposed||mine!==token)return;
    buckets=new Map(entries);busy=false;render();evaluateFacts();
  }
  function tick(){
    if(disposed)return;
    const previousDay=root.dataset.clockDate;
    render();
    if(previousDay&&previousDay!==root.dataset.clockDate)evaluateFacts();
    const changed=currentDates().join(',')!==lastDates;
    if(!busy&&(changed||[...buckets.values()].some(e=>eventCacheState(e.meta,now()).expired6h)))refresh();
    if(clock){win.clearTimeout(timer);timer=win.setTimeout(tick,Math.max(1000,60000-(now().getTime()%60000)));}
  }
  function context(event){
    if(!plannerPage)return;
    const next=event.detail||{};
    if(next.city&&config.cities.some(c=>c.id===next.city)){city=next.city;select.value=city;root.dataset.city=city;}
    // null explicitly returns to live Today/Tomorrow; never substitute today for
    // an invalid or omitted Trip date supplied as a purported selected date.
    if(Object.hasOwn(next,'date')){dateInvalid=false;if(next.date===null||next.date==='')date=null;else if(calendarDate(next.date))date=next.date;else dateInvalid=true;}
    subscription?.update();render();evaluateFacts();refresh();
  }
  function cityChange(){city=select.value;root.dataset.city=city;subscription?.update();render();}
  function add(event){
    const button=event.target.closest('[data-nearby-add]');if(!button||!root.contains(button))return;
    const day=button.dataset.eventDate,record=eventsForDate(buckets.get(day)?.data||{events:[]},day,{now:now()}).find(e=>e.id===button.dataset.nearbyAdd);
    if(!record)return;
    win.dispatchEvent(new win.CustomEvent('godune:event-proposal',{detail:{event:record,date:day,venue_id:record.venue_id,venue:buckets.get(day)?.data?.venues?.[record.venue_id]??null,opener:button}}));
  }
  function onVisible(){if(doc.visibilityState!=='hidden')tick();}
  // Route UI publishes only after resolving its visible date, including a
  // linked saved route or the current regional default. This also covers lazy
  // mounting after the form was initialized and later midnight/focus updates.
  function routeDate(){
    if(plannerPage||!routeForm||routeForm.dataset.dateReady!=='true')return;
    const next=routeForm.elements.date.value,invalid=routeForm.dataset.dateSource==='unknown'||!calendarDate(next);
    if(date===next&&dateInvalid===invalid)return;
    date=invalid?null:next;dateInvalid=invalid;render();evaluateFacts();refresh();
  }
  function selectedInput(event){if(event.target.matches('[data-route-day-settings] [name=date]'))routeDate();}
  select.addEventListener('change',cityChange);root.addEventListener('click',add);win.addEventListener('godune:nearby-context',context);win.addEventListener('godune:route-date',routeDate);win.addEventListener('focus',onVisible);doc.addEventListener('visibilitychange',onVisible);doc.addEventListener('input',selectedInput);
  const subscription=mountSubscription(root,{city:()=>city});
  render();routeDate();const ready=refresh();if(plannerPage)win.dispatchEvent(new win.CustomEvent('godune:nearby-context-request'));if(clock)tick();
  return {ready,refresh,tick,setContext:detail=>context({detail}),getModel:()=>nearbyModel({buckets,index,city,date,now:now(),places:places()}),destroy(){disposed=true;++token;win.clearTimeout(timer);select.removeEventListener('change',cityChange);root.removeEventListener('click',add);win.removeEventListener('godune:nearby-context',context);win.removeEventListener('godune:route-date',routeDate);win.removeEventListener('focus',onVisible);doc.removeEventListener('visibilitychange',onVisible);doc.removeEventListener('input',selectedInput);subscription?.destroy();}};
}

export function mountSubscription(root,{city}){
  const panel=root.querySelector('[data-nearby-subscribe]');if(!panel)return null;
  const input=panel.querySelector('[data-nearby-feed]'),link=panel.querySelector('[data-nearby-rss]'),button=panel.querySelector('[data-nearby-copy]'),message=panel.querySelector('[data-subscribe-status]');
  const url=()=>`https://godune.ru/data/events/feeds/${encodeURIComponent(city())}.xml`;
  function update(){input.value=url();link.href=url();message.textContent='';}
  async function copy(){
    try{await root.ownerDocument.defaultView.navigator.clipboard.writeText(url());message.textContent='Адрес RSS скопирован. Вставьте его в Blogtrottr; email и подтверждение — там.';}
    catch{input.focus();input.select();message.textContent='Скопируйте выделенный адрес RSS и вставьте его в Blogtrottr.';}
  }
  update();button.addEventListener('click',copy);return {update,destroy(){button.removeEventListener('click',copy);}};
}

// Some canonical POIs have freshness facts outside the five city widgets.
export function mountFactFreshness(doc,{base=new URL('./',import.meta.url),now=()=>new Date(),fetcher=globalThis.fetch.bind(globalThis)}={}){
  let data=null,engine=null,day='',pending=false;
  async function refresh(){
    const current=regionClock(now()).date;if(pending||current===day)return;
    pending=true;
    try{
      if(!data){const response=await fetcher(new URL('data/facts.json',base));if(!response.ok)throw Error('facts unavailable');data=await response.json();}
      if(!engine)engine=await import('./trip-scheduler.mjs?v=2026101707').then(m=>m.loadScheduler(base));
      applyFreshnessReport(doc,engine.factFreshness({version:1,as_of:current,snapshot:data.snapshot}));day=current;
    }catch{}finally{pending=false;}
  }
  const visible=()=>{if(doc.visibilityState!=='hidden')refresh();};
  doc.defaultView.addEventListener('focus',visible);doc.addEventListener('visibilitychange',visible);
  const timer=doc.defaultView.setInterval(visible,60000);refresh();
  return ()=>{doc.defaultView.clearInterval(timer);doc.defaultView.removeEventListener('focus',visible);doc.removeEventListener('visibilitychange',visible);};
}

if(typeof document!=='undefined'){
  const roots=document.querySelectorAll('[data-nearby-events]');
  for(const root of roots)mountNearbyEvents(root);
  if(!roots.length&&document.querySelector('[data-fact-subject]'))mountFactFreshness(document);
}
