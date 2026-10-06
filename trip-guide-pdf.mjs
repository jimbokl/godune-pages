export async function makeTripGuidePdf(input,{signal,onProgress=()=>{}}={}) {
  signal?.throwIfAborted();let worker;
  try{if(typeof Worker!=='undefined')worker=new Worker(new URL('./trip-guide-worker.mjs?v=12',import.meta.url),{type:'module'});}catch{}
  if(!worker){const {renderTripGuide}=await import('./trip-guide-renderer.mjs?v=12');return renderTripGuide(input,{signal,onProgress});}
  try{return await new Promise((resolve,reject)=>{
    const cleanup=()=>signal?.removeEventListener('abort',cancel),cancel=()=>{cleanup();reject(signal.reason || new DOMException('Отменено','AbortError'));};
    signal?.addEventListener('abort',cancel,{once:true});worker.onmessage=({data})=>{if(data.progress)onProgress(data.progress);else{cleanup();data.error?reject(Error(data.error)):resolve(data.result);}};
    worker.onerror=event=>{event.preventDefault();cleanup();reject(Error('guide_worker_failed'));};worker.onmessageerror=()=>{cleanup();reject(Error('guide_worker_failed'));};worker.postMessage(input);if(signal?.aborted)cancel();
  });}finally{worker.terminate();}
}
