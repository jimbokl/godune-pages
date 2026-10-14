import {recordTransportAction} from './transport-useful-actions.mjs?v=2026101305';
import {createScenarioJournal} from './scenario-journal.mjs?v=2026101305';
import {tripJournalBindings} from './scenario-bindings.mjs?v=2026101305';
import {collectTripGuide} from './trip-guide-engine.mjs?v=2026101307';
import {collectGuideMedia} from './trip-guide-media.mjs?v=2026101305';
import {makeTripGuidePdf} from './trip-guide-pdf.mjs?v=2026101402';
import {loadScheduler} from './trip-scheduler.mjs?v=2026101305';
import {loadTripTravelMatrix,tripRoadFeatures} from './travel-estimates.mjs?v=2026101305';
import {savedKosaJourney} from './day-kosa-journey.mjs?v=2026101402';
export async function downloadPersonalGuide({trip,catalog,base,scope,format,signal,onProgress,stillCurrent,title}) {
  // URL objects lose their prototype across the worker boundary; send a plain URL.
  base=new URL('.',base).href;
  const copy=structuredClone(trip);signal?.throwIfAborted();onProgress('Сверяем ваш день и дорогу…');
  let storage;try{storage=globalThis.localStorage;}catch{}
  const journal=createScenarioJournal(storage),bindings=await tripJournalBindings(copy,{scope});
  const resumed=journal.resume(bindings),attempt=resumed||journal.begin('guide');
  if(!resumed)await journal.event(attempt,'selected');
  try{
  const calculate=await loadScheduler(base);
  const snapshot=await collectTripGuide({trip:copy,catalog,scope,calculate,
    matrixFor:async current=>{signal?.throwIfAborted();return loadTripTravelMatrix(base,current,catalog).catch(()=>null);},
    roadsFor:async(current,matrix)=>{signal?.throwIfAborted();return matrix?tripRoadFeatures(current,catalog,matrix,base):{type:'FeatureCollection',features:[]};},
    kosaFor:current=>savedKosaJourney(current,catalog,base,calculate)});
  if(title)snapshot.title=title;
  const media=await collectGuideMedia(snapshot,base,{signal,onProgress});
  const result=await makeTripGuidePdf({snapshot,media,base,format},{signal,onProgress});
  signal?.throwIfAborted();if(!stillCurrent())throw Error('guide_trip_changed');
  const url=URL.createObjectURL(new Blob([result.bytes],{type:'application/pdf'})),a=document.createElement('a');
  a.href=url;a.download=`godune-${scope}-${snapshot.days[0].date || 'plan'}-${format}.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
  for(const profile of new Set(snapshot.days.flatMap(day=>(day.transport_plans||[]).map(e=>e.receipt.profile))))recordTransportAction({profile,action:'pdf_ready'});
  await journal.event(attempt,'pdf_ready');
  return result;
  }catch(error){await journal.event(attempt,signal?.aborted?'refused':'failed',{reason:signal?.aborted?'cancelled':error.message==='guide_trip_changed'?'stale':'pdf'});throw error;}
  finally{journal.destroy();}
}
