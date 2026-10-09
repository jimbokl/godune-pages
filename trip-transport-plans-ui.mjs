import {selectedDay} from './trip-days-state.mjs?v=27';
import {removeTransportPlan} from './trip-transport-plans-state.mjs';
import {transportStates,transportPath,transportDate,transportTotal,transportContextText} from './trip-transport-plans-view.mjs';
import {transportClock} from './transport-page-state.mjs?v=1';
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
export function initTransportPlans({mount,read,commit,catalog,base}){
 if(!mount)return {render(){}};
 const css=node('link');css.rel='stylesheet';css.href=new URL('trip-transport-plans.css?v=1',base);document.head.append(css);
 const section=node('section',undefined,'trip-transport-plans');section.dataset.transportPlans='';section.setAttribute('aria-label','Транспортный план');
 const anchor=mount.querySelector('#journey-preferences');if(anchor)anchor.before(section);else(mount.querySelector('.workshop-main')||mount).prepend(section);
 function render(){
  const trip=read(),day=selectedDay(trip),entries=day.transport_plans?.entries||[];
  section.hidden=!entries.length;section.replaceChildren();if(!entries.length)return;
  section.append(node('h2','Дорога и возвращение'),node('p','Сохранённый расчёт. Его можно открыть, изменить и включить в буклет.','transport-plan-intro'));
  for(const entry of entries){
   const r=entry.receipt,card=node('article',undefined,'transport-plan-card'),context=transportContextText(entry,day);
   card.dataset.transportPlan=entry.id;
   card.append(node('h3',r.title),node('p',`${transportDate(r.date)} · ${r.answers.people} чел.`,'transport-plan-date'),node('p',transportStates[r.state]),node('p',transportTotal(r.price),'transport-plan-cost'));
   if(context)card.append(node('p',context,'transport-plan-context'));
   const details=node('details'),summary=node('summary','Рейсы, стоимость и источники'),list=node('ol');
   for(const row of r.rows){const li=node('li');li.append(node('strong',`${row.time===null?'':transportClock(row.time)+' · '}${row.title}`),node('p',row.text));list.append(li);}
   const source=node('a',`Источник расписания · проверен ${r.source.checked_at}`);source.href=r.source.url;details.append(summary,list,source);card.append(details);
   const actions=node('div',undefined,'transport-plan-actions'),link=node('a','Открыть расчёт →');link.href=new URL(`${transportPath(r.profile)}?trip-day=${encodeURIComponent(day.id)}`,base);
   const remove=node('button','Убрать из дня');remove.type='button';remove.addEventListener('click',async()=>{remove.disabled=true;try{await commit(t=>removeTransportPlan(t,catalog,day.id,entry.id),'Транспортный расчёт убран из дня.');}finally{remove.disabled=false;}});
   actions.append(link,remove);card.append(actions);section.append(card);
  }
 }
 return {render};
}
