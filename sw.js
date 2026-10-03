/* Explicit complete packages. Normal browsing stays network-first. */
importScripts('offline-archive.js?v=1');
const PREFIX='godune-walk-offline:v1:',SHELL='godune-offline-shell:v1',ROOT=self.registration.scope;
const metadataURL=new URL('__godune_package__',ROOT).href;
const jobs=new Map(),removals=new Map(),packageReads=new Set();
let clearing,snapshot,reading,epoch=0;
const pathIndexes=new WeakMap();
const pathsOf=pack=>{if(!pathIndexes.has(pack))pathIndexes.set(pack,new Set(pack.resources.map(r=>normalized(url(r.path)))));return pathIndexes.get(pack);};
const url=path=>new URL(path,ROOT).href;
const normalized=value=>{const u=new URL(value);u.search='';u.hash='';if(u.pathname.endsWith('/'))u.pathname+='index.html';return u.href;};
const invalidate=()=>{snapshot=undefined;epoch++;};
const abortCheck=signal=>{if(signal.aborted)throw new DOMException('Cancelled','AbortError');};
self.addEventListener('install',event=>event.waitUntil((async()=>{const response=await fetch(url('offline.html'),{cache:'no-store'});if(!response.ok)throw new Error('Offline page unavailable');await (await caches.open(SHELL)).put(url('offline.html'),response);await self.skipWaiting();})()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
function packages(force=false){
  if(clearing)return Promise.resolve([]);
  if(force)invalidate();
  if(snapshot)return Promise.resolve([...snapshot]);
  if(reading && reading.epoch===epoch)return reading.promise.then(value=>[...value]);
  const ticket=epoch,read=readPackages();packageReads.add(read);reading={epoch:ticket,promise:read};
  return read.then(value=>{if(ticket===epoch)snapshot=value;return [...value];}).finally(()=>{packageReads.delete(read);if(reading?.promise===read)reading=undefined;});
}
async function readPackages(){
  const result=[];
  for(const name of (await caches.keys()).filter(n=>n.startsWith(PREFIX))){
    if([...jobs.values()].some(job=>job.cache===name && !job.committed))continue;
    const cache=await caches.open(name),response=await cache.match(metadataURL);if(!response)continue;
    try{const record=await response.json();validate(record);if(typeof record.saved_at!=='string')continue;const stored=new Set((await cache.keys()).map(r=>normalized(r.url)));if(record.resources.every(r=>stored.has(normalized(url(r.path)))))result.push({...record,cache:name});}catch{/* An interrupted/damaged package is not ready. */}
  }
  return result.sort((a,b)=>b.saved_at.localeCompare(a.saved_at));
}
function validate(pack){
  if(!pack || !/^[a-z0-9-]+$/.test(pack.slug) || !Array.isArray(pack.resources) || !pack.resources.length)throw new Error('Не удалось проверить список файлов.');
  const paths=new Map();
  for(const r of pack.resources){if(!GoduneArchive.safePath(r.path) || !Number.isSafeInteger(r.bytes) || r.bytes<0 || !/^[a-f0-9]{64}$/.test(r.sha256) || paths.has(r.path))throw new Error('Не удалось проверить файл карты.');paths.set(r.path,r);}
  if(pack.bytes!==pack.resources.reduce((sum,r)=>sum+r.bytes,0))throw new Error('Размер пакета изменился.');
  const archived=new Set();
  for(const a of pack.archives || []){if(!GoduneArchive.safePath(a.path) || !Number.isSafeInteger(a.bytes) || a.bytes<=0 || !/^[a-f0-9]{64}$/.test(a.sha256) || !Array.isArray(a.resources))throw new Error('Не удалось проверить архив карты.');for(const path of a.resources){if(!paths.has(path) || archived.has(path) || !/^data\/region-map\/\d+\/\d+\/\d+\.pbf$/.test(path))throw new Error('Не удалось проверить состав карты.');archived.add(path);}}
  if(pack.kind==='region' && (!Array.isArray(pack.bbox) || pack.bbox.length!==4 || !pack.bbox.every(Number.isFinite) || pack.bbox[0]>=pack.bbox[2] || pack.bbox[1]>=pack.bbox[3] || pack.minzoom!==5 || pack.maxzoom!==13 || !archived.size))throw new Error('Границы карты изменились.');
  return {paths,archived};
}
async function download(slug,port,id){
  if(clearing)throw new Error('Память сайта очищается. Загрузите карту после удаления.');
  if(removals.has(slug))throw new Error('Эта карта удаляется. Дождитесь конца удаления.');
  if(jobs.has(slug))throw new Error('Этот пакет уже загружается.');
  const controller=new AbortController();let finish;const done=new Promise(resolve=>{finish=resolve;}),job={controller,id,done,committed:false};jobs.set(slug,job);let name;
  try{
    const response=await fetch(url('offline-manifest.json'),{cache:'no-store',signal:controller.signal});if(!response.ok)throw new Error('Не удалось получить список файлов. Попробуйте ещё раз.');
    const manifest=await response.json(),pack=manifest.version===1 && [...manifest.routes,...(manifest.regions || [])].find(p=>p.slug===slug);if(!pack)throw new Error('Этот пакет пока нельзя загрузить.');
    const {paths,archived}=validate(pack),existing=(await packages(true)).find(p=>p.slug===slug && p.version===pack.version);if(existing)return existing;
    name=PREFIX+slug+':'+pack.version+':'+crypto.randomUUID();job.cache=name;const cache=await caches.open(name);
    let bytes=0,count=0,last=0;
    const progress=(phase,extra={})=>{const now=Date.now();if(now-last<100 && count<pack.resources.length && phase==='unpack')return;last=now;port.postMessage({type:'progress',bytes,total:pack.bytes,count,files:pack.resources.length,phase,...extra});};
    async function get(resource,archive=false){
      abortCheck(controller.signal);const response=await fetch(url(resource.path),{cache:'no-store',signal:controller.signal});if(!response.ok)throw new Error('Не все файлы загрузились. Прежняя загрузка сохранена.');
      let body;
      if(archive && response.body){const reader=response.body.getReader(),chunks=[];let received=0;try{while(true){abortCheck(controller.signal);const {value,done}=await reader.read();if(done)break;received+=value.length;if(received>resource.bytes)throw new Error('Размер архива изменился.');chunks.push(value);progress('archive',{received,archiveBytes:resource.bytes});}body=new Uint8Array(received);let offset=0;for(const part of chunks){body.set(part,offset);offset+=part.length;}}finally{await reader.cancel().catch(()=>{});}}
      else body=new Uint8Array(await response.arrayBuffer());
      abortCheck(controller.signal);if(body.byteLength!==resource.bytes || await GoduneArchive.digest(body)!==resource.sha256)throw new Error('Сайт обновился во время загрузки. Попробуйте ещё раз; прежняя загрузка сохранена.');
      return {body,headers:response.headers};
    }
    const ordinary=pack.resources.filter(r=>!archived.has(r.path));let next=0;
    const tasks=Array.from({length:Math.min(4,ordinary.length)},async()=>{while(next<ordinary.length){const r=ordinary[next++],{body,headers}=await get(r);abortCheck(controller.signal);await cache.put(url(r.path),new Response(body,{status:200,headers}));bytes+=body.byteLength;count++;progress('files');}});
    const settled=await Promise.allSettled(tasks.map(task=>task.catch(error=>{controller.abort();throw error;})));const failed=settled.find(r=>r.status==='rejected' && r.reason.name!=='AbortError') || settled.find(r=>r.status==='rejected');if(failed)throw failed.reason;
    for(const archive of pack.archives || []){const {body}=await get(archive,true);await GoduneArchive.unpack(body,archive.resources.map(path=>paths.get(path)),async(resource,body)=>{abortCheck(controller.signal);await cache.put(url(resource.path),new Response(body,{headers:{'Content-Type':'application/x-protobuf'}}));bytes+=body.byteLength;count++;progress('unpack');},{signal:controller.signal});}
    abortCheck(controller.signal);if(bytes!==pack.bytes || count!==pack.resources.length)throw new Error('Не все файлы карты сохранены.');
    const record={...pack,saved_at:new Date().toISOString()};await cache.put(metadataURL,new Response(JSON.stringify(record),{headers:{'Content-Type':'application/json'}}));abortCheck(controller.signal);job.committed=true;
    // No event can abort a committed version after this point: removals wait for done.
    await Promise.allSettled((await caches.keys()).filter(n=>n.startsWith(PREFIX+slug+':') && n!==name).map(old=>caches.delete(old)));
    invalidate();return {...record,cache:name};
  }catch(error){if(name)await caches.delete(name);invalidate();if(error.name==='AbortError')throw new Error('Загрузка отменена. Прежняя загрузка сохранена.');if(error.name==='QuotaExceededError')throw new Error('На телефоне не хватило места. Удалите другой пакет и попробуйте снова.');throw error;}
  finally{jobs.delete(slug);finish();}
}
function clearPackages(){
  if(clearing)return clearing;
  clearing=(async()=>{const active=[...jobs.values()];for(const job of active)job.controller.abort();await Promise.all(active.map(job=>job.done));await Promise.allSettled([...removals.values(),...packageReads]);for(const name of (await caches.keys()).filter(name=>name.startsWith(PREFIX)||name.startsWith('godune-routing:')))await caches.delete(name);invalidate();return true;})().finally(()=>{clearing=undefined;});return clearing;
}
function removePackage(slug){
  if(removals.has(slug))return removals.get(slug);
  const operation=(async()=>{const job=jobs.get(slug);job?.controller.abort();if(job)await job.done;await Promise.allSettled([...packageReads]);for(const name of (await caches.keys()).filter(n=>n.startsWith(PREFIX+slug+':')))await caches.delete(name);invalidate();return true;})().finally(()=>removals.delete(slug));
  removals.set(slug,operation);return operation;
}
self.addEventListener('message',event=>{
  const port=event.ports[0],{type,slug,id}=event.data || {};if(!port)return;
  event.waitUntil((async()=>{try{let value;if(type==='LIST')value=await packages(true);else if(type==='MAPS')value=(await packages(true)).map(({slug,name,kind,bbox,version,checked_at})=>({slug,name,kind,bbox,version,checked_at}));else if(type==='DOWNLOAD' && typeof slug==='string')value=await download(slug,port,id);else if(type==='CANCEL'){const job=jobs.get(slug);if(job && job.id===id && !job.committed)job.controller.abort();value=true;}else if(type==='CLEAR')value=await clearPackages();else if(type==='REMOVE' && /^[a-z0-9-]+$/.test(slug))value=await removePackage(slug);else throw new Error('Не удалось выполнить действие.');port.postMessage({type:'done',value});}catch(error){port.postMessage({type:'error',message:error.message || 'Загрузка не удалась. Попробуйте снова.'});}})());
});
function emptyTile(pack,path){
  if(pack.kind!=='region' || pathsOf(pack).has(normalized(url(path))))return false;
  const match=/^data\/region-map\/(\d+)\/(\d+)\/(\d+)\.pbf$/.exec(path);if(!match)return false;
  const [z,x,y]=match.slice(1).map(Number),n=2**z;if(z<pack.minzoom || z>pack.maxzoom || x>=n || y>=n)return false;
  const lat=row=>Math.atan(Math.sinh(Math.PI*(1-2*row/n)))*180/Math.PI,b=[x/n*360-180,lat(y+1),(x+1)/n*360-180,lat(y)];
  return b[0]<pack.bbox[2] && b[2]>pack.bbox[0] && b[1]<pack.bbox[3] && b[3]>pack.bbox[1];
}
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET' || new URL(event.request.url).origin!==new URL(ROOT).origin)return;
  event.respondWith((async()=>{try{return await fetch(event.request);}catch{
    const list=await packages(),client=event.clientId && await self.clients.get(event.clientId),clientURL=client && normalized(client.url);
    if(clientURL)list.sort((a,b)=>Number(pathsOf(b).has(clientURL))-Number(pathsOf(a).has(clientURL)));
    const target=normalized(event.request.url);for(const pack of list){if(!pathsOf(pack).has(target))continue;const response=await caches.match(target,{cacheName:pack.cache,ignoreSearch:true});if(response)return response;}
    const path=decodeURIComponent(new URL(target).pathname.slice(new URL(ROOT).pathname.length));
    if(list.some(pack=>emptyTile(pack,path)))return new Response(new Uint8Array(),{headers:{'Content-Type':'application/x-protobuf'}});
    const routing=await caches.match(event.request,{cacheName:'godune-routing:v1'});if(routing)return routing;
    if(event.request.mode==='navigate'){const response=await (await caches.open(SHELL)).match(url('offline.html'));if(response)return response;}
    return Response.error();
  }})());
});
