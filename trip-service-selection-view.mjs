import {validServiceVisit} from './trip-service-visits-contract.mjs?v=1';
import {formatKopecks} from './trip-money.mjs';

// Present the saved choice, independently of availability and the native quote.
// In particular, requested rental use is not its billable duration.
export function serviceSelectionFacts(visit){
 if(!validServiceVisit(visit))return [];
 const input=visit.selection,rental=input.visit.kind==='rental',choice=input.visit.input;
 const price=rental?choice.price:input.price,base=price?.tariff?.base,rows=[];
 const people=Array.isArray(input.participants.people)?input.participants.people.length:input.participants.party_size;
 if(Number.isSafeInteger(people)&&people>0)rows.push({label:'Участники',value:String(people)});
 const units=price?.selection?.units,bike=visit.category==='bike_rental';
 if(Number.isSafeInteger(units)&&units>0&&(rental||base?.scope==='unit'))rows.push({label:bike?'Велосипеды':'Единицы инвентаря',value:String(units)});
 const minutes=rental?choice.timing?.use_minutes:choice.timing?.activity;
 if(Number.isSafeInteger(minutes)&&minutes>=0)rows.push({label:rental?(bike?'Катание':'Время пользования'):'На месте',value:`${minutes} мин`});
 const subject={unit:bike?'за велосипед':'за единицу',person:'за человека',group:'за компанию'}[base?.scope];
 let rate='Нужно уточнить';
 if(base?.rate?.kind==='fixed'&&Number.isSafeInteger(base.rate.amount)&&base.rate.amount>=0){
  rate=formatKopecks(base.rate.amount);
  if(base.billing?.kind==='duration')rate+=` / ${base.billing.step_minutes} мин`;
  else if(base.billing?.kind==='session')rate+=' / сеанс';
  else if(base.billing?.kind==='once')rate+=' / посещение';
  if(subject)rate+=' · '+subject;
 }else if(base?.rate?.kind==='graduated')rate='Ступенчатый'+(subject?' · '+subject:'');
 rows.push({label:'Базовый тариф',value:rate});
 if(base?.billing?.kind==='duration'&&base.billing.minimum_minutes>0)rows.push({label:'Минимум по тарифу',value:`${base.billing.minimum_minutes} мин`});
 if(price?.tariff?.included?.length)rows.push({label:'Включено',value:price.tariff.included.join(', ')});
 for(const extra of price?.tariff?.extras||[]){
  if(!price.selection.extras.includes(extra.id))continue;
  const count=extra.scope==='unit'?(price.selection.extra_units?.[extra.id]??price.selection.units):extra.scope==='person'?price.selection.people:null;
  rows.push({label:extra.label||extra.id,value:count==null?'На компанию':`${count} ${extra.scope==='unit'?'шт.':'чел.'}`});
 }
 return rows;
}

export function serviceSelectionElement(visit){
 const rows=serviceSelectionFacts(visit);if(!rows.length)return null;
 const list=document.createElement('dl');list.className='visit-rental-facts visit-selection-facts';list.setAttribute('aria-label','Ваш выбор');
 for(const row of rows){const label=document.createElement('dt'),value=document.createElement('dd');label.textContent=row.label;value.textContent=row.value;list.append(label,value);}
 return list;
}
