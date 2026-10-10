import {collectDayGpx} from './day-gpx-state.mjs?v=2';
import {loadScheduler} from './trip-scheduler.mjs?v=42';
import {loadTripTravelMatrix} from './travel-estimates.mjs?v=13';

export async function downloadDayGpx({trip,catalog,base,engine,matrix,stillCurrent=()=>true}){
 const copy=structuredClone(trip);
 engine||=await loadScheduler(base);
 matrix||=await loadTripTravelMatrix(base,copy,catalog);
 const result=await collectDayGpx({trip:copy,catalog,matrix,engine,base});
 if(!stillCurrent())throw Error('gpx_day_changed');
 const url=URL.createObjectURL(new Blob([result.xml],{type:'application/gpx+xml;charset=utf-8'})),a=document.createElement('a');
 a.href=url;a.download=result.filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
 return result;
}
export function gpxMessage(error){
 return error.message==='gpx_day_changed'?'День изменился. Скачайте свежий трек.':error.message==='gpx_no_paths'?'Геометрия пути пока недоступна. Попробуйте ещё раз с подключением к сети.':error.message==='gpx_generated_day'?'Для этого дня доступен PDF-буклет. Трек можно скачать в карточке прогулки.':'Трек пока не собрался. Попробуйте ещё раз; ваш день на месте.';
}
export const gpxReady=result=>result.partial?`GPX готов: ${result.segments.length} известных участков. ${result.gaps.length?`Без трека: ${result.gaps.join('; ')}. `:''}${result.omittedStops?`Без координат: ${result.omittedStops} остановок.`:''}`:'GPX готов. Откройте файл в навигаторе.';
