import {updateSchedule} from './trip-schedule-state.mjs';

export function calculate(wasm,input) {
  const bytes=new TextEncoder().encode(JSON.stringify(input));
  const pointer=wasm.gastro_alloc(bytes.length);let output,length;
  try {
    new Uint8Array(wasm.memory.buffer,pointer,bytes.length).set(bytes);
    output=wasm.gastro_plan(pointer,bytes.length);
    length=new DataView(wasm.memory.buffer).getUint32(output,true);
    const result=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(new Uint8Array(wasm.memory.buffer,output+4,length)));
    if(!result.ok)throw Error(result.error);
    return result.tours;
  } finally {
    wasm.gastro_free(pointer,bytes.length);
    if(output!==undefined && length!==undefined)wasm.gastro_free(output,length+4);
  }
}
export function planRequest(food,settings) {
  return {venues:food.venues.map(v=>({id:v.slug,roles:v.roles,themes:v.themes,visit:v.visit,available:v.available})),legs:food.legs,
    theme:settings.theme,max_minutes:Number(settings.max_minutes),stops:Number(settings.stops),start:null};
}
// Existing points keep their order. Food stops join the same durable trip draft.
export function appendTour(current,tour,food) {
  let next={...current,places:[...new Set([...current.places,...tour.places])]};
  if(!current.places.length)next=updateSchedule(next,'mode','foot');
  for(const id of tour.places) {
    if(current.places.includes(id))continue;
    const v=food.venues.find(v=>v.slug===id);
    if(v)next=updateSchedule(next,'visit',v.visit,id);
  }
  return next;
}
export async function initGastronomy(base,workshop) {
  const form=document.querySelector('#gastro-form');if(!form)return;
  const status=document.querySelector('#gastro-status'),results=document.querySelector('#gastro-results');
  const response=await fetch(new URL('data/gastronomy.json',base));
  if(!response.ok)throw Error('food_catalog');
  const food=await response.json();
  const wasmResponse=await fetch(new URL('assets/gastro.wasm',base));
  if(!wasmResponse.ok)throw Error('food_engine');
  const {instance}=await WebAssembly.instantiate(await wasmResponse.arrayBuffer());
  const make=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
  const themes={all:'Вкусы города',fish:'Рыбная прогулка',baltic:'Балтика за столом',italian:'Итальянская остановка'};
  function render(tours,theme) {
    results.replaceChildren(...tours.slice(0,3).map((tour,index)=>{
      const card=make('article',undefined,'food-tour');
      card.append(make('p',`Прогулка ${String(index+1).padStart(2,'0')}`,'inner-kicker'),make('h3',themes[theme]),
        make('p',`${tour.total_minutes} минут с остановками · ${tour.walking_minutes} минут пешком · ${(tour.distance_m/1000).toFixed(1).replace('.',',')} км`,'food-tour-facts'));
      const list=make('ol');
      tour.places.forEach((id,i)=>{
        const v=food.venues.find(v=>v.slug===id),li=make('li'),a=make('a',v.name),small=make('span',`${v.visit} минут за столом`);
        a.href=new URL(`poi/${id}/`,base);li.append(a,small);list.append(li);
        if(i<tour.places.length-1){const leg=food.legs.find(l=>l.from===id && l.to===tour.places[i+1]);li.append(make('small',`↓ ${leg.minutes} минут пешком`,'food-tour-leg'));}
      });
      const save=make('button','Добавить в мой маршрут +','button button-dark');save.type='button';save.dataset.gastroSave=String(index);
      save.addEventListener('click',async()=>{save.disabled=true;
        try {await workshop.setState(current=>appendTour(current,tour,food),'Остановки и время за столом добавлены в ваш маршрут.');save.textContent='Остановки сохранены ✓';}
        finally{save.disabled=false;}
      });
      const map=make('a','Путь на нашей карте ↗','text-action');
      const mapUrl=new URL('./',base);mapUrl.searchParams.set('foodtour',tour.places.join(','));map.href=mapUrl;
      card.append(list,save,map);return card;
    }));
  }
  form.addEventListener('submit',event=>{
    event.preventDefault();const settings=Object.fromEntries(new FormData(form)),tours=calculate(instance.exports,planRequest(food,settings));
    render(tours,settings.theme);
    status.textContent=tours.length?`Нашлось прогулок: ${tours.length}. Выберите остановки или сначала посмотрите путь.`:'На такое время прогулка не складывается. Добавьте час или выберите две остановки.';
  });
  document.querySelectorAll('[data-food-filter]').forEach(button=>button.addEventListener('click',()=>{
    const theme=button.dataset.foodFilter;let count=0;
    document.querySelectorAll('[data-food-themes]').forEach(card=>{card.hidden=theme!=='all'&&!card.dataset.foodThemes.split(' ').includes(theme);if(!card.hidden)count++;});
    document.querySelectorAll('[data-food-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    document.querySelector('#food-filter-status').textContent=`Мест в подборке: ${count}`;
  }));
  render(food.tours,'all');form.querySelector('[type=submit]').disabled=false;
  status.textContent='Выберите вкус и время — прогулки появятся здесь.';
  document.documentElement.dataset.gastroReady='true';
}
