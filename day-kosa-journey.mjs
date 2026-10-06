import {selectedDay} from './trip-days-state.mjs?v=20';
import {kosaInput,kosaRailSnapshot,kosaBusSnapshot} from './kosa-plan-state.mjs?v=19';
import {kosaRoadbook} from './kosa-roadbook.mjs?v=17';
import {transitTable} from './transport-day.mjs?v=2';
import {roadbookJourney} from './day-journey-view.mjs?v=5';
import {currentProgress} from './day-progress.mjs?v=2';
import {kosaProgressInput,continueKosaRoadbook,kosaContinuationMessage} from './day-kosa-progress.mjs?v=4';
// Never overwrite the saved record, nor silently substitute a newer bus table.
export async function savedKosaJourney(trip,catalog,base,calculate) {
  const saved=selectedDay(trip).kosa_plan;
  if(!saved)return null;
  if(saved.date!==trip.date)return {state:'stale',message:'Дата дня изменилась. Откройте план косы и подберите рейсы заново.',rows:[]};
  const fetchJSON=async path=>{const response=await fetch(new URL(path,base));if(!response.ok)throw Error('journey_data_unavailable');return response.json();};
  const [table,maps]=await Promise.all([fetchJSON('data/kosa-bus-210.json'),fetchJSON('data/kosa-interchanges.json').catch(()=>null)]);
  const publication=transitTable(table,trip.date).publication;
  if(publication.image_sha256!==saved.source_sha256)return {state:'stale',message:'Таблица автобусов изменилась. Ваш записанный план на месте; откройте его и пересчитайте перед поездкой.',rows:[]};
  let input;try {input=kosaInput(saved,table,catalog);}catch {return {state:'stale',message:'Выбранные рейсы больше не совпадают с таблицей. Прежний план на месте; откройте поездку на косу и подтвердите транспорт.',rows:[]};}
  const result=calculate.transitDay(input);
  if(result.state!=='candidate')return {state:'incomplete',message:'Для сохранённых настроек возвращение сейчас не складывается. Откройте план косы и выберите другой вариант.',rows:[]};
  if(saved.bus_snapshot===undefined)return {state:'stale',message:'Этот день был сохранён без отметки выбранных автобусов. Прежний план на месте; откройте поездку на косу и подтвердите рейсы.',rows:[]};
  if(saved.bus_snapshot!==kosaBusSnapshot(result))return {state:'stale',message:'Выбранные автобусы изменились. Прежний план сохранён; откройте поездку на косу и подберите рейсы заново.',rows:[]};
  if(result.rail && saved.rail_snapshot===undefined)return {state:'stale',message:'Этот день был сохранён без отметки выбранных электричек. Прежний план на месте; откройте поездку на косу и подтвердите рейсы.',rows:[]};
  if(saved.rail_snapshot!==undefined && saved.rail_snapshot!==kosaRailSnapshot(result))return {state:'stale',message:'Выбранные электрички изменились. Прежний план сохранён; откройте поездку на косу и подберите рейсы заново.',rows:[]};
  const original=kosaRoadbook(saved,result,table,catalog,maps),context={input,table,maps,result,plan:JSON.stringify(saved),
    times:{'vysota-efa':result.outward.arrival+saved.first_visit,...(result.transfer?{'tancuyushchiy-les':result.transfer.via+saved.second_visit}:{})}};
  let book=original,progress;
  try {
    progress=currentProgress(trip);
    if(progress)book=continueKosaRoadbook(original,calculate.transitDay(kosaProgressInput(trip,context)),progress);
  }catch(error){return {state:'stale',message:'Отметки дня изменились. Обновите место и время у остановки перед новым расчётом.',rows:[],context,error:error.message};}
  return {state:book.continuation?.state==='conflict'?'conflict':'ready',context,
    message:(book.continuation?kosaContinuationMessage(book.continuation):'Электрички и автобусы — по опубликованной таблице. Рейсы и посадку на дату поездки подтвердите перед выходом.')+(book.walking.status==='unavailable'?' Карта переходов не загрузилась: время пеших участков ещё нужно сверить.':''),rows:roadbookJourney(book),book};
}
