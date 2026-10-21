import {intentOptions,intentPlan,validIntent} from './planner-intent-state.mjs?v=2026102101';
import {requestPlannerIntent} from './planner-intent-service.mjs?v=2026102101';
import {contextualProfile,emptyProfile} from './personalization-state.mjs?v=2026101904';
import {DAY_INTERESTS} from './day-preferences.mjs?v=2026101305';

export function initPlannerIntent({mount,workshop,catalog,base,wizardReady,profileReady}){
  if(!mount)return null;
  const $=s=>mount.querySelector(s),form=$('[data-intent-form]'),input=$('[data-intent-input]'),submit=form.querySelector('button[type=submit]'),status=$('[data-intent-status]'),output=$('[data-intent-output]');
  const options=intentOptions(catalog);
  let draft=null,sequence=0,controller=null,unsubscribe=null;
  wizardReady.then(wizard=>{unsubscribe=wizard?.onManualIntent?.(()=>{
    sequence++;controller?.abort();controller=null;busy(false);output.replaceChildren();
    announce('Продолжайте в готовом плане ниже. Чтобы снова разобрать пожелания, отправьте запрос.');
  });});
  const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
  const announce=text=>{status.textContent=text;};
  const busy=value=>{mount.toggleAttribute('aria-busy',value);submit.disabled=value;};
  const label=(parent,title,field)=>{const el=node('label',title);el.append(field);parent.append(el);return field;};
  const field=(name,type,value='')=>{const el=node('input');el.name=name;el.type=type;el.value=value;el.required=true;return el;};
  const select=(name,rows,value)=>{const el=node('select');el.name=name;el.required=true;el.append(new Option('Выберите',''));for(const [id,name]of rows)el.append(new Option(name,id));el.value=value??'';return el;};
  const clock=n=>n===null?'':`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
  const minute=text=>{const [h,m]=text.split(':').map(Number);return h*60+m;};
  async function begin(){
    const ticket=++sequence;controller?.abort();controller=null;output.replaceChildren();busy(true);
    const wizard=await wizardReady;
    if(ticket!==sequence)return null;
    if(!wizard?.invalidatePreview||!wizard.invalidatePreview())throw Error('intent_wizard');
    return {ticket,wizard,epoch:wizard.getIntentEpoch?.()};
  }
  function summary(){
    const area=options.areas.find(a=>a.id===draft.area)?.name;
    const parts=[draft.day_count?`${draft.day_count} ${draft.day_count===1?'день':'дня'}`:null,area,draft.date,draft.start!==null&&draft.end!==null?`${clock(draft.start)}–${clock(draft.end)}`:null,...draft.interests.map(i=>DAY_INTERESTS[i]),draft.exclude_interests.length?'Без: '+draft.exclude_interests.map(i=>DAY_INTERESTS[i]).join(', '):null].filter(Boolean);
    const p=node('p',parts.join(' · '));p.dataset.intentSummary='';output.append(p);
  }
  function questions(slots){
    const q=node('form');q.dataset.intentQuestions='';q.append(node('h3','Уточним перед расчётом'));
    let blocked=false;
    for(const slot of slots){
      const group=node('fieldset');group.dataset.intentQuestion=slot;
      const titles={day_count:'На сколько дней?',area:'Где начнём?',date:'Какого числа?',time_window:'Во сколько начнём и вернёмся?',party:'Сколько взрослых и детей?',transport:'Как передвигаемся?',selection:'Условия пока не складываются в готовый план'};
      group.append(node('legend',titles[slot]));
      if(slot==='day_count')label(group,'Дни',select(slot,[['1','Один день'],['2','Два дня']],draft.day_count));
      if(slot==='area')label(group,'Начало поездки',select(slot,options.areas.map(a=>[a.id,a.name]),draft.area));
      if(slot==='date')label(group,'Дата первого дня',field('date','date',draft.date||''));
      if(slot==='time_window'){label(group,'Начало',field('start','time',clock(draft.start)));label(group,'Вернуться до',field('end','time',clock(draft.end===1440?1439:draft.end)));}
      if(slot==='party')for(const [key,title]of [['adults','Взрослые'],['children','Дети']]){const el=field(key,'number',draft.party?.[key]??'');el.min='0';el.max='4294967295';el.step='1';label(group,title,el);}
      if(slot==='transport')label(group,'Транспорт',select(slot,[['no_car','Без машины'],['foot','Только пешком'],['car','На машине'],['rail','С электричкой'],['bus','С автобусом'],['auto','Как в готовом плане']],draft.transport));
      if(slot==='selection'){
        blocked=true;
        group.append(node('p',draft.interests.some(i=>draft.exclude_interests.includes(i))?'В запросе один интерес одновременно выбран и исключён. Напишите выше, какой вариант оставить.':'Для этого места, числа дней и исключений подходящего готового блока пока нет. Измените пожелания в поле выше или выберите прогулку вручную.'));
      }
      q.append(group);
    }
    if(!blocked){const button=node('button','Посмотреть план');button.type='submit';button.className='wizard-primary';q.append(button);}
    q.addEventListener('submit',async event=>{
      event.preventDefault();if(blocked||!q.reportValidity())return;
      const next=structuredClone(draft),values=new FormData(q);
      for(const slot of slots){
        if(slot==='day_count')next.day_count=Number(values.get(slot));
        if(slot==='area'||slot==='date'||slot==='transport')next[slot]=values.get(slot);
        if(slot==='time_window'){next.start=minute(values.get('start'));next.end=minute(values.get('end'));}
        if(slot==='party')next.party={adults:Number(values.get('adults')),children:Number(values.get('children'))};
      }
      if(next.party&&['solo','couple'].includes(next.travel_party)&&next.party.adults+next.party.children!==(next.travel_party==='solo'?1:2))next.travel_party='unknown';
      if(next.selection&&(next.area!==draft.area||next.day_count!==draft.day_count))next.selection=null;
      if(!validIntent(next,options)){announce('Проверьте время и число путешественников. Конец дня должен быть позже начала.');return;}
      next.unresolved=next.unresolved.filter(slot=>!slots.includes(slot));
      draft=next;
      try{const run=await begin();if(run)await present(run);}catch{announce('Расчёт пока не открылся. Готовые прогулки доступны ниже.');}finally{busy(false);}
    });
    output.append(q);announce(blocked?'Уточните пожелания в поле запроса.':'Ответьте на вопросы — затем покажем готовый план.');
    q.querySelector('input,select')?.focus({preventScroll:true});
  }
  async function present({ticket,wizard,epoch}){
    if(ticket!==sequence)return;
    const handle=await Promise.race([Promise.resolve(profileReady).catch(()=>null),new Promise(resolve=>setTimeout(()=>resolve(null),250))]);
    if(ticket!==sequence)return;
    const profile=contextualProfile(handle?.get().record||emptyProfile(),workshop.getState(),catalog);
    summary();const plan=intentPlan(draft,workshop.getState(),catalog,profile);
    if(plan.questions.length){questions(plan.questions);return;}
    const limits=node('div');limits.dataset.intentLimits='';for(const note of plan.notes)limits.append(node('p',note));output.append(limits);
    announce('Считаем дорогу и время по выбранному плану…');
    if(epoch!==wizard.getIntentEpoch?.())return;
    const result=await wizard.previewIntent(plan.answers,{notes:plan.notes,epoch});
    if(ticket!==sequence)return;
    if(!result.ready){announce('На эти условия план пока не рассчитан. Проверьте дату, рейсы и время в готовом плане ниже.');return;}
    const p=node('p',`Готовый блок: ${plan.selection.name}. Просмотрите остановки ниже и сохраните, если план подходит.`);p.dataset.intentReady='';output.append(p);
    announce('План открыт ниже. Сохранение — отдельной кнопкой.');
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(!form.reportValidity()||!input.value.trim())return;
    let ticket;
    try{
      const run=await begin();if(!run)return;ticket=run.ticket;
      announce('ИИ разбирает пожелания…');controller=new AbortController();
      const value=await requestPlannerIntent({text:input.value,draft,options,base,signal:controller.signal});
      if(ticket!==sequence)return;draft=value.intent;await present(run);
    }catch(error){
      if(ticket!==undefined&&ticket!==sequence)return;
      const copy={intent_unavailable:'ИИ сейчас недоступен. Выберите готовый день ниже или повторите запрос позже.',intent_timeout:'ИИ не ответил вовремя. Повторите запрос или выберите готовый день ниже.',intent_invalid:'Ответ ИИ не удалось проверить. Повторите запрос или выберите готовый день ниже.'};
      announce(copy[error.message]||'Запрос не завершён. Повторите его или выберите готовый день ниже.');
    }finally{if(ticket===undefined||ticket===sequence)busy(false);}
  });
  // Editing also invalidates an old save before the next network request is sent.
  input.addEventListener('input',()=>{
    const ticket=++sequence;controller?.abort();controller=null;busy(false);output.replaceChildren();
    wizardReady.then(w=>{if(ticket===sequence)w?.invalidatePreview?.();});announce('Пожелания изменены. Отправьте запрос, чтобы пересчитать план.');
  });
  submit.disabled=false;mount.dataset.intentReady='true';
  return {destroy(){sequence++;controller?.abort();unsubscribe?.();}};
}
