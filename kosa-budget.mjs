import {quoteTransportComponents} from './transport-page-state.mjs?v=2026101203';
const money=value=>new Intl.NumberFormat('ru-RU').format(value/100)+' ₽';
// Tariffs and group arithmetic use the same Rust quote engine as transport pages.
export function kosaBudget(answers,profile,engine){
 const people=answers.people??1,exempt=answers.exempt??0;
 const price=quoteTransportComponents(profile,{date:answers.date,people,exempt,bikes:1,mode:'foot'},engine);
 const rows=[...price.rows];
 if(answers.walks==='two')rows.push({id:'bus-transfer',label:'Автобус между тропами',count:people,cost:null,known:0,source:null});
 if(answers.city!=='zelenogradsk')rows.push({id:'connection',label:'Дорога до Зеленоградска и обратно',count:people,cost:null,known:0,source:null});
 rows.push({id:'food',label:'Еда и личные расходы',count:people,cost:null,known:0,source:null});
 return {version:1,date:answers.date,people,exempt,currency:'RUB',known:price.known,total:null,rows};
}
export function savedKosaBudget(answers){
 const b=answers.budget;
 if(!b||b.version!==1||b.date!==answers.date||b.currency!=='RUB'||b.total!==null
  ||!Number.isInteger(b.people)||b.people<1||b.people>20||!Number.isInteger(b.exempt)||b.exempt<0||b.exempt>b.people
  ||b.people!==(answers.people??1)||b.exempt!==(answers.exempt??0)
  ||!Number.isSafeInteger(b.known)||b.known<0||!Array.isArray(b.rows)
  ||!b.rows.every(r=>r&&typeof r.label==='string'&&(r.cost===null||Number.isSafeInteger(r.cost)&&r.cost>=0))
  ||b.rows.reduce((sum,r)=>sum+(r.cost??0),0)!==b.known)return null;
 return structuredClone(b);
}
export function kosaBudgetText(budget){
 if(!budget)return [];
 return [`Бюджет на ${budget.people} чел. (${budget.exempt} с льготой парка):`,...budget.rows.map(r=>`${r.label}: ${r.cost===null?'сумма уточняется':money(r.cost)}.`),`Известная часть — ${money(budget.known)}. Полная сумма зависит от проезда и личных расходов.`];
}
export {money as kosaMoney};
