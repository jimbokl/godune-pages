import {ensureJourney,selectedDay,chooseTripDay,changeDayDetails} from './trip-days-state.mjs?v=2026101707';

export function deliveryFactState(fact,now=new Date()){
 if(fact?.status!=='confirmed')return fact?.status||'unknown';
 const checked=Date.parse(fact.verified_at),instant=new Date(now).getTime();
 if(!Number.isFinite(checked)||!Number.isFinite(instant)||instant<checked)return 'unknown';
 return instant>=checked+fact.ttl_days*86400000?'needs_review':'confirmed';
}
export function deliveryOrderUrl(provider){
 const fact=provider?.facts?.order_url;
 if(fact?.status!=='confirmed'||typeof fact.value!=='string')return null;
 try{const u=new URL(fact.value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}
}
const money=value=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(value/100)+' ₽';
export function deliverySelection(data,providerId,offerId=null,now=new Date()){
 const provider=data.providers.find(p=>p.id===providerId),url=deliveryOrderUrl(provider);
 if(!provider||!url)throw Error('delivery_provider_unknown');
 const offer=offerId?data.offers.find(o=>o.id===offerId&&o.provider_id===providerId):null;
 if(offerId&&!offer)throw Error('delivery_offer_unknown');
 const header=`Доставка еды — ${provider.name}${offer?' · '+offer.title:''}`;
 const lines=[header,`Заказать у ${provider.name}: ${url}`];
 const order=provider.facts.order_url;
 lines.push(`Ссылка проверена ${order.verified_at.slice(0,10)}${deliveryFactState(order,now)!=='confirmed'?' · требует повторной проверки':''}.`);
 if(offer){
  const price=offer.facts.price,state=deliveryFactState(price,now);
  lines.push(price.value?`Цена в меню на ${price.verified_at.slice(0,10)}: ${money(price.value.amount_minor)} без доставки${state!=='confirmed'?' · требует повторной проверки':''}.`:'Цена неизвестна.');
  lines.push('Позиция указана в меню; наличие и готовность уточните при заказе.');
  lines.push(offer.facts.allergens.value===null?'Аллергены неизвестны: уточните состав и перекрёстный контакт у поставщика.':`Аллергены по источнику: ${offer.facts.allergens.value.join(', ')}. Уточните перед заказом.`);
 }
 lines.push('Адрес и время доставки согласуйте с поставщиком. Заказ не оформлен; расход не добавлен.');
 return {providerId,offerId,header,url,text:lines.join('\n')};
}
export function addDeliveryNote(trip,selection,dayId){
 const next=ensureJourney(trip),active=selectedDay(next).id,day=next.itinerary.days.find(d=>d.id===dayId);
 if(!day)throw Error('delivery_day_changed');
 if(day.note.split('\n').includes(selection.header))return next;
 // Only the selected note changes; the normal Trip projection and validation remain shared.
 const note=day.note+(day.note?'\n\n':'')+selection.text;
 return chooseTripDay(changeDayDetails(chooseTripDay(next,dayId),{note}),active);
}
export function deliveryOrderLinks(note,data){
 if(typeof note!=='string')return [];
 return data.providers.flatMap(provider=>{
  const url=deliveryOrderUrl(provider);
  return url&&note.split('\n').includes(`Заказать у ${provider.name}: ${url}`)?[{name:provider.name,url}]:[];
 });
}
