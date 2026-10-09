import {selectedDay,changeDayDetails} from './trip-days-state.mjs?v=27';
import {putExpense} from './trip-expenses-state.mjs?v=14';
import {validMenuChoice,menuChoiceRows} from './trip-menu-choices-contract.mjs';
import {linkedMenuExpense} from './trip-menu-expenses-contract.mjs';
export function recordMenuExpense(trip,id,guard){
 if(JSON.stringify(trip)!==guard)return trip;
 const day=selectedDay(trip),choice=menuChoiceRows(day).find(row=>row.menu_item_id===id);
 if(!validMenuChoice(choice)||linkedMenuExpense(day,id))return trip;
 const ids=new Set(Object.values(day.costs).flatMap(row=>(row.items||[]).map(item=>item.id)));
 let number=1;while(ids.has(`cost-menu-${number}`))number++;
 const price=choice.price,amount=day.date&&choice.planned_date===day.date&&price.observed_at&&price.observed_at<=day.date?price.amount_kopecks:null;
 const item={id:`cost-menu-${number}`,label:choice.name,poi:choice.place?.poi_id||null,amount,quantity:choice.quantity,scope:'group',paid:null,
  source:{label:choice.source.name||'Меню заведения',href:choice.source.url,observed_at:price.observed_at,quoted_amount:price.amount_kopecks,catalog_id:choice.menu_item_id},
  menu_choice:{version:1,snapshot:structuredClone(choice),date:day.date}};
 return changeDayDetails(trip,{costs:putExpense(day.costs,'food',item)});
}
