import {cleanTrip} from './trip-state.mjs?v=19';
import {selectedDay} from './trip-days-state.mjs?v=14';
import {dayTransfers,transferKey,transferStatus,validTransferPoint} from './trip-transfer-costs.mjs?v=3';

const stable=value=>JSON.stringify(value,(_,item)=>item && typeof item==='object' && !Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
export const replacementContext=(trip,catalog)=>stable([selectedDay(cleanTrip(trip,catalog)),catalog.poi.map(p=>[p.slug,p.lon,p.lat,p.arrival_points || null])]);
const snapshot=(poi,mode)=>{
  const gate=poi.arrival_points?.[mode],point={kind:'catalog',id:poi.slug,name:poi.name,lon:poi.lon,lat:poi.lat,arrival:gate?{id:gate.id,lon:gate.lon,lat:gate.lat}:null};
  return validTransferPoint(point)?point:null;
};
export function previewStopReplacement(trip,from,to,catalog) {
  const before=cleanTrip(trip,catalog),day=selectedDay(before),old=catalog.poi.find(p=>p.slug===from),place=catalog.poi.find(p=>p.slug===to);
  if(!old || !day.places.includes(from))return {error:'Прежней остановки уже нет в этом дне. Откройте замену заново.'};
  if(!place || to===from)return {error:'Выберите другое место.'};
  if(day.places.includes(to))return {error:'Это место уже есть в дне. Выберите другую остановку или измените порядок.'};
  const raw=structuredClone(before);raw.places[raw.places.indexOf(from)]=to;
  if(raw.schedule) {
    const setting=raw.schedule.stops[from];delete raw.schedule.stops[from];
    if(setting)raw.schedule.stops[to]={visit:setting.visit,pause:setting.pause,leg:null,window:null};
    // A personal travel estimate to the next stop refers to the previous road.
    for(const stop of Object.values(raw.schedule.stops))if(stop.leg?.from===from)stop.leg=null;
  }
  const after=cleanTrip(raw,catalog),next=selectedDay(after),roads=dayTransfers(day,catalog),newRoads=dayTransfers(next,catalog),expenses=[];
  for(const [kind,row] of Object.entries(day.costs))for(const item of row.items || []) {
    if(item.poi===from) {
      const point=snapshot(old,day.schedule?.mode || 'foot');
      expenses.push({kind,item,eligible:!!point,target:{poi:to},previous:{date:day.date,place:point,transfer:null,source:structuredClone(item.source)}});
    } else if(item.transfer && [item.transfer.from,item.transfer.to].some(point=>point.kind==='catalog' && point.id===from)) {
      const index=roads.findIndex(road=>transferKey(road)===transferKey(item.transfer)),transfer=index>=0?newRoads[index]:null;
      expenses.push({kind,item,eligible:!!transfer,target:transfer?{poi:null,transfer}:null,previous:{date:item.transfer.date,place:null,transfer:item.transfer,source:structuredClone(item.source)},reason:transfer?'':transferStatus(item.transfer,day,catalog).reason});
    }
  }
  return {before,after,old,place,expenses,settings_reset:!!day.schedule?.stops[from],context:replacementContext(before,catalog)};
}
export function replaceTripStop(current,intent,catalog) {
  if(!intent || typeof intent.expected!=='string' || replacementContext(current,catalog)!==intent.expected)return {trip:current,error:'День уже изменился. Закройте замену и откройте её заново — свежий маршрут сохранён.'};
  const preview=previewStopReplacement(current,intent.from,intent.to,catalog);if(preview.error)return {trip:current,error:preview.error};
  if(!Array.isArray(intent.expense_ids) || new Set(intent.expense_ids).size!==intent.expense_ids.length || intent.expense_ids.some(id=>!preview.expenses.some(row=>row.item.id===id && row.eligible)))return {trip:current,error:'Связь расходов изменилась. Откройте замену заново.'};
  const next=preview.after,day=selectedDay(next);
  for(const candidate of preview.expenses.filter(row=>intent.expense_ids.includes(row.item.id))) {
    const item=day.costs[candidate.kind].items.find(item=>item.id===candidate.item.id);
    item.previous_bindings=[...(item.previous_bindings || []),structuredClone(candidate.previous)];
    item.poi=candidate.target.poi;
    if(candidate.target.transfer)item.transfer=structuredClone(candidate.target.transfer);else delete item.transfer;
  }
  return {trip:cleanTrip(next,catalog),changed:true};
}
