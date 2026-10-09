import {ensureJourney,selectedDay,journeyDays,chooseTripDay,addTripDay,COST_KINDS} from './trip-days-state.mjs';
import {cleanTrip} from './trip-state.mjs';
import {validMenuChoice,menuChoiceRows} from './trip-menu-choices-contract.mjs';
import {selectMenuChoice} from './trip-menu-choices-state.mjs';
import {menuPriceFreshness} from './trip-menu-choices-view.mjs?v=2';
import {formatKopecks} from './trip-money.mjs';

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
export function prepareMenuChoice(trip,template,count,targetId,catalog,now=new Date().toISOString()){
 if(!validMenuChoice(template)||!Number.isSafeInteger(count)||count<1)throw Error('invalid_menu_choice');
 const guard=JSON.stringify(trip),original=ensureJourney(cleanTrip(trip,catalog)),active=original.itinerary.active;
 let next=original;
 if(targetId==='new'){next=addTripDay(next);targetId=selectedDay(next).id;}
 else if(!journeyDays(next).some(day=>day.id===targetId))throw Error('menu_choice_day_removed');
 next=chooseTripDay(next,targetId);const day=selectedDay(next),previous=menuChoiceRows(day).find(choice=>choice.menu_item_id===template.menu_item_id);
 const choice={...structuredClone(template),quantity:count,planned_date:day.date,selected_at:now,...(previous?{note:previous.note}:{})};
 next=selectMenuChoice(next,choice,catalog);
 return {version:1,guard,targetId,choice,day:structuredClone(selectedDay(next)),trip:chooseTripDay(next,active)};
}
export function confirmMenuChoice(trip,preview){
 if(preview?.version!==1||JSON.stringify(trip)!==preview.guard)throw Error('menu_choice_context_changed');
 return structuredClone(preview.trip);
}
