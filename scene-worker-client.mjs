// At most one frame is in flight. A slow worker receives the newest clock,
// never an accumulating queue of obsolete frames. The photograph stays in HTML.
export async function createSceneWorker(surface,photo,input,fallback,{normalizeProfile,photoCrop,photoSourceWindow,LAYERS}){
  if(typeof Worker==='undefined'||typeof createImageBitmap!=='function'||!surface.transferControlToOffscreen)
    return fallback(surface,photo,input);
  let worker,transferred=false,closed=false,failed=false,delegate;
  let profile=normalizeProfile(input),sequence=0,viewport,photoSrc='',photoRevision=0;
  let busy=false,latest,frameCost=0,frameLag=0;
  const jobs=new Map();
  const mark=(name,options)=>performance.mark(`godune:${name}`,options);
  const layerNames=()=>LAYERS.filter(k=>profile[k].enabled).join(',');
  function stop(error){
    failed=true;worker?.terminate();worker=null;busy=false;latest=null;
    for(const job of jobs.values())job.reject(error);jobs.clear();
  }
  function replacement(){
    // A transferred canvas cannot acquire a main-thread context. Replace only
    // that overlay; its class, position, photograph and surrounding UI persist.
    if(transferred){const next=surface.cloneNode(false);surface.replaceWith(next);surface=next;transferred=false;}
    surface.style.opacity='0';return surface;
  }
  let recovering;
  async function recover(error){
    if(closed)return;
    if(recovering)return recovering;
    stop(error);mark('scene-worker-fallback');
    recovering=(async()=>{
      delegate=await fallback(replacement(),photo,profile);
      if(closed){delegate?.dispose();return;}
      if(!delegate){surface.dataset.engine='static-fallback';return;}
      if(viewport)delegate.resize(...viewport);
      surface.style.removeProperty('opacity');
      surface.dataset.renderer='main';surface.dataset.workerFallback=error.message;
    })().catch(()=>{surface.style.opacity='0';surface.dataset.engine='static-fallback';});
    return recovering;
  }
  function rpc(type,value={},transfer=[]){
    if(closed||failed)return Promise.reject(new Error('Рабочий поток сцены закрыт'));
    const id=++sequence;
    return new Promise((resolve,reject)=>{
      jobs.set(id,{resolve,reject});
      try{worker.postMessage({id,type,...value},transfer);}
      catch(error){jobs.delete(id);reject(error);}
    });
  }
  function post(type,value){
    if(closed||failed)return;
    try{worker.postMessage({type,...value});}catch(error){recover(error);}
  }
  async function uploadPhoto(){
    const ticket=++photoRevision;
    await photo.decode();
    const source=photo.currentSrc||photo.src,sourceWindow=photoSourceWindow(photo);
    const bitmap=await createImageBitmap(photo);
    if(closed||failed||ticket!==photoRevision||source!==(photo.currentSrc||photo.src)){bitmap.close();return;}
    mark('scene-worker-photo-start');
    try{await rpc('photo',{bitmap,sourceWindow},[bitmap]);}catch(error){bitmap.close();throw error;}
    if(closed||failed||ticket!==photoRevision||source!==(photo.currentSrc||photo.src))return;
    photoSrc=source;surface.dataset.photoSource=new URL(source).pathname.split('/').pop();
    if(viewport){viewport[3]=photoCrop(photo,viewport[0],viewport[1]);post('resize',{viewport});}
    surface.style.removeProperty('opacity');mark('scene-worker-photo-ready');
  }
  const photoLoaded=()=>{if(closed||failed)return;surface.style.opacity='0';uploadPhoto().catch(recover);};
  try{
    mark('scene-worker-start');
    worker=new Worker(new URL('./scene-render-worker.mjs',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{
      if(data.error&&data.fatal){recover(new Error(data.error));return;}
      const job=jobs.get(data.id);if(!job)return;jobs.delete(data.id);
      if(data.error)job.reject(new Error(data.error));else job.resolve(data);
    };
    worker.onerror=event=>{event.preventDefault();recover(new Error('Рабочий поток сцены недоступен'));};
    worker.onmessageerror=()=>recover(new Error('Ответ сцены не прочитан'));
    await photo.decode();
    const initialSource=photo.currentSrc||photo.src;
    const bitmap=await createImageBitmap(photo),sourceWindow=photoSourceWindow(photo);
    if(closed||failed){bitmap.close();throw new Error('Рабочий поток сцены недоступен');}
    const maskWidth=Math.round(Math.min(1024,photo.naturalWidth/sourceWindow[0]));
    const maskHeight=Math.round(maskWidth*(photo.naturalHeight/sourceWindow[1])/(photo.naturalWidth/sourceWindow[0]));
    const offscreen=surface.transferControlToOffscreen();transferred=true;
    let result;
    try{result=await rpc('init',{surface:offscreen,bitmap,sourceWindow,profile,maskWidth,maskHeight},[offscreen,bitmap]);}
    catch(error){bitmap.close();throw error;}
    for(const entry of result.marks||[]){
      const startTime=Math.max(0,entry.at-performance.timeOrigin);
      mark(entry.name.replace('godune:','').replace('scene-','scene-worker-'),{startTime});
    }
    photoSrc=initialSource;photo.addEventListener('load',photoLoaded);
    surface.dataset.engine='webgl-scene';surface.dataset.renderer='worker';surface.dataset.layers=layerNames();
    surface.dataset.photoSource=new URL(photoSrc).pathname.split('/').pop();mark('scene-worker-ready');
    if(photoSrc!==(photo.currentSrc||photo.src))photoLoaded();
  }catch(error){await recover(error);return delegate||null;}
  function pump(){
    if(busy||!latest||closed||failed)return;
    const [time,wind]=latest;latest=null;busy=true;
    const began=performance.now();
    rpc('draw',{time,wind}).then(data=>{
      busy=false;frameCost=data.cost;frameLag=performance.now()-began;pump();
    }).catch(recover);
  }
  return {
    get profile(){return delegate?.profile||profile;},
    get frameCost(){return frameCost;},get frameLag(){return frameLag;},
    resize(w,h,dpr=1,crop=photoCrop(photo,w,h)){
      viewport=[w,h,dpr,crop];
      if(delegate)return delegate.resize(...viewport);
      post('resize',{viewport});
      if(photoSrc!==(photo.currentSrc||photo.src))surface.style.opacity='0';
    },
    draw(time,wind=1){
      if(delegate)return delegate.draw(time,wind);
      if(photoSrc!==(photo.currentSrc||photo.src)||closed||failed)return;
      latest=[time,wind];pump();
    },
    async setProfile(value){
      profile=normalizeProfile(value);
      if(delegate)return delegate.setProfile(profile);
      await rpc('profile',{profile});surface.dataset.layers=layerNames();
    },
    setParameters(value){profile=normalizeProfile(value);if(delegate)delegate.setParameters(profile);else post('parameters',{profile});},
    dispose(){closed=true;photo.removeEventListener('load',photoLoaded);delegate?.dispose();stop(new Error('Сцена закрыта'));}
  };
}
