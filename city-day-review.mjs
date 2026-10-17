import {dayOutcome} from './day-outcome.mjs?v=2026101705';
// Display the common engine's assessment. No timing calculation or Trip write here.
export function cityDayReview(check,config,catalog,{railAvailable=true}={}){
 const stops=check?.places?.stops||[],codes=stops.flatMap(s=>(s.issues||[]).map(i=>i.code));
 const missingRoad=codes.some(code=>['unknown_travel','unknown_approach','unknown_return','transport_incomplete'].includes(code));
 const lines=[check?dayOutcome(check):railAvailable?'Расчёт дня не загрузился. Время остановок и возвращения пока не подтверждено.':'Расписание на выбранную дату не подтверждено. Время прогулки и возвращения пока уточняется.'];
 const actions=[{label:'Переходы на карте',href:'#journey-map'},{label:'Выбрать обратный поезд',href:'#day-passport-trains'}];
 if(check?.itinerary){lines.push((check.itinerary.order?.some(row=>row.kind==='service')?'В сохранённом дне есть события или услуги. ':'')+'Часы прогулки ниже учитывают общий порядок дня; если дорога или окончание неизвестны, время остаётся «Уточняется». Полный порядок и возвращение проверьте в «Моём дне».');actions.push({label:'Открыть мой день',href:'../../planner/'});}
 if(check&&check.state!=='fits')lines.push(missingRoad?'Не хватает времени переходов. Откройте карту; после сохранения дня можно задать свои минуты дороги в «Моём дне».':'Часы у остановок — расчёт по выбранному темпу и карте, с запасом на переходы. Это не подтверждение прохода на месте.');
 if(!railAvailable)lines.push('На эту дату рейсы не подтверждены. Откройте расписание перевозчика в разделе поездов и выберите возвращение.');
 for(const stop of stops){
  if(!config.food.includes(stop.id))continue;
  const issues=(stop.issues||[]).map(i=>i.code),place=catalog.poi.find(p=>p.slug===stop.id),name=place?.name||stop.id;
  if(issues.includes('closed'))lines.push(`${name}: в выбранную дату заведение закрыто. Выберите другое место в «Моём дне».`);
  else if(issues.includes('window_missed'))lines.push(`${name}: еда не помещается в часы работы. Перенесите её раньше или выберите другое место в «Моём дне».`);
  else if(issues.includes('unknown_opening'))lines.push(`${name}: часы приёма на выбранную дату нужно уточнить у заведения.`);
  else if(issues.some(code=>['unknown_kitchen','kitchen_needs_check'].includes(code)))lines.push(`${name}: часы зала учтены, время последнего заказа неизвестно. Если переносите обед на вечер, уточните его у ресторана.`);
  else if(issues.some(code=>['kitchen_closed','kitchen_window_missed'].includes(code)))lines.push(`${name}: к выбранному времени кухня не принимает заказы. Перенесите еду раньше или выберите другое место в «Моём дне».`);
  else continue;
  actions.push({label:`Часы и контакты: ${name}`,href:`../../poi/${stop.id}/`});
 }
 return {state:check?.state||'unknown',lines,actions};
}
