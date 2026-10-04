export async function makeKosaPdf({snapshot,base,format='phone',signal,onProgress=()=>{}}){
  if(!['phone','print'].includes(format))throw Error('Выберите формат путеводителя.');
  signal?.throwIfAborted();
  const input={snapshot,base:new URL(base).href,format};
  if(typeof Worker==='undefined'){
    onProgress('Собираем путеводитель в этой вкладке…');
    const {renderKosaPdf}=await import('./kosa-pdf-renderer.mjs?v=5');
    return renderKosaPdf(input,{signal,onProgress});
  }
  let worker;
  try{worker=new Worker(new URL('./kosa-pdf-worker.mjs?v=5',import.meta.url),{type:'module'});}
  catch{
    const {renderKosaPdf}=await import('./kosa-pdf-renderer.mjs?v=5');
    return renderKosaPdf(input,{signal,onProgress});
  }
  try{return await new Promise((resolve,reject)=>{
    const cancel=()=>reject(signal.reason || new DOMException('Сборка отменена','AbortError'));
    signal?.addEventListener('abort',cancel,{once:true});
    worker.onmessage=({data})=>{
      if(data.progress)onProgress(data.progress);
      else {signal?.removeEventListener('abort',cancel);data.error?reject(Error(data.error)):resolve(data.result);}
    };
    worker.onerror=event=>{event.preventDefault();signal?.removeEventListener('abort',cancel);reject(Error('Сборка PDF не запустилась. Повторите попытку.'));};
    worker.onmessageerror=()=>{signal?.removeEventListener('abort',cancel);reject(Error('Ответ сборки PDF не прочитан. Повторите попытку.'));};
    worker.postMessage(input);
    if(signal?.aborted)cancel();
  });}finally{worker.terminate();}
}
