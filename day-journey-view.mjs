// Read-only adapters. Rust owns time; this module only names its results.
import {clock} from './day-stop-view.mjs?v=1';
export const journeyKinds={start:'Выход',walk:'Пешком',car:'На машине',bike:'На велосипеде',mixed:'Пешком и транспорт',rail:'Электричка',bus:'Автобус',ferry:'Переправа',wait:'Ожидание',visit:'Прогулка',return:'Возвращение',boarding:'До посадки',notice:'Проверьте перед выходом'};
const row=(id,kind,time,title,text,state='estimate',source=null)=>({id,kind,time,title,text,state,source});
const known=n=>Number.isInteger(n)&&n>=0?n:null;
export function railJourney(resolved,result) {
  if(!resolved)return {before:[],after:[]};
  if(!resolved.input || !result)return {before:[row('rail-check','notice',null,'Электрички нужно выбрать заново',resolved.reason==='choose_date'?'Выберите дату дня.':resolved.reason==='stale_date'?'Дата изменилась. Прежние рейсы сохранены, но сейчас не учитываются.':'Расписание на этот день изменилось или ещё не опубликовано. Прежние рейсы сохранены; точное время нужно уточнить.','unknown')],after:[]};
  const r=result,s=resolved.saved,service=resolved.service,source=resolved.source;
  const conflict=['missed','no_time'].includes(r.state),unknownReturn=r.itinerary_deadline===null;
  return {before:r.resume_at!==undefined?[]:[
    row('rail-outward','rail',r.outward_departure,`${service.from} → ${service.to}`,`Прибытие по таблице — ${clock(r.outward_arrival)}. Перед выездом подтвердите рейс и платформу.`,'timetable',source),
    row('rail-arrival-walk','walk',r.outward_arrival,'От станции к началу дня',s.after_arrival===null?'Время пути ещё нужно задать. Точное начало дня неизвестно.':`${s.after_arrival} мин по вашей оценке. Начало прогулки не раньше ${clock(r.earliest_start)}.`,s.after_arrival===null?'unknown':'estimate')
  ],after:[
    row('rail-return-walk','walk',null,'Обратно к станции',unknownReturn?'Время пути от текущего конца прогулки к станции ещё нужно задать. Прибытие к поезду пока неизвестно.':`${s.before_return} мин по вашей оценке + ${s.boarding} мин до отправления. ${r.itinerary_deadline===null?'Окончание прогулки ещё нужно уточнить.':`Закончить прогулку до ${clock(r.itinerary_deadline)}.`}`,unknownReturn?'unknown':'estimate'),
    row('rail-inbound','rail',r.inbound_departure,`${service.to} → ${service.from}`,conflict?`На этот поезд по плану не успеваете${r.missed_by?` как минимум на ${r.missed_by} мин`:''}. Выберите другой рейс или сократите день.`:r.state==='incomplete'?'Рейс выбран, но возвращение пока не складывается полностью: уточните неизвестные участки.':`После дороги и запаса до посадки остаётся ${r.wait} мин. Прибытие по таблице — ${clock(r.inbound_arrival)}.`,conflict?'conflict':r.state==='incomplete'?'unknown':'timetable',source)
  ]};
}
export function roadJourney(item,travel,reserve,fromName,blocked=false,name=id=>id) {
  const kind=travel.leg_mode || travel.mode || 'foot';
  const compound=travel.parts?.length>1;
  const label=compound?'mixed':kind==='foot'?'walk':kind==='bike'?'bike':'car';
  const unknown=blocked || travel.minutes===null;
  const parts=compound?travel.parts.map(part=>{
    const title=part.kind==='approach'?'От парковки к началу прогулки':part.kind==='return'?'Обратно к парковке':`${part.leg_mode==='foot'||part.mode==='foot'?'Пешком':part.mode==='bike'?'На велосипеде':'На машине'} до ${name(part.to)}`;
    return `${title} — ${part.minutes===null?'время ещё нужно уточнить':part.minutes+' мин'}`;
  }).join('; ')+'. ':'';
  return {...row(`road-${item.id}`,label,blocked?null:known(item.arrival),`От ${fromName}`,blocked?'Сначала нужно подобрать возвращение с переправы.':parts+(travel.minutes===null?'Общее время дороги пока неизвестно.':travel.origin==='same_place'?'Вы уже в этом месте. Дорога между точками не нужна.':`${travel.origin==='estimate'?'Около ':''}${travel.minutes} мин ${travel.origin==='manual'?'по вашей оценке':'по карте'} + ${reserve} мин запас.`),unknown?'unknown':'estimate'),timeLabel:'Прибытие'};
}
export function waitJourney(item,booked=false) {
  return item.wait>0?row(`wait-${item.id}`,'wait',known(item.arrival),booked?'До записанного времени':'До начала посещения',`${item.wait} мин. Начать около ${clock(item.begins)}.`):null;
}
export function excursionJourney(resolved,result,name) {
  if(!result)return [];
  const rows=[row('pier-walk','walk',known(result.start),'К причалу',result.approach===null?'Время пути ещё нужно уточнить.':`${result.approach} мин по вашей оценке.`,result.approach===null?'unknown':'estimate')];
  for(const [direction,title]of [['outward','На другой берег'],['inbound','Обратно с косы']]) {
    const crossing=result[direction],manual=resolved.origins[direction]==='manual';
    if(crossing.wait!==null)rows.push(row(`${direction}-wait`,'wait',known(crossing.ready),'До посадки',`${crossing.wait} мин, включая ${crossing.boarding} мин вашего запаса.`));
    const state=['no_departures','missed_last'].includes(crossing.state)?'conflict':crossing.departure===null||crossing.arrival===null?'unknown':manual?'estimate':'timetable';
    const note=state==='conflict'?(crossing.state==='no_departures'?'В таблице рейсов нет.':'Последний рейс уже не подходит. Нужен другой способ возвращения.'):crossing.departure===null?'Рейс пока нельзя подобрать точно. Уточните путь и расписание.':`Прибытие ${crossing.arrival===null?'ещё неизвестно':`около ${clock(crossing.arrival)}`}. ${manual?'Рейсы записаны вами.':'По опубликованной таблице.'}`;
    rows.push(row(`${direction}-ferry`,'ferry',known(crossing.departure),title,note,state,manual?null:resolved.source));
    if(direction==='outward')rows.push(row('shore','visit',known(crossing.arrival),'Прогулка на косе',`${result.shore} мин вместе с возвращением к её причалу.`,crossing.arrival===null?'unknown':'estimate'));
  }
  rows.push(row('pier-return','return',known(result.finish),`Снова у «${name}»`,result.conflict?'Возвращение не подобрано. Следующие остановки остаются без точного времени.':result.return_walk===null?'Путь от причала обратно к остановке ещё нужно уточнить.':`${result.return_walk} мин от причала по вашей оценке.`,result.conflict?'conflict':result.finish===null?'unknown':'estimate'));
  return rows;
}
export function roadbookJourney(book) {
  const source={name:'Расписание автобуса № 210',url:book.publication.source_url,checked_at:book.publication.checked_at};
  return book.timeline.flatMap((item,index)=>{
    const step=row(`roadbook-${index}`,item.kind || 'visit',known(item.time),item.title,item.text,item.state || (item.walking_check?.state==='too_short'?'conflict':['rail','bus'].includes(item.kind)?'timetable':'estimate'),item.kind==='rail'?book.rail?.publication:item.kind==='bus'?source:null);
    if(item.poi)step.poi=item.poi;
    return item.kind==='boarding'?[step,row('roadbook-return-bus','bus',book.return.blocked?null:book.return.departure,`${book.return.stop} → Зеленоградск`,book.return.blocked?`Выбранный автобус был в ${clock(book.return.departure)}. Подходящее возвращение теперь нужно подтвердить заново.`:`Автобус № 210. Прибытие по таблице — ${clock(book.return.arrival)}. Наличие мест неизвестно.`,book.return.blocked?'conflict':'timetable',source)]:[step];
  });
}
