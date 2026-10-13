// Presentation of a frozen ferry receipt. No timetable or price lookup belongs here.
import {validTransportReceipt} from './trip-transport-plans-contract.mjs?v=2026101305';
import {transportReceiptRows} from './transport-shore-walk.mjs?v=2026101305';
import {transportStatus,transportTotal,transportContextText} from './trip-transport-plans-view.mjs?v=2026101305';
import {transferClock as clock} from './trip-service-transfer-view.mjs?v=2026101305';

import {roadOrigins} from './transport-road-connection.mjs?v=2026101305';
export function transportBooklet(snapshot){
 if(snapshot.days?.length!==1)return null;
 const day=snapshot.days[0],receipt=snapshot.transport_receipt||day.transport_plans?.length===1&&day.transport_plans[0].receipt;
 if(receipt?.profile!=='baltic-ferry'||!validTransportReceipt(receipt))return null;
 // A mixed day keeps the full guide, including every place, expense and booking.
 if(['entries','stops','services','bookings','menu_choices'].some(key=>day[key]?.length)||day.kosa||day.access?.route_id||day.access?.entries?.length||day.preferences?.label||day.record.start_at||day.record.night_at||day.expenses?.error||day.expenses?.categories?.some(c=>c.items?.length))return null;
 const rows=transportReceiptRows(receipt),c=receipt.circular,r=receipt.rail_connection,road=receipt.road_connection,mode=road&&roadOrigins[road.origin];
 const step=(title,text)=>({title,text});
 const outward=r?.outward?`У поезда к ${clock(r.outward.departure-r.boarding)}. ${clock(r.outward.departure)}-${clock(r.outward.arrival)} Южный - Балтийск. `:'';
 const inbound=r?.inbound?` Поезд ${clock(r.inbound.departure)}-${clock(r.inbound.arrival)} на Южный.`:r?' Обратный поезд не подобран.':'';
 const roadOut=road?`Ваш выезд ${clock(road.departure)}; ${road.outward_minutes} мин до Балтийска и ${road.transfer_minutes} мин до причала. `:'';
 const roadBack=road?.return_arrival!=null?` Ваш обратный выезд ${clock(road.return_departure)}; Калининград около ${clock(road.return_arrival)}.`:road?' '+transportStatus(receipt):'';
 const overview=[
  step(road?`Туда: ${mode.label.toLowerCase()} и паром`:r?'Туда: поезд и паром':'Паром из Балтийска',roadOut+outward+(c?.outbound_cycle!=null?`Паром ${clock(c.outbound_cycle)}; у причала к ${clock(c.outbound_cycle-c.boarding)}.`:transportStatus(receipt))),
  step('Прогулка по косе',c?.shore_start_estimate!=null?`Около ${clock(c.shore_start_estimate)}-${clock(c.shore_until)}. ${receipt.answers.shore} мин: ${receipt.shore_walk?.steps.map(s=>s.title).join(', ')||'берег и путь обратно'}.`:'Время прогулки пока не складывается. Измените дату или начало поездки.'),
  step(road?'Обратно в Калининград':r?'Обратно: паром и поезд':'Возвращение в Балтийск',(c?.return_cycle!=null?`К причалу ${clock(c.board_by)}. Круговой рейс ${clock(c.return_cycle)}; Балтийск около ${clock(c.finish_estimate)}.`:'Обратный паром не подобран.')+inbound+roadBack)
 ];
 const sources=[],sourceKey=s=>JSON.stringify([s.url,s.checked_at,s.verification]);
 const reference=s=>{if(!s)return null;const key=sourceKey(s);let index=sources.findIndex(v=>v.key===key);if(index<0){index=sources.length;sources.push({...structuredClone(s),key,number:index+1});}return index+1;};
 // The saved-plan summary is already shown by the overview and context above.
 const details=[...(day.rows||[]).filter(row=>row.kind==='notice'&&row.id!==`transport-${receipt.profile}`),...rows].map(row=>({...structuredClone(row),references:[row.source,...row.sources||[]].filter(Boolean).map(reference)}));
 const changed=day.transport_plans?.length===1?transportContextText(day.transport_plans[0],day.record):'';
 const context=changed?[changed]:[];
 return {receipt,day,title:'Балтийская коса',subtitle:road?`Из Калининграда ${mode.phrase}`:r?'Из Калининграда поездом':'Из Балтийска',overview,
  budget:transportTotal(receipt.price,r,road),status:transportStatus(receipt),context,
  details,sources,backupWarning:r?.inbound&&r.backup_catches_train===false?'Запасной паром не успевает к обратному поезду. Сохраните выбранный возврат.':road?.state==='connected'&&road.backup_catches_return===false?'Запасной паром не успевает к выбранному обратному автобусу. Сохраните выбранный возврат.':null};
}
