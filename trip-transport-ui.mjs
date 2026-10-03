import {defaultExcursion,parseDepartures,transportOptions,resolveExcursion,validExcursion} from './trip-transport-state.mjs?v=2';
import {updateSchedule} from './trip-schedule-state.mjs?v=9';

const line = (text,cls) => {const node=document.createElement('p');node.textContent=text;if(cls)node.className=cls;return node;};
const time = (value,clock) => value===null || value===undefined ? 'время пока неизвестно' : clock(value);
export function transportCard({trip,item,place,catalog,clock}) {
  const options=transportOptions(catalog,item.id), saved=trip.schedule?.stops[item.id]?.excursion;
  if(!options.length && !saved)return null;
  const card=document.createElement('section');card.className='trip-transport trip-visit-calendar';card.dataset.transportPoint=item.id;
  const title=document.createElement('h4');title.textContent=saved?'Переправа в вашем дне':'За проливом — ещё один берег';card.append(title);
  if(!saved) {
    card.append(line('Добавьте прогулку по Балтийской косе после этой остановки. В расчёт войдут оба рейса и возвращение к этой точке.'));
    for(const option of options) {const button=document.createElement('button');button.type='button';button.className='save-item';button.dataset.transportAdd=item.id;button.dataset.transportService=option.id;button.textContent='Добавить переправу и прогулку';card.append(button);}
    return card;
  }
  const resolved=resolveExcursion(trip,item.id,catalog), result=item.excursion;
  card.dataset.transportStatus=result?.conflict?'conflict':result?.complete?'scheduled':'incomplete';
  const notice={choose_date:'Выберите дату: свои рейсы и время пути сохраняются для конкретного дня.',missing_service:'Прежней переправы больше нет в каталоге. Ваши настройки сохранились; расписание нужно уточнить.',outside_validity:'Прежнее расписание не действует на этот день. Уточните рейсы заново.',stale_estimates:'Дата или способ передвижения изменились. Прежние транспортные оценки сохранены, но в этот расчёт не входят. Введите их заново.'}[resolved.reason];
  if(notice)card.append(line(notice,'trip-transport-warning'));
  if(resolved.service)card.append(line(resolved.service.note));
  if(resolved.service?.pier_address)card.append(line(`Причал: ${resolved.service.pier_address}. Путь от «${place.name}» к причалу и обратно задайте по своей прогулке.`));
  if(result) {
    const list=document.createElement('ol');list.className='trip-transport-timeline';
    const texts=[`К причалу — ${result.approach===null?'время пути нужно уточнить':result.approach+' мин'}.`,
      `Из Балтийска: ${time(result.outward.departure,clock)}. Прибыть к причалу минимум за ${saved.boarding} мин до рейса — ваш запас на посадку.`,
      `На косе — ${result.shore} мин, включая возвращение к её причалу.`,
      `С косы: ${time(result.inbound.departure,clock)}.`,
      `Вернуться к «${place.name}»: ${time(result.finish,clock)}.`];
    for(const text of texts){const li=document.createElement('li');li.textContent=text;list.append(li);}card.append(list);
    if(result.inbound.last_departure!==null) {
      const deadline=result.inbound.latest_ready===null?'Запас на посадку больше оставшегося времени.':`У её причала — до ${clock(result.inbound.latest_ready)} с вашим запасом.`;
      card.append(line(`Последний обратный рейс по ${resolved.origins.inbound==='manual'?'вашему расписанию':'источнику'}: ${clock(result.inbound.last_departure)}. ${deadline}`,'trip-transport-last'));
    } else card.append(line('Последний обратный рейс пока неизвестен. Начало кругового рейса из Балтийска не заменяет время посадки с косы.','trip-transport-warning'));
    for(const [key,label]of [['outward','Из Балтийска'],['inbound','С косы']]) {
      const row=result[key], schedule=resolved.input[key];
      if(['missed_last','no_departures'].includes(row.state))card.append(line(row.state==='missed_last'?`${label}: последний рейс уже не подходит. Измените начало дня, время прогулки или порядок остановок.`:`${label}: на выбранную дату рейсов нет по заданному расписанию.`,'trip-transport-warning'));
      const available=line(schedule.departures===null?`${label}: расписание нужно уточнить.`:`${label} · ${resolved.origins[key]==='manual'?'ваши рейсы':resolved.exception?'изменение на дату':'обычные рейсы'}: ${schedule.departures.map(clock).join(' · ') || 'рейсов нет'}`);
      available.dataset.transportDirection=key;card.append(available);
      if(schedule.duration===null)card.append(line(`${label}: длительность одного перехода пока неизвестна.`,'trip-calendar-source'));
    }
  }
  if(resolved.source) {
    const source=line('','trip-calendar-source'),link=document.createElement('a');link.href=resolved.source.url;link.target='_blank';link.rel='noopener';link.textContent=resolved.source.name;
    source.append(link,` · проверено ${resolved.source.checked_at.split('-').reverse().join('.')}`);card.append(source);
  }
  card.append(line('Сохранённое расписание помогает собрать день. Наличие билетов, очередь и работу переправы в погоду поездки сверьте с перевозчиком. Личные оценки не подтверждают рейс.','trip-calendar-source'));
  const details=document.createElement('details'),summary=document.createElement('summary');details.dataset.transportEditor=item.id;summary.textContent='Уточнить рейсы и время';details.append(summary);
  const form=document.createElement('form');form.className='trip-stop-settings trip-transport-settings';form.dataset.transportEdit=item.id;form.dataset.transportDate=trip.date || '';form.dataset.transportMode=trip.schedule?.mode || 'foot';form.dataset.transportDay=trip.itinerary?.active || '';form.dataset.transportService=saved.service;
  const values=resolved.sameDate?saved:defaultExcursion(saved.service,trip);
  for(const [key,caption]of [['shore','На косе с возвращением к причалу, мин'],['boarding','Ваш запас перед каждым рейсом, мин'],['approach','От этой точки к причалу, мин'],['return_walk','От причала обратно к этой точке, мин'],['outward_duration','Переправа на косу, мин'],['inbound_duration','Переправа обратно, мин'],['outward_departures','Ваши рейсы из Балтийска'],['inbound_departures','Ваши рейсы с косы']]) {
    const label=document.createElement('label'),input=document.createElement('input');label.textContent=caption;input.name=key;
    input.type=key.endsWith('_departures')?'text':'number';input.dataset.planField=key;input.dataset.planStop=item.id;
    if(input.type==='number') {input.min=key.endsWith('_duration')?'1':'0';input.max='1440';input.step='1';input.inputMode='numeric';input.required=['shore','boarding'].includes(key);}
    else {input.placeholder='10:00 12:00 14:00';input.autocomplete='off';}
    input.value=Array.isArray(values[key]) ? values[key].length?values[key].map(clock).join(' '):'нет' : values[key] ?? '';
    if(['shore','boarding'].includes(key))input.value=saved[key];label.append(input);form.append(label);
  }
  const note=line('Рейсы — через пробел. «Нет» означает отсутствие рейсов; пустое поле возвращает источник, если он есть. Прогулка на косе включает путь обратно к её причалу.','trip-plan-note');
  const button=document.createElement('button');button.type='submit';button.className='save-item';button.textContent='Сохранить переправу';form.append(note,button);details.append(form);card.append(details);
  const remove=document.createElement('button');remove.type='button';remove.className='button button-light';remove.dataset.transportRemove=item.id;remove.textContent='Убрать переправу из дня';card.append(remove);return card;
}

