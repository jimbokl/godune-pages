import {regionDate,eventMatches} from './events-engine.mjs?v=3';
import {BOOKMARK_KEY,readBookmarks,writeBookmarks} from './events-bookmarks.mjs?v=1';
const root=document.querySelector('[data-event-calendar]');
if(root){
 const form=root.querySelector('form'),cards=[...root.querySelectorAll('[data-event-id]')],buttons=[...root.querySelectorAll('[data-period]')],empty=root.querySelector('[data-events-empty]'),summary=root.querySelector('[data-events-count]'),status=root.querySelector('[data-events-status]');
 let period='upcoming',saved=new Set(),storageReady=true;
 try{saved=readBookmarks(localStorage);}catch{storageReady=false;}
 function followLink(){const linked=cards.find(card=>'#'+card.id===location.hash);if(linked){period=linked.dataset.date<regionDate()?'past':'upcoming';form.reset();}}
 followLink();
 function render(){
  const today=regionDate(),date=form.elements.date.value,city=form.elements.city?.value||'';let count=0;
  for(const card of cards){
   const event={date:card.dataset.date,city:card.dataset.city};
   card.hidden=!eventMatches(event,{today,date,city,period,saved:saved.has(card.id)});if(!card.hidden)count++;
   const button=card.querySelector('[data-event-save]'),isSaved=saved.has(card.id);
   button.setAttribute('aria-pressed',String(isSaved));button.setAttribute('aria-label',(isSaved?'Убрать из сохранённых: ':'Сохранить событие: ')+card.querySelector('h2').textContent);
   button.querySelector('span').textContent=isSaved?'Сохранено':'Сохранить';button.hidden=false;
  }
  for(const button of buttons)button.setAttribute('aria-pressed',String(button.dataset.period===period));
  root.querySelector('[data-saved-count]').textContent=String(cards.filter(c=>saved.has(c.id)).length);
  summary.textContent=`Событий: ${count}`;empty.hidden=count>0;
  empty.querySelector('h2').textContent=period==='saved'?'Здесь будут ваши события':'Этот день пока свободен';
  empty.querySelector('p').textContent=period==='saved'?'Нажмите «Сохранить» на карточке — событие останется здесь.':date?'Выберите другую дату или посмотрите ближайшие события.':'Выберите другой город или готовую прогулку.';
 }
 form.addEventListener('change',render);form.addEventListener('submit',e=>e.preventDefault());
 root.querySelector('[data-events-reset]').addEventListener('click',()=>{form.elements.date.value='';render();});
 for(const button of buttons)button.addEventListener('click',()=>{period=button.dataset.period;form.reset();render();});
 for(const card of cards)card.querySelector('[data-event-save]').addEventListener('click',()=>{
  if(!storageReady){status.textContent='Не удалось открыть сохранённые события в этом браузере.';return;}
  const next=new Set(saved),removing=next.delete(card.id);if(!removing)next.add(card.id);
  try{saved=writeBookmarks(localStorage,next);status.textContent=removing?'Событие убрано из сохранённых.':'Событие сохранено.';render();}
  catch{status.textContent='Не удалось сохранить событие. Попробуйте ещё раз.';}
 });
 window.addEventListener('storage',e=>{if(e.key===BOOKMARK_KEY||e.key===null){try{saved=readBookmarks(localStorage);storageReady=true;render();}catch{status.textContent='Не удалось прочитать сохранённые события.';}}});
 window.addEventListener('hashchange',()=>{followLink();render();});form.hidden=false;
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)render();});render();
}
