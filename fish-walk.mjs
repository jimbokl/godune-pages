import {saveTourDay} from './gastronomy.mjs?v=2026101203';
export async function initFishWalk({workshop,base,catalog}) {
  const button=document.querySelector('[data-fish-save]'),booklet=document.querySelector('[data-fish-booklet]'),status=document.querySelector('[data-fish-status]');
  const response=await fetch(new URL('data/gastronomy.json',base));
  if(!response.ok)throw Error('food_unavailable');
  const food=await response.json(),tour=food.fish_tour;
  if(!tour || tour.places.length!==3)throw Error('fish_walk_unavailable');
  let busy=false;
  const enabled=value=>{button.disabled=!value;if(booklet)booklet.disabled=!value;};
  const save=()=>workshop.setState(current=>saveTourDay(current,tour,food,{name:'Зеленоградск на рыбной волне',theme:'fish',time:'12:00',date:null,max_minutes:180}),'Рыбная прогулка добавлена отдельным днём.');
  enabled(true);
  button.addEventListener('click',async()=>{
    if(busy)return;busy=true;enabled(false);
    try {
      const result=await save();
      button.textContent=result.saved?'День сохранён ✓':'Сохранить день →';
      status.textContent=result.saved?'День сохранён. Дату и время можно выбрать в своём плане.':'День открыт в этой вкладке. Сохраните буклет, чтобы взять его с собой.';
    } catch {status.textContent='Не удалось сохранить прогулку. Попробуйте ещё раз.';}
    finally {busy=false;enabled(true);}
  });
  booklet?.addEventListener('click',async()=>{
    if(busy)return;busy=true;enabled(false);booklet.textContent='Собираем буклет…';
    try {
      await save();
      const trip=structuredClone(workshop.getState()),signature=JSON.stringify(trip);
      const {downloadPersonalGuide}=await import('./trip-guide-ui.mjs?v=2026101203');
      const result=await downloadPersonalGuide({trip,catalog,base,scope:'day',format:'phone',onProgress:text=>{status.textContent=text;},stillCurrent:()=>JSON.stringify(workshop.getState())===signature});
      status.textContent=`Буклет готов: ${result.pages} стр. Ищите PDF в загрузках.`;
      button.textContent='День сохранён ✓';
    } catch(error) {status.textContent=error.message==='guide_trip_changed'?'День изменился. Соберите свежий буклет.':'Буклет пока не собрался. Попробуйте ещё раз.';}
    finally {busy=false;enabled(true);booklet.textContent='Собрать буклет ↓';}
  });
  document.querySelectorAll('.fish-overview a').forEach(link=>link.addEventListener('click',()=>{
    const stop=document.querySelector(link.hash+' .fish-stop-details');if(stop)stop.open=true;
  }));
}
