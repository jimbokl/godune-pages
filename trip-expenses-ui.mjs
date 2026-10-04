import {selectedDay,changeDayDetails,budgetInput,COST_KINDS} from './trip-days-state.mjs?v=12';
import {emptyCost,putExpense,removeExpense,cancelExpense,putRefund,removeRefund,validExpense,validCosts,validObservations,observationSource} from './trip-expenses-state.mjs?v=7';
import {parseKopecks,costText,rubles} from './trip-budget-state.mjs?v=2';
import {loadScheduler} from './trip-scheduler.mjs?v=17';
import {dayTransfers,transferKey,transferContext,transferTitle,transferRole,transferStatus} from './trip-transfer-costs.mjs?v=3';
import {TRAVEL_MODES} from './travel-estimates.mjs?v=6';
import {initTripOffers} from './trip-offers-ui.mjs?v=6';
import {offerSource,offerContext,offerStatusText,retainedSource} from './trip-offers-state.mjs?v=2';
const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
const button=(text,action)=>{const node=el('button',text,'expense-button');node.type='button';node.dataset.expenseAction=action;return node;};
const basis=row=>row?.basis || 'summary';
const dateLabel=date=>date?new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z')):'Дата не указана';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function initTripExpenses({section,read,commit,base,catalog}) {
  const panel=el('section',undefined,'trip-expenses');panel.setAttribute('aria-labelledby','expense-title');
  panel.innerHTML='<div class="expense-heading"><div><p class="eyebrow">Обед, билет, ночь у моря</p><h4 id="expense-title">Расходы этого дня</h4></div><button type="button" class="expense-add" data-expense-action="add">+ Добавить расход</button></div><div class="expense-totals"><p>План на всех<strong id="expense-planned">Ещё не заполнен</strong><small id="expense-plan-note"></small></p><p>Оплачено на всех<strong id="expense-paid">Ещё не заполнено</strong><small id="expense-paid-note"></small></p><p>Вернулось на всех<strong id="expense-refunded">0 ₽</strong><small>Только записанные возвраты</small></p><p>Потрачено после возвратов<strong id="expense-net">Ещё не заполнено</strong><small id="expense-net-note"></small></p></div><p id="expense-difference" class="journey-note"></p><details id="expense-categories"><summary>Разобрать по категориям <span aria-hidden="true">+</span></summary><div id="expense-rows"></div></details><p class="journey-note">Цена может меняться. Сохраните источник и дату, а после поездки — сколько заплатили. Пустая сумма означает, что вы её ещё не знаете.</p><p id="expense-status" class="journey-note" role="status" aria-live="polite"></p>';
  section.querySelector('#journey-details').after(panel);
  const roads=el('details',undefined,'expense-roads');roads.id='expense-roads';roads.innerHTML='<summary>Дорога этого дня <span aria-hidden="true">+</span></summary><p class="journey-note">Билет, такси или топливо можно связать с конкретным переездом. Цена — ваша оценка; после изменения маршрута проверьте её снова.</p><ol id="expense-road-list"></ol>';panel.querySelector('#expense-categories').before(roads);
  const dialog=el('dialog',undefined,'expense-dialog');dialog.id='expense-dialog';dialog.setAttribute('aria-labelledby','expense-editor-title');
  dialog.innerHTML='<div class="expense-dialog-top"><p class="eyebrow">Часть вашего дня</p><button type="button" class="expense-close" aria-label="Закрыть расход">×</button></div><h2 id="expense-editor-title">Добавить расход</h2><form id="expense-form"><div class="expense-fields"></div><details class="expense-source-details"><summary>Источник и дата цены <span aria-hidden="true">+</span></summary><div class="expense-source-fields"></div></details><p id="expense-basis-note" class="journey-note"></p><div class="expense-editor-actions"><button type="submit" class="expense-save">Сохранить расход</button><button type="button" class="expense-cancel">Отмена</button></div><p id="expense-editor-status" class="journey-note" role="status" aria-live="polite"></p></form>';
  document.body.append(dialog);
  const $=selector=>panel.querySelector(selector),field=name=>dialog.querySelector(`[name="${name}"]`),form=dialog.querySelector('form');
  const quoteNote=el('p','','expense-quote-note');quoteNote.hidden=true;dialog.querySelector('.expense-fields').after(quoteNote);
  let prices=[],pricePromise,editing,lastFocus;
  const status=text=>{$('#expense-status').textContent=text;};
  const editorStatus=text=>{dialog.querySelector('#expense-editor-status').textContent=text;};
  function label(parent,caption,name,type='text') {
    const wrap=el('label',caption),input=el(type==='select'?'select':'input');if(type!=='select')input.type=type;input.name=name;wrap.append(input);parent.append(wrap);return input;
  }
  function option(select,value,text) {const node=el('option',text);node.value=value;select.append(node);}
  const fields=dialog.querySelector('.expense-fields'),sources=dialog.querySelector('.expense-source-fields');
  const kindField=label(fields,'Что оплачиваем','kind','select');Object.entries(COST_KINDS).forEach(([id,name])=>option(kindField,id,name));
  const binding=label(fields,'К чему относится расход','binding','select');for(const [value,text]of [['place','К остановке'],['transfer','К переезду'],['general','К дню целиком']])option(binding,value,text);
  label(fields,'Остановка','poi','select');
  const transferField=label(fields,'За какой переезд','transfer','select');transferField.closest('label').classList.add('expense-field-wide');
  const transferPreview=el('div',undefined,'expense-transfer-preview');transferPreview.setAttribute('aria-live','polite');fields.append(transferPreview);
  const observation=label(fields,'Взять цену из нашего снимка меню','observation','select');option(observation,'','Своя оценка');
  observation.closest('label').classList.add('expense-field-wide');
  const evidence=el('figure',undefined,'expense-evidence'),evidenceImage=el('img');let evidenceLink=null;evidence.hidden=true;evidence.append(evidenceImage,el('figcaption'));fields.append(evidence);
  const name=label(fields,'Название расхода','label');name.required=true;name.placeholder='Например, обед у моря';name.closest('label').classList.add('expense-field-wide');
  const planned=label(fields,'План за одну порцию, билет или ночь, ₽','amount');planned.inputMode='decimal';planned.placeholder='Ещё не знаю';
  const qty=label(fields,'Сколько раз оплачиваем','quantity','number');qty.min='1';qty.max='4294967295';qty.step='1';qty.required=true;
  const scope=label(fields,'Эта цена','scope','select');option(scope,'group','На всех');option(scope,'person','На человека');
  const paid=label(fields,'Всего уже оплачено на всех, ₽','paid');paid.inputMode='decimal';paid.placeholder='После оплаты';
  label(sources,'Название источника','source-label');label(sources,'Ссылка на меню, фото или страницу','source-href');label(sources,'Когда видели эту цену','source-date','date');
  const quoted=label(sources,'Цена в источнике за единицу, ₽','source-amount');quoted.inputMode='decimal';
  sources.append(el('p','Источник сохраняется отдельно от вашего плана. Дата снимка не гарантирует цену и наличие блюда в день поездки.','journey-note'));
  async function loadPrices() {
    pricePromise ||= fetch(new URL('data/price-observations.json',base)).then(async response=>{if(!response.ok)throw Error('price_source_unavailable');const value=await response.json();if(!validObservations(value,catalog))throw Error('price_source_invalid');prices=value.observations;return prices;}).catch(()=>{pricePromise=null;return [];});
    return pricePromise;
  }
  function sourceFields(source) {
    field('source-label').value=source?.label || '';field('source-href').value=source?.href || '';field('source-date').value=source?.observed_at || '';field('source-amount').value=costText(source?.quoted_amount ?? null);
    quoteNote.hidden=!source?.offer;quoteNote.replaceChildren();
    if(source?.offer){const q=source.offer;quoteNote.append(el('strong',`${q.label} · ${q.unit} · ${q.amount===null?'Цена ещё неизвестна':rubles(q.amount)}`));const link=el('a',`${q.source_label} · ${dateLabel(q.observed_at)} ↗`);link.href=new URL(q.source_href,base);link.target='_blank';link.rel='noopener noreferrer';quoteNote.append(link,el('span','Это цена из источника. Ваш план и фактическая оплата сохраняются отдельно.'));}
  }
  function showEvidence(row) {
    evidence.hidden=!row;if(!row){evidenceImage.removeAttribute('src');if(evidenceLink){evidenceLink.replaceWith(evidenceImage);evidenceLink=null;}return;}
    const image=evidenceImage;image.src=new URL(row.photo,base);image.alt=`Меню у входа · ${catalog.poi.find(p=>p.slug===row.poi)?.name || 'Зеленоградск'}`;
    if(!evidenceLink){evidenceLink=el('a');evidenceLink.target='_blank';evidenceLink.rel='noopener noreferrer';evidenceLink.setAttribute('aria-label','Рассмотреть снимок меню');image.replaceWith(evidenceLink);evidenceLink.append(image);}evidenceLink.href=image.src;
    evidence.querySelector('figcaption').textContent=`${row.label} · ${row.unit} · ${row.amount===null?'Цена ещё неизвестна':rubles(row.amount)} на снимке ${dateLabel(row.observed_at)}. Нажмите на снимок, чтобы рассмотреть. Сегодняшнюю цену уточните перед заказом.`;
  }
  function fillObservations(source=null) {
    observation.replaceChildren();option(observation,'',source?.offer?'Выбранная цена из списка':'Своя оценка');
    for(const row of prices.filter(row=>row.poi===field('poi').value))option(observation,row.id,`${row.label} · ${rubles(row.amount)} · ${dateLabel(row.observed_at)}`);
    const match=prices.find(row=>row.poi===field('poi').value && same(observationSource(row),source));observation.value=match?.id || '';showEvidence(source?.offer?.origin==='photo'?source.offer:match);
  }
  function updateBasisNote() {
    if(!editing)return;
    const row=selectedDay(read()).costs[field('kind').value];
    dialog.querySelector('#expense-basis-note').textContent=basis(row)==='summary' && row?.amount!==null && row?.amount!==undefined?'Список расходов заменит общую оценку этой категории. Она останется в настройках: к ней можно вернуться.':'План категории будет считаться по списку расходов. Для полного бюджета проверьте и остальные категории.';
  }
  function chosenTransfer() {
    return transferField.value==='saved'?editing?.savedTransfer:editing?.transfers[Number(transferField.value)];
  }
  function updateBinding() {
    const linked=binding.value==='transfer',place=binding.value==='place';
    field('poi').closest('label').hidden=!place;transferField.closest('label').hidden=!linked;
    observation.closest('label').hidden=!place;transferPreview.hidden=!linked;transferPreview.replaceChildren();
    if(!place)showEvidence(null);else fillObservations(editing?.source);
    const transfer=linked && transferField.value!==''?chosenTransfer():null;
    if(transfer) {
      transferPreview.append(el('span',transferRole(transfer),'expense-transfer-role'),el('strong',transferTitle(transfer)),el('p',`${TRAVEL_MODES[transfer.leg_mode]} · ${dateLabel(transfer.date)}${transfer.leg_mode!==transfer.mode?' · между местами с общей парковкой':''}`));
      const state=transferStatus(transfer,selectedDay(read()),catalog);transferPreview.dataset.current=String(state.current);transferPreview.append(el('p',state.reason));
    } else if(linked)transferPreview.append(el('p',editing?.transfers.length?'Выберите направление. Сумму можно оставить пустой, пока не узнаете цену.':'Добавьте остановки, начало или ночёвку: здесь появится дорога вашего дня.'));
    planned.closest('label').firstChild.textContent=linked?'План за один переезд или билет, ₽':'План за одну порцию, билет или ночь, ₽';
  }
  async function open(kind='food',id=null,preferred=null,quote=null,evaluation=null,expected=null) {
    const day=selectedDay(read()),item=day.costs[kind]?.items?.find(item=>item.id===id);
    if(expected && offerContext(day,read().itinerary?.people || 1)!==expected)throw Error('День изменился. Выберите цену заново.');
    lastFocus=document.activeElement;
    editing={day:day.id,kind,id:item?.id || crypto.randomUUID(),before:structuredClone(day.costs[kind]),source:item?.source || null,savedTransfer:item?.transfer || null,previousBindings:item?.previous_bindings?structuredClone(item.previous_bindings):null,cancelled:item?.cancelled,refunds:item?.refunds?structuredClone(item.refunds):null,transfers:dayTransfers(day,catalog),context:transferContext(day,catalog)};
    const ticket=editing;form.reset();kindField.value=kind;kindField.disabled=!!item;
    editing.offerContext=quote || item?.source?.offer?offerContext(day,read().itinerary?.people || 1):null;
    const select=field('poi');select.replaceChildren();option(select,'','Без остановки');
    for(const place of [...catalog.poi.filter(p=>day.places.includes(p.slug)),...catalog.poi.filter(p=>!day.places.includes(p.slug))])option(select,place.slug,`${day.places.includes(place.slug)?'В этом дне · ':''}${place.name}`);
    if(item?.poi && !catalog.poi.some(p=>p.slug===item.poi))option(select,item.poi,'Сохранённое место вне каталога');
    select.value=item?.poi || day.places.find(id=>catalog.poi.find(p=>p.slug===id)?.gastronomy) || '';
    transferField.replaceChildren();option(transferField,'','Выберите переезд');
    if(item?.transfer)option(transferField,'saved',`Сохранённый · ${transferTitle(item.transfer)}`);
    editing.transfers.forEach((transfer,index)=>option(transferField,String(index),`${transferRole(transfer)} · ${transferTitle(transfer)} · ${TRAVEL_MODES[transfer.leg_mode]}`));
    transferField.value=item?.transfer?'saved':preferred?String(editing.transfers.findIndex(transfer=>transferKey(transfer)===transferKey(preferred))):'';
    binding.value=item?.transfer || preferred || !item && kind==='travel'?'transfer':item && !item.poi?'general':'place';
    name.value=item?.label || '';planned.value=costText(item?.amount ?? null);qty.value=item?.quantity || 1;scope.value=item?.scope || (kind==='travel'?'group':'person');paid.value=costText(item?.paid ?? null);
    sourceFields(item?.source);fillObservations(item?.source);updateBinding();dialog.querySelector('h2').textContent=item?'Изменить расход':'Добавить расход';editorStatus('');updateBasisNote();dialog.showModal();name.focus();
    if(quote){editing.source=offerSource(quote);select.value=quote.poi;binding.value='place';name.value=quote.label;planned.value=costText(quote.amount);qty.value=1;scope.value=quote.scope;paid.value='';sourceFields(editing.source);updateBinding();editorStatus(offerStatusText(evaluation));}
    const rows=await loadPrices();if(editing!==ticket || !dialog.open)return;
    updateBinding();if(!rows.length && binding.value==='place' && !editing.source?.offer)editorStatus('Снимки цен пока не открылись. Свою оценку можно сохранить.');
  }
  function close() {editing=null;dialog.close();lastFocus?.isConnected && lastFocus.focus({preventScroll:true});}
  dialog.querySelector('.expense-close').addEventListener('click',close);dialog.querySelector('.expense-cancel').addEventListener('click',close);
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});window.addEventListener('godune:memory-cleared',()=>{if(dialog.open)close();});
  field('poi').addEventListener('change',()=>{editing.source=null;sourceFields(null);fillObservations();});
  binding.addEventListener('change',updateBinding);transferField.addEventListener('change',updateBinding);
  kindField.addEventListener('change',()=>{editing.kind=kindField.value;editing.before=structuredClone(selectedDay(read()).costs[editing.kind]);updateBasisNote();});
  observation.addEventListener('change',()=>{
    const row=prices.find(row=>row.id===observation.value && row.poi===field('poi').value);if(!row){editing.source=null;sourceFields(null);showEvidence(null);return;}
    editing.source=observationSource(row);sourceFields(editing.source);name.value=row.label;planned.value=costText(row.amount);showEvidence(row);editorStatus('Цена и дата перенесены со снимка. Измените план под себя, если нужно.');
  });
  async function guardedChange(dayId,kind,before,transform,message,editor=null,stillCurrent=()=>true) {
    const engine=await loadScheduler(base);let error='';
    const result=await commit(current=>{
      const day=selectedDay(current);
      if(!stillCurrent() || day.id!==dayId || !same(day.costs[kind],before) || editor && editing!==editor){error='День или расходы уже изменились. Закройте редактор и откройте его заново — свежий выбор сохранён.';return current;}
      if(editor?.checkTransfer && editor.context!==transferContext(day,catalog)){error='Дорога изменилась, пока расход был открыт. Закройте редактор и выберите переезд заново. Суммы и новый маршрут сохранены.';return current;}
      if(editor?.offerContext && editor.offerContext!==offerContext(day,current.itinerary?.people || 1)){error='Дата, остановки или число путешественников изменились. Откройте цену заново — ваш свежий день сохранён.';return current;}
      const costs=transform(day.costs);if(!validCosts(costs,COST_KINDS)){error='Проверьте название, цену, источник и количество.';return current;}
      const next=changeDayDetails(current,{costs});
      try {engine.budget(budgetInput(next));}catch{error='Сумма слишком велика для расчёта. Проверьте цену, количество и число путешественников.';return current;}
      return next;
    },message);
    if(error)return error;
    status(result?.saved===false?'Расходы останутся в этой вкладке. Браузер не разрешил сохранение.':message);return '';
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(!editing)return;const ticket=editing,save=form.querySelector('[type=submit]');save.disabled=true;
    try {
      const values=new FormData(form),sourceLabel=String(values.get('source-label')).trim(),href=String(values.get('source-href')).trim() || null,observed_at=values.get('source-date') || null,quoted_amount=parseKopecks(values.get('source-amount'));
      let source=sourceLabel || href || observed_at || quoted_amount!==null?{label:sourceLabel || 'Ваш источник',href,observed_at,quoted_amount,catalog_id:null}:null;
      source=retainedSource(source,ticket.source);
      const linked=values.get('binding')==='transfer',transfer=linked && values.get('transfer')!==''?chosenTransfer():null;
      if(linked && !transfer)throw Error('Выберите, за какой переезд платите. Общий расход можно сохранить для дня целиком.');
      ticket.checkTransfer=linked;
      const item={id:ticket.id,label:String(values.get('label')).trim(),poi:values.get('binding')==='place'?values.get('poi') || null:null,amount:parseKopecks(values.get('amount')),quantity:Number(values.get('quantity')),scope:values.get('scope'),paid:parseKopecks(values.get('paid')),source,...(transfer?{transfer:structuredClone(transfer)}:{}),...(ticket.previousBindings?{previous_bindings:ticket.previousBindings}:{}),...(ticket.cancelled!==undefined?{cancelled:ticket.cancelled}:{}),...(ticket.refunds?{refunds:ticket.refunds}:{})};
      if(!validExpense(item))throw Error('Проверьте название, цену, источник и количество.');
      const error=await guardedChange(ticket.day,ticket.kind,ticket.before,costs=>putExpense(costs,ticket.kind,item),'Расход сохранён в этом дне.',ticket);
      if(error)editorStatus(error);else {$('#expense-categories').open=true;close();}
    }catch(error){editorStatus(error.message || 'Расход пока не сохранился. Попробуйте ещё раз.');}finally{save.disabled=false;}
  });
  const refundDialog=el('dialog',undefined,'expense-dialog expense-refund-dialog');refundDialog.id='expense-refund-dialog';refundDialog.setAttribute('aria-labelledby','refund-title');
  refundDialog.innerHTML='<div class="expense-dialog-top"><p class="eyebrow">Деньги вернулись</p><button type="button" class="expense-close" aria-label="Закрыть возврат">×</button></div><h2 id="refund-title">Записать возврат</h2><p id="refund-expense-name" class="cancellation-place"></p><form><div class="expense-fields"></div><p class="journey-note">Запишите полученную сумму на всех. Для нескольких частичных возвратов добавьте отдельные записи. Ожидаемый возврат здесь пока не учитывается.</p><div class="expense-editor-actions"><button type="submit" class="expense-save">Сохранить возврат</button><button type="button" class="expense-cancel">Закрыть</button></div><p id="refund-status" class="journey-note" role="status" aria-live="polite"></p></form>';
  document.body.append(refundDialog);const rf=refundDialog.querySelector('form'),rfields=refundDialog.querySelector('.expense-fields');
  const ramount=label(rfields,'Получено на всех, ₽','refund-amount');ramount.inputMode='decimal';ramount.required=true;ramount.placeholder='Например, 1500';
  const rdate=label(rfields,'Когда вернулось','refund-date','date'),rnote=label(rfields,'Заметка к возврату','refund-note');rnote.placeholder='Например, часть оплаты за билет';rnote.closest('label').classList.add('expense-field-wide');
  let refunding,refundFocus;
  function closeRefund(){
    const ticket=refunding;refunding=null;refundDialog.close();
    const controls=[...panel.querySelectorAll('[data-expense-action=refund]')];
    const match=control=>control.dataset.expenseKind===ticket?.kind && control.dataset.expenseId===ticket?.id;
    const target=refundFocus?.isConnected?refundFocus:controls.find(control=>match(control) && control.dataset.refundId===ticket?.refundId) || controls.find(control=>match(control) && !control.dataset.refundId) || panel.querySelector('.expense-add');
    target?.focus({preventScroll:true});
  }
  refundDialog.querySelector('.expense-close').addEventListener('click',closeRefund);refundDialog.querySelector('.expense-cancel').addEventListener('click',closeRefund);refundDialog.addEventListener('cancel',event=>{event.preventDefault();closeRefund();});window.addEventListener('godune:memory-cleared',()=>{if(refundDialog.open)closeRefund();});
  function openRefund(kind,id,refundId=null){
    const day=selectedDay(read()),item=day.costs[kind]?.items?.find(item=>item.id===id);if(!item)return;
    const row=item.refunds?.find(row=>row.id===refundId);refundFocus=document.activeElement;refunding={day:day.id,kind,id,refundId:row?.id || crypto.randomUUID(),before:structuredClone(day.costs[kind])};rf.reset();ramount.value=costText(row?.amount ?? null);rdate.value=row?.date || '';rnote.value=row?.note || '';
    refundDialog.querySelector('#refund-title').textContent=row?'Изменить возврат':'Записать возврат';refundDialog.querySelector('#refund-expense-name').textContent=item.label;refundDialog.querySelector('#refund-status').textContent='';refundDialog.showModal();ramount.focus();
  }
  rf.addEventListener('submit',async event=>{
    event.preventDefault();if(!refunding)return;const ticket=refunding,save=rf.querySelector('[type=submit]');save.disabled=true;
    try{const row={id:ticket.refundId,amount:parseKopecks(ramount.value),date:rdate.value || null,note:rnote.value.trim()};if(row.amount===null)throw Error('Укажите сумму, которая уже вернулась.');
      const error=await guardedChange(ticket.day,ticket.kind,ticket.before,costs=>putRefund(costs,ticket.kind,ticket.id,row),'Возврат записан. Оплата сохранена.',null,()=>refunding===ticket && refundDialog.open);
      if(error)refundDialog.querySelector('#refund-status').textContent=error;else closeRefund();
    }catch(error){refundDialog.querySelector('#refund-status').textContent=error.message || 'Возврат пока не сохранился.';}finally{save.disabled=false;}
  });
  panel.addEventListener('click',async event=>{
    const node=event.target.closest('[data-expense-action]');if(!node)return;const day=selectedDay(read()),kind=node.dataset.expenseKind || 'food',id=node.dataset.expenseId;
    if(node.dataset.expenseAction==='add')return open(kind);
    if(node.dataset.expenseAction==='road')return open('travel',null,dayTransfers(day,catalog)[Number(node.dataset.transferIndex)]);
    if(node.dataset.expenseAction==='edit')return open(kind,id);
    if(node.dataset.expenseAction==='refund')return openRefund(kind,id,node.dataset.refundId);
    if(['cancel','restore','delete-refund'].includes(node.dataset.expenseAction)){
      try{const action=node.dataset.expenseAction,error=await guardedChange(day.id,kind,structuredClone(day.costs[kind]),costs=>action==='delete-refund'?removeRefund(costs,kind,id,node.dataset.refundId):cancelExpense(costs,kind,id,action==='cancel'),action==='delete-refund'?'Запись возврата удалена. Оплата сохранена.':action==='cancel'?'Расход убран из будущего плана. Деньги сохранены.':'Расход снова в плане. Оплаты и возвраты сохранены.');if(error)status(error);}catch{status('Изменение пока не сохранилось. Попробуйте ещё раз.');}return;
    }
    if(node.dataset.expenseAction==='summary'){const details=section.querySelector('#journey-details');details.open=true;section.querySelector(`[name="${kind}-amount"]`)?.focus();return;}
    if(node.dataset.expenseAction==='delete'){
      try {const error=await guardedChange(day.id,kind,structuredClone(day.costs[kind]),costs=>removeExpense(costs,kind,id),'Расход удалён. Остальные суммы сохранены.');if(error)status(error);}catch{status('Расход пока не удалён. Попробуйте ещё раз.');}
    }
  });
  const offers=initTripOffers({panel,read,base,catalog,openOffer:(quote,evaluation,context)=>open(quote.category,null,null,quote,evaluation,context)});
  function render(trip) {
    offers.render(trip);
    const day=selectedDay(trip),hasItems=Object.values(day.costs).some(row=>row.items?.length);
    if(!panel.dataset.rendered && hasItems)$('#expense-categories').open=true;panel.dataset.rendered='true';
    const transfers=dayTransfers(day,catalog);
    $('#expense-road-list').replaceChildren(...transfers.map((transfer,index)=>{
      const row=el('li',undefined,'expense-road'),text=el('div');text.append(el('span',`${index+1} · ${transferRole(transfer)}`,'expense-transfer-role'),el('strong',transferTitle(transfer)),el('p',TRAVEL_MODES[transfer.leg_mode]));
      const count=Object.values(day.costs).flatMap(cost=>cost.items || []).filter(item=>item.transfer && transferKey(item.transfer)===transferKey(transfer)).length;
      if(count)text.append(el('small',`Сохранено расходов: ${count}`));
      const add=button('+ Расход дороги','road');add.dataset.transferIndex=String(index);row.append(text,add);return row;
    }));
    if(!transfers.length)$('#expense-road-list').append(el('li','Выберите остановки и, если нужно, начало и ночёвку. Здесь появятся переезды вашего дня.','journey-note'));
    $('#expense-rows').replaceChildren(...Object.entries(COST_KINDS).map(([kind,caption])=>{
      const row=day.costs[kind] || emptyCost(),block=el('section',undefined,'expense-category');block.dataset.expenseKind=kind;
      const heading=el('div',undefined,'expense-category-heading');heading.append(el('h5',caption),el('span',basis(row)==='items'?'По списку':'Общая оценка'));block.append(heading);
      const total=el('p',undefined,'expense-category-total');total.dataset.expenseTotal=kind;block.append(total);
      for(const item of row.items || []) {
        const card=el('article',undefined,'expense-card');card.dataset.expenseId=item.id;
        card.dataset.cancelled=String(!!item.cancelled);card.append(el('h6',item.label));if(item.cancelled)card.append(el('span','Убран из плана · деньги сохранены','expense-cancelled-badge'));
        const place=catalog.poi.find(p=>p.slug===item.poi);
        if(item.poi)card.append(el('p',`${place?.name || 'Место вне каталога'}${day.places.includes(item.poi)?'':' · вне остановок этого дня'}`,'expense-place'));
        if(item.transfer) {
          const state=transferStatus(item.transfer,day,catalog),link=el('div',undefined,'expense-transfer-link');link.dataset.current=String(state.current);
          link.append(el('span',transferRole(item.transfer),'expense-transfer-role'),el('strong',transferTitle(item.transfer)),el('p',`${TRAVEL_MODES[item.transfer.leg_mode]} · ${dateLabel(item.transfer.date)}`),el('p',state.reason));card.append(link);
        }
        card.append(el('p',`${item.cancelled?'Прежний план':'План'}: ${item.amount===null?'ещё неизвестен':`${rubles(item.amount)} × ${item.quantity} · ${item.scope==='person'?'на человека':'на всех'}`}`));
        card.append(el('p',`Оплачено на всех: ${item.paid===null?'ещё не записано':rubles(item.paid)}`));
        if(item.refunds?.length){
          const list=el('ol',undefined,'expense-refunds');
          for(const refund of item.refunds){const entry=el('li');entry.append(el('strong',`Вернулось ${rubles(refund.amount)}`),el('small',`${dateLabel(refund.date)}${refund.note?' · '+refund.note:''}`));const actions=el('div',undefined,'expense-card-actions');for(const [action,caption]of [['refund','Изменить возврат'],['delete-refund','Удалить запись']]){const b=button(caption,action);b.dataset.expenseKind=kind;b.dataset.expenseId=item.id;b.dataset.refundId=refund.id;actions.append(b);}entry.append(actions);list.append(entry);}card.append(list);
        }
        if(item.previous_bindings?.length) {
          const history=el('details',undefined,'expense-binding-history'),list=el('ol');history.append(el('summary',`Прежние связи · ${item.previous_bindings.length}`));
          for(const row of item.previous_bindings) {
            const entry=el('li',`${row.place?.name || transferTitle(row.transfer)} · ${dateLabel(row.date)}`);
            if(row.source){const text=`${row.source.label} · ${dateLabel(row.source.observed_at)}${row.source.quoted_amount===null?'':` · ${rubles(row.source.quoted_amount)}`}`,source=el(row.source.href?'a':'span',text);if(row.source.href){source.href=new URL(row.source.href,base);source.target='_blank';source.rel='noopener noreferrer';}entry.append(el('br'),source);}list.append(entry);
          }history.append(list);card.append(history);
          const previous=item.previous_bindings.at(-1);
          if(item.source && (!Object.hasOwn(previous,'source') || same(previous.source,item.source)))card.append(el('p','Сохранённый источник относится к прежней связи. Цену нового места проверьте отдельно.','expense-binding-warning'));
        }
        if(item.source) {
          const source=el('p',undefined,'expense-source');const text=`${item.source.label} · ${dateLabel(item.source.observed_at)}${item.source.quoted_amount===null?'':` · в источнике ${rubles(item.source.quoted_amount)}`}`;
          if(item.source.href){const link=el('a',text);link.href=new URL(item.source.href,base);link.target='_blank';link.rel='noopener noreferrer';source.append(link);}else source.textContent=text;
          card.append(source);
        }
        if(basis(row)==='summary')card.append(el('p','Сейчас этот расход не входит в план категории. Выбрана общая оценка.','journey-note'));
        const controls=el('div',undefined,'expense-card-actions');for(const [action,text]of [['edit','Изменить'],[item.cancelled?'restore':'cancel',item.cancelled?'Вернуть в план':'Убрать из плана'],['refund','+ Возврат'],['delete','Удалить запись']]){const b=button(text,action);b.dataset.expenseKind=kind;b.dataset.expenseId=item.id;controls.append(b);}card.append(controls);block.append(card);
      }
      const controls=el('div',undefined,'expense-card-actions');for(const [action,text]of [['add','+ Расход'],['summary','Изменить оценку']]){const b=button(text,action);b.dataset.expenseKind=kind;controls.append(b);}block.append(controls);return block;
    }));
  }
  function totals(budget) {
    const day=budget.days.find(row=>row.id===selectedDay(read()).id);if(!day)return;
    $('#expense-planned').textContent=rubles(day.known);$('#expense-plan-note').textContent=day.total===null?`Известная часть · неизвестных сумм: ${day.unknown}`:`Весь день · вас ${budget.people}`;
    $('#expense-paid').textContent=rubles(day.paid_known);$('#expense-paid-note').textContent=day.paid_total===null?`Записанная часть · не заполнено: ${day.paid_unknown}`:'Все расходы этого дня записаны';
    $('#expense-refunded').textContent=rubles(day.refunded);$('#expense-net').textContent=rubles(day.net_known);$('#expense-net-note').textContent=day.net_known<0?'Возвратов больше записанных оплат. Проверьте, все ли оплаты внесены.':day.net_total===null?'Записанная часть · не все оплаты заполнены':'Оплаты за вычетом полученных возвратов';
    $('#expense-difference').textContent=day.difference_overflow?'Разница выходит за пределы точного расчёта. Суммы сохранены.':day.difference===null?'Разница появится, когда план и оплаты будут заполнены целиком. Полученные возвраты уже вычтены.':day.difference===0?'Потратили ровно столько, сколько планировали.':`${day.difference>0?'Больше':'Меньше'} плана на ${rubles(Math.abs(day.difference))}.`;
    for(const category of day.categories) {
      const node=panel.querySelector(`[data-expense-total="${category.kind}"]`);if(node)node.textContent=`План: ${rubles(category.known)}${category.total===null?' · часть суммы':''}. Оплачено: ${category.paid_unknown>0 && category.paid_known===0?'ещё не записано':`${rubles(category.paid_known)}${category.paid_total===null?' · часть суммы':''}`}. Вернулось: ${rubles(category.refunded)}. После возвратов: ${rubles(category.net_known)}${category.net_total===null?' · часть суммы':''}.${category.net_known<0?' Возвратов больше записанных оплат — проверьте оплаты.':''}`;
    }
    panel.dataset.expensesReady='true';
  }
  function pending(){panel.dataset.expensesReady='false';$('#expense-planned').textContent='Считаем…';$('#expense-paid').textContent='Считаем…';$('#expense-refunded').textContent='Считаем…';$('#expense-net').textContent='Считаем…';$('#expense-net-note').textContent='';$('#expense-plan-note').textContent='';$('#expense-paid-note').textContent='';$('#expense-difference').textContent='';}
  function error(){panel.dataset.expensesReady='error';$('#expense-planned').textContent='Расчёт нужно проверить';$('#expense-paid').textContent='Суммы сохранены';$('#expense-refunded').textContent='Суммы сохранены';$('#expense-net').textContent='Суммы сохранены';$('#expense-net-note').textContent='';$('#expense-plan-note').textContent='Проверьте суммы, количество и число путешественников.';$('#expense-paid-note').textContent='';$('#expense-difference').textContent='';panel.querySelectorAll('[data-expense-total]').forEach(node=>{node.textContent='Расчёт пока не готов';});}
  return {render,totals,pending,error};
}
