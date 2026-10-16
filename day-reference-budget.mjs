// A dated reference quote. It never writes the traveller's expense ledger.
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const money=v=>Number.isSafeInteger(v)&&v>=0;
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const kinds=new Set(['travel','food','tickets','lodging','other']);
const safeUrl=v=>{if(v===undefined||v===null)return true;try{return ['https:','http:'].includes(new URL(v).protocol);}catch{return false;}};
function validRow(row){
 return object(row)&&typeof row.id==='string'&&!!row.id&&kinds.has(row.kind)&&typeof row.name==='string'&&!!row.name&&
  (row.amount_kopecks===null||money(row.amount_kopecks))&&Number.isInteger(row.quantity)&&row.quantity>0&&row.quantity<=4294967295&&
  ['person','group'].includes(row.scope)&&typeof row.unit==='string'&&['observed','unknown','estimate'].includes(row.status)&&
  (row.source===null||object(row.source)&&safeUrl(row.source.url))&&
  (row.status!=='observed'||row.source!==null)&&
  (row.amount_kopecks===null?row.status==='unknown':row.status!=='unknown');
}
const validContext=c=>object(c)&&typeof c.route==='string'&&!!c.route&&(c.date===null||date(c.date))&&Number.isInteger(c.people)&&c.people>0&&c.people<=4294967295&&['sun','rain'].includes(c.weather);
function validRows(rows){return Array.isArray(rows)&&rows.every(validRow)&&new Set(rows.map(row=>row.id)).size===rows.length;}
export function validReferenceBudget(value){
 return object(value)&&value.version===1&&validContext(value.context)&&object(value.variants)&&['base','full'].every(key=>{
  const v=value.variants[key];return object(v)&&validRows(v.rows)&&money(v.known_kopecks)&&(v.total_kopecks===null||money(v.total_kopecks))&&Number.isInteger(v.unknown)&&v.unknown>=0&&
   v.rows.every(row=>money(row.known_kopecks)&&(row.total_kopecks===null||money(row.total_kopecks)));
 });
}
function variant(calculate,rows,people){
 if(!validRows(rows))throw Error('invalid_reference_budget_rows');
 const costs=row=>[...kinds].map(kind=>({kind,amount:kind===row?.kind?row.amount_kopecks:0,quantity:kind===row?.kind?row.quantity:1,scope:kind===row?.kind?row.scope:'group',basis:'summary',paid:null}));
 const result=calculate.budget({version:1,people,days:rows.length?rows.map(row=>({id:row.id,costs:costs(row)})):[{id:'empty-reference',costs:costs(null)}]});
 return {rows:rows.map((row,i)=>({...structuredClone(row),known_kopecks:result.days[i].known,total_kopecks:result.days[i].total})),known_kopecks:result.known,total_kopecks:result.total,unknown:result.unknown};
}
export function referenceBudget(calculate,{context,base,full}){
 if(!validContext(context))throw Error('invalid_reference_budget_context');
 return {version:1,context:structuredClone(context),variants:{base:variant(calculate,base,context.people),full:variant(calculate,full,context.people)}};
}
// Imported snapshots retain their original observations; their arithmetic is
// verified by the same Rust ABI before display or export.
export function checkedReferenceBudget(calculate,value){
 if(!validReferenceBudget(value))throw Error('invalid_reference_budget');
 const fresh=referenceBudget(calculate,{context:value.context,base:value.variants.base.rows,full:value.variants.full.rows});
 for(const key of ['base','full']){
  const before=value.variants[key],after=fresh.variants[key];
  if(['known_kopecks','total_kopecks','unknown'].some(k=>before[k]!==after[k])||before.rows.some((r,i)=>r.known_kopecks!==after.rows[i].known_kopecks||r.total_kopecks!==after.rows[i].total_kopecks))throw Error('reference_budget_mismatch');
 }
 return fresh;
}
export const referenceMoney=value=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(value/100)+' ₽';
const sumWord=n=>n%100>=11&&n%100<=14?'сумм':n%10===1?'сумму':n%10>=2&&n%10<=4?'суммы':'сумм';
export const referenceBudgetText=value=>value.total_kopecks===null?`Известно ${referenceMoney(value.known_kopecks)}; ещё ${value.unknown} ${sumWord(value.unknown)} нужно уточнить`:referenceMoney(value.total_kopecks);
