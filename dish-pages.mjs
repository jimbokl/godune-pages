import {dishItemMatches,dishResultPrice} from './dish-search.mjs?v=1';
import {initDiningRouteFilter} from './dining-route-filter.mjs?v=5';
import {showSpatialDistance} from './service-context.mjs?v=16';
const root=document.querySelector('[data-dish-page]');
if(root){
 const base=new URL('./',import.meta.url),form=root.querySelector('.dish-filters'),cards=[...root.querySelectorAll('[data-dining-card]')],list=root.querySelector('#dish-results');
 const rows=new Map(cards.map(card=>[card,[...card.querySelectorAll('[data-dish-item]')].map(row=>({row,name:row.dataset.dishName,channel:row.dataset.channel,price:row.dataset.price===''?null:Number(row.dataset.price)}))]));
 let eligible=null;
 function filter(){
  const fields=new FormData(form),options={query:fields.get('q'),max:fields.get('max'),channel:fields.get('channel')},prices=new Map();let places=0,positions=0;
  for(const card of cards){
   const nearby=!eligible||eligible.has(card.dataset.id),matches=rows.get(card).filter(item=>nearby&&dishItemMatches(item,options));
   for(const item of rows.get(card))item.row.hidden=!matches.includes(item);
   card.querySelectorAll('.food-menu-source').forEach(source=>{source.hidden=![...source.querySelectorAll('[data-dish-item]')].some(row=>!row.hidden);});
   card.hidden=!matches.length;prices.set(card,dishResultPrice(matches));if(matches.length){places++;positions+=matches.length;}
  }
  const ordered=[...cards].sort((a,b)=>fields.get('sort')==='price'?(prices.get(a)-prices.get(b)||a.dataset.name.localeCompare(b.dataset.name,'ru')):a.dataset.name.localeCompare(b.dataset.name,'ru'));
  // Move existing nodes, keeping selection forms, focus and source identity intact.
  ordered.forEach((card,index)=>{if(list.children[index]!==card)list.insertBefore(card,list.children[index]||null);});
  root.querySelector('[data-dish-count]').textContent=`Мест: ${places} · позиций в меню: ${positions}`;
  root.querySelector('[data-dish-empty]').hidden=positions>0;
 }
 form.hidden=false;form.addEventListener('input',filter);form.addEventListener('change',filter);form.addEventListener('submit',event=>{event.preventDefault();filter();});form.addEventListener('reset',()=>queueMicrotask(filter));
 initDiningRouteFilter({root,cards,base,area:'zelenogradsk',onResult(result){eligible=result?new Set(result.eligible_ids):null;showSpatialDistance(new Map(cards.map(card=>[card.dataset.id,card])),result);filter();}});
 // Menu JSON is fetched only for visible cards. Trip/WASM starts on an explicit selection.
 import('./trip-menu-choices-ui.mjs?v=8').then(({initDiningMenuChoices})=>initDiningMenuChoices(root,base,{lazy:true}));
 filter();
}
