import {linkedMenuExpense,menuExpenseText} from './trip-menu-expenses-contract.mjs';
import {validMenuChoice,menuChoiceRows,menuChoiceContext} from './trip-menu-choices-contract.mjs';
import {formatKopecks} from './trip-money.mjs';
const manual=new Set(['manual','partner','manual_verified','partner_verified','verified']);
export function menuPriceFreshness(choice,asOf){
 const observed=choice.price.observed_at;
 if(!observed||!asOf||choice.price.amount_kopecks===null&&choice.price.from_kopecks===null&&!choice.price.label?.trim())return 'unknown';
 const age=(Date.parse(asOf+'T12:00:00Z')-Date.parse(observed+'T12:00:00Z'))/86400000;
 if(!Number.isFinite(age)||age<0)return 'unknown';
 const verified=manual.has(choice.source.verification_status?.toLowerCase().replaceAll(' ','_'));
 return age>(verified?30:90)?'stale':verified?'verified':'recent';
}
export function menuChoiceGuide(day){
 return menuChoiceRows(day).map(choice=>{
  if(!validMenuChoice(choice))throw Error('guide_invalid_menu_choice');
  const price=choice.price, freshness=menuPriceFreshness(choice,day.date),amount=price.amount_kopecks,minimum=price.from_kopecks;
  const value=amount!==null?formatKopecks(amount):minimum!==null?'от '+formatKopecks(minimum):price.label||'Цена не указана';
  const hasPrice=amount!==null||minimum!==null||!!price.label?.trim();
  const priceText=`${value}${price.observed_at?' · меню на '+price.observed_at:''}${freshness==='stale'?' · цена требует проверки':hasPrice&&freshness==='unknown'?' · цена на день поездки не подтверждена':''}`;
  const context=menuChoiceContext(choice,day), contextText={date_missing:'Дата дня не выбрана.',date_changed:'Выбрано на другую дату: '+(choice.planned_date||'дата не указана')+'.',separate:'Заведение сохранено отдельно от рассчитанных остановок.',in_day:'Заведение включено в остановки дня.'}[context];
  const tail=choice.quantity%100,unit=choice.quantity%10;
  const quantityText=`${choice.quantity} ${tail>=11&&tail<=14?'порций':unit===1?'порция':unit>=2&&unit<=4?'порции':'порций'}`;
  return {choice:structuredClone(choice),id:choice.menu_item_id,poi:choice.place?.poi_id||null,name:choice.name,place:choice.place?.name||'Заведение не определено',address:choice.place?.address||null,portion:choice.portion,category:choice.category,channel:choice.channel,quantity:choice.quantity,price:priceText,freshness,context,
   text:[choice.category,choice.portion,quantityText,({hall:'В зале',delivery:'Доставка',takeaway:'С собой'})[choice.channel]||null].filter(Boolean).join(' · '),
   note:[contextText,linkedMenuExpense(day,choice.menu_item_id)?menuExpenseText(day,choice.menu_item_id)+'.':null,'Наличие блюда и время приёма заказа ещё нужно уточнить.',choice.note].filter(Boolean).join(' '),
   source:{name:choice.source.name||'Меню заведения',url:choice.source.url,checked_at:choice.source.observed_at}};
 });
}
