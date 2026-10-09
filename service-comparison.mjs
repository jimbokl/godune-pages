// Compare the existing Rust assessments; this view never quotes or ranks services.
import {formatKopecks} from './trip-money.mjs';
import {rentalDetails} from './trip-rental-view.mjs';

const unknown='Нужно уточнить';
const conditionLabels={age:'Возраст',group:'Размер компании',audience:'Кому доступно',equipment:'Что взять',booking:'Предварительная запись'};
const conditionStatuses={pass:'Подходит',fail:'Не подходит',conflict:'Источники расходятся',stale:'Сведения устарели',unknown};
const stateLabels={fits:'По времени и условиям подходит',does_not_fit:'Нужно изменить план',needs_info:'Есть что уточнить'};
const profileLabels={length_m:'Длина бассейна, м',lanes:'Дорожки',capacity:'Вместимость',minimum_hours:'Минимум часов'};
const cell=(text,note='',state='known')=>({text,note,state});
function money(total,lower){
  return total!=null?cell(formatKopecks(total)):cell(unknown,lower>0?`Известная часть: ${formatKopecks(lower)}`:'','unknown');
}
function clock(value){
  if(value==null)return unknown;
  const minute=((value%1440)+1440)%1440;
  return `${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}${value<0?' предыдущего дня':value>=1440?' следующего дня':''}`;
}
function conditionText(c){
  if(c.kind==='age'||c.kind==='group'){
    const unit=c.kind==='age'?'лет':'человек';
    return c.minimum==null&&c.maximum==null?'Без ограничений':c.minimum!=null&&c.maximum!=null?`От ${c.minimum} до ${c.maximum} ${unit}`:c.minimum!=null?`От ${c.minimum} ${unit}`:`До ${c.maximum} ${unit}`;
  }
  if(c.kind==='audience')return c.allowed.map(v=>({guest:'Гости',resident:'Проживающие',member:'Владельцы абонемента'})[v]||v).join(', ');
  if(c.kind==='equipment')return c.required.length?c.required.map(v=>v.label).join(', '):'Ничего дополнительно не требуется';
  return !c.required?'Без записи':c.notice_minutes==null?'Нужна запись':`Запись за ${c.notice_minutes} мин`;
}
function condition(check){
  if(!check)return cell(unknown,'','unknown');
  const facts=check.observations.filter(v=>v.status==='current').map(v=>`${conditionText(v.rule.condition)} · проверено ${v.rule.source.checked_at}`);
  return cell(conditionStatuses[check.status]||unknown,facts.join('; '),check.status);
}
function property(spec,value){
  if(value==null)return cell(unknown,'','unknown');
  if(typeof value==='boolean')return cell(value?'Да':'Нет');
  if(typeof value==='number')return cell(String(value));
  if(Array.isArray(value))return cell(value.length?value.map(v=>spec.options.find(o=>o.value===v)?.label||v).join(', '):'Нет');
  return cell(unknown,'','unknown');
}
function calendar(value){
  if(!value)return cell(unknown,'','unknown');
  const hours=value.windows.map(w=>`${clock(w.open)}–${clock(w.close)}`);
  const sessions=value.sessions.map(s=>`${clock(s.start)}–${clock(s.start+s.duration)}`);
  if(value.coverage!=='known')return cell(unknown,[...hours,...sessions].length?`Известные часы: ${[...hours,...sessions].join(', ')}`:'','unknown');
  return cell([...hours,...sessions].join(', ')||'Закрыто в выбранный день');
}

