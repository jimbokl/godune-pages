import {validMenuChoice,menuChoiceRows} from './trip-menu-choices-contract.mjs';
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const date=value=>value===null||typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!value.startsWith('0000')&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
export function validMenuExpenseLink(value){
 if(!object(value)||!Number.isSafeInteger(value.version)||value.version<1)return false;
 if(value.version>1)return true;
 return Object.keys(value).every(key=>['version','snapshot','date'].includes(key))&&validMenuChoice(value.snapshot)&&date(value.date);
}
export function linkedMenuExpense(day,id){
 for(const [kind,cost]of Object.entries(day?.costs||{}))for(const item of cost.items||[])if(item.menu_choice?.snapshot?.menu_item_id===id)return {kind,item};
 return null;
}
// The binding is evidence, never an additional numeric cost. Keep the user's
// ledger even if the menu, date or portions change later.
export function menuExpenseContext(day,item){
 const link=item?.menu_choice;
 if(!validMenuExpenseLink(link)||link.version!==1)return 'unsupported';
 if(!day.date)return 'date_missing';
 if(link.date!==day.date||link.snapshot.planned_date!==day.date)return 'date_changed';
 const choice=menuChoiceRows(day).find(row=>row.menu_item_id===link.snapshot.menu_item_id);
 if(!choice)return 'choice_removed';
 if(JSON.stringify(choice)!==JSON.stringify(link.snapshot))return 'selection_changed';
 return 'current';
}
export function menuExpenseText(day,id){
 const linked=linkedMenuExpense(day,id);
 if(!linked)return 'В бюджет ещё не добавлено';
 const {kind,item}=linked,context=menuExpenseContext(day,item);
 const status={current:'Связано с выбранным блюдом',date_missing:'Выберите дату и проверьте цену',date_changed:'Дата изменилась — проверьте расход',selection_changed:'Блюдо или порции изменились — проверьте расход',choice_removed:'Блюдо убрано из дня. Расход сохранён',unsupported:'Связь с меню нужно проверить'}[context];
 if(item.cancelled)return 'Расход убран из плана · оплата сохранена';
 if(day.costs[kind]?.basis!=='items')return 'В плане общая оценка еды · запись расхода сохранена';
 return context==='current'?'Учтено в бюджете дня':status;
}
