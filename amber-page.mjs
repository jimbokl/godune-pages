import {localToday,nextDay,dateLabel,planAmberWalk,saveAmberWalk,loadAmberWalk} from './amber-state.mjs?v=1';
const form=document.querySelector('#amber-form'),base=new URL('./',import.meta.url);
const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
async function init(){
 if(!form)return;
 const status=document.querySelector('#amber-status'),result=document.querySelector('#amber-result'),submit=form.querySelector('[type=submit]');
 let manifest,plan,storage;try{storage=globalThis.localStorage;}catch{storage=null;}
 form.elements.storm.value=localToday();form.elements.storm.max=localToday();form.elements.visit.value=nextDay(localToday());
 try{const response=await fetch(new URL('data/amber.json',base));if(!response.ok)throw Error();manifest=await response.json();if(manifest.version!==1)throw Error();}
 catch{submit.disabled=true;status.textContent='Инструмент не загрузился. Описания берегов и ответы доступны ниже.';return;}
 const read=()=>({storm:form.elements.storm.value,visit:form.elements.visit.value,beach:form.elements.beach.value,sea:form.elements.sea.value,access:form.elements.access.checked,daylight:form.elements.daylight.checked});
 const fill=values=>{for(const key of ['storm','visit','beach','sea'])if(typeof values?.[key]==='string')form.elements[key].value=values[key];};
 function render(){
  try{plan=planAmberWalk(manifest,read());}catch(error){status.textContent=error.message;result.hidden=true;plan=null;return;}
  status.textContent='';result.replaceChildren();result.hidden=false;result.dataset.state=plan.state;
  const kicker=node('p',plan.beach.name+' · '+dateLabel(plan.answers.visit),'eyebrow'),heading=node('h3',plan.title);heading.id='amber-result-title';result.append(kicker,heading,node('p',plan.lead,'amber-result-lead'));
  const dates=node('p','Шторм: '+dateLabel(plan.answers.storm)+' · дата указана вами','amber-date-note');result.append(dates);
  const list=node('ol',undefined,'amber-steps');plan.steps.forEach((step,i)=>{const item=node('li'),copy=node('div');copy.append(node('h4',step.title),node('p',step.text));item.append(node('span',String(i+1).padStart(2,'0')),copy);list.append(item);});result.append(list);
  if(plan.transfer)result.append(node('p','Балтийская коса: перед поездкой подтвердите работу переправы и обратный рейс у перевозчика.','amber-transfer'));
  const actions=node('div',undefined,'amber-result-actions'),pdf=node('button','Скачать памятку PDF ↓','amber-primary'),save=node('button','Сохранить здесь','amber-save'),link=node('a',plan.beach.link_label+' →');pdf.type=save.type='button';link.href=new URL(plan.beach.link.replace(/^\//,''),base).href;
  actions.append(pdf,save,link);result.append(actions);
  save.addEventListener('click',()=>{const ok=saveAmberWalk(storage,plan);status.textContent=ok?'Памятка сохранена в этом браузере. Перед новым выходом проверьте условия ещё раз.':'Сохранение недоступно. Скачайте PDF, чтобы забрать памятку с собой.';if(ok)save.textContent='Сохранено ✓';});
  pdf.addEventListener('click',async()=>{const snapshot=structuredClone(plan);pdf.disabled=true;status.textContent='Собираем короткую памятку…';try{const {makeAmberPdf}=await import('./amber-pdf.mjs?v=1');const bytes=await makeAmberPdf({plan:snapshot,manifest,base});const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})),a=node('a');a.href=url;a.download=`godune-yantar-${snapshot.answers.visit}.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);status.textContent='Памятка готова. Проверьте загрузки браузера.';}catch{status.textContent='PDF не собрался. Повторите скачивание или распечатайте страницу через меню браузера.';}finally{pdf.disabled=false;}});
 }
 form.addEventListener('submit',event=>{event.preventDefault();render();if(plan)result.focus({preventScroll:true});});
 // Editing invalidates the old result; a stale ready state must not remain visible.
 form.addEventListener('input',()=>{if(plan){result.hidden=true;plan=null;status.textContent='Настройки изменены. Соберите прогулку заново.';}});
 document.querySelectorAll('[data-amber-beach]').forEach(button=>button.addEventListener('click',()=>{form.elements.beach.value=button.dataset.amberBeach;result.hidden=true;plan=null;document.querySelector('#amber-tool').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});form.elements.beach.focus({preventScroll:true});}));
 document.addEventListener('click',event=>{const link=event.target.closest('a[href^="#source-"]');if(!link)return;const target=document.getElementById(link.hash.slice(1));const details=target?.closest('details');if(details)details.open=true;});
 const saved=loadAmberWalk(storage);if(saved){fill(saved);status.textContent='Открыты сохранённые настройки. Море и доступ к берегу проверьте заново.';}
 document.documentElement.dataset.amberReady='true';
}
init();
