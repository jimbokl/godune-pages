import {transportPlanContext} from './trip-transport-plans-contract.mjs?v=2026101202';
import {formatKopecks} from './trip-money.mjs';
export const transportStates={circular_candidate:'Круговые рейсы подобраны. Возвращение в Балтийск — ориентировочное.',candidate:'Отправление и обратный автобус подобраны по таблице.',no_return:'Для такой прогулки обратный автобус не подошёл.',no_outward:'Подходящий автобус к Эфе уже не найден.',unknown_transfer:'Пересадку нужно уточнить.',conflict:'Отправление или возвращение не помещаются.',incomplete:'Отправление можно выбрать. Точное возвращение нужно уточнить.',needs_check:'Рейсы складываются по опубликованной таблице.',car_price:'Вход в парк на вашу компанию.',unpublished_year:'Расписание на этот год пока не добавлено.',outside_validity:'На выбранную дату опубликованная таблица не действует.',unavailable:'Подходящая поездка по таблице не найдена.'};
export const transportPath=profile=>profile==='curonian-210'?'kurshskaya-kosa/transport/':'dunes/baltic-spit/how-to-get/';
export const transportDate=date=>new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
export const transportTotal=price=>price.total!==null?`Итого: ${formatKopecks(price.total)}`:price.known>0?`Известная часть: ${formatKopecks(price.known)}. Полная сумма уточняется.`:'Полная стоимость пока неизвестна.';
export function transportPlanB(receipt){
 if(receipt.profile!=='baltic-ferry')return 'Сохраните обратный автобус. При задержке сократите прогулку, а запасной рейс проверьте до выхода.';
 const clock=value=>`${Math.floor(value/60).toString().padStart(2,'0')}:${(value%60).toString().padStart(2,'0')}`,c=receipt.circular;
 return c?.backup_cycle!=null?`Запасной круговой рейс из Балтийска — ${clock(c.backup_cycle)}. На косе будьте у причала к ${clock(c.backup_cycle-c.boarding)}. Касса: +7 (4012) 52-09-03. Если переправа не работает, замените поездку прогулкой по Балтийску.`:'Перед прогулкой проверьте работу переправы. Касса: +7 (4012) 52-09-03. Если паром не ходит, оставайтесь в Балтийске.';
}
export function transportContextText(entry,day){
 const c=transportPlanContext(entry,day),notes=[];
 if(!c.sameDate)notes.push(`Расчёт на ${transportDate(entry.receipt.date)}. Дата дня изменилась — пересчитайте рейсы.`);
 if(c.sameParty===false)notes.push(`Расчёт на ${entry.receipt.answers.people} чел. Состав компании изменился — пересчитайте стоимость.`);
 if(c.sameParty===null)notes.push(`В расчёте ${entry.receipt.answers.people} чел. Проверьте компанию перед поездкой.`);
 return notes.join(' ');
}
export function transportGuideRows(entries,day){
 return entries.flatMap(entry=>{
  const r=entry.receipt,context=transportContextText(entry,day);
  return [{id:`transport-${entry.id}`,kind:'notice',time:null,title:r.title,text:`${transportDate(r.date)} · ${r.answers.people} чел. ${transportStates[r.state]||''} ${context} Это сохранённый транспортный расчёт; время остальных мест в него не входит.`,source:r.source},...r.rows.map(row=>({...structuredClone(row),id:`${entry.id}-${row.id}`,time:row.time}))];
 });
}
