import {validServiceVisit} from './trip-service-visits-contract.mjs?v=1';
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const date=v=>v===null||typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!v.startsWith('0000')&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
// Preserve future envelopes in files. Rust refuses to treat them as a current quote.
export function validServiceExpenseLink(v){
 if(!object(v)||!Number.isSafeInteger(v.version)||v.version<1)return false;
 if(v.version>1)return true;
 return Object.keys(v).every(k=>['version','snapshot','date','people'].includes(k))&&validServiceVisit(v.snapshot)&&date(v.date)&&Number.isSafeInteger(v.people)&&v.people>0&&v.people<=4294967295;
}
export function linkedServiceExpense(day,visitId){
 for(const [kind,cost] of Object.entries(day?.costs||{}))for(const item of cost.items||[])if(item.service_visit?.snapshot?.id===visitId)return {kind,item};
 return null;
}
export function serviceExpenseDay(day,{includeVisits=false}={}){
 const links=Object.values(day.costs||{}).flatMap(cost=>(cost.items||[]).filter(item=>Object.hasOwn(item,'service_visit')).map(item=>({item_id:item.id,binding:structuredClone(item.service_visit)})));
 if(!links.length&&!includeVisits)return null;
 const visits=Array.isArray(day.service_visits)?structuredClone(day.service_visits):[];
 return {id:day.id,date:day.date,visits,...(day.service_visits!=null&&!Array.isArray(day.service_visits)?{unresolved_visits:1}:{}),links};
}
