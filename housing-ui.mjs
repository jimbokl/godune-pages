import {housingContext,housingInput,applyHousing,housingLock,housingMode} from './housing-state.mjs?v=2';
import {journeyDays} from './trip-days-state.mjs?v=12';
import {baseName} from './personal-points.mjs?v=3';
import {TRAVEL_MODES} from './travel-estimates.mjs?v=6';
import {loadScheduler} from './trip-scheduler.mjs?v=14';
import {pickPersonalPoint} from './personal-point-picker.mjs?v=6';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const minutes=n=>n===null?'Путь ещё нужно уточнить':n<60?`${n} мин`:`${Math.floor(n/60)} ч${n%60?` ${n%60} мин`:''}`;
const date=d=>d?new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z')):'Дата не выбрана';
export async function initHousing(base,workshop,catalog) {
  const root=document.querySelector('#housing-engine'),status=root.querySelector('#housing-status'),daysNode=root.querySelector('#housing-days'),address=root.querySelector('#housing-address-result');
  const response=await fetch(new URL('data/housing.json',base),{cache:'no-cache'});if(!response.ok)throw Error('housing_data');
  const data=await response.json();if(data.version!==1||!data.items?.every(c=>catalog.poi.some(p=>p.slug===c.point)))throw Error('housing_data');
  const engine=await loadScheduler(base);
  let selected=new Set(),personal=null,sequence=0,comparisonContext='';
  const read=()=>workshop.getState(),ids=()=>journeyDays(read()).filter(d=>selected.has(d.id)).map(d=>d.id);
  function renderDays() {
    const trip=read(),days=journeyDays(trip),known=new Set(days.map(d=>d.id));
    selected=new Set([...selected].filter(id=>known.has(id)));
    if(!selected.size)selected=new Set(days.filter(d=>d.places.length).map(d=>d.id));
    if(!selected.size)selected.add(days[0].id);
    daysNode.replaceChildren(...days.map((d,i)=>{
      const label=el('label',undefined,'housing-day'),check=el('input');check.type='checkbox';check.value=d.id;check.checked=selected.has(d.id);
      const text=el('span');text.append(el('strong',`День ${i+1} · ${date(d.date)}`),el('small',`${TRAVEL_MODES[housingMode(d)]} · ${d.places.length} остановок`));label.append(check,text);return label;
    }));
  }
  const cards=()=>[...root.querySelectorAll('[data-housing-id]')];
  function candidateFor(id){return id==='personal'?personal:data.items.find(c=>c.id===id);}
  async function compare() {
    const ticket=++sequence,trip=read(),chosen=ids(),candidates=[...data.items,...(personal?[personal]:[])];
    comparisonContext=housingContext(trip,chosen);
    cards().forEach(card=>{card.querySelector('.housing-road').textContent='Считаем дорогу…';card.querySelector('.housing-breakdown').replaceChildren();});
    root.dataset.housingReady='loading';status.textContent='Считаем дорогу от базы к первой и от последней остановки.';
    try {
      const input=await housingInput(base,trip,chosen,candidates,catalog),rows=engine.housing(input);
      if(ticket!==sequence||housingContext(read(),chosen)!==comparisonContext)return;
      const complete=rows.filter(r=>r.total_minutes!==null),least=complete.length?Math.min(...complete.map(r=>r.total_minutes)):null;
      for(const card of cards()) {
        const row=rows.find(r=>r.id===card.dataset.housingId);if(!row)continue;
        card.querySelector('.housing-road').textContent=row.total_minutes===null?`Уточнить ${row.unknown_legs} участков · известная часть ${minutes(row.known_minutes)}`:`${minutes(row.total_minutes)} дороги за ${chosen.length} ${chosen.length===1?'день':'дн.'}`;
        card.dataset.housingLeast=String(least!==null&&row.total_minutes===least);
        const breakdown=card.querySelector('.housing-breakdown');
        row.days.forEach(leg=>{const index=journeyDays(trip).findIndex(d=>d.id===leg.id);breakdown.append(el('li',`День ${index+1}: к первой точке ${minutes(leg.outbound)} · обратно ${minutes(leg.return_trip)}`));});
      }
      const arrival=journeyDays(trip).filter(d=>chosen.includes(d.id)).some(d=>d.bookings?.some(b=>b.binding==='start'&&b.status!=='cancelled'));
      status.textContent=`Сравнение готово.${arrival?' Связанное прибытие сохраняет начало своего дня.':''} Меньше дороги — только один довод: смотрите путь каждого дня.`;
      root.dataset.housingReady='true';
    }catch(error){if(ticket!==sequence)return;status.textContent=error.message==='Выберите дни с остановками.'?'Сначала добавьте остановки в выбранные дни. Базу можно отметить уже сейчас.':'Дорога пока не рассчитана. Можно выбрать базу; её путь проверьте в планировщике.';cards().forEach(c=>c.querySelector('.housing-road').textContent='Добавьте остановки для сравнения');root.dataset.housingReady='empty';}
  }
  function preview(candidate) {
    const trip=read(),chosen=ids(),expected=housingContext(trip,chosen),lastFocus=document.activeElement;
    if(!chosen.length){status.textContent='Выберите хотя бы один день.';return;}
    const dialog=el('dialog',undefined,'housing-dialog');dialog.setAttribute('aria-labelledby','housing-preview-title');
    const top=el('div',undefined,'dialog-top'),kicker=el('p','База вашей поездки','eyebrow'),close=el('button','×','icon-button');close.type='button';close.setAttribute('aria-label','Закрыть выбор базы');top.append(kicker,close);
    const title=el('h2',candidate.name);title.id='housing-preview-title';const form=el('form'),list=el('div',undefined,'housing-changes'),message=el('p','Выберите, какие ориентиры заменить. Места, даты, расходы и записи поездки останутся на своих местах.','housing-preview-note');
    for(const day of journeyDays(trip).filter(d=>chosen.includes(d.id))) {
      const section=el('fieldset'),legend=el('legend',`День ${journeyDays(trip).findIndex(d=>d.id===day.id)+1} · ${date(day.date)}`);section.append(legend);
      for(const [role,caption]of [['start_at','Начало'],['night_at','К ночи']]){
        const lock=housingLock(day,role),label=el('label'),check=el('input');check.type='checkbox';check.name='change';check.value=`${day.id}/${role}`;check.disabled=!!lock;check.checked=!lock;const text=el('span',lock?`${caption} уже связано с «${lock.name}». Измените запись в планировщике.`:`${caption}: ${day[role]?baseName(day[role],catalog):'не выбрано'} → ${candidate.name}`);label.append(check,text);section.append(label);
      }list.append(section);
    }
    const error=el('p','', 'housing-error');error.setAttribute('role','alert');const actions=el('div',undefined,'housing-actions'),save=el('button','Применить к выбранным дням →','button button-dark'),cancel=el('button','Вернуться','button button-light');save.type='submit';cancel.type='button';actions.append(save,cancel);form.append(list,error,actions);dialog.append(top,title,message,form);document.body.append(dialog);
    const dispose=()=>{dialog.close();dialog.remove();lastFocus?.focus({preventScroll:true});};close.onclick=dispose;cancel.onclick=dispose;dialog.addEventListener('cancel',e=>{e.preventDefault();dispose();});
    form.onsubmit=async event=>{
      event.preventDefault();const changes=[...form.querySelectorAll('input:checked:not(:disabled)')].map(n=>{const [day,role]=n.value.split('/');return {day,role};});
      if(!changes.length){error.textContent='Выберите хотя бы один ориентир. Связанные записи можно изменить в планировщике.';return;}
      save.disabled=true;let result;
      try{await workshop.setState(current=>{result=applyHousing(current,candidate.point,changes,expected,chosen);return result.state;},'База сохранена в выбранных днях.');
        if(result.stale||result.invalid){error.textContent=result.stale?'Поездка уже изменилась. Закройте выбор и посмотрите свежие дни.':'Один из ориентиров связан с записью. Проверьте планировщик.';return;}
        dispose();status.textContent=workshop.isSaved()?'База сохранена. Уточните адрес жилья и время в планировщике.':'База выбрана, но браузер не сохраняет поездку. Скачайте файл в планировщике.';
      }catch{error.textContent='Не удалось сохранить. Выбор остаётся в форме; попробуйте ещё раз.';}finally{save.disabled=false;}
    };dialog.showModal();title.tabIndex=-1;title.focus();
  }
  function personalCard(candidate) {
    const card=el('article',undefined,'housing-personal');card.dataset.housingId='personal';card.append(el('p','Ваш адрес','eyebrow'),el('h3',candidate.name),el('p','Дорога начинается на ближайшем подходящем дорожном сегменте. Подход от двери пока не учтён.','housing-caption'),el('p','Считаем дорогу…','housing-road'));
    const details=el('details'),summary=el('summary','Путь по дням'),list=el('ul',undefined,'housing-breakdown');details.append(summary,list);const button=el('button','Использовать этот адрес →','button button-dark');button.type='button';button.dataset.housingChoose='personal';card.append(details,button);return card;
  }
  root.addEventListener('click',async event=>{
    const choose=event.target.closest('[data-housing-choose]');if(choose){const c=candidateFor(choose.dataset.housingChoose);if(c)preview(c);return;}
    if(event.target.closest('#housing-pick')){
      const point=await pickPersonalPoint({base,initial:personal?.point,caption:'Проверить адрес жилья',focusPlace:catalog.poi.find(p=>p.slug===read().places[0]),saveLabel:'Сравнить этот адрес →',privacyText:'Пока это пример для сравнения. В поездку адрес попадёт, когда вы выберете дни и нажмёте «Применить».'});
      if(!point)return;personal={id:'personal',name:point.name,point};address.replaceChildren(personalCard(personal));await compare();
    }
  });
  daysNode.onchange=()=>{selected=new Set([...daysNode.querySelectorAll('input:checked')].map(n=>n.value));compare();};
  root.querySelector('#housing-compare').onclick=compare;
  window.addEventListener('godune:trip-change',()=>{renderDays();compare();});
  window.addEventListener('godune:memory-cleared',()=>{personal=null;selected.clear();address.replaceChildren();renderDays();compare();});
  root.querySelectorAll('[data-housing-choose],#housing-pick,#housing-compare').forEach(b=>b.disabled=false);
  renderDays();await compare();
}
