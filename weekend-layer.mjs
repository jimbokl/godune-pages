import {placePath} from './place-path.mjs?v=2026101406';
import {loadScheduler} from './trip-scheduler.mjs?v=2026101305';
import {weekendDefaults,weekendDays,prepareWeekend,saveWeekendPlan} from './weekend-state.mjs?v=2026101401';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const clone=value=>structuredClone(value);
const baseNames={kgd:'Калининград',zel:'Зеленоградск',svet:'Светлогорск',split:'Калининград и приморский город'};
const errors={
 weekend_invalid_date:'Укажите действительную дату первого дня.',weekend_date_overflow:'Поездка выходит за поддерживаемый календарь. Измените дату.',weekend_invalid_time:'Проверьте время приезда и отъезда.',weekend_insufficient_day:'Для этой дороги и выбранного времени отъезда не хватает дня. Передвиньте отъезд или выберите другой план.',weekend_ferry_unavailable:'Не загрузились таблицы парома и железной дороги. Повторите после восстановления связи.',weekend_ferry_date:'На эту дату нет подходящей таблицы переправы.',weekend_ferry_no_outbound:'На эту дату не найдено подходящего отправления парома.',weekend_ferry_no_inbound:'На эту дату не найдено подходящего обратного рейса парома.',weekend_goal_requires_fresh_days:'Цель меняет остановки в дне, который вы вручную правили. Ваши правки сохранены: создайте новый набор дней или вернитесь к прежней цели.',weekend_target_missing:'Один из выбранных дней уже удалён. Обновите поездку и проверьте список дней.',weekend_plan_unavailable:'Не удалось собрать план из доступных прогулок и транспорта.'
};
const errorCode=error=>error?.cause?.message||error?.message;
const prettyError=error=>{const code=errorCode(error);return errors[code]||(/^weekend_ferry_/.test(code||'')?'На выбранную дату не удалось состыковать переправу и возвращение. Проверьте дату и личные запасы времени.':code||'План пока не удалось собрать. Проверьте дату и настройки.');};
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kaliningrad',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const toMinutes=value=>{if(!/^\d{2}:\d{2}$/.test(value||''))return null;return Number(value.slice(0,2))*60+Number(value.slice(3));};
const fromMinutes=value=>`${String(Math.floor(value/60)%24).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;
const node=(tag,attrs={},text='')=>{const element=document.createElement(tag);for(const [key,value]of Object.entries(attrs))if(value!==undefined&&value!==null)element.setAttribute(key,String(value));element.textContent=text;return element;};

function parseUrlSettings(config,preset){
 const params=new URL(location.href).searchParams,raw=params.get('weekend');if(!raw)return null;
 try{
  const value=JSON.parse(raw);if(!value||value.preset!==preset||!config.presets.some(row=>row.id===value.preset))return null;
  return value;
 }catch{return null;}
}
function idsFromUrl(){
 const raw=new URL(location.href).searchParams.get('trip-days');if(!raw)return null;
 const ids=raw.split(',').filter(Boolean);return ids.length===new Set(ids).size?ids:null;
}
function serializeSettings(settings){
 // Only controls are serialized. Personal notes, stops, names and meal choices stay in Trip storage.
 const {preset,origin,arrival,departure,base,goal,date,party,arrival_time,departure_time,arrival_reserve,airport_reserve,travel_reserve,ferry_ready,ferry_boarding,ferry_shore}=settings;
 return {preset,origin,arrival,departure,base,goal,date,party:{version:1,adults:party.adults,children:party.children},arrival_time,departure_time,arrival_reserve,airport_reserve,travel_reserve,ferry_ready,ferry_boarding,ferry_shore};
}
function loadContext(base){
 let pending;
 return ()=>pending ||= (async()=>{
  const json=async path=>{const response=await fetch(new URL(path,base),{cache:'no-cache'});if(!response.ok)throw Error('weekend_ferry_unavailable');return response.json();};
  const [bus,maps,services,rail,manifest,calculate]=await Promise.all([
   json('data/kosa-bus-210.json'),json('data/kosa-interchanges.json').catch(()=>null),json('data/transport-services.json'),json('data/rail-services.json'),json('data/transport-pages.json'),loadScheduler(base)
  ]);
  const context={table:bus,maps,calculate,profiles:manifest.profiles,tables:{bus,services,rail}};
  if(bus.version!==1||services.version!==1||rail.version!==1||manifest.version!==1)throw Error('weekend_ferry_unavailable');
  return context;
 })();
}
function itineraryUrl(settings,ids){
 const url=new URL(location.href);url.search='';url.searchParams.set('weekend',JSON.stringify(serializeSettings(settings)));if(ids?.length)url.searchParams.set('trip-days',ids.join(','));return url;
}
function renderDays(list,trip,config,settings,ids,catalog,base,{selectedOnly=false}={}){
 const allDays=trip?.itinerary?.days||[],days=selectedOnly&&ids?.length?ids.map(id=>allDays.find(day=>day.id===id)).filter(Boolean):allDays;list.replaceChildren();
 for(let index=0;index<days.length;index++){
  const day=days[index],row=settings?weekendDays(config,settings)[index]:null,li=node('li',{class:'weekend-plan-day','data-weekend-day-id':ids?.[index]||day.id}),dot=node('span',{class:'weekend-day-dot'},String(index+1)),details=node('details',{...(index===0?{open:''}:{})}),summary=node('summary'),title=node('strong',{},day.name||row?.name||`День ${index+1}`),meta=node('small',{},`${day.date||'Дата не выбрана'} · ${day.schedule?`${fromMinutes(day.schedule.start)}–${fromMinutes(day.schedule.end)}`:''}`),body=node('div',{class:'weekend-day-body'}),places=node('ol');
  const summaryLabel=node('span');summaryLabel.append(meta,title);summary.append(summaryLabel,node('span',{'aria-hidden':'true'},'⌄'));
  for(const slug of day.places||[]){const place=catalog.poi?.find(point=>point.slug===slug);if(place){const item=node('li'),link=node('a',{href:new URL(placePath(catalog,slug),base).href},place.name);item.append(link);places.append(item);}}
  body.append(places);
  if(row?.kind==='kosa')body.append(node('p',{class:'weekend-logistics'},'Куршская коса: план опирается на автобус № 210 и возвращение по таблице рейсов. Переход пешком из Зеленоградска к дюнам не закладывается.'));
  if(row?.kind==='ferry')body.append(node('p',{class:'weekend-logistics'},'Балтийская коса: отдельный день с поездкой к Балтийску, паромом, прогулкой и обратным путём. Расчёт переправы сохраняется в этот же день.'));
  for(const line of String(day.note||'').split('\n').filter(Boolean))body.append(node('p',{},line));
  for(const link of row?.links||[]){const a=node('a',{href:new URL(link.url,base).href},`${link.label} →`);body.append(a);}
  details.append(summary,body);li.append(dot,details);list.append(li);
 }
}
function settingFromForm(form,presetId){
 const values=Object.fromEntries(new FormData(form).entries());
 const defaults={preset:presetId};
 for(const key of ['origin','arrival','departure','base','goal'])defaults[key]=values[key];
 const arrivalTime=toMinutes(values.ferry_ready);
 return {...defaults,date:values.date||null,party:{version:1,adults:Number(values.adults),children:Number(values.children)},arrival_time:values.arrival_time,departure_time:values.departure_time,
  arrival_reserve:Number(values.arrival_reserve),airport_reserve:Number(values.airport_reserve),travel_reserve:Number(values.travel_reserve),ferry_ready:arrivalTime,ferry_boarding:Number(values.ferry_boarding),ferry_shore:Number(values.ferry_shore)};
}
function applyForm(form,settings){
 for(const [key,value]of Object.entries(settings)){
  if(key==='party'){form.elements.adults.value=String(value.adults);form.elements.children.value=String(value.children);continue;}
  if(!form.elements[key])continue;
  form.elements[key].value=key==='ferry_ready'?fromMinutes(value):String(value??'');
 }
}

export function initWeekendLayer({workshop,base,catalog}){
 const root=document.querySelector('[data-weekend-layer]'),form=root?.querySelector('[data-weekend-layer-form]');if(!root||!form||!workshop||!catalog)return null;
 const data=JSON.parse(root.querySelector('[data-weekend-layer-data]')?.textContent||'{}'),config=data.config,presetLinks=[...root.querySelectorAll('[data-weekend-preset]')],list=root.querySelector('[data-weekend-layer-days]'),status=root.querySelector('[data-weekend-layer-status]'),save=root.querySelector('[data-weekend-layer-save]'),pdf=root.querySelector('[data-weekend-layer-pdf]'),heading=root.querySelector('[data-weekend-layer-heading]'),baseLabel=root.querySelector('[data-weekend-base-label]'),newChoice=root.querySelector('[data-weekend-layer-new]'),recovery=root.querySelector('[data-weekend-layer-recovery]'),pdfFormat=root.querySelector('[data-weekend-layer-format]');
 if(!config?.presets?.length||!list||!status||!save||!pdf)return null;
 let selected=data.selected||config.presets[0].id,settings=null,ids=idsFromUrl(),proposal=null,contextLoad=loadContext(base),loadedContext=null,lastSignature='',recoveryMode=false,freshRequested=false,request=0;
 const statusText=(message,error=false)=>{status.textContent=message;status.dataset.kind=error?'error':'info';};
 const baseCaption=value=>`База поездки: ${baseNames[value]||'не выбрана'} · личный запас дороги ${settings?.travel_reserve??120} мин в одну сторону.`;
 function putSettingsUrl(){if(!settings)return;history.replaceState(history.state,'',itineraryUrl(settings,ids||null));}
 function headingText(){const preset=config.presets.find(row=>row.id===selected);heading.textContent=`Ваши ${preset?.days.length||0} дня`;baseLabel.textContent=baseCaption(settings.base);}
 function currentTrip(){return workshop.getState();}
 async function update({announce=false}={}){
  const ticket=++request;
  try{
   settings=settingFromForm(form,selected);if(!settings.date)throw Error('weekend_invalid_date');
   const signature=JSON.stringify(settings);if(signature===lastSignature&&proposal)return proposal;
   save.disabled=true;pdf.disabled=!ids?.length;recovery.hidden=true;recoveryMode=false;
   statusText('Сверяем дату, расписания и время возвращения…');
   const context=loadedContext||await contextLoad();if(ticket!==request)return null;loadedContext=context;proposal=prepareWeekend(currentTrip(),catalog,config,settings,context);lastSignature=signature;
   renderDays(list,proposal.trip,config,settings,ids,catalog,base);headingText();putSettingsUrl();save.disabled=false;pdf.disabled=!ids?.length;
   statusText(announce?'План обновлён. Проверьте короткий день и личные запасы времени.':'План рассчитан по выбранным датам. Сохранение добавит его к вашей поездке.');return proposal;
  }catch(error){if(ticket!==request)return null;proposal=null;lastSignature='';save.disabled=true;pdf.disabled=!ids?.length;recovery.hidden=error.message!=='weekend_goal_requires_fresh_days';recoveryMode=error.message==='weekend_goal_requires_fresh_days';statusText(prettyError(error),true);return null;}
 }
 function setPreset(id,{navigate=true}={}){
  const next=config.presets.find(row=>row.id===id);if(!next)return;
  const prior=settings||settingFromForm(form,selected),changedPreset=selected!==id;selected=id;
  settings={...weekendDefaults(config,id),date:prior.date,party:clone(prior.party),arrival_reserve:prior.arrival_reserve,airport_reserve:prior.airport_reserve,travel_reserve:prior.travel_reserve,ferry_ready:prior.ferry_ready,ferry_boarding:prior.ferry_boarding,ferry_shore:prior.ferry_shore};
  applyForm(form,settings);
  for(const link of presetLinks){const active=link.dataset.weekendPreset===id;link.classList.toggle('is-selected',active);if(active)link.setAttribute('aria-current','true');else link.removeAttribute('aria-current');}
  if(changedPreset||ids?.length&&ids.length!==next.days.length)ids=null;
  if(navigate){const link=presetLinks.find(item=>item.dataset.weekendPreset===id);if(link)history.pushState({},'',new URL(link.getAttribute('href'),location.href));}
  lastSignature='';void update({announce:true});
 }
 for(const link of presetLinks)link.addEventListener('click',event=>{event.preventDefault();setPreset(link.dataset.weekendPreset);});
 form.addEventListener('input',()=>{lastSignature='';void update({announce:true});});
 form.addEventListener('change',event=>{if(event.target.name==='arrival')form.elements.arrival_time.value=({morning:'08:30',day:'12:00',evening:'19:00'})[event.target.value];if(event.target.name==='departure')form.elements.departure_time.value=event.target.value==='day_out'?'14:00':'20:00';lastSignature='';void update({announce:true});});
 window.addEventListener('popstate',()=>{const pathId=location.pathname.match(/\/weekend\/([^/]+)\//)?.[1];if(pathId&&config.presets.some(row=>row.id===pathId))selected=pathId;const urlSettings=parseUrlSettings(config,selected);if(urlSettings){settings={...weekendDefaults(config,selected),...urlSettings};applyForm(form,settings);}else{settings=weekendDefaults(config,selected);settings.date=today();applyForm(form,settings);}for(const link of presetLinks){const active=link.dataset.weekendPreset===selected;link.classList.toggle('is-selected',active);if(active)link.setAttribute('aria-current','true');else link.removeAttribute('aria-current');}ids=idsFromUrl();lastSignature='';void update();});
 save.addEventListener('click',async()=>{
  if(!proposal||save.disabled)return;
  save.disabled=true;const expectedRevision=workshop.getRevision();let saved;
  try{
   const result=await workshop.setState(current=>{saved=saveWeekendPlan(current,catalog,config,settings,{ids:freshRequested?null:ids,context:loadedContext,fresh:freshRequested});return saved.trip;},'Выходные добавлены в поездку.',{expectedRevision});
   if(result?.conflict||!result?.saved){statusText('Поездка успела измениться в другой вкладке. Обновляю план по свежему состоянию.',true);ids=null;lastSignature='';void update();return;}
   ids=saved.ids;recoveryMode=false;freshRequested=false;putSettingsUrl();headingText();renderDays(list,saved.trip,config,settings,ids,catalog,base,{selectedOnly:true});pdf.disabled=false;
   const open=root.querySelector('[data-weekend-layer-open]');if(open){const target=new URL(open.getAttribute('href'),location.href);target.searchParams.set('trip-day',ids[0]);open.href=target.href;}
   statusText('Поездка сохранена. Все прежние дни, блюда и заметки остались в «Моём дне».');
  }catch(error){if(errorCode(error)==='weekend_goal_requires_fresh_days'){recoveryMode=true;recovery.hidden=false;}statusText(prettyError(error),true);}
  finally{save.disabled=!proposal;}
 });
 pdf.addEventListener('click',async()=>{
  if(!ids?.length)return;pdf.disabled=true;const trip=currentTrip(),signature=JSON.stringify(trip);
  try{const {downloadPersonalGuide}=await import('./trip-guide-ui.mjs?v=2026101406');const result=await downloadPersonalGuide({trip,catalog,base,scope:'trip',format:pdfFormat?.value||'phone',onProgress:message=>statusText(message),stillCurrent:()=>JSON.stringify(currentTrip())===signature,title:'Моя поездка на Балтику'});statusText(`Личный буклет готов: ${result.pages} стр. В нём вся поездка.`);}
  catch(error){statusText(error.message==='guide_trip_changed'?'Поездка изменилась во время подготовки PDF. Обновите план и повторите.':'Личный PDF не удалось подготовить. Попробуйте ещё раз после восстановления связи.',true);}
  finally{pdf.disabled=false;}
 });
 newChoice?.addEventListener('click',()=>{ids=null;freshRequested=true;recoveryMode=false;recovery.hidden=true;lastSignature='';void update({announce:true}).then(()=>{save.disabled=!proposal;});});
 const initial=parseUrlSettings(config,selected);if(initial){settings={...weekendDefaults(config,selected),...initial,party:initial.party||{version:1,adults:2,children:0}};applyForm(form,settings);}else{settings=weekendDefaults(config,selected);settings.date=today();applyForm(form,settings);}
 if(ids){const savedIds=new Set((currentTrip().itinerary?.days||[]).map(day=>day.id));if(ids.some(id=>!savedIds.has(id))){ids=null;statusText('День из сохранённой ссылки уже отсутствует в поездке. Можно сохранить план как новый набор.',true);}}
 headingText();void update();
 return {refresh:()=>update(),getSettings:()=>settings,getIds:()=>ids};
}
