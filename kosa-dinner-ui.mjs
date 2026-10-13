import {validKosaDinner,dinnerStatus} from './kosa-dinner.mjs?v=2026101307';
import {validMenuChoice} from './trip-menu-choices-contract.mjs?v=2026101305';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const clock=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
const rub=n=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:2}).format(n/100);
const fish=/рыб|скумбр|судак|угор|лосос|осётр|треск|палтус|сельд|камбал|шпрот|тунец|горбуш|кревет|лосось/i;
export async function initKosaDinner({form,base,savedDay}){
  const root=form.querySelector('#kosa-dinner'),enabled=form.elements.dinner_enabled,fields=root.querySelector('fieldset'),hint=root.querySelector('[data-dinner-source]'),menu=root.querySelector('[data-dinner-menu]');
  const initial=savedDay?.kosa_plan?.dinner;
  let places=[],menus,choices=structuredClone(savedDay?.menu_choices?.filter(c=>c.place?.poi_id===initial?.place.id)||initial?.choices||[]);
  const change=()=>form.dispatchEvent(new Event('input',{bubbles:true}));
  enabled.checked=!!initial||new URL(location.href).searchParams.get('dinner')==='1';
  const status=root.querySelector('[data-dinner-status]');
  try{const r=await fetch(new URL('data/kosa-dinner.json',base));if(!r.ok)throw Error('hours_unavailable');const data=await r.json();if(data.version!==1||!Array.isArray(data.places))throw Error('hours_invalid');places=data.places;}
  catch{status.textContent='Часы ресторана не загрузились. Обновите страницу, чтобы собрать ужин.';enabled.checked=false;enabled.disabled=true;}
  const venue=form.elements.dinner_venue;
  for(const p of places){const o=el('option',p.name);o.value=p.id;venue.append(o);}
  if(initial){venue.value=initial.place.id;for(const [name,key]of [['dinner_walk','walk_minutes'],['dinner_minutes','minutes'],['dinner_buffer','order_buffer'],['dinner_to_train','to_train'],['dinner_to_home','to_home']])form.elements[name].value=initial[key]??'';form.elements.dinner_last_order.value=initial.last_order===null?'':clock(initial.last_order);form.elements.dinner_not_before.value=initial.not_before==null?'':clock(initial.not_before);}
  function sync(){
    fields.hidden=!enabled.checked;fields.disabled=!enabled.checked;
    const p=places.find(p=>p.id===venue.value);if(!p)return;
    hint.replaceChildren(el('span',p.id==='restoran-telegraf'?'Зал: ежедневно 12:00–23:00.':'Зал: пятница–воскресенье 09:00–21:00.'));
    const a=el('a','Источник · 13 октября');a.href=p.source.url;a.target='_blank';a.rel='noopener';hint.append(a);
    form.elements.dinner_to_train.closest('label').hidden=form.elements.city.value!=='kaliningrad';
  }
  venue.addEventListener('change',()=>{choices=[];form.elements.dinner_last_order.value='';menu.replaceChildren();sync();change();});
  enabled.addEventListener('change',sync);form.elements.city.addEventListener('change',sync);
  const load=root.querySelector('[data-dinner-load]');
  async function drawMenu(){
    if(!menus){const r=await fetch(new URL('data/gastro-menu-choices.json',base));if(!r.ok)throw Error('menu_unavailable');menus=await r.json();}
    const rows=menus.venues?.[venue.value];if(!rows?.length||!rows.every(validMenuChoice))throw Error('menu_invalid');
    menu.replaceChildren();const picker=el('select');picker.id='kosa-dinner-dish';const label=el('label','Блюдо из меню');label.htmlFor=picker.id;
    picker.append(el('option','Выберите блюдо…'));picker.firstChild.value='';
    const sorted=[...rows.filter(r=>fish.test(r.name)),...rows.filter(r=>!fish.test(r.name))];
    for(const row of sorted){const o=el('option',row.name+(row.price.amount_kopecks!==null?' · '+rub(row.price.amount_kopecks):''));o.value=row.menu_item_id;picker.append(o);}
    label.append(picker);menu.append(label);
    const list=el('ul',undefined,'kosa-dinner-dishes');menu.append(list);
    function draw(){list.replaceChildren();for(const c of choices){const li=el('li'),name=el('strong',c.name),qtyLabel=el('label','Порций'),qty=el('input');qty.type='number';qty.min='1';qty.max='99';qty.step='1';qty.value=c.quantity;qty.setAttribute('aria-label','Порций: '+c.name);qtyLabel.append(qty);
      qty.required=true;qty.addEventListener('input',()=>{const n=Number(qty.value);if(Number.isInteger(n)&&n>=1&&n<=99){c.quantity=n;change();}});
      const remove=el('button','Убрать');remove.type='button';remove.setAttribute('aria-label','Убрать '+c.name);remove.addEventListener('click',()=>{choices=choices.filter(v=>v.menu_item_id!==c.menu_item_id);draw();change();});
      li.append(name,el('small',c.price.amount_kopecks!==null?`${rub(c.price.amount_kopecks)} за порцию · меню на ${c.price.observed_at}`:'Цена в меню не указана'),qtyLabel,remove);list.append(li);}}
    picker.addEventListener('change',()=>{const row=rows.find(r=>r.menu_item_id===picker.value);if(row&&!choices.some(c=>c.menu_item_id===row.menu_item_id))choices.push({...structuredClone(row),selected_at:new Date().toISOString()});draw();picker.value='';change();});
    draw();load.textContent='Обновить выбор блюд';status.textContent='Блюда и количество порций попадут в этот день и его PDF.';
  }
  load.addEventListener('click',async()=>{load.disabled=true;try{await drawMenu();}catch{status.textContent='Меню не загрузилось. Выбранные блюда на месте; попробуйте ещё раз.';}finally{load.disabled=false;}});
  if(choices.length)drawMenu().catch(()=>{status.textContent='Выбранные блюда сохранены. Меню можно загрузить ещё раз.';});
  sync();
  return {read(date){if(!enabled.checked)return undefined;const number=n=>Number(form.elements[n].value),last=form.elements.dinner_last_order.value;
      const before=form.elements.dinner_not_before.value;
      const value={version:1,place:structuredClone(places.find(p=>p.id===venue.value)),walk_minutes:number('dinner_walk'),minutes:number('dinner_minutes'),not_before:before?Number(before.slice(0,2))*60+Number(before.slice(3)):null,order_buffer:number('dinner_buffer'),last_order:last?Number(last.slice(0,2))*60+Number(last.slice(3)):null,to_train:number('dinner_to_train'),to_home:form.elements.dinner_to_home.value===''?null:number('dinner_to_home'),choices:choices.map(c=>({...structuredClone(c),planned_date:date}))};
      if(!validKosaDinner(value))throw Error('Проверьте время ужина и количество порций.');return value;},
    render(result,book){if(!book.dinner)return;const d=book.dinner,p=d.plan.place,section=el('section',undefined,'kosa-dinner-card');section.dataset.dinnerState=d.state;
      section.append(el('p','После косы — на рыбной волне','eyebrow'),el('h4',p.name),el('p',p.address));
      const times=el('dl');for(const [label,value]of [['У ресторана',d.arrival===null?'Уточнить':clock(d.arrival)],['Ужин',d.start===null?'Уточнить':`${clock(d.start)}–${clock(d.end)}`],['Последний заказ',d.plan.last_order===null?'Уточнить кухню':clock(d.plan.last_order)+' · указано вами']]){const row=el('div');row.append(el('dt',label),el('dd',value));times.append(row);}section.append(times,el('p',dinnerStatus(d),'kosa-dinner-verdict'));
      if(d.return_state==='no_train')section.append(el('p','После ужина электричка не подобрана. Вернитесь с косы раньше или выберите другой транспорт.','kosa-plan-warning'));
      if(d.plan.choices.length){const ul=el('ul',undefined,'kosa-dinner-selection');for(const c of d.plan.choices)ul.append(el('li',`${c.name} × ${c.quantity}${c.price.amount_kopecks!==null?' · '+rub(c.price.amount_kopecks*c.quantity):''}`));section.append(ul);const known=d.plan.choices.filter(c=>c.price.amount_kopecks!==null).reduce((s,c)=>s+c.price.amount_kopecks*c.quantity,0);section.append(el('p',`${rub(known)} — выбранные порции по сохранённому меню.`));}
      const links=el('div',undefined,'kosa-dinner-actions'),call=el('a','Позвонить в ресторан');call.href='tel:'+p.phone;const edit=el('button','Уточнить кухню и блюда ↑');edit.type='button';edit.addEventListener('click',()=>{form.elements.dinner_last_order.closest('details').open=true;root.scrollIntoView({block:'start',behavior:'instant'});form.elements.dinner_last_order.focus({preventScroll:true});});links.append(call,edit);section.append(links);result.append(section);
    }};
}
