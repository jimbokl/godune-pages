import {formatKopecks} from './trip-money.mjs';

// Stable names preserve independent selections in list/detail URLs.
const hex=value=>[...new TextEncoder().encode(value)].map(v=>v.toString(16).padStart(2,'0')).join('');
export const serviceExtraName=(kind,service,charge)=>`${kind}:${hex(service)}:${hex(charge)}`;
export const extraBelongsTo=(key,service)=>key.startsWith(`sr_extra:${hex(service)}:`)||key.startsWith(`sr_quantity:${hex(service)}:`);
export const extraKey=key=>/^sr_(?:extra|quantity):[0-9a-f]+:[0-9a-f]+$/.test(key);
export const selectedPrice=input=>input.visit.kind==='rental'?input.visit.input.price:input.price;
export function extrasFromFields(fields,input) {
  const price=selectedPrice(input),extras=[],extra_units={};
  for(const charge of price?.tariff?.extras||[]){
    if(!fields.has(serviceExtraName('extra',input.service_id,charge.id)))continue;
    extras.push(charge.id);
    if(charge.scope==='unit'){
      const raw=String(fields.get(serviceExtraName('quantity',input.service_id,charge.id))||'');
      const value=Number(raw);
      if(!/^\d+$/.test(raw)||!Number.isSafeInteger(value)||value<1||value>4294967295)throw Error('Проверьте количество инвентаря.');
      extra_units[charge.id]=value;
    }
  }
  return {extras,extra_units};
}
export function priceRows(input,quote) {
  const price=selectedPrice(input);if(!price||!quote)return [];
  const tariff=price.tariff,charges=[tariff.base,...(tariff.mandatory||[]),...(tariff.extras||[])];
  const rows=quote.lines.map(line=>{
    const charge=charges.find(c=>c.id===line.id),name=charge.label||(charge.id===tariff.base.id?'Посещение':'Доплата');
    const count=line.subjects===0?'Не требуется':charge.scope==='person'?`${line.subjects} чел.`:charge.scope==='unit'?`${line.subjects} шт.`:'На компанию';
    const time=line.unknown?.includes('partial_step_unknown')?' · оплату неполного интервала нужно уточнить':line.billed_minutes==null?'':` · оплачивается ${line.billed_minutes} мин`;
    const q=line.admission,chosen=q?.alternatives.find(a=>a.id===q.recommended_id);
    const extra=chosen?.overtime_minutes>0?` · сверх тарифа ${chosen.overtime_minutes} мин: ${money(chosen.overtime_total)}`:'';
    return {name:chosen?`${name} · ${chosen.label}`:name,detail:count+time+extra,total:line.total};
  });
  if(quote.minimum_adjustment>0)rows.push({name:'До минимальной суммы',detail:'',total:quote.minimum_adjustment});
  return rows;
}
const money=value=>value==null?'Нужно уточнить':formatKopecks(value);
export function splitText(quote) {
  const s=quote?.cost_split;if(!s)return 'Полная сумма на человека пока неизвестна';
  return 'На человека: '+(s.minimum===s.maximum?money(s.minimum):`${money(s.minimum).replace(/\s*₽$/,'')}–${money(s.maximum)}`);
}
export function priceQuoteElement(input,quote) {
  const fragment=document.createDocumentFragment(),dl=document.createElement('dl');dl.className='service-price-lines';
  function row(name,detail,value,total=false){
    const div=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=name;
    if(detail){const small=document.createElement('small');small.textContent=detail;dt.append(small);}
    dd.textContent=money(value);div.append(dt,dd);if(total)div.className='service-price-total';dl.append(div);
  }
  for(const r of priceRows(input,quote))row(r.name,r.detail,r.total);
  row('Итого','',quote.cost_total,true);fragment.append(dl);
  for(const line of quote.lines)if(line.admission)fragment.append(admissionPlansElement(line.admission));
  const split=document.createElement('p');split.className='service-price-split';split.textContent=splitText(quote);fragment.append(split);
  const deposit=document.createElement('p'),small=document.createElement('small');deposit.className='service-price-deposit';
  deposit.textContent='Возвратный залог: '+money(quote.deposit.total);small.textContent='Потребуется при входе: '+money(quote.upfront_total);deposit.append(small);fragment.append(deposit);
  return fragment;
}


function admissionPlansElement(q){
  const panel=document.createElement('div');panel.className='service-admission-plans';
  const clock=document.createElement('p');clock.textContent=(q.charged_minutes===null?'Время по браслету пока неизвестно':`По браслету: ${q.charged_minutes} мин`)+'. Сравнение доступных тарифов:';panel.append(clock);
  const available=q.alternatives.filter(a=>a.eligibility==='eligible');
  if(!available.length){const p=document.createElement('p');p.textContent='Укажите возраст гостей и льготные билеты в блоке «Кто пойдёт».';panel.append(p);}
  for(const a of available){
    const row=document.createElement('div'),label=document.createElement('span'),value=document.createElement('strong'),detail=document.createElement('small');row.className='service-admission-plan';
    const chosen=a.id===q.recommended_id;if(chosen)row.dataset.recommended='';label.textContent=a.label+(chosen?' · выбран':'');value.textContent=money(a.total);
    if(a.overtime_minutes>0)detail.textContent=`Вход ${money(a.base_total)} · доплата за ${a.overtime_minutes} мин: ${money(a.overtime_total)}`;
    row.append(label,value,detail);panel.append(row);
  }
  return panel;
}
