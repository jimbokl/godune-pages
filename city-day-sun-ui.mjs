// A date belongs to the visible solar value, including while it is unresolved.
// This also runs when the form initializes before the async city controller.
export function renderCitySun(root,date,state='pending',text=null){
 const value=root?.querySelector('[data-city-sunset]'),label=root?.querySelector('[data-city-sunset-date]');
 if(!value||!label)return;
 const current=date?state:'choose_date';
 value.dataset.state=current;value.setAttribute('aria-busy',String(current==='pending'));
 value.textContent=text??(current==='pending'?'Рассчитываем…':'Уточняется');
 label.textContent=date||'Дата не выбрана';
 if(date)label.dateTime=date;else label.removeAttribute('datetime');
}
