// The quote is a durable source snapshot. Changing a plan never changes a payment.
import {dayPeople} from './trip-party.mjs?v=1';
const object=v=>!!v && typeof v==='object' && !Array.isArray(v);
const keys=(v,allowed)=>Object.keys(v).every(k=>allowed.includes(k));
const text=v=>typeof v==='string' && !!v.trim();
const integer=v=>Number.isSafeInteger(v) && v>=0;
const people=v=>Number.isSafeInteger(v) && v>0 && v<=4294967295;
const date=v=>typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !v.startsWith('0000') && Number.isFinite(Date.parse(v+'T12:00:00Z')) && new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const photo=v=>typeof v==='string' && /^assets\/food\/[a-z0-9_-]+\.webp$/.test(v);
const href=v=>{try{const u=new URL(v);return ['https:','http:'].includes(u.protocol);}catch{return false;}};
const fields=['id','poi','category','label','unit','amount','scope','origin','photo','source_label','source_href','observed_at','valid_from','valid_until','weekdays','min_people','max_people','terms'];
export function validOffer(v) {
  return object(v) && keys(v,fields) && fields.every(k=>Object.hasOwn(v,k)) && text(v.id) && text(v.poi) && ['food','lodging','travel','tickets','other'].includes(v.category) && text(v.label) && text(v.unit) && (v.amount===null || integer(v.amount)) && ['group','person'].includes(v.scope) && ['menu','photo'].includes(v.origin) && (v.photo===null || photo(v.photo)) && text(v.source_label) && (v.origin==='photo'?photo(v.photo) && v.source_href===`/${v.photo}`:href(v.source_href)) && date(v.observed_at) && (v.valid_from===null || date(v.valid_from)) && (v.valid_until===null || date(v.valid_until)) && (!v.valid_from || !v.valid_until || v.valid_from<=v.valid_until) && (v.weekdays===null || Array.isArray(v.weekdays) && !!v.weekdays.length && new Set(v.weekdays).size===v.weekdays.length && v.weekdays.every(d=>Number.isInteger(d)&&d>=1&&d<=7)) && (v.min_people===null || people(v.min_people)) && (v.max_people===null || people(v.max_people)) && (v.min_people===null || v.max_people===null || v.min_people<=v.max_people) && typeof v.terms==='string';
}
export function validOffers(v,catalog) {
  if(!object(v)||!keys(v,['version','offers'])||v.version!==1||!Array.isArray(v.offers))return false;
  const ids=new Set(),known=new Set(catalog.poi.map(p=>p.slug));
  return v.offers.every(row=>validOffer(row) && known.has(row.poi) && !ids.has(row.id) && !!ids.add(row.id));
}
export function offerSource(row) {
  return {label:row.source_label,href:row.source_href,observed_at:row.observed_at,quoted_amount:row.amount,catalog_id:row.id,offer:structuredClone(row)};
}
export function validOfferSource(source) {
  const row=source.offer;
  return validOffer(row) && source.label===row.source_label && source.href===row.source_href && source.observed_at===row.observed_at && source.quoted_amount===row.amount && source.catalog_id===row.id;
}
export function retainedSource(source,previous) {
  if(!source || !previous)return source;
  const {offer,...common}=previous;
  return Object.entries(common).every(([k,v])=>({...source,catalog_id:previous.catalog_id})[k]===v)?structuredClone(previous):source;
}
export function offerInput(offers,day,people=1,quantity=1,scope=null) {
  return {version:1,date:day.date,people:dayPeople(day,people),offers:offers.map(row=>({id:row.id,amount:row.amount,quantity,scope:scope || row.scope,observed_at:row.observed_at,valid_from:row.valid_from,valid_until:row.valid_until,weekdays:row.weekdays,min_people:row.min_people,max_people:row.max_people}))};
}
export const offerContext=(day,people)=>JSON.stringify([day.id,day.date,day.places,dayPeople(day,people)]);
export const offerBlocked=row=>['outside_period','weekday_mismatch','people_mismatch'].includes(row?.state);
export function offerStatusText(row) {
  return ({date_unknown:'Выберите дату: условия для вашего дня ещё не проверены.',observed_later:'Цена проверена позже выбранного дня. Используйте её как ориентир.',outside_period:'Выбранная дата вне указанного срока.',weekday_mismatch:'Для этого дня недели предложение не действует.',people_mismatch:'Число путешественников не подходит под условия.',within_period:'Дата попадает в указанный срок. Наличие уточните перед поездкой.',period_unknown:'Срок этой цены не указан. Уточните её перед поездкой.'})[row?.state] || 'Условия пока не удалось проверить. Сохранённая сумма остаётся.';
}
export function snapshotNotice(item,kind,day,current,evaluation) {
  const quote=item.source?.offer;if(!quote)return '';
  const notes=[offerStatusText(evaluation)];
  if(item.poi!==quote.poi || item.transfer || kind!==quote.category)notes.push('Источник относится к другой остановке или категории.');
  const latest=current?.find(row=>row.id===quote.id);
  if(current && !latest)notes.push('Цена осталась в вашей поездке; в новом списке её нет.');
  else if(latest && fields.some(k=>JSON.stringify(latest[k])!==JSON.stringify(quote[k])))notes.push('Список цен обновился. В вашем плане сохранена прежняя цена.');
  return notes.join(' ');
}