export function bindTransport({section,read,commit,catalog,feedback}) {
  section.addEventListener('click',event=>{
    const add=event.target.closest('[data-transport-add]'),remove=event.target.closest('[data-transport-remove]');
    if(!add && !remove)return;
    const id=add?.dataset.transportAdd || remove.dataset.transportRemove;
    commit(current=>{
      if(add && !transportOptions(catalog,id).some(row=>row.id===add.dataset.transportService))return current;
      return updateSchedule(current,'excursion',add?defaultExcursion(add.dataset.transportService,current):null,id);
    },add?'Переправа добавлена. Уточните обратные рейсы и время пути.':'Переправа убрана из этого дня.');
  });
  section.addEventListener('submit',async event=>{
    const form=event.target.closest('[data-transport-edit]');if(!form)return;
    event.preventDefault();feedback.textContent='';const fields=new FormData(form),current=read();
    if(!current.date){feedback.textContent='Сначала выберите дату поездки. Рейсы сохраняются для конкретного дня.';return;}
    const value={service:form.dataset.transportService,date:current.date,mode:form.dataset.transportMode};
    try {
      for(const [key,text]of fields) value[key]=key.endsWith('_departures')?parseDepartures(String(text)):text===''?null:Number(text);
      if(!validExcursion(value))throw Error('Проверьте минуты и рейсы. Длительность переправы должна быть больше нуля.');
      let stale=false;
      await commit(trip=>{
        if((trip.itinerary?.active || '')!==form.dataset.transportDay || (trip.date || '')!==form.dataset.transportDate || (trip.schedule?.mode || 'foot')!==form.dataset.transportMode || trip.schedule?.stops[form.dataset.transportEdit]?.excursion?.service!==value.service) {stale=true;return trip;}
        return updateSchedule(trip,'excursion',value,form.dataset.transportEdit);
      },'Рейсы и время сохранены для этого дня.');
      if(stale)feedback.textContent='День уже изменился. Откройте настройки переправы заново.';
    }catch(error){feedback.textContent=error.message;}
  });
}
