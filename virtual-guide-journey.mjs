// A read-only view of the same snapshot used by the personal PDF.
// Rust, service calendars and the saved transport bindings own every time.
import {collectTripGuide} from './trip-guide-engine.mjs?v=9';
import {loadScheduler} from './trip-scheduler.mjs?v=20';
import {loadTripTravelMatrix} from './travel-estimates.mjs?v=6';
import {savedKosaJourney} from './day-kosa-journey.mjs?v=5';
import {clock} from './day-stop-view.mjs?v=1';

export async function collectVirtualJourney({trip,catalog,base,calculate,matrixFor,kosaFor}) {
  const saved=structuredClone(trip);
  calculate ||= await loadScheduler(base);
  const snapshot=await collectTripGuide({trip:saved,catalog,calculate,
    matrixFor:matrixFor || (current=>loadTripTravelMatrix(base,current,catalog).catch(()=>null)),
    kosaFor:kosaFor || (current=>savedKosaJourney(current,catalog,base,calculate)),
    roadsFor:async()=>({type:'FeatureCollection',features:[]})});
  return snapshot.days[0];
}

export function chapterJourney(guide,day,index) {
  const stop=guide.stops[index];
  if(!stop)return null;
  const rows=day.rows || [],anchor=rows.findIndex(row=>row.kind==='visit' && row.poi===stop.id);
  if(day.record?.schedule?.progress?.completed.includes(stop.id))return {state:'completed',summary:day.summary,note:'Вы уже отметили это место. Оно осталось в путеводителе; новый расчёт начинается после осмотра. Время посещения не записано.',before:[],visit:null,after:[],planB:day.planB};
  if(anchor<0)return {state:'unavailable',summary:day.summary,
    note:day.record?.kosa_plan && !['stale','incomplete'].includes(day.status)
      ?'Это дополнительное место. Время поездки на косу его не учитывает.'
      :'Для этой остановки точное время пока не рассчитано.',before:[],visit:null,after:[],planB:day.planB};
  const previous=rows.slice(0,anchor).findLastIndex(row=>row.kind==='visit' && row.poi);
  const next=rows.findIndex((row,i)=>i>anchor && row.kind==='visit' && row.poi);
  return {state:day.status,summary:day.summary,note:'Время взято из вашего плана. Переход к главе не отмечает посещение.',
    before:rows.slice(previous+1,anchor),visit:rows[anchor],
    after:rows.slice(anchor+1,next<0?undefined:next+1),planB:day.planB};
}

export function virtualJourneyTranscript(day) {
  if(!day)return '';
  const lines=['Ваш план дня',day.date || 'Дата не выбрана',day.summary,
    'Время по сохранённому плану. Этот файл сам не обновляется.',''];
  for(const row of day.rows || []) {
    lines.push(`${Number.isInteger(row.time)?clock(row.time)+' · ':''}${row.title}`,row.text);
    if(row.source?.checked_at)lines.push('Дата проверки: '+row.source.checked_at);
    if(/^https?:\/\//.test(row.source?.url || ''))lines.push('Источник: '+row.source.url);
    lines.push('');
  }
  if(day.planB)lines.push('Если планы изменились: '+day.planB);
  return lines.join('\n');
}
