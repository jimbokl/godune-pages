import {linkedServiceExpense} from './trip-service-expenses-contract.mjs?v=1';
import {serviceVisitContext} from './trip-service-visits-contract.mjs?v=1';
export function serviceExpenseButton({day,visit,onExpense}){
 if(!onExpense)return null;
 const linked=linkedServiceExpense(day,visit.id),ready=!!linked||serviceVisitContext(visit,day)==='ready';
 const wrap=document.createElement('div');wrap.className='visit-expense-action';
 const button=document.createElement('button');button.type='button';button.className='visit-primary';button.dataset.serviceExpense=visit.id;
 button.textContent=linked?'Открыть расход':'В расходы дня';button.disabled=!ready;
 const feedback=document.createElement('p');feedback.className='visit-feedback';feedback.setAttribute('role','status');
 if(!ready)feedback.textContent='Сначала выберите дату и пересчитайте посещение.';
 button.addEventListener('click',async()=>{
  button.disabled=true;feedback.textContent='Открываем расходы…';
  try{const result=await onExpense(visit.id);feedback.textContent=result?.message||'';}
  catch{feedback.textContent='Не удалось открыть расход. Ваш выбор сохранён.';}
  finally{button.disabled=!ready;}
 });
 wrap.append(button,feedback);return wrap;
}
