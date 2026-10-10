import {bindServiceContext} from './service-context.mjs?v=17';
import {diningSpatialTemplate,diningPublicContexts} from './dining-route-state.mjs?v=6';
import {loadScheduler} from './trip-scheduler.mjs?v=42';
const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const currentDate=()=>{const parts=new Intl.DateTimeFormat('en',{timeZone:'Europe/Kaliningrad',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(type=>parts.find(p=>p.type===type).value).join('-');};
export function initDiningRouteFilter({root,cards,base,area,onResult}){
 const details=node('details');details.className='dining-route-filter';details.dataset.diningRouteFilter='';
 details.append(node('summary','Еда рядом с прогулкой или жильём'));
 const body=node('div');details.append(body);root.querySelector('.dining-filters').after(details);
 let initialized,pending=false,sequence=0,context,engine,form,feedback,apply,retry;
 const sourceRows=cards.map(card=>({id:card.dataset.id,name:card.dataset.name,lat:card.dataset.lat===''?null:Number(card.dataset.lat),lon:card.dataset.lon===''?null:Number(card.dataset.lon),source:{reference:card.dataset.sourceUrl,checked_at:card.dataset.sourceDate}}));
 async function initialize(){
  body.replaceChildren(node('p','Открываем прогулки…'));
  try{
   const [catalog,scheduler]=await Promise.all([fetch(new URL('data/catalog.json',base)).then(response=>{if(!response.ok)throw Error();return response.json();}),loadScheduler(base)]);
   engine=scheduler;
   const page={contexts:diningPublicContexts(catalog,area),spatial:diningSpatialTemplate(sourceRows)};
   form=node('form');form.className='dining-route-fields';
   // All option text is assigned with textContent below; no source HTML is used.
   form.innerHTML='<label>Когда<input type="date" name="date" required></label><label>Где искать<select name="scope_kind"><option value="all">Весь город</option><option value="route">Вдоль прогулки</option><option value="point">Рядом с местом</option></select></label><label data-context-route hidden>Прогулка<select name="scope_route"><option value="">Выберите прогулку</option></select></label><label data-context-point hidden>Место<select name="scope_point"><option value="">Выберите место</option></select></label><label data-context-radius hidden>Не дальше<select name="radius_m"><option value="500">500 м</option><option value="1000" selected>1 км</option><option value="2000">2 км</option><option value="5000">5 км</option></select></label><div data-context-options hidden><button type="button" data-load-contexts>Места из моей поездки</button><p data-context-status role="status"></p><input type="checkbox" name="spatial_strict" checked hidden></div><select name="sort" hidden><option value="relevance">По каталогу</option><option value="distance" data-distance-sort>По расстоянию</option></select>';
   form.elements.date.value=currentDate();
   for(const saved of page.contexts){const option=node('option',saved.name);option.value=saved.id;form.elements.scope_route.append(option);}
   feedback=node('p');feedback.className='dining-route-status';feedback.setAttribute('role','status');
   apply=node('button','Найти по пути');apply.type='submit';
   retry=node('button','Повторить поиск');retry.type='button';retry.hidden=true;
   form.append(apply);body.replaceChildren(form,feedback,retry);
   context=bindServiceContext(form,page,()=>{sequence++;feedback.textContent='Выберите место и нажмите «Найти по пути».';});
   form.addEventListener('submit',event=>{event.preventDefault();calculate();});
   form.addEventListener('change',()=>{sequence++;feedback.textContent='Нажмите «Найти по пути», чтобы обновить результат.';});
   retry.addEventListener('click',()=>calculate());
  }catch{initialized=null;body.replaceChildren(node('p','Прогулки не загрузились. Карточки каталога доступны.'));
   const retry=node('button','Попробовать ещё раз');retry.type='button';retry.addEventListener('click',()=>{initialized=initialize();});body.append(retry);
  }
 }
 async function calculate(){
  if(pending||!form.reportValidity())return;
  pending=true;const ticket=++sequence;apply.disabled=true;retry.hidden=true;feedback.textContent='Ищем места по пути…';
  try{
   await context.refresh(new FormData(form));
   const request=context.request(new FormData(form));
   const result=request?engine.serviceSpatial(request):null;
   if(ticket!==sequence)return;
   onResult(result);
   feedback.textContent=result?'Показаны места в выбранном радиусе на карте. Дорога и время проверяются при сборке дня.':'Снова показан весь город с вашими фильтрами.';
  }catch(error){if(ticket===sequence){feedback.textContent=/[А-Яа-яЁё]/.test(error.message)?error.message:'Поиск не выполнился. Прежний результат сохранён.';retry.hidden=false;}}
  finally{pending=false;apply.disabled=false;}
 }
 details.addEventListener('toggle',()=>{if(details.open&&!initialized)initialized=initialize();});
 return {reset(){sequence++;onResult(null);if(form&&context){form.reset();form.elements.date.value=currentDate();context.update();feedback.textContent='';}}};
}
