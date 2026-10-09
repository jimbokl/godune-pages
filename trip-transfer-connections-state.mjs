// Selection membership and notes. Never store a computed arrival or fit claim.
import {ensureJourney,selectedDay} from './trip-days-state.mjs?v=27';
import {timelineOrder,validTimeline} from './trip-service-timeline-state.mjs';
import {validTransferChoice,validTransferConnections,transferChoices,connectionKey} from './trip-transfer-connections-contract.mjs';
export const transferConnectionGuard=trip=>JSON.stringify(trip);
function editable(trip,guard){
 if(guard!==transferConnectionGuard(trip))throw Error('День уже изменился. Откройте выбор дороги заново.');
 const next=ensureJourney(trip),day=selectedDay(next);
 if(Object.hasOwn(day,'transfer_connections')&&!validTransferConnections(day.transfer_connections))throw Error('Выбранная дорога сохранена в другой версии. Она остаётся в файле поездки.');
 if(Object.hasOwn(day,'timeline')&&!validTimeline(day.timeline))throw Error('Порядок сохранён в другой версии. Он остаётся в файле поездки.');
 return {next,day};
}
export function saveTransferConnection(trip,choice,engine,guard){
 const {next,day}=editable(trip,guard);
 if(!validTransferChoice(choice))throw Error('Не удалось прочитать выбранную дорогу.');
 if(choice.date!==day.date)throw Error('У дня изменилась дата. Выберите дорогу заново.');
 // Validation only: readiness comes from the actual day when it is calculated.
 engine.serviceTransfer({version:1,date:choice.date,ready_at:null,graph:choice.graph,steps:choice.steps});
 const rows=structuredClone(transferChoices(day)),index=rows.findIndex(v=>connectionKey(v)===connectionKey(choice));
 const saved=structuredClone(choice);
 if(index>=0){saved.id=rows[index].id;rows[index]=saved;}
 else {let n=1;while(rows.some(v=>v.id===`connection-${n}`))n++;saved.id=`connection-${n}`;rows.push(saved);}
 const value={version:1,choices:rows};
 if(!validTransferConnections(value))throw Error('Один выбранный рейс уже входит в другую часть дня.');
 day.transfer_connections=value;day.timeline={version:1,order:timelineOrder(day)};return next;
}
export function removeTransferConnection(trip,id,guard){
 const {next,day}=editable(trip,guard);
 if(!transferChoices(day).some(v=>v.id===id))throw Error('Выбранная дорога уже удалена.');
 day.transfer_connections={version:1,choices:transferChoices(day).filter(v=>v.id!==id)};return next;
}
export function changeTransferConnectionNote(trip,id,note,guard){
 const {next,day}=editable(trip,guard),choice=transferChoices(day).find(v=>v.id===id);
 if(!choice)throw Error('Выбранная дорога уже удалена.');
 if(typeof note!=='string')throw Error('Не удалось прочитать заметку.');
 choice.note=note;return next;
}
