// Prices are snapshots. Plans and actual group payments are independent.
import {validTransfer} from './trip-transfer-costs.mjs?v=1';
const object=v=>!!v && typeof v==='object' && !Array.isArray(v);
const amount=v=>v===null || Number.isSafeInteger(v) && v>=0;
const date=v=>typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !v.startsWith('0000') && Number.isFinite(Date.parse(v+'T12:00:00Z')) && new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const keys=(v,list)=>Object.keys(v).every(key=>list.includes(key));
export const emptyCost=()=>({amount:null,quantity:1,scope:'group'});
export const validSourceHref=value=>value===null || typeof value==='string' && (/^\/assets\/food\/[a-z0-9_-]+\.webp$/.test(value) || (()=>{try{return ['https:','http:'].includes(new URL(value).protocol);}catch{return false;}})());
export function validPriceSource(source) {
  return source===null || object(source) && keys(source,['label','href','observed_at','quoted_amount','catalog_id']) && typeof source.label==='string' && !!source.label.trim() && validSourceHref(source.href) && (source.observed_at===null || date(source.observed_at)) && amount(source.quoted_amount) && (source.catalog_id===null || typeof source.catalog_id==='string' && !!source.catalog_id);
}
export function validExpense(item) {
  return object(item) && keys(item,['id','label','poi','amount','quantity','scope','paid','source','transfer']) && typeof item.id==='string' && !!item.id && typeof item.label==='string' && !!item.label.trim() && (item.poi===null || typeof item.poi==='string' && !!item.poi) && amount(item.amount) && Number.isSafeInteger(item.quantity) && item.quantity>0 && item.quantity<=4294967295 && ['group','person'].includes(item.scope) && amount(item.paid) && validPriceSource(item.source) && (!Object.hasOwn(item,'transfer') || item.transfer===null || item.poi===null && validTransfer(item.transfer));
}
export function validCosts(costs,kinds) {
  if(!object(costs))return false;
  const ids=new Set();
  return Object.entries(costs).every(([kind,row])=>Object.hasOwn(kinds,kind) && object(row) && keys(row,['amount','quantity','scope','basis','paid','items']) && amount(row.amount) && Number.isSafeInteger(row.quantity) && row.quantity>0 && row.quantity<=4294967295 && ['group','person'].includes(row.scope) && (!Object.hasOwn(row,'basis') || ['summary','items'].includes(row.basis)) && (!Object.hasOwn(row,'paid') || amount(row.paid)) && (!Object.hasOwn(row,'items') || Array.isArray(row.items) && row.items.every(item=>{if(!validExpense(item)||ids.has(item.id))return false;ids.add(item.id);return true;})));
}
export function expenseCostInput(kind,row) {
  const cost=row || emptyCost();
  return {kind,amount:cost.amount,quantity:cost.quantity,scope:cost.scope,...(cost.basis?{basis:cost.basis}:{}),...(Object.hasOwn(cost,'paid')?{paid:cost.paid}:{}),...(cost.items?{items:cost.items.map(({id,amount,quantity,scope,paid})=>({id,amount,quantity,scope,paid}))}:{})};
}
export function putExpense(costs,kind,item) {
  const next=structuredClone(costs),row=next[kind] ||= emptyCost();row.items ||= [];
  const index=row.items.findIndex(old=>old.id===item.id);
  if(index<0)row.items.push(structuredClone(item));else row.items[index]=structuredClone(item);
  row.basis='items';return next;
}
export function removeExpense(costs,kind,id) {
  const next=structuredClone(costs);
  if(next[kind]?.items)next[kind].items=next[kind].items.filter(item=>item.id!==id);
  return next;
}
export function unpaidCopy(costs) {
  const next=structuredClone(costs);
  for(const row of Object.values(next)) {
    if(Object.hasOwn(row,'paid'))row.paid=null;
    for(const item of row.items || [])item.paid=null;
  }
  return next;
}
export function observationSource(row) {
  return {label:`${row.label} · ${row.unit} · меню у входа`,href:`/${row.photo}`,observed_at:row.observed_at,quoted_amount:row.amount,catalog_id:row.id};
}
export function validObservations(value,catalog) {
  if(!object(value)||value.version!==1||!Array.isArray(value.observations))return false;
  const ids=new Set(),known=new Set(catalog.poi.map(p=>p.slug));
  return value.observations.every(row=>object(row) && typeof row.id==='string' && !!row.id && !ids.has(row.id) && !!ids.add(row.id) && known.has(row.poi) && typeof row.label==='string' && !!row.label && Number.isSafeInteger(row.amount) && row.amount>=0 && typeof row.unit==='string' && !!row.unit && date(row.observed_at) && /^assets\/food\/[a-z0-9_-]+\.webp$/.test(row.photo));
}
