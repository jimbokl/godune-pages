import {selectedDay} from './trip-days-state.mjs?v=23';
import {kosaInput,kosaRailSnapshot,kosaBusSnapshot,isGeneratedKosaNote} from './kosa-plan-state.mjs?v=24';
import {kosaRoadbook} from './kosa-roadbook.mjs?v=22';
import {transitTable} from './transport-day.mjs?v=3';
import {roadbookJourney} from './day-journey-view.mjs?v=7';
import {currentProgress} from './day-progress.mjs?v=2';
import {kosaProgressInput,continueKosaRoadbook,kosaContinuationMessage} from './day-kosa-progress.mjs?v=7';
import {transitHomeCopy} from './transport-home.mjs?v=2';
import {boundBusInput} from './wizard-bus.mjs?v=3';
// Never overwrite the saved record, nor silently substitute a newer bus table.
export async function savedKosaJourney(trip,catalog,base,calculate) {
  const saved=selectedDay(trip).kosa_plan;
  if(!saved)return null;
  if(saved.date!==trip.date)return {state:'stale',message:'Дата дня изменилась. Откройте план косы и подберите рейсы заново.',rows:[]};
  const fetchJSON=async path=>{const response=await fetch(new URL(path,base));if(!response.ok)throw Error('journey_data_unavailable');return response.json();};
  const [table,maps]=await Promise.all([fetchJSON('data/kosa-bus-210.json'),fetchJSON('data/kosa-interchanges.json').catch(()=>null)]);
  const publication=transitTable(table,trip.date).publication;
  if(publication.image_sha256!==saved.source_sha256)return {state:'stale',message:'Таблица автобусов изменилась. Ваш записанный план на месте; откройте его и пересчитайте перед поездкой.',rows:[]};
  let input;try {input=boundBusInput(trip,saved,kosaInput(saved,table,catalog));}catch {return {state:'stale',message:'Настройки дня или выбранные рейсы изменились. Прежний план на месте; откройте поездку на косу и подтвердите транспорт.',rows:[]};}
  const result=calculate.transitDay(input);
  if(result.state!=='candidate')return {state:'incomplete',message:'Для сохранённых настроек возвращение сейчас не складывается. Откройте план косы и выберите другой вариант.',rows:[]};
  if(saved.bus_snapshot===undefined)return {state:'stale',message:'Этот день был сохранён без отметки выбранных автобусов. Прежний план на месте; откройте поездку на косу и подтвердите рейсы.',rows:[]};
  if(saved.bus_snapshot!==kosaBusSnapshot(result))return {state:'stale',message:'Выбранные автобусы изменились. Прежний план сохранён; откройте поездку на косу и подберите рейсы заново.',rows:[]};
  if(result.rail && saved.rail_snapshot===undefined)return {state:'stale',message:'Этот день был сохранён без отметки выбранных электричек. Прежний план на месте; откройте поездку на косу и подтвердите рейсы.',rows:[]};
  if(saved.rail_snapshot!==undefined && saved.rail_snapshot!==kosaRailSnapshot(result))return {state:'stale',message:'Выбранные электрички изменились. Прежний план сохранён; откройте поездку на косу и подберите рейсы заново.',rows:[]};
  let generated_note=false;
  try{generated_note=isGeneratedKosaNote(selectedDay(trip).note,saved,result,table,catalog,maps);}catch{/* Unrecognized notes remain visible. */}
  const effective={...saved,...(input.home?{home:input.home}:{}),...(input.rail?{to_station:input.rail.to_station,from_station:input.rail.from_station}:{})};
  const original=kosaRoadbook(effective,result,table,catalog,maps),context={input,table,maps,result,plan:JSON.stringify(saved),
    times:{'vysota-efa':result.outward.arrival+saved.first_visit,...(result.transfer?{'tancuyushchiy-les':result.transfer.via+saved.second_visit}:{})}};
  let book=original,progress;
  try {
    progress=currentProgress(trip);
    if(progress)book=continueKosaRoadbook(original,calculate.transitDay(kosaProgressInput(trip,context)),progress);
  }catch(error){return {state:'stale',message:'Отметки дня изменились. Обновите место и время у остановки перед новым расчётом.',rows:[],context,error:error.message};}
  return {generated_note,state:book.continuation?.state==='conflict'||book.home?.state==='late_home'?'conflict':book.continuation?.state==='incomplete'||book.home&&book.home.state!=='fits'?'incomplete':'ready',context,
    message:(book.continuation?kosaContinuationMessage(book.continuation):[book.home?transitHomeCopy(book.home,book.home_known??true,book.home_road):'','Электрички и автобусы — по опубликованной таблице. Рейсы и посадку на дату поездки подтвердите перед выходом.'].filter(Boolean).join(' '))+(book.walking.status==='unavailable'?' Карта переходов не загрузилась: время пеших участков ещё нужно сверить.':''),rows:roadbookJourney(book),book};
}