export function comparisonRows(page,ids,assessments,inputs){
  const results=ids.map(id=>assessments.get(id)),rows=[];
  const row=(key,label,values)=>rows.push({key,label,values});
  row('state','Подходит ли вашему дню',results.map(r=>cell(stateLabels[r.state],r.checks.some(c=>c.kind==='time'&&c.status==='fail')?'Не укладывается в выбранные часы':'',r.state)));
  row('cost','Расходы на всех',results.map(r=>money(r.summary.cost_total,r.summary.cost_lower_bound)));
  row('deposit','Возвратный залог',results.map(r=>r.quote?.deposit.required===false?cell('Без залога'):money(r.quote?.deposit.total)));
  row('upfront','При получении / входе',results.map(r=>money(r.summary.upfront_total,r.summary.upfront_lower_bound)));
  row('time','Вместе с дорогой',results.map(r=>r.summary.total_minutes==null?cell(unknown,r.summary.known_minutes>0?`Известно: ${r.summary.known_minutes} мин`:'','unknown'):cell(`${r.summary.total_minutes} мин`)));
  row('return','Вернётесь к базе',results.map(r=>cell(clock(r.summary.departure),'',r.summary.departure==null?'unknown':'known')));
  row('calendar','Работа в выбранную дату',results.map(r=>calendar(r.rental?r.rental.pickup.calendar:r.visit.calendar)));
  if(results.some(r=>r.rental)){
    row('return-calendar','Возврат: часы в дату сдачи',results.map(r=>calendar(r.rental?.return_visit?.calendar)));
    const details=ids.map((id,i)=>new Map(rentalDetails({selection:inputs.get(id)},results[i]).map(v=>[v.label,v.value])));
    for(const label of ['Получить велосипед','Вернуть велосипед','Сдача завершена','Время по тарифу','Возврат в выбранном пункте'])row(`rental:${label}`,label,details.map(v=>cell(v.get(label)||unknown)));
  }
  for(const spec of page.facets)row(`profile:${spec.key}`,profileLabels[spec.key]||spec.label,ids.map(id=>property(spec,page.query.documents.find(d=>d.id===id)?.properties[spec.key])));
  for(const [kind,label] of Object.entries(conditionLabels))row(`condition:${kind}`,label,results.map(r=>condition(r.eligibility.checks.find(v=>v.kind===kind))));
  return rows;
}

function stored(storage,key){
  const raw=storage.getItem(key);
  if(raw===null)return {version:1,groups:{}};
  const value=JSON.parse(raw);
  if(value?.version!==1||!value.groups||Array.isArray(value.groups)||typeof value.groups!=='object'||Object.values(value.groups).some(ids=>!Array.isArray(ids)||ids.some(id=>typeof id!=='string')))throw Error('invalid_service_comparison_storage');
  return value;
}
export function readComparison(storage,key,group,knownIds){
  const ids=[...new Set(stored(storage,key).groups[group]||[])];
  return {ids:ids.filter(id=>knownIds.has(id)),removed:ids.filter(id=>!knownIds.has(id)).length};
}
export function writeComparison(storage,key,group,ids){
  let value;
  try{value=stored(storage,key);}catch{value={version:1,groups:{}};}
  value.groups[group]=[...new Set(ids)];
  storage.setItem(key,JSON.stringify(value));
}

