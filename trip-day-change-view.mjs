import {transportIssueText} from './trip-transport-context.mjs?v=2026101705';
const clock=value=>`${String(Math.floor(value/60)%24).padStart(2,'0')}:${String(value%60).padStart(2,'0')}${value>=1440?' следующего дня':''}`;
const reasonText={
 kitchen_closed:'В выбранный день кухня не принимает заказы.',
 kitchen_window_missed:'К моменту прихода кухня уже не принимает заказы.',
 unknown_kitchen:'Время последнего заказа нужно уточнить.',
 kitchen_needs_check:'Время приёма заказов на эту дату нужно сверить с заведением.',
 closed:'Место закрыто в выбранный день.',
 window_missed:'Посещение не помещается в часы работы.',
 appointment_missed:'Не успеваете к выбранному времени билета.',
 fixed_visit_missed:'Не успеваете к началу выбранного посещения.',
 transport_conflict:'Не успеваете на выбранный транспорт.',
 service_connections_unknown:'Дорога к посещению пока не выбрана.',
 rail_connections_unknown:'Путь до выбранного поезда ещё не связан с остановками.',
 outside_day_window:'Посещение выходит за выбранное время дня.',
 date_missing:'Укажите дату, чтобы проверить время посещения.',
 date_changed:'Дата посещения отличается от даты дня.',
 unresolved_visits:'Часть посещений пока не рассчитана.',
};
const reasons=check=>[...(check?.issues||[]).map(row=>({code:row.code,id:row.entry?.id||''})),
 ...(check?.places?.stops||[]).flatMap(stop=>(stop.issues||[]).map(row=>({code:row.code,id:stop.id})))];

// Plain text shared by both existing confirmation dialogs, with no new panel.
export function dayChangeText(change){
 const lines=[],before=change.before_timing,after=change.after_timing;
 if(before.finish!==null&&after.finish!==null){
  const delta=change.finish_delta;
  lines.push(delta===0?`Завершение остановок не меняется: ${clock(after.finish)}.`:
   `Остановки закончатся ${delta>0?'позже':'раньше'} на ${Math.abs(delta)} мин: ${clock(before.finish)} → ${clock(after.finish)}.`);
 }else if(after.finish!==null)lines.push(`По расчёту остановки закончатся в ${clock(after.finish)}.`);
 else lines.push('Изменение времени пока не рассчитано: не хватает дороги или условий посещения.');
 const horizon=after.deadline_kind==='rail'?'выбранной электрички':'конца заданного времени дня';
 if(after.slack!==null){
  if(after.slack<0)lines.push(`Не успеваете до ${horizon}: не хватает ${Math.abs(after.slack)} мин.`);
  else if(before.slack!==null)lines.push(`Запас до ${horizon}: ${before.slack} → ${after.slack} мин.`);
  else lines.push(`Запас до ${horizon}: ${after.slack} мин.`);
 }
 const previous=new Set(reasons(change.before).map(row=>`${row.code}:${row.id}`));
 const seen=new Set();
 const current=reasons(change.after),fresh=current.filter(row=>!previous.has(`${row.code}:${row.id}`));
 let ordinary=0;
 for(const row of [...current.filter(row=>transportIssueText(row.code)),...(fresh.length?fresh:current)]){
  const text=transportIssueText(row.code)||reasonText[row.code];if(!text||seen.has(text))continue;
  if(!transportIssueText(row.code)&&ordinary++>=2)continue;
  seen.add(text);lines.push(text);
 }
 if(change.after.overlaps.length&&!change.before.overlaps.length)lines.push('Выбранные посещения пересекаются по времени.');
 return lines;
}
