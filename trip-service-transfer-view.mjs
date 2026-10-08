// One read-only projection for the day timeline and the offline guide.
// Rust supplies all timings, waits, boarding deadlines and conflict decisions.
const modes={foot:['walk','Пешком'],bike:['bike','На велосипеде'],car:['car','На машине'],bus:['bus','Автобус'],rail:['rail','Поезд'],ferry:['ferry','Паром']};
const messages={unknown:'Время этого участка пока неизвестно.',stale:'Сведения для этой даты нужно обновить.',stale_date:'Дорога выбрана на другую дату. Проверьте рейсы перед выходом.',changed_point:'Остановка изменилась. Проверьте путь перед выходом.',conflict:'Сведения по этому участку расходятся.',blocked:'Этот участок недоступен.',cancelled:'Выбранный рейс отменён.',missed:'На выбранный рейс не успеваем.',risk:'По оценке времени можем не успеть на посадку.',estimate:'Время рассчитано по оценке. Стыковку стоит проверить.'};
export const transferClock=minute=>{
 if(minute==null)return 'время неизвестно';
 const day=Math.floor(minute/1440),local=((minute%1440)+1440)%1440;
 return `${String(Math.floor(local/60)).padStart(2,'0')}:${String(local%60).padStart(2,'0')}${day===1?' следующего дня':day===-1?' предыдущего дня':day?` (${day>0?'+':''}${day} д.)`:''}`;
};
const clock=transferClock;
const source=s=>s?{name:s.reference,url:/^https?:\/\//.test(s.reference)?s.reference:null,checked_at:s.checked_at}:null;
const sources=values=>[...new Map(values.filter(Boolean).map(s=>[JSON.stringify(s),s])).values()].map(source);
const state=status=>['missed','cancelled','blocked','conflict'].includes(status)?'conflict':['known','shared'].includes(status)?'timetable':status==='estimate'?'estimate':'unknown';
export function selectedConnectionRows(connection,{id=connection.to,title='Выбранная пересадка'}={}){
 if(!connection.selection)return null;
 const selected=connection.selection.steps;
 const transfers=connection.journey?.transfers;
 if(!transfers)return [{id:`connection:${id}:unresolved`,kind:'notice',time:null,title,
  text:[messages[connection.status]||messages.unknown,...selected.filter(s=>s.kind==='ride').map(s=>`Выбранный рейс остаётся: ${s.ride.date}, ${clock(s.ride.departure)} → ${clock(s.ride.arrival)}.`)].join(' '),state:'unknown',sources:sources(selected.filter(s=>s.kind==='ride').map(s=>s.ride.source)),
  selected:structuredClone(connection.selection)}];
 const rows=[];
 for(const [index,t] of transfers.entries()){
  const anchors=t.anchors||t.road?.anchors||[],name=point=>anchors.find(a=>a.id===point)?.name||point;
  const ride=t.ride,mode=ride?.mode||t.road?.mode||selected[index]?.mode;
  const [kind,label]=modes[mode]||['notice','Дорога'];
  const evidence=sources(ride?[ride.source,...anchors.map(a=>a.source)]:[...(t.road?.candidates||[]).map(c=>c.link.source),...anchors.map(a=>a.source)]);
  if(t.wait_minutes>0)rows.push({id:`connection:${id}:${index}:wait`,kind:'wait',time:t.ready_at,title:'До выбранного рейса',text:`Ожидание ${t.wait_minutes} мин.`,state:state(t.status),sources:evidence});
  const chosen=ride?`Выбрано: ${ride.date}, ${clock(ride.departure)} → ${clock(ride.arrival)}. `:'';
  const duration=t.travel_minutes==null?'Время в пути неизвестно.':`${t.travel_minutes} мин в пути.`;
  const boarding=ride&&t.boarding_deadline!=null?` Подойти к посадке до ${clock(t.boarding_deadline)}.`:'';
  const warning=messages[t.status]?` ${messages[t.status]}`:'';
  const late=t.late_by>0?` Отстаём от времени посадки на ${t.late_by} мин.`:'';
  rows.push({id:`connection:${id}:${index}`,kind,time:t.departure,title:`${label} · ${name(t.from)} → ${name(t.to)}`,
   text:chosen+duration+boarding+warning+late,state:state(t.status),sources:evidence,
   status:t.status,anchors:structuredClone(anchors),...(ride?{selected_ride:structuredClone(ride)}:{})});
 }
 return rows;
}
export function unusedConnectionRows(itinerary){
 return (itinerary.unused_connections||[]).map((selection,index)=>({id:`connection:unused:${index}`,kind:'notice',time:null,
  title:'Выбранная пересадка осталась в плане',text:'Порядок остановок изменился. Проверьте, между какими местами нужна эта поездка.',state:'unknown',sources:sources(selection.steps.filter(s=>s.kind==='ride').map(s=>s.ride.source)),selected:structuredClone(selection)}));
}