export function bindServiceComparison(page,cards,onAdd){
  const panel=document.querySelector('[data-service-comparison]');
  if(!panel)return {update(){},dirty(){}};
  const group=`${page.query.selection.category}:${page.query.selection.area}`;
  const storageKey=`godune:service-comparison:${page.dataset||'editorial'}:v1`;
  const selected=new Set(),knownIds=new Set(cards.keys());
  const table=panel.querySelector('[data-comparison-table]'),notice=panel.querySelector('[data-comparison-notice]');
  const jump=document.querySelector('[data-open-comparison]');
  let assessments=new Map((page.assessments||[]).map(r=>[r.service_id,r])),inputs=new Map(page.inputs.map(v=>[v.service_id,v]));
  let visible=new Set(page.results.hits.map(v=>v.id)),pending=false,storageMessage='';
  const element=(tag,text,cls)=>{const node=document.createElement(tag);if(text!=null)node.textContent=text;if(cls)node.className=cls;return node;};
  function persist(){
    try{writeComparison(window.localStorage,storageKey,group,[...selected]);storageMessage='';}
    catch{storageMessage='Выбор остаётся на этой странице. Сохранить сравнение в браузере не удалось.';}
  }
  function restore(){
    try{
      const value=readComparison(window.localStorage,storageKey,group,knownIds);
      selected.clear();value.ids.forEach(id=>selected.add(id));
      storageMessage=value.removed?'Место больше не доступно в этом каталоге и убрано из сравнения.':'';
      if(value.removed){persist();storageMessage='Место больше не доступно в этом каталоге и убрано из сравнения.';}
    }catch{selected.clear();storageMessage='Сохранённое сравнение не удалось прочитать. Можно выбрать места заново.';}
  }
  function render(){
    const focused=document.activeElement;
    const focusKey=panel.contains(focused)?focused.dataset.comparisonFocus:null;
    const ids=[...selected].filter(id=>assessments.has(id));
    panel.hidden=selected.size===0;jump.hidden=selected.size===0;
    jump.textContent=`Сравнить (${selected.size})`;
    panel.querySelector('[data-comparison-count]').textContent=String(selected.size);
    for(const [id,card] of cards){const control=card.querySelector('[data-compare-service]');if(control)control.checked=selected.has(id);}
    notice.textContent=[pending?'Условия изменились. Пересчитайте подбор, чтобы обновить сравнение.':'',storageMessage,selected.size===1?'Выберите ещё одно место для сравнения.':''].filter(Boolean).join(' ');
    const head=element('thead'),header=element('tr'),corner=element('th','Ваш день');corner.scope='col';header.append(corner);
    for(const id of ids){
      const th=element('th'),choice=page.choices.find(v=>v.identity.service_id===id);th.scope='col';
      th.append(element('span',choice?.name||id,'service-comparison-name'));
      const input=inputs.get(id),visit=input.visit.input;
      th.append(element('span',`${visit.date} · ${visit.price?.selection.people??input.price?.selection.people??input.participants.party_size??input.participants.people?.length??'—'} чел.`,'service-comparison-context'));
      if(!visible.has(id))th.append(element('span','Не входит в текущий подбор','service-comparison-excluded'));
      const remove=element('button','Убрать','service-comparison-remove');remove.type='button';remove.ariaLabel=`Убрать из сравнения: ${choice?.name||id}`;remove.dataset.comparisonFocus=`remove:${id}`;
      remove.addEventListener('click',()=>{selected.delete(id);persist();render();});th.append(remove);header.append(th);
    }
    head.append(header);
    const body=element('tbody');
    if(ids.length)for(const row of comparisonRows(page,ids,assessments,inputs)){
      const tr=element('tr'),label=element('th',row.label);label.scope='row';tr.append(label);
      for(const value of row.values){const td=element('td');td.dataset.comparisonState=value.state;td.append(element('span',value.text));if(value.note)td.append(element('small',value.note));tr.append(td);}
      body.append(tr);
    }
    const foot=element('tfoot'),actions=element('tr');actions.append(element('td'));
    for(const id of ids){
      const td=element('td'),add=element('button','Добавить в день +','service-add-visit');add.type='button';add.dataset.comparisonFocus=`add:${id}`;
      add.disabled=pending||!visible.has(id);add.addEventListener('click',()=>onAdd(id,add));td.append(add);actions.append(td);
    }
    foot.append(actions);table.replaceChildren(element('caption','Стоимость, время и условия выбранных мест'),head,body,foot);
    if(focusKey){
      const next=[...panel.querySelectorAll('[data-comparison-focus]')].find(v=>v.dataset.comparisonFocus===focusKey);
      (next||(!panel.hidden?panel.querySelector('summary'):firstChoice()))?.focus({preventScroll:true});
    }
  }
  function firstChoice(){return [...cards.values()].find(card=>!card.hidden)?.querySelector('[data-compare-service]')||formButton();}
  function formButton(){return document.querySelector('[data-service-choice] [type=submit]');}
  for(const [id,card] of cards){
    const control=card.querySelector('[data-compare-service]');if(!control)continue;
    control.closest('label').hidden=false;
    control.addEventListener('change',()=>{if(control.checked)selected.add(id);else selected.delete(id);persist();render();});
  }
  jump.addEventListener('click',()=>{panel.open=true;panel.scrollIntoView({block:'start',behavior:'instant'});panel.querySelector('summary').focus({preventScroll:true});});
  panel.querySelector('[data-clear-comparison]').addEventListener('click',()=>{selected.clear();persist();render();firstChoice()?.focus();});
  window.addEventListener('storage',event=>{if(event.key===storageKey||event.key===null){restore();render();}});
  restore();render();
  return {
    update(results,nextAssessments,nextInputs){visible=new Set(results.hits.map(v=>v.id));if(nextAssessments)assessments=new Map(nextAssessments.map(v=>[v.service_id,v]));if(nextInputs)inputs=nextInputs;pending=false;render();},
    dirty(){pending=true;render();},
  };
}
