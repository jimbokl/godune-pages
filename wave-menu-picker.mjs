import {selectedDay} from './trip-days-state.mjs';
import {selectMenuChoice} from './trip-menu-choices-state.mjs';
import {menuChoiceRows} from './trip-menu-choices-contract.mjs';
import {menuChoiceGuide} from './trip-menu-choices-view.mjs?v=2';
import {menuChoiceFromTemplate} from './trip-menu-choices-ui.mjs';

const pickerStates=new WeakMap();
const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
const dayKey=trip=>trip?.itinerary?.active||'';
const dayTarget=trip=>{const day=selectedDay(trip);return {id:day.id,date:day.date,snapshot:JSON.stringify(menuChoiceRows(day))};};
const quantity=value=>Number.isSafeInteger(value)&&value>0;
export function waveMenuVenueForPoi(index,poiId){
 if(index?.version!==1||!Array.isArray(index.venues))return null;
 return index.venues.find(venue=>venue?.poi_id===poiId&&typeof venue.directory_id==='string'&&venue.directory_id.trim())||null;
}
export function waveMenuFilterItems(items,query='',limit=8){
 if(!items||typeof items!=='object'||Array.isArray(items))return [];
 const needle=String(query).trim().toLocaleLowerCase('ru-RU');
 return Object.entries(items).filter(([,template])=>{
  const haystack=[template?.name,template?.category,template?.portion].filter(value=>typeof value==='string').join(' ').toLocaleLowerCase('ru-RU');
  return !needle||haystack.includes(needle);
 }).slice(0,Math.max(0,limit)).map(([key,template])=>({key,template}));
}
export function waveMenuVerifiedItems(items,query,trip,poiId,limit=8){
 return waveMenuFilterItems(items,query,Number.MAX_SAFE_INTEGER).filter(({template})=>{
  try{return menuChoiceFromTemplate(template,trip,1).place?.poi_id===poiId;}catch{return false;}
 }).slice(0,Math.max(0,limit));
}
function feedback(status,text,kind=''){status.dataset.feedback=kind;status.textContent=text;}
function currentFor(read,fallback){try{return read?.()||fallback;}catch{return fallback;}}
function sameTarget(trip,expected){try{const active=dayTarget(trip);return active.id===expected.id&&active.date===expected.date&&active.snapshot===expected.snapshot;}catch{return false;}}
function activeDayMatches(read,fallback,expected){const trip=currentFor(read,fallback);try{return selectedDay(trip).id===expected.id&&selectedDay(trip).date===expected.date;}catch{return false;}}
function priceText(template,trip){
 try{const selected=menuChoiceFromTemplate(template,trip,1);return menuChoiceGuide({...selectedDay(trip),menu_choices:[selected]} )[0]?.price||'Цена не указана';}
 catch{return 'Цена не указана';}
}
function createEntry({template,trip,catalog,commit,read,fallbackTrip,expectedDayKey,expected,live,panelLive,refresh,notify}){
 const article=el('article',undefined,'wave-menu-item'),title=el('h5',template.name),meta=el('p',[template.portion?.trim()||'Порция не указана',priceText(template,trip)].join(' · '),'wave-menu-item-meta');
 const form=el('form',undefined,'wave-menu-add-form'),label=el('label','Порции'),input=el('input');input.type='number';input.name='quantity';input.min='1';input.step='1';input.value='1';input.required=true;input.inputMode='numeric';label.append(input);
 const add=el('button','Добавить блюдо','wave-menu-add');add.type='submit';const status=el('p','','wave-menu-feedback');status.setAttribute('role','status');form.append(label,add);article.append(title,meta,form,status);
 form.addEventListener('submit',async event=>{
  event.preventDefault();const count=input.valueAsNumber;if(!quantity(count)){input.focus();return;}
  const current=currentFor(read,fallbackTrip),key=dayKey(current);if(key!==expectedDayKey||!expected||!sameTarget(current,expected)){feedback(status,'День изменился. Откройте меню ещё раз.','conflict');return;}
  add.disabled=true;feedback(status,'Добавляем блюдо…','pending');
  try{
   const choice=menuChoiceFromTemplate(template,current,count);
   const result=await commit(state=>{
    if(!sameTarget(state,expected))throw Error('menu_choice_context_changed');
    return selectMenuChoice(state,choice,catalog);
   },'Выбор блюда сохранён.');
   if(!activeDayMatches(read,fallbackTrip,expected))return;
   const kind=result?.conflict?'conflict':result?.saved?'saved':'draft';
   const message=kind==='conflict'?'День изменился. Проверьте свежий выбор.':kind==='saved'?'Блюдо добавлено и сохранено в поездке.':'Блюдо добавлено в черновик этой вкладки. Скачайте файл поездки через «Ещё», чтобы сохранить её отдельно.';
   notify?.(message,kind,expected);
   if(panelLive())feedback(status,message,kind);
   refresh?.();
  }catch{
   if(panelLive()&&activeDayMatches(read,fallbackTrip,expected))feedback(status,'Не удалось добавить блюдо. Проверьте день и повторите действие.','error');
  }finally{add.disabled=false;}
 });
 return article;
}
function renderResults({panel,items,venue,trip,catalog,commit,read,fallbackTrip,key,expected,searchValue,live,panelLive,refresh,notify}){
 const list=panel.querySelector('[data-wave-menu-results]'),query=searchValue?.value||'';
 const candidates=waveMenuVerifiedItems(items,query,trip,venue.poi_id,8);
 list.replaceChildren(...candidates.map(({template})=>createEntry({template,trip,catalog,commit,read,fallbackTrip,expectedDayKey:key,expected,live,panelLive,refresh,notify})));
 feedback(panel.querySelector('[data-wave-menu-load]'),candidates.length?'':query?'Ничего не найдено по этому запросу.':'В меню пока нет проверенных блюд.',candidates.length?'':'empty');
}
function setupPicker(panel,context){
 if(pickerStates.has(panel))return pickerStates.get(panel);
 const box=el('div',undefined,'wave-menu-picker'),searchLabel=el('label','Найти блюдо','wave-menu-search-label'),search=el('input');search.type='search';search.autocomplete='off';search.placeholder='Название блюда';search.value=panel.dataset.waveMenuSearch||'';searchLabel.append(search);
 const results=el('div',undefined,'wave-menu-results');results.dataset.waveMenuResults='';const status=el('p','','wave-menu-feedback');status.dataset.waveMenuLoad='';status.setAttribute('role','status');box.append(searchLabel,status,results);panel.append(box);
 const state={box,search,results,status,promise:null,ready:false,dead:false,request:0};pickerStates.set(panel,state);
 search.addEventListener('input',()=>state.render?.());
 return state;
}
async function loadPicker(panel,context){
 const state=setupPicker(panel,context);if(state.promise||state.ready||state.dead)return state.promise;
 const request=++state.request,trip=currentFor(context.read,context.trip),key=dayKey(trip),poiId=panel.closest('[data-wave-stop]')?.dataset.waveStop;
 let expected;try{expected=dayTarget(trip);}catch{return;}
 const live=()=>!context.disposed()&&!state.dead&&panel.isConnected&&panel.closest('[data-wave-stop]')?.dataset.waveStop===poiId&&activeDayMatches(context.read,context.trip,expected)&&sameTarget(currentFor(context.read,context.trip),expected);
 if(!poiId||!live())return;
 feedback(state.status,'Загружаем меню…','pending');
 state.promise=(async()=>{
  try{
   const index=await context.loadIndex();if(!live()||request!==state.request)return;
   const venue=waveMenuVenueForPoi(index,poiId);if(!venue){state.search.parentElement.hidden=true;feedback(state.status,'Для этого места список меню пока не загрузили.','unknown');return;}
   const menuResponse=await fetch(new URL(`data/menu-choices/${encodeURIComponent(venue.directory_id)}.json`,context.base),{cache:'no-cache'});if(!menuResponse.ok)throw Error('menu_items_load');
   const data=await menuResponse.json();if(!live()||request!==state.request)return;
   if(data?.version!==1||data.directory_id!==venue.directory_id||!data.items||typeof data.items!=='object'||Array.isArray(data.items))throw Error('menu_items_invalid');
   state.venue=venue;state.items=data.items;state.ready=true;state.expected=expected;state.key=key;state.live=live;state.panelLive=()=>!context.disposed()&&!state.dead&&panel.isConnected&&panel.closest('[data-wave-stop]')?.dataset.waveStop===poiId;
   state.render=()=>{if(state.live())renderResults({...context,panel,items:state.items,venue:state.venue,trip:currentFor(context.read,context.trip),catalog:context.catalog,commit:context.commit,read:context.read,fallbackTrip:context.trip,key:state.key,expected:state.expected,searchValue:state.search,live:state.live,panelLive:state.panelLive,refresh:context.refresh});};state.render();
  }catch{
   if(live()&&request===state.request){feedback(state.status,'Не удалось загрузить меню. Попробуйте ещё раз.','error');state.retry?.remove();state.retry=el('button','Повторить','wave-menu-retry');state.retry.type='button';state.retry.addEventListener('click',()=>{state.promise=null;loadPicker(panel,context);});state.status.after(state.retry);}
  }finally{if(request===state.request)state.promise=null;}
 })();return state.promise;
}
export function initWaveMenuPicker({root,trip,catalog,base,read,commit}){
 if(!root)return {render(){},cleanup(){}};
 const existing=pickerStates.get(root);if(existing?.rootCleanup)return existing;
 const fallbackTrip=trip,cache=new Map();
 const url=new URL('data/menu-choice-venues.json',base).href;
 const fetchIndex=()=>{
  let request=cache.get(url);if(!request){request=fetch(url,{cache:'no-cache'}).then(async response=>{if(!response.ok)throw Error('menu_venues_load');return response.json();}).catch(error=>{cache.delete(url);throw error;});cache.set(url,request);}return request;
 };
 let currentTrip=fallbackTrip,disposed=false;
 const notice=el('p','','wave-menu-feedback');notice.setAttribute('role','status');root.after(notice);let noticeTarget=null;
 const notify=(message,kind,expected)=>{if(disposed||!activeDayMatches(read,currentTrip,expected))return;noticeTarget=expected;feedback(notice,message,kind);};
 const contextFor=()=>({root,trip:currentTrip,catalog,base,read,commit,notify,loadIndex:fetchIndex,disposed:()=>disposed,refresh:()=>{currentTrip=currentFor(read,currentTrip);}});
 const loadActive=()=>{const tab=root.querySelector('[data-wave-stop][open] [data-wave-tab="menu"][aria-pressed="true"]');if(!tab)return;const panel=tab.closest('[data-wave-stop]')?.querySelector('[data-wave-panel="menu"]');if(panel)loadPicker(panel,contextFor());};
 const listener=event=>{
  const tab=event.target?.closest?.('[data-wave-tab="menu"]');if(!tab||!root.contains(tab))return;
  currentTrip=currentFor(read,currentTrip);
  const panel=tab.closest('[data-wave-stop]')?.querySelector('[data-wave-panel="menu"]');
  if(!panel)return;
  loadPicker(panel,contextFor());
 };
 root.addEventListener('click',listener);
 const result={root,rootCleanup:true,render(nextTrip=currentFor(read,currentTrip)){currentTrip=nextTrip;if(noticeTarget&&!activeDayMatches(read,currentTrip,noticeTarget)){noticeTarget=null;feedback(notice,'');}loadActive();return result;},cleanup(){disposed=true;notice.remove();root.removeEventListener('click',listener);for(const panel of root.querySelectorAll('[data-wave-panel="menu"]')){const state=pickerStates.get(panel);if(state){state.dead=true;state.request++;state.box.remove();pickerStates.delete(panel);}}}};
 pickerStates.set(root,result);return result;
}
