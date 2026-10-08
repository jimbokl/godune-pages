import {transferClock} from './trip-service-transfer-view.mjs';
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
export function renderMapRoads(root,projection,{onSelect,onFocus,dayId}){
 const open=root.dataset.dayId===dayId?[...root.querySelectorAll('details[open][data-map-connection]')].map(n=>n.dataset.mapConnection):[];
 root.replaceChildren();root.dataset.dayId=dayId;
 for(const connection of projection.connections){
  const detail=node('details',undefined,'day-map-road');detail.dataset.mapConnection=connection.key;detail.dataset.roadState=connection.status;
  const summary=node('summary'),heading=node('span',connection.title,'day-map-road-title'),parts=connection.rows.filter(r=>r.kind!=='wait');
  const caption=parts.length===1?parts[0].text.split('.')[0]:`${parts.length} участка дороги`;
  summary.append(heading,node('span',caption,'day-map-road-caption'));detail.append(summary);
  const body=node('div',undefined,'day-map-road-body');
  for(const row of connection.rows){
   const part=node('div',undefined,'day-map-road-part');part.dataset.transferStatus=row.status||row.state;
   part.append(node('p',`${row.time==null?'':`${transferClock(row.time)} · `}${row.title}`,'day-map-road-stage'),node('p',row.text));
   if(row.sources?.length){const facts=node('details',undefined,'day-map-road-sources');facts.append(node('summary','Время и источники'));for(const source of row.sources){const p=node('p');if(/^https?:\/\//.test(source.name)){const a=node('a','Источник ↗');a.href=source.name;a.target='_blank';a.rel='noopener';p.append(a);}else p.append(node('span',source.name));p.append(document.createTextNode(` · ${source.checked_at}`));facts.append(p);}part.append(facts);}
   body.append(part);
  }
  if(connection.unknown.length)body.append(node('p',`Без метки на карте: ${connection.unknown.join('; ')}.`,'day-map-road-location'));
  const actions=node('div',undefined,'day-map-road-actions');
  if(projection.points.some(p=>p.connectionKey===connection.key)){const focus=node('button','Остановки на карте','day-map-road-link');focus.type='button';focus.addEventListener('click',()=>onFocus(connection.key));actions.append(focus);}
  if(connection.target){const button=node('button','Показать в дне →','day-map-road-link');button.type='button';button.addEventListener('click',()=>onSelect(connection.target.id));actions.append(button);}
  body.append(actions);detail.append(body);root.append(detail);
  detail.open=open.includes(connection.key)||!open.length&&projection.connections.length===1;
  detail.addEventListener('toggle',()=>{if(detail.open)for(const other of root.querySelectorAll('details[data-map-connection][open]'))if(other!==detail)other.open=false;});
 }
 if(projection.omittedStops)root.append(node('p',`Остановок без координат: ${projection.omittedStops}. Они остаются в вашем дне.`,'day-map-road-location'));
 for(const row of projection.unused)root.append(node('p',`${row.title}. ${row.text}`,'day-map-road-location'));
 root.hidden=!root.childElementCount;
}
