import {previewStopCancellation,cancelTripStop} from './trip-cancellation-state.mjs?v=4';
import {replacementContext} from './trip-replacement-state.mjs?v=5';
import {transferTitle} from './trip-transfer-costs.mjs?v=2';
import {rubles} from './trip-budget-state.mjs?v=1';
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
export function initTripCancellation({read,commit,catalog}) {
  const dialog=el('dialog',undefined,'expense-dialog trip-cancellation-dialog');dialog.id='trip-cancellation-dialog';dialog.setAttribute('aria-labelledby','cancellation-title');
  dialog.innerHTML='<div class="expense-dialog-top"><p class="eyebrow">План меняется. Деньги помним.</p><button type="button" class="expense-close" aria-label="Закрыть отмену остановки">×</button></div><h2 id="cancellation-title">Убрать остановку</h2><p id="cancellation-place" class="cancellation-place"></p><form><p class="journey-note">Остановка исчезнет из дня. Оплаты, источники цен и полученные возвраты останутся в расходах.</p><h3>Что убрать из будущего бюджета?</h3><div id="cancellation-expenses"></div><p class="journey-note">Отметьте расходы, которые больше не планируете. Брони и билеты отменяются у продавца; здесь вы меняете свой план.</p><div class="expense-editor-actions"><button type="submit" class="expense-save">Убрать остановку</button><button type="button" class="expense-cancel">Оставить в дне</button></div><p id="cancellation-status" class="journey-note" role="status" aria-live="polite"></p></form>';
  document.body.append(dialog);const $=selector=>dialog.querySelector(selector);let editing,lastFocus,lastIndex=0;
  function restoreFocus(){const controls=[...document.querySelectorAll('#my-places [data-trip-action=remove]')],target=lastFocus?.isConnected?lastFocus:controls[Math.min(lastIndex,controls.length-1)] || document.querySelector('#my-trip-title');if(target){if(!target.matches('button,a,input'))target.tabIndex=-1;target.focus({preventScroll:true});}}
  function close(){editing=null;dialog.close();restoreFocus();}
  $('.expense-close').addEventListener('click',close);$('.expense-cancel').addEventListener('click',close);dialog.addEventListener('cancel',event=>{event.preventDefault();close();});window.addEventListener('godune:memory-cleared',()=>{if(dialog.open)close();});
  function render(){if(editing && editing.expected!==replacementContext(read(),catalog)){$('#cancellation-status').textContent='День уже изменился. Откройте остановку заново — свежий план сохранён.';$('[type=submit]').disabled=true;}}
  async function apply(intent,ticket=null){let error='';const result=await commit(current=>{if(ticket && editing!==ticket){error='Форма уже закрыта. План сохранён.';return current;}const change=cancelTripStop(current,intent,catalog);error=change.error || '';return change.trip;},'Остановка убрана. Оплаты и возвраты сохранены.');return error || (result?.saved===false?'План остался в этой вкладке: браузер не разрешил сохранение.':'');}
  async function open(id) {
    const preview=previewStopCancellation(read(),id,catalog);if(preview.error)return;
    const intent={id,expected:preview.context,expense_ids:[]};lastFocus=document.activeElement;lastIndex=read().places.indexOf(id);
    if(!preview.expenses.length){const error=await apply(intent);restoreFocus();return error;}
    editing=intent;$('form').reset();$('[type=submit]').disabled=false;$('#cancellation-status').textContent='';$('#cancellation-place').textContent=preview.place.name;
    $('#cancellation-expenses').replaceChildren(...preview.expenses.map(row=>{
      const label=el('label',undefined,'cancellation-expense'),input=el('input');input.type='checkbox';input.name='cancellation-expense';input.value=row.item.id;input.checked=!row.item.cancelled;input.disabled=!!row.item.cancelled;
      const text=el('span');text.append(el('strong',row.item.label),el('small',row.item.transfer?transferTitle(row.item.transfer):preview.place.name),el('small',`Оплачено: ${row.item.paid===null?'не записано':rubles(row.item.paid)} · записей возврата: ${row.item.refunds?.length || 0}`),el('small',row.item.cancelled?'Уже убран из плана':row.basis==='summary'?'Запомним отмену. Бюджет категории пока считается по общей оценке.':'Будущий план по этому расходу станет нулевым.'));label.append(input,text);return label;
    }));dialog.showModal();$('[type=submit]').focus();
  }
  $('form').addEventListener('submit',async event=>{event.preventDefault();if(!editing)return;const ticket=editing,save=$('[type=submit]');save.disabled=true;try{const error=await apply({...ticket,expense_ids:[...dialog.querySelectorAll('[name=cancellation-expense]:checked:not(:disabled)')].map(input=>input.value)},ticket);if(error)$('#cancellation-status').textContent=error;else close();}catch{$('#cancellation-status').textContent='План пока не сохранился. Попробуйте ещё раз.';}finally{if(editing===ticket)save.disabled=false;render();}});
  return {open,render};
}
