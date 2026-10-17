import {ensureJourney,selectedDay,journeyDays,chooseTripDay,addTripDay,COST_KINDS} from './trip-days-state.mjs?v=2026101707';
import {cleanTrip} from './trip-state.mjs?v=2026101707';
import {validMenuChoice,menuChoiceRows} from './trip-menu-choices-contract.mjs?v=2026101305';
import {selectMenuChoice} from './trip-menu-choices-state.mjs?v=2026101707';
import {menuPriceFreshness} from './trip-menu-choices-view.mjs?v=2026101706';
import {formatKopecks} from './trip-money.mjs?v=2026101305';

// This is a separate, read-only quote of observed menu prices, never a payment
// or an automatic replacement of the traveller's food expense ledger.
export function menuQuoteInput(day){
 const rows=menuChoiceRows(day);if(!rows.every(validMenuChoice))throw Error('invalid_menu_choice');
 const items=rows.map(choice=>({id:choice.menu_item_id,quantity:choice.quantity,scope:'group',paid:null,
  amount:choice.planned_date===day.date&&choice.price.observed_at&&day.date&&choice.price.observed_at<=day.date?choice.price.amount_kopecks:null}));
 return {version:1,people:1,days:[{id:day.id,costs:Object.keys(COST_KINDS).map(kind=>({kind,amount:0,quantity:1,scope:'group',paid:null,
  ...(kind==='food'?{basis:'items',items}:{})}))}]};
}
export function quoteMenuDay(engine,day){
 const rows=menuChoiceRows(day);if(!rows.length)return null;
 const result=engine.budget(menuQuoteInput(day)).days[0];
 return {version:1,known:result.known,unknown:result.unknown,total:result.total,
  date_missing:!day.date,
  stale:rows.filter(choice=>menuPriceFreshness(choice,day.date)==='stale').length};
}
export function menuQuoteText(quote){
 if(!quote)return '';
 if(quote.date_missing)return 'Для расчёта суммы выберите дату дня. Блюдо можно сохранить сейчас.';
 const amount=formatKopecks(quote.known);
 return quote.unknown?`По сохранённым ценам меню: ${amount}; ещё ${quote.unknown} поз. без точной суммы.`:`По сохранённым ценам меню: ${amount}.`;
}
export function prepareMenuChoices(trip,selections,targetId,catalog,now=new Date().toISOString()){
 if(!Array.isArray(selections)||!selections.length)throw Error('invalid_menu_choices');
 const ids=new Set();
 for(const row of selections){
  if(!validMenuChoice(row?.template)||!Number.isSafeInteger(row.quantity)||row.quantity<1||ids.has(row.template.menu_item_id))throw Error('invalid_menu_choice');
  ids.add(row.template.menu_item_id);
 }
 const guard=JSON.stringify(trip),original=ensureJourney(cleanTrip(trip,catalog)),active=original.itinerary.active;
 let next=original;
 if(targetId==='new'){next=addTripDay(next);targetId=selectedDay(next).id;}
 else if(!journeyDays(next).some(day=>day.id===targetId))throw Error('menu_choice_day_removed');
 next=chooseTripDay(next,targetId);const choices=[];
 for(const row of selections){
  const day=selectedDay(next),previous=menuChoiceRows(day).find(choice=>choice.menu_item_id===row.template.menu_item_id);
  const choice={...structuredClone(row.template),quantity:row.quantity,planned_date:day.date,selected_at:now,...(previous?{note:previous.note}:{})};
  next=selectMenuChoice(next,choice,catalog);choices.push(choice);
 }
 return {version:1,guard,targetId,choices,day:structuredClone(selectedDay(next)),trip:chooseTripDay(next,active)};
}
export function prepareMenuChoice(trip,template,count,targetId,catalog,now=new Date().toISOString()){
 const preview=prepareMenuChoices(trip,[{template,quantity:count}],targetId,catalog,now);
 const {choices,...single}=preview;return {...single,choice:choices[0]};
}
// Native preset metadata is checked against the same exact saved templates as
// individual dishes. A mixed cached HTML/JSON pair cannot change the order.
export function menuPresetSelections(preset,data){
 if(preset?.version!==1||typeof preset.venue!=='string'||!Array.isArray(preset.items)||!preset.items.length)throw Error('invalid_menu_preset');
 const templates=data?.version===1&&data.venues?.[preset.venue];if(!Array.isArray(templates))throw Error('menu_preset_missing');
 const ids=new Set();return preset.items.map(item=>{
  if(!Number.isSafeInteger(item.quantity)||item.quantity<1)throw Error('invalid_menu_choice');
  if(typeof item.key!=='string'||!/^\d+:\d+:\d+$/.test(item.key))throw Error('menu_preset_item_missing');
  const [m,c,i]=item.key.split(':'),suffix=`/menus/${m}/categories/${c}/items/${i}`;
  const matches=templates.filter(t=>t.source?.pointer?.endsWith(suffix));if(matches.length!==1)throw Error('menu_preset_item_missing');
  const t=matches[0],price=item.price;
  if(!validMenuChoice(t)||ids.has(t.menu_item_id)||t.name!==item.name||t.category!==item.category||(t.portion||null)!==(item.portion||null)||t.source.url!==preset.source?.url||t.source.observed_at!==preset.source?.observed_at||t.price.observed_at!==preset.source?.observed_at||!price||t.price.amount_kopecks!==price.amount_kopecks||t.price.from_kopecks!==price.from_kopecks||(t.price.label||null)!==(price.label||null))throw Error('menu_preset_source_changed');
  ids.add(t.menu_item_id);return {template:t,quantity:item.quantity};
 });
}
// Object member order can change when memory projects a legacy day. Compare
// every value and array position, while retaining the original guard format.
const contextJSON=value=>JSON.stringify(value,(_key,row)=>row&&typeof row==='object'&&!Array.isArray(row)?Object.fromEntries(Object.keys(row).sort().map(key=>[key,row[key]])):row);
export function confirmMenuChoice(trip,preview){
 if(preview?.version!==1||typeof preview.guard!=='string')throw Error('menu_choice_context_changed');
 if(JSON.stringify(trip)!==preview.guard){
  let unchanged=false;try{unchanged=contextJSON(trip)===contextJSON(JSON.parse(preview.guard));}catch{}
  if(!unchanged)throw Error('menu_choice_context_changed');
 }
 return structuredClone(preview.trip);
}
