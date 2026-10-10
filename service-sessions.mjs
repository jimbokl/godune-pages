// Published slots are resolved by Rust. This module only carries the user's choice.
const hex=value=>[...new TextEncoder().encode(value)].map(v=>v.toString(16).padStart(2,'0')).join('');
export const sessionName=service=>`session:${hex(service)}`;
export const sessionKey=key=>/^sr_session:(?:[0-9a-f]{2})+$/.test(key);
export const sessionBelongsTo=(key,service)=>key===`sr_${sessionName(service)}`;
export const sessionValue=slot=>`${slot.start}:${slot.duration}`;

export function withSessionChoice(input,fields) {
  const name=sessionName(input.service_id);
  if(input.visit.kind==='rental'||!fields.has(name))return input;
  const raw=String(fields.get(name)),visit=input.visit.input;
  if(raw===''){visit.session_start=null;return input;}
  if(!/^\d+:\d+$/.test(raw))throw Error('Проверьте начало занятия в ссылке.');
  const [start,duration]=raw.split(':').map(Number);
  if(![start,duration].every(v=>Number.isSafeInteger(v)&&v<=4294967295)||duration===0)throw Error('Проверьте начало занятия в ссылке.');
  visit.session_start=start;visit.timing.activity=duration;
  if(input.price)input.price.selection.duration_minutes=duration;
  return input;
}

const clock=value=>`${String(Math.floor(value/60)%24).padStart(2,'0')}:${String(value%60).padStart(2,'0')}${value>=1440?' следующего дня':''}`;
export function sessionPresentation(result,input) {
  const visit=input.visit.input,start=visit.session_start;
  const slots=(result.visit.calendar?.sessions||[]).filter(slot=>slot.start>=0);
  const selected=start==null?'':sessionValue({start,duration:visit.timing.activity});
  const published=slots.some(slot=>sessionValue(slot)===selected);
  const late=result.visit.issues.find(issue=>issue.code==='session_missed');
  let message;
  if(selected&&!published)message=`Выбрано ${clock(start)}. На эту дату такого занятия нет в расписании — выберите другое время.`;
  else if(late)message=`К началу не успеваете${late.minutes==null?'':`: опоздание ${late.minutes} мин`}. Выберите другое время или начните путь раньше.`;
  else if(selected)message=`Начало в ${clock(start)} · ${visit.timing.activity} мин. Запись — у организатора.`;
  else if(slots.length)message='Выберите время начала. Продолжительность возьмём из расписания.';
  else message=result.visit.calendar?.coverage==='known'?'На эту дату занятий нет. Выберите другой день.':'Расписание на эту дату нужно уточнить.';
  return {slots,selected,message,conflict:!!selected&&(!published||!!late)};
}

export function renderSessionChoices(card,result,input) {
  const panel=card.querySelector('[data-session-picker]');if(!panel)return;
  const view=sessionPresentation(result,input),list=panel.querySelector('[data-session-options]');
  const focused=panel.contains(document.activeElement)?document.activeElement.dataset.sessionValue:null;
  const nodes=view.slots.map(slot=>{
    const button=document.createElement('button'),duration=document.createElement('small');
    button.type='button';button.className='service-session-option';button.dataset.sessionValue=sessionValue(slot);
    button.setAttribute('aria-pressed',String(view.selected===sessionValue(slot)));button.textContent=clock(slot.start);
    duration.textContent=`${slot.duration} мин`;button.append(duration);return button;
  });
  list.replaceChildren(...nodes);
  const note=panel.querySelector('[data-session-status]');note.textContent=view.message;note.dataset.conflict=String(view.conflict);
  panel.querySelector('[data-session-clear]').hidden=!view.selected;
  if(focused!=null)list.querySelector(`[data-session-value="${focused}"]`)?.focus({preventScroll:true});
}
