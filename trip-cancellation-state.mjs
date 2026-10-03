import {cleanTrip} from './trip-state.mjs?v=16';
import {selectedDay} from './trip-days-state.mjs?v=12';
import {replacementContext} from './trip-replacement-state.mjs?v=8';

export function previewStopCancellation(trip,id,catalog) {
  const before=cleanTrip(trip,catalog),day=selectedDay(before),place=catalog.poi.find(p=>p.slug===id);
  if(!place || !day.places.includes(id))return {error:'Этой остановки уже нет в дне. Откройте план заново.'};
  const raw=structuredClone(before);raw.places=raw.places.filter(value=>value!==id);
  if(raw.schedule){delete raw.schedule.stops[id];for(const stop of Object.values(raw.schedule.stops))if(stop.leg?.from===id)stop.leg=null;}
  const expenses=[];
  for(const [kind,row] of Object.entries(day.costs))for(const item of row.items || [])if(item.poi===id || item.transfer && [item.transfer.from,item.transfer.to].some(point=>point.kind==='catalog' && point.id===id))expenses.push({kind,item,basis:row.basis || 'summary'});
  return {before,after:cleanTrip(raw,catalog),place,expenses,context:replacementContext(before,catalog)};
}
export function cancelTripStop(current,intent,catalog) {
  if(!intent || intent.expected!==replacementContext(current,catalog))return {trip:current,error:'День уже изменился. Откройте остановку заново — свежий план сохранён.'};
  const preview=previewStopCancellation(current,intent.id,catalog);if(preview.error)return {trip:current,error:preview.error};
  if(!Array.isArray(intent.expense_ids) || new Set(intent.expense_ids).size!==intent.expense_ids.length || intent.expense_ids.some(id=>!preview.expenses.some(row=>row.item.id===id && !row.item.cancelled)))return {trip:current,error:'Список расходов изменился. Откройте остановку заново.'};
  const next=preview.after,day=selectedDay(next);
  for(const row of preview.expenses)if(intent.expense_ids.includes(row.item.id))day.costs[row.kind].items.find(item=>item.id===row.item.id).cancelled=true;
  return {trip:cleanTrip(next,catalog),changed:true};
}
