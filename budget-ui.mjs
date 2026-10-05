import {dayPeople,partyLabel} from './trip-party.mjs?v=1';
import {journeyDays,selectedDay,chooseTripDay,changeDayDetails,budgetInput,COST_KINDS} from './trip-days-state.mjs?v=18';
import {initTripExpenses} from './trip-expenses-ui.mjs?v=15';
import {loadScheduler} from './trip-scheduler.mjs?v=20';
import {parseKopecks,costText} from './trip-budget-state.mjs?v=2';

// The same cost model is used by the planner and the standalone budget.
// Keep a snapshot while editing so a different tab cannot lose newer expenses.
function summaryEditor({section,read,commit,engine}) {
  const details=document.createElement('details');details.id='journey-details';details.className='budget-estimates';
  const summary=document.createElement('summary');summary.textContent='Общие оценки по категориям';
  const form=document.createElement('form'),status=document.createElement('p');status.setAttribute('role','status');
  details.append(summary,form,status);section.querySelector('#journey-details').replaceWith(details);
  function field(parent,caption,name,value,type='text',choices=[]) {
    const label=document.createElement('label');label.append(document.createTextNode(caption));
    const input=document.createElement(type==='select'?'select':'input');input.name=name;
    if(type==='select')for(const [value,text]of choices){const option=document.createElement('option');option.value=value;option.textContent=text;input.append(option);}
    else {input.type=type;if(type==='number'){input.min='1';input.max='4294967295';input.step='1';input.required=true;}else{input.inputMode='decimal';input.placeholder='Ещё не знаю';}}
    input.value=value;label.append(input);parent.append(label);
  }
  let dayId,snapshot;
  function render(trip) {
    const day=selectedDay(trip);
    if(dayId===day.id && form.contains(document.activeElement))return;
    dayId=day.id;snapshot=JSON.stringify(day.costs);form.replaceChildren();
    for(const [kind,caption]of Object.entries(COST_KINDS)) {
      const cost=day.costs[kind],row=document.createElement('fieldset'),legend=document.createElement('legend');legend.textContent=caption;row.append(legend);
      field(row,'Сумма, ₽',`${kind}-amount`,costText(cost?.amount ?? null));
      field(row,'Количество',`${kind}-quantity`,cost?.quantity || 1,'number');
      field(row,'Эта сумма',`${kind}-scope`,cost?.scope || 'group','select',[['group','На всех'],['person','На человека']]);
      field(row,'Считать категорию',`${kind}-basis`,cost?.basis || 'summary','select',[['summary','По общей оценке'],['items','По списку расходов']]);
      field(row,'Оплачено на всех, ₽',`${kind}-paid`,costText(cost?.paid ?? null));form.append(row);
    }
    const note=document.createElement('p');note.textContent='Пустая сумма — ещё неизвестно. Ноль — бесплатно. Список расходов сохранится, если переключить категорию на общую оценку.';
    const button=document.createElement('button');button.type='submit';button.className='journey-save';button.textContent='Сохранить оценки';form.append(note,button);
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();const values=new FormData(form),editingDay=dayId,before=snapshot;let stale=false;
    const button=form.querySelector('[type=submit]');button.disabled=true;
    try {
      const result=await commit(current=>{
        const day=selectedDay(current);
        if(day.id!==editingDay || JSON.stringify(day.costs)!==before){stale=true;return current;}
        const costs=Object.fromEntries(Object.keys(COST_KINDS).map(kind=>[kind,{...day.costs[kind],amount:parseKopecks(values.get(`${kind}-amount`)),quantity:Number(values.get(`${kind}-quantity`)),scope:values.get(`${kind}-scope`),basis:values.get(`${kind}-basis`),paid:parseKopecks(values.get(`${kind}-paid`))}]));
        const next=changeDayDetails(current,{costs});
        if(next===current)throw new Error('Проверьте сумму и количество.');
        engine.budget(budgetInput(next));return next;
      },'Оценки расходов сохранены.');
      status.textContent=stale?'Расходы уже изменились. Проверьте свежие значения и сохраните ещё раз.':result.saved?'Оценки расходов сохранены.':'Оценки обновлены в этой вкладке. Браузер не подтвердил сохранение.';
      button.blur();render(read());
    }catch(error){status.textContent=error.message || 'Оценки пока не сохранились. Попробуйте ещё раз.';}
    finally{button.disabled=false;}
  });
  return {render};
}

export async function initBudget({workshop,catalog,base}) {
  const section=document.querySelector('#budget-page');
  if(!section)return;
  const read=()=>workshop.getState();
  const commit=(next,message)=>workshop.setState(next,message);
  const engine=await loadScheduler(base);
  const estimates=summaryEditor({section,read,commit,engine});
  const ledger=initTripExpenses({section,read,commit,base,catalog});
  const select=section.querySelector('#budget-day'),form=section.querySelector('#budget-people-form'),people=section.querySelector('#budget-people'),status=section.querySelector('#budget-page-status');
  function render() {
    const trip=read(),active=selectedDay(trip);
    select.replaceChildren(...journeyDays(trip).map((day,index)=>{
      const option=document.createElement('option');option.value=day.id;
      option.textContent=`День ${index+1}${day.date?' · '+new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(day.date+'T12:00:00Z')):''}`;
      return option;
    }));
    select.value=active.id;
    if(document.activeElement!==people)people.value=dayPeople(active,trip.itinerary?.people || 1);
    let note=section.querySelector('[data-budget-party-note]');if(!note){note=document.createElement('p');note.dataset.budgetPartyNote='';note.className='budget-memory-note';section.querySelector(".budget-controls").after(note);}
    note.textContent=active.party?`${partyLabel(active.party)}. Число относится к выбранному дню. Детские билеты с другой ценой внесите отдельным расходом на всех.`:'Это число используется в днях, где ещё не указан отдельный состав группы.';
    estimates.render(trip);
    ledger.render(trip);
    try {ledger.totals(engine.budget(budgetInput(trip)));}
    catch {ledger.error();}
    section.dataset.budgetReady='true';
  }
  select.disabled=false;form.querySelector('button').disabled=false;status.textContent='';
  select.addEventListener('change',()=>commit(current=>chooseTripDay(current,select.value),'Выбран другой день.'));
  form.addEventListener('submit',async event=>{
    event.preventDefault();const count=Number(people.value);
    if(!Number.isSafeInteger(count) || count<1 || count>4294967295)return;
    const result=await commit(current=>changeDayDetails(current,{people:count}),'Число путешественников сохранено.');
    status.textContent=result.saved?'Число путешественников сохранено.':'Расчёт обновлён в этой вкладке. Браузер не подтвердил сохранение.';
  });
  window.addEventListener('godune:trip-change',render);
  render();
}
