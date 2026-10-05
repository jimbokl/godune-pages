/* Shared SW transport. Only a complete, checksum-checked body reaches storage. */
globalThis.GoduneOfflineFetch=(()=>{
  const transient=new Set([408,429,500,502,503,504]);
  const cancelled=()=>new DOMException('Cancelled','AbortError');
  const check=signal=>{if(signal?.aborted)throw cancelled();};
  const networkError=(status,retryable=true)=>Object.assign(new Error('Не все файлы загрузились. Скачанная часть сохранена. Продолжите загрузку, когда вернётся связь. Прежняя загрузка сохранена.'),{name:'OfflineNetworkError',status,retryable});
  const integrityError=()=>Object.assign(new Error('Сайт обновился во время загрузки. Попробуйте ещё раз; прежняя загрузка сохранена.'),{name:'OfflineIntegrityError'});
  function pause(ms,signal){
    check(signal);
    return new Promise((resolve,reject)=>{
      const stop=()=>{clearTimeout(timer);signal?.removeEventListener('abort',stop);reject(cancelled());};
      const timer=setTimeout(()=>{signal?.removeEventListener('abort',stop);resolve();},ms);
      signal?.addEventListener('abort',stop,{once:true});
    });
  }
  function retryDelay(response,fallback){
    const value=response?.headers.get('Retry-After');
    if(!value)return fallback;
    const seconds=Number(value),delay=Number.isFinite(seconds)?seconds*1000:Date.parse(value)-Date.now();
    return Number.isFinite(delay)?Math.max(fallback,Math.min(10000,delay)):fallback;
  }
  async function request(address,{signal,resource,digest,progress,retry,delays=[500,1500],idleTimeout=30000}={}){
    for(let attempt=0;;attempt++){
      check(signal);
      const controller=new AbortController();let timer,response,timedOut=false;
      const stop=()=>controller.abort();signal?.addEventListener('abort',stop,{once:true});
      const touch=()=>{clearTimeout(timer);timer=setTimeout(()=>{timedOut=true;controller.abort();},idleTimeout);};
      try{
        touch();response=await fetch(address,{cache:'no-store',signal:controller.signal});check(signal);
        if(!response.ok)throw networkError(response.status,transient.has(response.status));
        let body;
        if(response.body){
          const reader=response.body.getReader(),chunks=[];let received=0;
          try{while(true){check(signal);touch();const {value,done}=await reader.read();if(done)break;received+=value.length;
            if(resource && received>resource.bytes)throw integrityError();chunks.push(value);progress?.(received);}
            body=new Uint8Array(received);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length;}
          }finally{await reader.cancel().catch(()=>{});}
        }else body=new Uint8Array(await response.arrayBuffer());
        check(signal);clearTimeout(timer);
        if(resource && (body.byteLength!==resource.bytes || await digest(body)!==resource.sha256))throw integrityError();
        check(signal);return {body,headers:response.headers};
      }catch(error){
        check(signal);
        if(timedOut || error instanceof TypeError || error.name==='AbortError')error=networkError();
        if(error.name!=='OfflineNetworkError' || !error.retryable || attempt>=delays.length)throw error;
        const delay=retryDelay(response,delays[attempt]);retry?.({attempt:attempt+1,delay,status:error.status});
        clearTimeout(timer);signal?.removeEventListener('abort',stop);await pause(delay,signal);
      }finally{clearTimeout(timer);signal?.removeEventListener('abort',stop);controller.abort();}
    }
  }
  async function manifest(address,options){const {body}=await request(address,options);return JSON.parse(new TextDecoder().decode(body));}
  return {request,manifest};
})();
