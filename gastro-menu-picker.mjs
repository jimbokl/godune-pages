import {selectedDay,chooseTripDay} from './trip-days-state.mjs?v=2026101706';
import {selectMenuChoice,removeMenuChoice} from './trip-menu-choices-state.mjs?v=2026101706';
import {validMenuChoice} from './trip-menu-choices-contract.mjs?v=2026101305';
const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const rub=v=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:2}).format(v/100);
export function initGastroMenus({workshop,base,catalog,saveDay,getId,setBusy}){
 let loaded;const blocks=[...document.querySelectorAll('[data-gastro-menu]')];
 async function read(){if(!loaded)loaded=fetch(new URL('data/gastro-menu-choices.json',base)).then(async r=>{if(!r.ok)throw Error('menu_unavailable');const v=await r.json();if(v.version!==1)throw Error('menu_version');return v;}).catch(e=>{loaded=null;throw e;});return loaded;}
 function sync(){for(const block of blocks){const id=getId(),day=workshop.getState().itinerary?.days.find(d=>d.id===id);for(const b of block.querySelectorAll('[data-gastro-choice]')){const selected=day?.menu_choices?.some(c=>c.menu_item_id===b.dataset.gastroChoice);b.setAttribute('aria-pressed',String(!!selected));b.textContent=selected?'В плане ✓':'Добавить +';}}}
 for(const block of blocks){const load=block.querySelector('[data-gastro-load-menu]'),status=block.querySelector('[role=status]');
  load.addEventListener('click',async()=>{load.disabled=true;try{
   const data=await read(),rows=data.venues[block.dataset.gastroMenu];if(!rows?.length||!rows.every(validMenuChoice))throw Error('invalid_menu');status.textContent='';
   const label=el('label','Раздел меню'),select=el('select');select.setAttribute('aria-label','Раздел меню '+rows[0].place.name);
   for(const category of [...new Set(rows.map(r=>r.category))]){const option=el('option',category||'Меню');option.value=category||'';select.append(option);}label.append(select);
   const list=el('ul');list.className='gastro-menu-list';
   function draw(){list.replaceChildren();for(const row of rows.filter(r=>(r.category||'')===select.value)){
    const li=el('li'),copy=el('span'),name=el('strong',row.name),detail=el('small',[row.portion,row.price.amount_kopecks!==null?rub(row.price.amount_kopecks):row.price.from_kopecks!==null?'от '+rub(row.price.from_kopecks):row.price.label||''].filter(Boolean).join(' · ')),button=el('button','Добавить +');
    button.type='button';button.dataset.gastroChoice=row.menu_item_id;button.setAttribute('aria-label','Выбрать '+row.name);copy.append(name,detail);li.append(copy,button);list.append(li);
    button.addEventListener('click',async()=>{if(!setBusy(true))return;button.disabled=true;try{
      await saveDay();const id=getId();if(!id)throw Error('no_day');
      const result=await workshop.setState(current=>{const next=chooseTripDay(current,id),day=selectedDay(next);if(day.menu_choices?.some(c=>c.menu_item_id===row.menu_item_id))return removeMenuChoice(next,row.menu_item_id,catalog);return selectMenuChoice(next,{...structuredClone(row),planned_date:day.date,selected_at:new Date().toISOString()},catalog);},'Выбор блюда сохранён.');
      if(result.conflict)throw Error('menu_conflict');status.textContent='Выбор обновлён в вашем дне и попадёт в PDF.';
     }catch(error){console.error('gastro_menu_choice',error);status.textContent='Не удалось обновить выбор. Попробуйте ещё раз.';}finally{button.disabled=false;setBusy(false);sync();}});
   }sync();}
   select.addEventListener('change',draw);load.replaceWith(label);block.append(list);const source=el('p');source.className='gastro-menu-source';const link=el('a','Меню · '+rows[0].source.observed_at);link.href=rows[0].source.url;link.target='_blank';link.rel='noopener';source.append(link);block.append(source);draw();
  }catch{status.textContent='Меню пока не загрузилось. Попробуйте ещё раз.';load.disabled=false;}});
  load.disabled=false;
 }
 window.addEventListener('godune:trip-change',sync);
}
