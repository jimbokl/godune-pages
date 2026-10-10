import {formatKopecks as money} from './trip-money.mjs';
import {rentalDetails} from './trip-rental-view.mjs?v=1';
import {dayOutcome} from './day-outcome.mjs?v=1';
const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};

export function bikeRentalPicker({row,preview,choices,view,base,catalog,onChange}){
 const details=node('details',undefined,'bike-rental-picker'),summary=node('summary',`Велосипед · ${view.mode==='rental'?'напрокат':'свой'}`);
 details.append(summary);details.open=view.open;details.addEventListener('toggle',()=>{view.open=details.open;});
 const modes=node('div',undefined,'bike-rental-modes');modes.setAttribute('role','group');modes.setAttribute('aria-label','Откуда велосипед');
 for(const [mode,label]of [['own','Свой'],['rental','Взять напрокат']]){
  const button=node('button',label);button.type='button';button.dataset.bikeMode=mode;button.setAttribute('aria-pressed',String(view.mode===mode));
  button.disabled=mode==='rental'&&!choices.length;
  button.addEventListener('click',()=>{view.mode=mode;if(mode==='rental'&&!view.entryId)view.entryId=choices[0].id;onChange(`[data-bike-mode="${mode}"]`);});modes.append(button);
 }
 details.append(modes);
 if(!choices.length)details.append(node('p','Прокаты в этом городе ещё не добавлены в каталог.','bike-caption'));
 if(view.mode!=='rental')return details;
 const entry=choices.find(e=>e.id===view.entryId);
 if(choices.length>1){
  const label=node('label','Пункт проката'),select=node('select');select.dataset.bikeRentalOffer='';
  for(const e of choices){const option=node('option',e.name);option.value=e.id;option.selected=e.id===view.entryId;select.append(option);}
  select.addEventListener('change',()=>{view.entryId=select.value;onChange('[data-bike-rental-offer]');});label.append(select);details.append(label);
 }
 if(entry){
  const offer=node('div',undefined,'bike-rental-offer'),title=node('a',entry.name);title.href=new URL(entry.href,base);offer.append(title,node('p',entry.metadata.address,'bike-caption'));
  const line=entry.selection.visit.input.price?.tariff.base,rate=line?.rate;
  if(rate?.kind==='fixed'&&rate.amount!=null&&line.billing?.kind==='duration')offer.append(node('p',`${money(rate.amount)} за ${line.billing.step_minutes} мин · ${line.scope==='unit'?'за велосипед':'по тарифу'}`,'bike-rental-rate'));
  details.append(offer);
 }
 const quantity=node('label','Велосипедов'),input=node('input');input.type='number';input.min='1';input.step='1';input.inputMode='numeric';input.value=view.unitsText??String(view.units);input.dataset.bikeRentalUnits='';
 input.addEventListener('input',()=>{view.unitsText=input.value;view.units=Number(input.value);onChange('[data-bike-rental-units]');});quantity.append(input);details.append(quantity);
 details.append(node('p','Получить → Прогуляться → Вернуть','bike-rental-sequence'));
 if(preview.rentalError){const error=node('p',preview.rentalError,'bike-rental-outcome');error.setAttribute('role','alert');details.append(error);return details;}
 const rental=preview.rental;if(!rental)return details;
 const facts=node('dl',undefined,'bike-rental-facts'),rows=rentalDetails(rental.visit,rental.assessment,catalog);
 for(const name of ['Получить велосипед','Вернуть велосипед','Возврат в выбранном пункте']){
  const fact=rows.find(r=>r.label===name);if(fact)facts.append(node('dt',fact.label),node('dd',fact.value));
 }
 const quote=rental.assessment.quote;
 facts.append(node('dt','Стоимость проката'),node('dd',quote.cost_total==null?'После уточнения времени по тарифу':money(quote.cost_total)));
 facts.append(node('dt','Возвратный залог'),node('dd',quote.deposit.total==null?'Нужно уточнить':money(quote.deposit.total)));
 details.append(facts,node('p',dayOutcome(rental.check),'bike-rental-outcome'));
 const more=node('a','Условия проката →','bike-rental-link');more.href=new URL(entry.href,base);details.append(more);
 return details;
}
