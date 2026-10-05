import {saveTourDay} from './gastronomy.mjs?v=18';
export async function initFishWalk({workshop,base}) {
  const button=document.querySelector('[data-fish-save]'),status=document.querySelector('[data-fish-status]');
  const response=await fetch(new URL('data/gastronomy.json',base));
  if(!response.ok)throw Error('food_unavailable');
  const food=await response.json(),tour=food.fish_tour;
  if(!tour || tour.places.length!==3)throw Error('fish_walk_unavailable');
  button.disabled=false;
  button.addEventListener('click',async()=>{
    button.disabled=true;
    try {
      const result=await workshop.setState(current=>saveTourDay(current,tour,food,{theme:'fish',time:'12:00',date:null,max_minutes:180}),'Рыбная прогулка добавлена отдельным днём.');
      status.textContent=result.saved?'Прогулка сохранена. Выберите дату и время в своём плане.':'Прогулка открыта в этой вкладке. Браузер не подтвердил сохранение — скачайте файл поездки.';
      const link=document.createElement('a');link.href=new URL('planner/#my-trip',base);link.textContent='Открыть мой план →';link.className='text-action';status.append(document.createTextNode(' '),link);
    } catch {status.textContent='Не удалось сохранить прогулку. Попробуйте ещё раз; прежний план остаётся на месте.';}
    finally {button.disabled=false;}
  });
}
