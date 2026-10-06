import {regionDate,eventMatches} from './events-engine.mjs?v=2';
const root=document.querySelector('[data-event-calendar]');
if(root){
 const form=root.querySelector('form'),cards=[...root.querySelectorAll('[data-event-id]')],buttons=[...root.querySelectorAll('[data-period]')],empty=root.querySelector('[data-events-empty]'),summary=root.querySelector('[data-events-count]');
 let period='upcoming';
 function followLink(){
  const linked=cards.find(card=>'#'+card.id===location.hash);
  if(linked){period=linked.dataset.date<regionDate()?'past':'upcoming';form.reset();}
 }
 followLink();
 function render(){
  const today=regionDate(),date=form.elements.date.value,city=form.elements.city?.value||'';let count=0;
  for(const card of cards){const event={date:card.dataset.date,city:card.dataset.city};card.hidden=!eventMatches(event,{today,date,city,period});if(!card.hidden)count++;}
  for(const button of buttons)button.setAttribute('aria-pressed',String(button.dataset.period===period));
  summary.textContent=`Событий: ${count}`;empty.hidden=count>0;
  empty.querySelector('p').textContent=date?'На эту дату в нашей подборке пока нет событий. Выберите другой день или посмотрите все ближайшие.':'В нашей подборке пока нет событий для этого выбора. Загляните позже или выберите прогулку.';
 }
 form.addEventListener('change',render);form.addEventListener('submit',e=>e.preventDefault());
 root.querySelector('[data-events-reset]').addEventListener('click',()=>{form.elements.date.value='';render();});
 for(const button of buttons)button.addEventListener('click',()=>{period=button.dataset.period;form.reset();render();});
 window.addEventListener('hashchange',()=>{followLink();render();});
 form.hidden=false;
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)render();});render();
}
