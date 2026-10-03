import {journeyDays, selectedDay} from './trip-days-state.mjs?v=11';
export function initToolPages(workshop,catalog,base) {
  document.querySelector('.tool-nav [aria-current="page"]')?.scrollIntoView({inline:'nearest',block:'nearest',behavior:'instant'});
  const mount=document.querySelector('[data-tool-trip]');
  const render=()=>{
    if(!mount)return;
    const trip=workshop.getState(),days=journeyDays(trip),day=selectedDay(trip);
    const count=day.places.length,index=days.findIndex(row=>row.id===day.id)+1;
    const date=day.date?new Date(day.date+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'}):'дата пока свободна';
    const summary=mount.querySelector('p');
    summary.textContent=trip.itinerary || count ? `День ${index} из ${days.length} · ${date} · остановок: ${count}. ${count?day.places.slice(0,3).map(id=>catalog.poi.find(p=>p.slug===id)?.name).filter(Boolean).join(' → ')+(count>3?' → …':''):'Выберите первое место.'}`:'Ваш день пока свободен. Добавьте остановку на карте или выберите готовый план.';
  };
  render();window.addEventListener('godune:trip-change',render);
  let writing=false;
  document.querySelectorAll('[data-plan-starter]').forEach(button=>{button.addEventListener('click',async()=>{
    if(writing)return;writing=true;
    const buttons=[...document.querySelectorAll('[data-plan-starter]')],status=document.querySelector('#plan-starter-status');
    buttons.forEach(b=>b.disabled=true);status.textContent='Добавляем дни в вашу поездку…';
    try {
      const result=await workshop.addStarter(button.dataset.planStarter);
      status.textContent=result.conflict?'Поездка изменилась в другой вкладке. Показан свежий выбор; при необходимости добавьте план снова.':result.saved?'Дни добавлены. Откройте «Мой маршрут», выберите даты и подстройте остановки под себя.':'Браузер не сохранил новые дни. Разрешите хранение данных сайта и попробуйте снова.';
      if(result.saved){mount?.querySelector('a')?.focus({preventScroll:true});status.scrollIntoView({block:'nearest',behavior:'instant'});}
    } catch {status.textContent='Дни пока не добавились. Ваш прежний выбор сохранён. Попробуйте ещё раз.';}
    finally{writing=false;buttons.forEach(b=>b.disabled=false);}
  });button.disabled=false;});
  // A help link opens exactly the answer requested, including a collapsed section.
  function revealAnswer(){const target=document.getElementById(location.hash.slice(1));if(target?.matches('.help-answers details'))target.open=true;}
  revealAnswer();window.addEventListener('hashchange',revealAnswer);
  document.documentElement.dataset.toolReady='true';
}
