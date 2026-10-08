import {serviceDay,validServiceDate} from './service-calendar.mjs?v=1';
import {transitTable,datedTransitInput} from './transport-day.mjs?v=3';

const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
export const transportClock=n=>Number.isInteger(n)?`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`:'Время уточняется';
export function validateTransportProfile(p){
  if(!p||!['bus210','ferry'].includes(p.adapter)||!p.id||!p.path||!Array.isArray(p.modes)||!p.modes.length||!Array.isArray(p.hubs)||p.hubs.length<2||!Array.isArray(p.prices))throw Error('transport_profile_invalid');
  const ids=new Set();
  for(const r of p.prices){
    if(!r.id||ids.has(r.id)||!['eligible','people','vehicle','bike'].includes(r.scope)||!Array.isArray(r.modes)||!r.modes.length||r.modes.some(m=>!p.modes.some(v=>v.id===m))||!(r.amount===null||integer(r.amount,0,1e12))||!validServiceDate(r.source?.checked_at))throw Error('transport_price_invalid');
    try{if(new URL(r.source.url).protocol!=='https:')throw Error();}catch{throw Error('transport_source_invalid');}
    if(r.valid_from!==null&&!validServiceDate(r.valid_from)||r.valid_until!==null&&!validServiceDate(r.valid_until)||r.valid_from&&r.valid_until&&r.valid_from>r.valid_until)throw Error('transport_price_date_invalid');
    ids.add(r.id);
  }
  return p;
}
export function validateTransportAnswers(p,a){
  if(!validServiceDate(a?.date)||!integer(a.ready,0,1439)||!integer(a.boarding,0,120)||!integer(a.shore,30,720)||!integer(a.people,1,20)||!integer(a.exempt,0,a.people)||!integer(a.bikes,1,20)||!p.modes.some(m=>m.id===a.mode)||!['one','two'].includes(a.walks)||!integer(a.forest,30,240))throw Error('transport_answers_invalid');
  return a;
}
export function transportCalendar(p,a,tables){
  validateTransportProfile(p);validateTransportAnswers(p,a);
  const service=tables.services.services.find(s=>s.id===p.service_id);
  const day=p.adapter==='bus210'?transitTable(tables.bus,a.date):serviceDay(service?{...service,publication_year:service.publication_year??Number(service.source.checked_at.slice(0,4))}:null,a.date);
  if(day.reason)return {...day,outward:null,inbound:null};
  return day;
}
// Each price component is quoted by the existing Rust tariff engine. An
// unpriced component stays unknown; an explicitly exempt count can be zero.
export function transportPrice(p,a,engine){
  validateTransportProfile(p);validateTransportAnswers(p,a);
  const rows=p.prices.filter(r=>r.modes.includes(a.mode)).map(r=>{
    const count={people:a.people,eligible:a.people-a.exempt,vehicle:1,bike:a.bikes}[r.scope];
    const valid=(!r.valid_from||a.date>=r.valid_from)&&(!r.valid_until||a.date<=r.valid_until);
    const amount=valid?r.amount:null;
    const quote=count===0?null:engine.serviceQuote({version:1,activity_id:p.id,offer_id:r.id,selection:{people:count,units:count,duration_minutes:1,sessions:1,extras:[]},tariff:{currency:'RUB',base:{id:r.id,scope:'unit',billing:{kind:'once'},rate:{kind:'fixed',amount}},mandatory:[],extras:[],deposit:{kind:'none'}}});
    return {id:r.id,label:r.label,count,unit:r.unit,amount,cost:count===0?0:quote.cost_total,known:count===0?0:quote.known_cost,source:structuredClone(r.source),valid};
  });
  const known=rows.reduce((sum,r)=>sum+r.known,0),total=rows.every(r=>r.cost!==null)?known:null;
  return {currency:'RUB',known,total,rows};
}
export function calculateTransport(p,a,tables,engine){
  const calendar=transportCalendar(p,a,tables),price=transportPrice(p,a,engine);
  if(p.adapter==='bus210'){
    if(a.mode==='car')return {state:'car_price',calendar,price,day:null,finish:null};
    if(calendar.reason)return {state:calendar.reason,calendar,price,day:null,finish:null};
    const day=engine.transitDay(datedTransitInput({date:a.date,ready:a.ready,boarding:a.boarding,first_visit:a.shore,second_visit:a.walks==='two'?a.forest:null},tables.bus));
    return {state:day.state,calendar,price,day,finish:day.finish};
  }
  if(calendar.reason)return {state:calendar.reason,calendar,price,day:null,finish:null};
  const crossing=d=>({departures:d?.departures?.map(v=>Number(v.slice(0,2))*60+Number(v.slice(3)))??null,duration:d?.duration??null,boarding:a.boarding,needs_check:true});
  const plan=engine({version:1,start:a.ready,end:1440,reserve:0,stops:[{id:p.id,visit:0,pause:0,travel:0,opening:[{open:0,close:1440}],excursion:{approach:0,return_walk:0,shore:a.shore,outward:crossing(calendar.outward),inbound:crossing(calendar.inbound)}}]});
  const day=plan.stops[0].excursion;
  return {state:day.conflict?'conflict':day.complete?'needs_check':'incomplete',calendar,price,day,finish:day.finish};
}
export function transportReceipt(p,a,r){
  const rows=[],source=r.calendar.source;
  const add=(id,time,title,text)=>rows.push({id,kind:'transport',time,title,text,source});
  if(p.adapter==='bus210'&&r.day){
    const d=r.day;
    if(d.outward){add('out',d.outward.departure,'Автобус 210 · к Эфе',`Будьте у остановки в ${transportClock(d.outward.departure-a.boarding)}. Прибытие к Эфе — ${transportClock(d.outward.arrival)}.`);add('efa',d.outward.arrival,'Прогулка по дюнам',`${a.shore} мин на месте. До ${transportClock(d.first_until)}.`);}
    if(d.transfer)add('forest',d.transfer.departure,'Автобус 210 · к Танцующему лесу',`Прибытие — ${transportClock(d.transfer.via)}. Прогулка ${a.forest} мин.`);
    if(d.inward)add('back',a.walks==='two'?d.inward.via:d.inward.departure,'Автобус 210 · в Зеленоградск',`Посадка ${a.walks==='two'?'у Танцующего леса':'у Эфы'}. У остановки — ${transportClock(d.board_by)}. В Зеленоградске — ${transportClock(d.finish)}.`);
    else add('no-back',null,'Обратный автобус не подобран','Начните раньше или сократите прогулку, затем пересчитайте.');
    if(d.backup)add('backup',a.walks==='two'?d.backup.via:d.backup.departure,'Запасной обратный автобус',`Прибытие в Зеленоградск — ${transportClock(d.backup.arrival)}. Наличие мест уточняйте отдельно.`);
  }else if(p.adapter==='ferry'&&r.day){
    const d=r.day;
    add('out',d.outward.departure,'Паром · из Балтийска',`Причал: Морской бульвар, 2Б. Личный запас перед посадкой: ${a.boarding} мин. ${d.outward.departure!==null?`У причала — ${transportClock(d.outward.departure-a.boarding)}.`:''}`);
    add('shore',d.outward.arrival,'На Балтийской косе',`${a.shore} мин на прогулку. ${d.outward.arrival===null?'Время перехода пока не опубликовано.':''}`);
    add('back',d.inbound.departure,'Паром · обратно в Балтийск',d.inbound.departure===null?'Отдельное время отправления с косы нужно уточнить у перевозчика.':`Возвращение — ${transportClock(d.finish)}.`);
  }else add('no-table',null,p.adapter==='bus210'&&a.mode==='car'?'Вход в парк на машине':'Расписание на выбранную дату',a.mode==='car'&&p.adapter==='bus210'?'Сумма ниже включает отдельные составляющие входа. Дорога на машине здесь не рассчитывается.':'Подтверждённое расписание на эту дату пока не добавлено.');
  for(const v of r.price.rows)rows.push({id:v.id,kind:'cost',time:null,title:v.label,text:`${v.count} × ${v.amount===null?'тариф уточняется':`${v.amount/100} ₽`} · ${v.cost===null?'сумма уточняется':`${v.cost/100} ₽`}`,source:v.source});
  rows.push({id:'price-total',kind:'cost',time:null,title:r.price.total===null?'Полная сумма пока неизвестна':'Итого',text:r.price.total!==null?`${r.price.total/100} ₽`:r.price.known>0?`Известная часть — ${r.price.known/100} ₽. Остальные тарифы нужно уточнить.`:'Подтверждённые тарифы пока не добавлены.'});
  return {version:1,profile:p.id,date:a.date,answers:structuredClone(a),state:r.state,finish:r.finish,rows,price:structuredClone(r.price),source:structuredClone(source),title:p.title};
}
export function transportGuide(receipt){
  const summary=receipt.finish!==null?`По опубликованной таблице возвращение — ${transportClock(receipt.finish)}.`:'Точное возвращение пока не рассчитано.';
  return {version:1,title:receipt.title,scope:'day',created_at:new Date().toISOString(),transport_receipt:structuredClone(receipt),days:[{id:'day-1',name:receipt.title,date:receipt.date,record:{start_at:null,night_at:null,note:''},party_label:`Компания: ${receipt.answers.people} чел.`,summary,finish:receipt.finish,earliest_finish:null,slack:null,rows:receipt.rows,stops:[],entries:[],services:[],bookings:[],planB:receipt.profile==='baltic-ferry'?'Подтвердите обратный рейс у перевозчика до начала прогулки. При изменении работы переправы останьтесь на стороне Балтийска.':'Сохраните обратный автобус. При задержке сократите прогулку, а запасной рейс проверьте до выхода.',kosa:null,access:null,expenses:null}],preparation:[]};
}
