import {referenceMoney,referenceBudgetText} from './day-reference-budget.mjs?v=2026101702';
const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
export function renderReferenceBudget(root,snapshot){
 if(!root)return;const {context,variants}=snapshot,fragment=document.createDocumentFragment();
 fragment.append(el('p',`Дата прогулки: ${context.date}. Путешественников: ${context.people}. Базовый день и день с дополнениями — два варианта одной поездки.`));
 for(const [key,title] of [['base','Базовый день'],['full','День с дополнениями']]){
  const value=variants[key],section=el('section');section.className='day-passport-budget-variant';section.dataset.budgetVariant=key;section.append(el('h4',title));
  const summary=el('p',referenceBudgetText(value));summary.className='day-passport-budget-total';section.append(summary);
  const wrap=el('div');wrap.className='day-passport-table';wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label',title);
  const table=el('table'),head=el('thead'),tr=el('tr'),body=el('tbody');table.append(el('caption',`Состав: ${title}`));
  for(const label of ['Позиция','Сумма','Количество и источник']){const th=el('th',label);th.scope='col';tr.append(th);}head.append(tr);
  for(const row of value.rows){const tr=el('tr'),name=el('th',row.name),amount=el('td',row.total_kopecks===null?'Цена не подтверждена':referenceMoney(row.total_kopecks)),detail=el('td');name.scope='row';
   detail.append(el('span',`${row.quantity} × ${row.unit} · ${row.scope==='person'?'на человека':'на группу'}`));
   if(row.source){detail.append(el('br'));if(row.source.url){const link=el('a',row.source.name||'Источник');link.href=row.source.url;detail.append(link);}const date=row.source.checked_at||row.source.observed_at;if(date)detail.append(document.createTextNode(` · проверено ${date}`));}
   tr.append(name,amount,detail);body.append(tr);
  }table.append(head,body);wrap.append(table);section.append(wrap);fragment.append(section);
 }
 fragment.append(el('p','Покупки вне выбранных позиций — отдельно. Это ориентир поездки; личные оплаты сохраняются в «Моём дне».'));root.replaceChildren(fragment);
}
