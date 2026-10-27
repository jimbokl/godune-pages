import {regionDate,eventMatches} from './events-engine.mjs?v=2026102701';
import {BOOKMARK_KEY,readBookmarks,writeBookmarks} from './events-bookmarks.mjs?v=2026101305';
const root=document.querySelector('[data-event-calendar]');
if(root){
 const form=root.querySelector('form'),cards=[...root.querySelectorAll('[data-event-id]')],buttons=[...root.querySelectorAll('[data-period]')],empty=root.querySelector('[data-events-empty]'),summary=root.querySelector('[data-events-count]'),status=root.querySelector('[data-events-status]');
 const bookmarkIds=card=>[card.id,...(card.dataset.eventAliases||'').split(' ').filter(Boolean)];
 const isSaved=card=>bookmarkIds(card).some(id=>saved.has(id));
 let period='upcoming',saved=new Set(),storageReady=true;
 try{saved=readBookmarks(localStorage);}catch{storageReady=false;}
 function followLink(){const linked=cards.find(card=>bookmarkIds(card).some(id=>'#'+id===location.hash));if(linked){period=linked.dataset.date<regionDate()?'past':'upcoming';form.reset();}}
 followLink();
 function render(){
  const now=new Date(),today=regionDate(now),date=form.elements.date.value,city=form.elements.city?.value||'';let count=0;
  for(const card of cards){
   const event={date:card.dataset.date,city:card.dataset.city,start_time:card.dataset.startTime,end_time:card.dataset.endTime||null};
   card.hidden=!eventMatches(event,{today,date,city,period,saved:isSaved(card),now:date?undefined:now});if(!card.hidden)count++;
   const button=card.querySelector('[data-event-save]'),marked=isSaved(card);
   button.setAttribute('aria-pressed',String(marked));button.setAttribute('aria-label',(marked?'Убрать из сохранённых: ':'Сохранить событие: ')+card.querySelector('h2').textContent);
   button.querySelector('span').textContent=marked?'Сохранено':'Сохранить';button.hidden=false;
  }
  for(const button of buttons)button.setAttribute('aria-pressed',String(button.dataset.period===period));
  root.querySelector('[data-saved-count]').textContent=String(cards.filter(isSaved).length);
  summary.textContent=`Событий: ${count}`;empty.hidden=count>0;
  empty.querySelector('h2').textContent=period==='saved'?'Здесь будут ваши события':'Этот день пока свободен';
  empty.querySelector('p').textContent=period==='saved'?'Нажмите «Сохранить» на карточке — событие останется здесь.':date?'Выберите другую дату или посмотрите ближайшие события.':'Выберите другой город или готовую прогулку.';
 }
 form.addEventListener('change',render);form.addEventListener('submit',e=>e.preventDefault());
 root.querySelector('[data-events-reset]').addEventListener('click',()=>{form.elements.date.value='';render();});
 for(const button of buttons)button.addEventListener('click',()=>{period=button.dataset.period;form.reset();render();});
 for(const card of cards)card.querySelector('[data-event-save]').addEventListener('click',()=>{
  if(!storageReady){status.textContent='Не удалось открыть сохранённые события в этом браузере.';return;}
  const next=new Set(saved),removing=isSaved(card);if(removing){for(const id of bookmarkIds(card))next.delete(id);}else next.add(card.id);
  try{saved=writeBookmarks(localStorage,next);status.textContent=removing?'Событие убрано из сохранённых.':'Событие сохранено.';render();}
  catch{status.textContent='Не удалось сохранить событие. Попробуйте ещё раз.';}
 });
 window.addEventListener('storage',e=>{if(e.key===BOOKMARK_KEY||e.key===null){try{saved=readBookmarks(localStorage);storageReady=true;render();}catch{status.textContent='Не удалось прочитать сохранённые события.';}}});
 window.addEventListener('hashchange',()=>{followLink();render();});form.hidden=false;
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)render();});window.addEventListener('focus',render);window.setInterval(()=>{if(!document.hidden)render();},60000);render();
}

const detail=document.querySelector('[data-event-detail] [data-event-id]');
if(detail){
 const button=detail.querySelector('[data-event-save]');
 const state=document.createElement('p');state.setAttribute('role','status');detail.append(state);
 const render=()=>{try{
  const saved=readBookmarks(localStorage).has(detail.id);button.hidden=false;
  button.setAttribute('aria-pressed',String(saved));button.querySelector('span').textContent=saved?'Сохранено':'Сохранить';
 }catch{state.textContent='Не удалось открыть сохранённые события в этом браузере.';}};
 button.addEventListener('click',()=>{try{
  const saved=readBookmarks(localStorage);if(!saved.delete(detail.id))saved.add(detail.id);
  writeBookmarks(localStorage,saved);render();
 }catch{state.textContent='Не удалось сохранить событие. Попробуйте ещё раз.';}});
 window.addEventListener('storage',e=>{if(e.key===BOOKMARK_KEY||e.key===null)render();});render();
}
