import {menuChoiceGuide} from './trip-menu-choices-view.mjs';

const states=new WeakMap();
const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
const validPoint=point=>Number.isFinite(point?.lat)&&Number.isFinite(point?.lon)&&Math.abs(point.lat)<=90&&Math.abs(point.lon)<=180;
const radians=value=>value*Math.PI/180;
export function nearbyWaveStops(point,catalog,limit=3){
 if(!validPoint(point))return [];
 return (catalog?.poi||[]).filter(row=>row.slug!==point.slug&&row.area===point.area&&validPoint(row)).map(row=>{
  const dLat=radians(row.lat-point.lat),dLon=radians(row.lon-point.lon),a=Math.sin(dLat/2)**2+Math.cos(radians(point.lat))*Math.cos(radians(row.lat))*Math.sin(dLon/2)**2;
  return {point:row,distance:6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))};
 }).filter(row=>row.distance<=1000).sort((a,b)=>a.distance-b.distance||a.point.slug.localeCompare(b.point.slug)).slice(0,limit);
}
const distanceLabel=meters=>meters<1000?`${Math.round(meters/10)*10} м`:`${(meters/1000).toLocaleString('ru-RU',{maximumFractionDigits:1})} км`;
const portions=value=>{const tail=value%100,unit=value%10;return `${value} ${tail>=11&&tail<=14?'порций':unit===1?'порция':unit>=2&&unit<=4?'порции':'порций'}`;};
const shortDescription=value=>{const text=String(value||'').trim().replace(/\s+/g,' ');if(text.length<=116)return text;const sentence=text.match(/^.{35,116}?[.!?](?=\s|$)/);return sentence?sentence[0]:text.slice(0,113).trimEnd()+'…';};
const dayKey=trip=>trip?.itinerary?.active||trip?.date||'';
function dayFor(trip){return trip?.itinerary?.days?.find(day=>day.id===trip.itinerary.active)||trip?.itinerary?.days?.[0]||{date:trip?.date,places:[],menu_choices:[]};}
function foodHref(base,point){return new URL(point.area==='zelenogradsk'?'food/zelenogradsk/all/':`poi/${encodeURIComponent(point.slug)}/`,base).href;}
function renderMenu(panel,point,trip,base){
 const rows=menuChoiceGuide(dayFor(trip)).filter(row=>row.poi===point.slug);
 if(rows.length){const list=el('ul',undefined,'wave-menu-choice-list');for(const row of rows){const item=el('li',undefined,'wave-menu-choice');item.append(el('strong',row.name),el('span',[row.portion,portions(row.quantity)].filter(Boolean).join(' · ')),el('small',row.price));list.append(item);}panel.append(list);}
 const link=el('a',point.area==='zelenogradsk'?'Посмотреть кафе и меню →':'Открыть место и меню →','wave-menu-link');link.href=foodHref(base,point);panel.append(link);
}
function renderNearby(panel,point,catalog,base){
 const rows=nearbyWaveStops(point,catalog);if(!rows.length){panel.append(el('p','Поблизости пока нет мест с координатами.','wave-nearby-empty'));return;}
 const list=el('ul',undefined,'wave-nearby-list');for(const {point:near,distance} of rows){const item=el('li'),link=el('a',near.name);link.href=new URL(`poi/${encodeURIComponent(near.slug)}/`,base).href;item.append(link,el('small',`По прямой · ${distanceLabel(distance)}`));list.append(item);}panel.append(list);
}
export function selectTab(card,name){
 for(const button of card.querySelectorAll('[data-wave-tab]')){const selected=button.dataset.waveTab===name;button.setAttribute('aria-pressed',String(selected));}
 for(const panel of card.querySelectorAll('[data-wave-panel]'))panel.hidden=panel.dataset.wavePanel!==name;
}
export function decorateStop(li,point,index,trip,catalog,base){
 const details=el('details',undefined,'wave-stop-card'),summary=el('summary',undefined,'wave-stop-summary');
 details.dataset.waveStop=point.slug;details.id=`wave-stop-${point.slug}`;
 const marker=el('span',String(index),'wave-stop-marker');marker.setAttribute('aria-hidden','true');
 const lead=li.querySelector('.day-stop-lead'),header=lead?.querySelector('.trip-timeline-heading')||li.querySelector('.trip-timeline-heading');
 const time=header?.querySelector('.trip-timeline-time'),name=header?.querySelector('.day-stop-name, a')||header?.querySelector('span');
 const photo=lead?.querySelector('.day-stop-photo');
 if(header){const caption=header.querySelector('.day-time-caption');if(caption)summary.append(caption);if(time)summary.append(time);const title=el('h4');if(name)title.textContent=name.textContent;summary.append(title);}
 summary.append(el('p',shortDescription(point.description),'wave-stop-description'));
 if(li.dataset.planConflict==='true')summary.append(el('small','Проверьте время','wave-stop-conflict'));
 const icon=el('img');icon.src=new URL('assets/icons/chevron-down.svg',base).href;icon.alt='';icon.width=24;icon.height=24;icon.setAttribute('aria-hidden','true');summary.append(icon);
 const body=el('div',undefined,'wave-stop-content'),tabs=el('div',undefined,'wave-stop-tabs');tabs.setAttribute('role','group');tabs.setAttribute('aria-label',`Разделы: ${point.name}`);
 const names=point.category==='restaurant'?['place','menu','nearby']:['place','nearby'],labels={place:'Место',menu:'Меню',nearby:'Рядом'},panels={};
 for(const tab of names){const button=el('button',labels[tab],'wave-stop-tab');button.type='button';button.dataset.waveTab=tab;button.setAttribute('aria-pressed',String(tab==='place'));button.setAttribute('aria-controls',`wave-panel-${point.slug}-${tab}`);button.addEventListener('click',()=>selectTab(details,tab));tabs.append(button);const panel=el('section',undefined,`wave-stop-panel wave-stop-panel-${tab}`);panel.id=`wave-panel-${point.slug}-${tab}`;panel.dataset.wavePanel=tab;panel.setAttribute('role','region');panel.setAttribute('aria-label',labels[tab]);panel.hidden=tab!=='place';panels[tab]=panel;}
 if(photo)panels.place.append(photo);if(name?.tagName==='A')panels.place.append(name);
 const original=[...li.childNodes];for(const node of original){if(node===header||node===lead&&lead.contains(header)||node===photo)continue;if(node.nodeType===1&&node.classList.contains('day-stop-lead')){for(const child of [...node.childNodes])if(child!==header&&child!==photo)panels.place.append(child);node.remove();continue;}panels.place.append(node);}
 if(point.category==='restaurant')renderMenu(panels.menu,point,trip,base);
 renderNearby(panels.nearby,point,catalog,base);
 body.append(tabs,...Object.values(panels));details.append(summary,body);li.replaceChildren(marker,details);li.dataset.waveStopReady='true';
}
export function enhanceWaveStops({root,trip,catalog,base,read,commit}){
 if(!root)return {render(){}};
 // `read` and `commit` are accepted so callers can share the day UI contract;
 // existing stop controls keep their original listeners and data attributes.
 void read;void commit;
 const key=dayKey(trip),state=states.get(root)||{dayKey:key,expanded:null,tab:'place'};
 const currentOpen=root.querySelector('details.wave-stop-card[open]');
 if(currentOpen){state.expanded=currentOpen.dataset.waveStop;state.tab=currentOpen.querySelector('[data-wave-tab][aria-pressed="true"]')?.dataset.waveTab||'place';}
 if(state.dayKey!==key){state.dayKey=key;state.expanded=null;state.tab='place';}
 const list=root.matches?.('#trip-plan-stops')?root:root.querySelector('#trip-plan-stops');if(!list){states.set(root,state);return {render(){}};}
 let index=0;
 for(const li of list.querySelectorAll(':scope > li[data-plan-point]')){
  if(li.dataset.waveStopReady==='true')continue;
  const point=catalog?.poi?.find(row=>row.slug===li.dataset.planPoint);if(!point)continue;
  index++;decorateStop(li,point,index,trip,catalog,base);
 }
 for(const card of list.querySelectorAll('details.wave-stop-card')){
  const open=card.dataset.waveStop===state.expanded;card.open=open;
  if(open)selectTab(card,state.tab);
  card.addEventListener('toggle',()=>{
   if(!card.isConnected)return;
   if(card.open){for(const other of list.querySelectorAll('details.wave-stop-card'))if(other!==card)other.open=false;state.expanded=card.dataset.waveStop;state.tab=card.querySelector('[data-wave-tab][aria-pressed="true"]')?.dataset.waveTab||'place';}
   else if(state.expanded===card.dataset.waveStop)state.expanded=null;
  });
  for(const tab of card.querySelectorAll('[data-wave-tab]'))tab.addEventListener('click',()=>{state.tab=tab.dataset.waveTab;state.expanded=card.dataset.waveStop;});
 }
 states.set(root,state);return {render(){return enhanceWaveStops({root,trip,catalog,base,read,commit});}};
}
export function focusWaveStop(root,id){
 const list=root?.matches?.('#trip-plan-stops')?root:root?.querySelector?.('#trip-plan-stops');if(!list)return false;
 const card=[...list.querySelectorAll('details.wave-stop-card')].find(node=>node.dataset.waveStop===id);if(!card)return false;
 card.open=true;card.querySelector('summary.wave-stop-summary')?.focus({preventScroll:true});return true;
}
