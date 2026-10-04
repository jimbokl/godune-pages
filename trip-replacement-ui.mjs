import {selectedDay} from './trip-days-state.mjs?v=12';
import {previewStopReplacement,replaceTripStop,replacementContext} from './trip-replacement-state.mjs?v=9';
import {transferTitle} from './trip-transfer-costs.mjs?v=3';
import {rubles} from './trip-budget-state.mjs?v=2';
import {loadScheduler} from './trip-scheduler.mjs?v=18';
import {planInput} from './trip-schedule-state.mjs?v=9';
import {loadTripTravelMatrix} from './travel-estimates.mjs?v=6';

const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
const normalize=text=>text.toLocaleLowerCase('ru-RU').replaceAll('ё','е').trim();
const clock=minute=>`${String(Math.floor(minute%1440/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}${minute>=1440?' · следующий день':''}`;
const finish=result=>result.finish===null?`Не раньше ${clock(result.earliest_finish)} · часть дороги неизвестна`:`≈ ${clock(result.earliest_finish)}`;

export function initTripReplacement({mount,read,commit,catalog,base}) {
  if(!mount)return {render(){},control(){return null;}};
  const dialog=el('dialog',undefined,'expense-dialog trip-replacement-dialog');dialog.id='trip-replacement-dialog';dialog.setAttribute('aria-labelledby','replacement-title');
  dialog.innerHTML='<div class="expense-dialog-top"><p class="eyebrow">Другой поворот вашего дня</p><button type="button" class="expense-close" aria-label="Закрыть замену">×</button></div><h2 id="replacement-title">Заменить остановку</h2><p class="replacement-intro">Место в порядке дня останется тем же. Дорогу и время посчитаем заново.</p><form><div class="replacement-pair"><div><span>Было</span><strong id="replacement-old"></strong><small id="replacement-old-area"></small></div><span aria-hidden="true" class="replacement-arrow">→</span><div class="replacement-new"><span>Станет</span><strong id="replacement-new">Выберите место ниже</strong><small id="replacement-new-area"></small></div></div><label class="replacement-search">1. Найдите новую остановку<input type="search" id="replacement-search" placeholder="Место, город или кухня" autocomplete="off"></label><fieldset class="replacement-options"><legend class="sr-only">Новая остановка</legend><div id="replacement-results"></div></fieldset><p id="replacement-time" class="replacement-time" role="status" aria-live="polite"></p><section id="replacement-costs" hidden><h3>2. Что делать с расходами?</h3><p class="journey-note">Оставим их у прежнего места. Отметьте только те, которым хотите дать новую связь. Сумма и оплата сохранятся; цена нового места не подтверждена.</p><div id="replacement-expenses"></div></section><p class="journey-note">Время на осмотр и паузу сохраним. Часы посещения, сеанс и личное время дороги для прежнего места уберём — для новой остановки нужны свои условия.</p><div class="expense-editor-actions"><button type="submit" class="expense-save" disabled>Заменить остановку</button><button type="button" class="expense-cancel">Оставить как есть</button></div><p id="replacement-status" class="journey-note" role="status" aria-live="polite"></p></form>';
  document.body.append(dialog);
  const $=selector=>dialog.querySelector(selector),form=$('form'),save=$('[type=submit]');let editing=null,lastFocus,sequence=0;
  function control(id,name) {const b=el('button','Заменить','trip-replace-control');b.type='button';b.dataset.tripReplace=id;b.setAttribute('aria-label',`Заменить: ${name}`);return b;}
  function close() {
    const target=editing?.to;editing=null;sequence++;dialog.close();
    const focus=lastFocus?.isConnected?lastFocus:mount.querySelector(`[data-trip-replace="${target}"]`);focus?.focus({preventScroll:true});
  }
  $('.expense-close').addEventListener('click',close);$('.expense-cancel').addEventListener('click',close);
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});window.addEventListener('godune:memory-cleared',()=>{if(dialog.open)close();});
  function render() {
    if(!editing || !dialog.open)return;
    if(editing.expected!==replacementContext(read(),catalog)){$('#replacement-status').textContent='День уже изменился. Закройте замену и откройте её заново — свежий маршрут сохранён.';save.disabled=true;}
  }
  function results() {
    const words=normalize($('#replacement-search').value).split(/\s+/).filter(Boolean),day=selectedDay(read());
    const places=catalog.poi.filter(p=>p.slug!==editing.from && !day.places.includes(p.slug) && words.every(word=>normalize([p.name,p.area_name,p.category_name,p.gastronomy?.cuisine,...(p.tags || [])].join(' ')).includes(word)));
    $('#replacement-results').replaceChildren(...places.map(place=>{
      const row=el('label',undefined,'replacement-option'),input=el('input');input.type='radio';input.name='replacement-place';input.value=place.slug;input.checked=editing.to===place.slug;
      const text=el('span');text.append(el('strong',place.name),el('small',`${place.area_name} · ${place.category_name}`));row.append(input,text);return row;
    }));
    if(!places.length)$('#replacement-results').append(el('p','Здесь такого места пока нет. Попробуйте название города или другой запрос.','journey-note'));
  }
  async function timing(preview,ticket) {
    const version=++sequence;$('#replacement-time').textContent='Считаем дорогу и время для двух вариантов…';delete $('#replacement-time').dataset.ready;
    try {
      const [engine,before,after]=await Promise.all([loadScheduler(base),loadTripTravelMatrix(base,preview.before,catalog),loadTripTravelMatrix(base,preview.after,catalog)]);
      if(editing!==ticket || version!==sequence || !dialog.open)return;
      const oldPlan=engine(planInput(preview.before,catalog,before)),newPlan=engine(planInput(preview.after,catalog,after));
      $('#replacement-time').replaceChildren(el('span','Ориентир окончания дня'),el('strong',`${finish(oldPlan)} → ${finish(newPlan)}`),el('small',newPlan.status==='complete'?'После замены снова проверьте свет и условия посещения.':'В новом плане есть условия, которые нужно проверить. Они появятся в расчёте дня.'));
      $('#replacement-time').dataset.ready='true';
    }catch{
      if(editing!==ticket || version!==sequence || !dialog.open)return;
      $('#replacement-time').textContent='Сравнение времени пока не открылось. Замену можно сохранить; неизвестная дорога останется неизвестной.';$('#replacement-time').dataset.ready='error';
    }
  }
  function select(to) {
    if(!editing)return;const preview=previewStopReplacement(read(),editing.from,to,catalog);
    if(preview.error){$('#replacement-status').textContent=preview.error;save.disabled=true;return;}
    editing.to=to;$('#replacement-new').textContent=preview.place.name;$('#replacement-new-area').textContent=preview.place.area_name;
    $('#replacement-costs').hidden=!preview.expenses.length;
    $('#replacement-expenses').replaceChildren(...preview.expenses.map(row=>{
      const label=el('label',undefined,'replacement-expense'),input=el('input');input.type='checkbox';input.name='replacement-expense';input.value=row.item.id;input.disabled=!row.eligible;input.checked=row.eligible && editing.expenses.has(row.item.id);
      const text=el('span');text.append(el('strong',row.item.label),el('small',row.item.transfer?transferTitle(row.item.transfer):preview.old.name),el('small',`План: ${row.item.amount===null?'неизвестен':rubles(row.item.amount)} · оплачено на всех: ${row.item.paid===null?'не записано':rubles(row.item.paid)}`),el('small',row.eligible?'Отметьте, чтобы связать с новым местом или дорогой.':`${row.reason} Сохранённый расход останется у прежней дороги.`));label.append(input,text);return label;
    }));
    $('#replacement-status').textContent='';save.disabled=false;render();timing(preview,editing);
  }
  function open(from) {
    const day=selectedDay(read()),place=catalog.poi.find(p=>p.slug===from);if(!place || !day.places.includes(from))return;
    lastFocus=document.activeElement;editing={from,to:null,expected:replacementContext(read(),catalog),expenses:new Set()};form.reset();
    $('#replacement-old').textContent=place.name;$('#replacement-old-area').textContent=place.area_name;$('#replacement-new').textContent='Выберите место ниже';$('#replacement-new-area').textContent='';$('#replacement-costs').hidden=true;$('#replacement-time').textContent='';$('#replacement-status').textContent='';delete $('#replacement-time').dataset.ready;save.disabled=true;results();dialog.showModal();$('#replacement-search').focus();
  }
  mount.addEventListener('click',event=>{const b=event.target.closest('[data-trip-replace]');if(b)open(b.dataset.tripReplace);});
  $('#replacement-search').addEventListener('input',()=>{if(editing)results();});
  form.addEventListener('change',event=>{
    if(event.target.name==='replacement-place')select(event.target.value);
    if(editing && event.target.name==='replacement-expense'){if(event.target.checked)editing.expenses.add(event.target.value);else editing.expenses.delete(event.target.value);}
  });
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(!editing?.to)return;const ticket=editing;save.disabled=true;let error='';
    try {
      const result=await commit(current=>{const value=replaceTripStop(current,{from:ticket.from,to:ticket.to,expected:ticket.expected,expense_ids:[...ticket.expenses]},catalog);error=value.error || '';return value.trip;},'Остановка заменена. Дорога и время пересчитываются; расходы сохранены.');
      if(editing!==ticket)return;
      if(error){$('#replacement-status').textContent=error;return;}
      if(result?.conflict){$('#replacement-status').textContent='Черновик уже изменился. Закройте замену и проверьте свежий день.';return;}
      close();
    }catch{$('#replacement-status').textContent='Замену пока не удалось сохранить. Попробуйте ещё раз.';}finally{if(editing===ticket){save.disabled=false;render();}}
  });
  return {control,render};
}
