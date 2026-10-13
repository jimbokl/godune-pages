import {railTable,rideSnapshot} from './trip-rail-state.mjs?v=2026101305';
import {validMenuChoice} from './trip-menu-choices-contract.mjs?v=2026101305';
const minute=n=>Number.isInteger(n)&&n>=0&&n<1440;
const clock=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
const url=v=>{try{return new URL(v).protocol==='https:';}catch{return false;}};
export function validKosaDinner(v){
  const p=v?.place;
  return v?.version===1&&p&&typeof p.id==='string'&&typeof p.name==='string'&&typeof p.address==='string'
    &&/^\+\d{10,15}$/.test(p.phone)&&url(p.source?.url)&&/^\d{4}-\d{2}-\d{2}$/.test(p.source.checked_at)
    &&Array.isArray(p.hours)&&p.hours.length===7&&p.hours.every(h=>h===null||Array.isArray(h)&&h.length===2&&minute(h[0])&&Number.isInteger(h[1])&&h[1]<=1440&&h[1]>h[0])
    &&Number.isInteger(v.walk_minutes)&&v.walk_minutes>=0&&v.walk_minutes<=180
    &&Number.isInteger(v.minutes)&&v.minutes>=15&&v.minutes<=240
    &&Number.isInteger(v.order_buffer)&&v.order_buffer>=0&&v.order_buffer<=60
    &&(v.last_order===null||minute(v.last_order))
    &&(v.not_before===undefined||v.not_before===null||minute(v.not_before))
    &&Number.isInteger(v.to_train)&&v.to_train>=0&&v.to_train<=180
    &&(v.to_home===null||Number.isInteger(v.to_home)&&v.to_home>=0&&v.to_home<=180)
    &&Array.isArray(v.choices)&&v.choices.every(c=>validMenuChoice(c)&&c.place?.poi_id===p.id)
    &&new Set(v.choices.map(c=>c.menu_item_id)).size===v.choices.length;
}
export function dinnerWindow(plan,date,busArrival){
  if(!validKosaDinner(plan)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!minute(busArrival))throw Error('dinner_invalid_plan');
  const hours=plan.place.hours[new Date(date+'T12:00:00Z').getUTCDay()],arrival=busArrival+plan.walk_minutes;
  const start=Math.max(arrival,hours?.[0]??0,plan.not_before??0),end=start+plan.minutes;
  const order_by=plan.last_order===null?null:plan.last_order-plan.order_buffer;
  const state=!hours?'closed':arrival>=hours[1]||end>hours[1]||order_by!==null&&start>order_by?'too_late':plan.last_order===null?'kitchen_unknown':'fits';
  return {arrival,start,end,hours,order_by,state,slack:order_by===null?null:order_by-start};
}
// Extend the bus day, never the tram/train selected before the dinner existed.
// Walk and meal durations are the traveller's explicit estimates.
export function withKosaDinner(original,plan,{date,station,rail_boarding=10,catalog}={}){
  if(!plan)return original;
  if(!validKosaDinner(plan))throw Error('dinner_invalid_plan');
  const book=structuredClone(original),blocked=book.return?.blocked||book.continuation?.state==='conflict'||book.continuation?.state==='incomplete';
  const d=blocked?{arrival:null,start:null,end:null,hours:null,order_by:null,state:'return_unknown',slack:null}:dinnerWindow(plan,date,book.return.arrival);
  d.plan=structuredClone(plan);d.backup=book.return.backup?dinnerWindow(plan,date,book.return.backup.arrival):null;
  const busRow=book.timeline.findIndex(r=>r.kind==='return'&&r.title==='Снова в Зеленоградске');
  if(busRow>=0){book.timeline=book.timeline.slice(0,busRow+1);book.timeline[busRow].text=`До ${plan.place.name} — ${plan.walk_minutes} мин пешком по вашей оценке.`;}
  const state=['too_late','closed'].includes(d.state)?'conflict':d.state==='fits'?'estimate':'unknown';
  book.timeline.push({kind:'walk',time:blocked?null:book.return.arrival,title:'От автобуса — к рыбному ужину',text:`${plan.walk_minutes} мин пешком по вашей оценке. ${plan.place.name} · ${plan.place.address}.`,state});
  if(d.start!==null&&d.start>d.arrival)book.timeline.push({kind:'pause',time:d.arrival,title:'Время до ужина',text:`До ${clock(d.start)} свободны ${d.start-d.arrival} мин. Можно отдохнуть или прогуляться по городу; отдельная прогулка в расчёт не включена.`,state:'estimate'});
  book.timeline.push(
    {kind:'visit',poi:plan.place.id,time:d.start,title:'Рыбный ужин в Зеленоградске',text:`${plan.place.name}. На ужин — ${plan.minutes} мин.${d.start!==null&&d.start>d.arrival?` Время до ужина — ${d.start-d.arrival} мин.`:''} ${dinnerStatus(d)}`,state});
  let finish=['closed','too_late','return_unknown'].includes(d.state)?null:d.end;
  const oldRail=book.rail;
  // The station walk now starts at the restaurant, not the bus stop.
  if(oldRail){
    const table=railTable(catalog,station,date),ready=d.end===null?null:d.end+plan.to_train+rail_boarding;
    const ride=ready!==null&&!table.reason?table.inbound?.map(rideSnapshot).find(r=>r.departure>=ready):null;
    d.train=ride?{...ride,board_by:ride.departure-rail_boarding,walk_minutes:plan.to_train,from:oldRail.from,source:table.source}:null;
    if(ride){
      book.rail={...oldRail,inward:ride,train_by:d.train.board_by,to_train:plan.to_train,home_finish:oldRail.from_station===null?null:ride.arrival+oldRail.from_station,backup:null};
      book.timeline.push({kind:'walk',time:d.end,title:'После ужина — к электричке',text:`${plan.to_train} мин от ресторана до станции по вашей оценке. У поезда к ${clock(d.train.board_by)}.`},
        {kind:'rail',time:ride.departure,title:'Электричка после ужина',text:`№ ${ride.id} до ${oldRail.from}, прибытие ${clock(ride.arrival)}.`,state:'timetable'});
      if(finish!==null)finish=book.origin==='station'?ride.arrival:book.rail.home_finish;
      if(book.origin!=='station')book.timeline.push({kind:'return',time:finish,title:'После поезда — к жилью',text:oldRail.from_station===null?'Время дороги от вокзала до жилья нужно уточнить.':`${oldRail.from_station} мин по вашей оценке.`,state:finish===null?'unknown':'estimate'});
    }else{
      finish=null;d.return_state='no_train';delete book.rail;
      book.timeline.push({kind:'notice',time:null,title:'После ужина электричка не подобрана',text:'В опубликованной таблице нет подходящего поезда. Вернитесь с косы раньше, сократите ужин или выберите другой транспорт.',state:'conflict'});
    }
  }else if(book.home_known||book.home){
    finish=finish===null||plan.to_home===null?null:d.end+plan.to_home;
    book.timeline.push({kind:'return',time:finish,title:'От ресторана — к жилью',text:plan.to_home===null?'Укажите время пути именно от ресторана до жилья. Прежний переход от автостанции здесь не подходит.':`${plan.to_home} мин от ресторана до жилья по вашей оценке.`,state:finish===null?'unknown':'estimate'});
  }
  if(book.home){
    const limit=book.home.end_by;
    book.home={...book.home,finish,earliest_finish:finish,return_slack:finish===null||!Number.isInteger(limit)?null:limit-finish,state:finish===null?'incomplete':Number.isInteger(limit)&&finish>limit?'late_home':'fits'};
    if(book.home.state==='late_home')d.return_state='late_home';
  }
  book.dinner=d;book.finish=finish;book.earliest_finish=finish;
  book.duration=finish===null||original.finish===null||original.duration===null?null:finish-(original.finish-original.duration);
  book.before.push(`Позвоните в ${plan.place.name}: ${plan.place.phone}. Подтвердите стол, блюда и последний заказ кухни на ${date}.`);
  book.fallback=d.backup?`После следующего автобуса у ресторана около ${clock(d.backup.arrival)}. ${dinnerStatus(d.backup)}${oldRail?' Электричку после этого ужина нужно подобрать заново.':''}`:'После последнего автобуса запасного № 210 в этой таблице нет. Если пропустите его, потребуется другой транспорт.';
  return book;
}
export function dinnerStatus(d){
  if(d.state==='return_unknown')return 'Сначала подтвердите возвращение с косы. Время ужина пока неизвестно.';
  if(d.state==='closed')return 'На этот день по опубликованным часам ресторан закрыт. Выберите другое место или дату.';
  if(d.state==='too_late')return 'С этим автобусом и временем на ужин не успеваете к выбранному последнему заказу или закрытию зала. Нужен более ранний рейс или другой ресторан.';
  if(d.state==='kitchen_unknown')return 'По часам зала время есть. Последний заказ кухни не опубликован — уточните по телефону и укажите время ниже.';
  return `До выбранного последнего заказа остаётся ${d.slack} мин с вашим запасом. Время кухни указано вами; стол и блюда ещё нужно подтвердить.`;
}
