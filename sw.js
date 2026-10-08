/* Explicit complete packages. Normal browsing stays network-first. */
importScripts('offline-archive.js?v=3');
importScripts('offline-fetch.js?v=1');
importScripts('offline-storage.js?v=1');
importScripts('offline-media.js?v=1');
importScripts('offline-clients.js?v=1');
const LEGACY='godune-walk-offline:v1:',PREFIX='godune-walk-offline:v2:',SHELL='godune-offline-shell:v2',ROOT=self.registration.scope;
const metadataURL=new URL('__godune_package__',ROOT).href;
const draftURL=new URL('__godune_download__',ROOT).href;
const jobs=new Map(),removals=new Map(),packageReads=new Set();
const clientSnapshots=GoduneOfflineClients.create({root:ROOT,caches,clients:self.clients});
let clearing,snapshot,reading,epoch=0;
const pathIndexes=new WeakMap();
const packageCache=name=>name.startsWith(PREFIX)||name.startsWith(LEGACY);
const slugCache=(name,slug)=>name.startsWith(PREFIX+slug+':')||name.startsWith(LEGACY+slug+':');
const pathsOf=pack=>{if(!pathIndexes.has(pack))pathIndexes.set(pack,new Map(pack.resources.map(r=>[normalized(url(r.path)),r])));return pathIndexes.get(pack);};
const url=path=>new URL(path,ROOT).href;
const normalized=value=>{const u=new URL(value);u.search='';u.hash='';if(u.pathname.endsWith('/'))u.pathname+='index.html';return u.href;};
const invalidate=()=>{snapshot=undefined;epoch++;};
const abortCheck=signal=>{if(signal.aborted)throw new DOMException('Cancelled','AbortError');};
self.addEventListener('install',event=>event.waitUntil((async()=>{const response=await fetch(url('offline.html'),{cache:'no-store'});if(!response.ok)throw new Error('Offline page unavailable');await (await caches.open(SHELL)).put(url('offline.html'),response);await self.skipWaiting();})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{await caches.delete('godune-offline-shell:v1');await self.clients.claim();})()));
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
  for(const name of (await caches.keys()).filter(packageCache)){
    if([...jobs.values()].some(job=>job.cache===name && !job.committed))continue;
    const cache=await caches.open(name),response=await cache.match(metadataURL);if(!response)continue;
    try{const record=await response.json();validate(record);if(typeof record.saved_at!=='string' || record.compressed_files>0 && typeof DecompressionStream!=='function')continue;const stored=new Set((await cache.keys()).map(r=>normalized(r.url)));if(record.resources.every(r=>stored.has(normalized(url(r.path)))))result.push({...record,cache:name});}catch{/* An interrupted/damaged package is not ready. */}
  }
  // Retired snapshots may still serve open documents, but the library shows
  // only the most recently completed version of each package.
  const seen=new Set();return result.sort((a,b)=>b.saved_at.localeCompare(a.saved_at)).filter(pack=>{if(seen.has(pack.slug))return false;seen.add(pack.slug);return true;});
}
function validate(pack){
  if(!pack || !/^[a-z0-9-]+$/.test(pack.slug) || !Array.isArray(pack.resources) || !pack.resources.length)throw new Error('Не удалось проверить список файлов.');
  const paths=new Map();
  for(const r of pack.resources){if(!GoduneArchive.safePath(r.path) || !Number.isSafeInteger(r.bytes) || r.bytes<0 || !/^[a-f0-9]{64}$/.test(r.sha256) || paths.has(r.path))throw new Error('Не удалось проверить файл карты.');paths.set(r.path,r);}
  if(pack.bytes!==pack.resources.reduce((sum,r)=>sum+r.bytes,0))throw new Error('Размер пакета изменился.');
  for(const key of ['storage_bytes','stored_bytes'])if(pack[key]!==undefined && (!Number.isSafeInteger(pack[key]) || pack[key]<0 || pack[key]>pack.bytes))throw new Error('Размер сохранённых файлов изменился.');
  if(pack.compressed_files!==undefined && (!Number.isSafeInteger(pack.compressed_files) || pack.compressed_files<0 || pack.compressed_files>pack.resources.length))throw new Error('Состав сохранённых файлов изменился.');
  const archived=new Set(),archivePaths=new Set();let mapTiles=0;
  for(const a of pack.archives || []){if(!GoduneArchive.safePath(a.path) || paths.has(a.path) || archivePaths.has(a.path) || !Number.isSafeInteger(a.bytes) || a.bytes<=0 || !/^[a-f0-9]{64}$/.test(a.sha256) || !Array.isArray(a.resources) || !a.resources.length || a.kind!==undefined && a.kind!=='files')throw new Error('Не удалось проверить архив карты.');archivePaths.add(a.path);for(const path of a.resources){const tile=/^data\/region-map\/\d+\/\d+\/\d+\.pbf$/.test(path);if(!paths.has(path) || archived.has(path) || a.kind!=='files' && !tile)throw new Error('Не удалось проверить состав карты.');archived.add(path);if(tile)mapTiles++;}}
  if(pack.kind==='region' && (!Array.isArray(pack.bbox) || pack.bbox.length!==4 || !pack.bbox.every(Number.isFinite) || pack.bbox[0]>=pack.bbox[2] || pack.bbox[1]>=pack.bbox[3] || pack.minzoom!==5 || pack.maxzoom!==13 || !mapTiles))throw new Error('Границы карты изменились.');
  return {paths,archived};
}
async function readDrafts(){
  const result=[];
  for(const name of (await caches.keys()).filter(packageCache)){
    const cache=await caches.open(name);if(await cache.match(metadataURL))continue;
    try{const response=await cache.match(draftURL);if(!response)continue;
      const record=await response.json();if(record.schema!==1 || typeof record.created_at!=='string')continue;
      validate(record.pack);const stored=new Set((await cache.keys()).map(r=>normalized(r.url))),resources=record.pack.resources.filter(r=>stored.has(normalized(url(r.path))));
      result.push({...record,cache:name,count:resources.length,bytes:resources.reduce((sum,r)=>sum+r.bytes,0)});
    }catch{/* An unrecognised draft never becomes a ready package. */}
  }
  return result.sort((a,b)=>b.created_at.localeCompare(a.created_at));
}
async function drafts(){
  if(clearing)return [];
  const read=readDrafts();packageReads.add(read);
  try{return (await read).map(({pack,created_at,count,bytes})=>({slug:pack.slug,name:pack.name,version:pack.version,created_at,count,bytes,total:pack.bytes,files:pack.resources.length}));}
  finally{packageReads.delete(read);}
}
async function download(slug,port,id){
  if(clearing)throw new Error('Память сайта очищается. Загрузите карту после удаления.');
  if(removals.has(slug))throw new Error('Эта карта удаляется. Дождитесь конца удаления.');
  if(jobs.has(slug))throw new Error('Этот пакет уже загружается.');
  const controller=new AbortController();let finish;const done=new Promise(resolve=>{finish=resolve;}),job={controller,id,done,committed:false};jobs.set(slug,job);let name;
  try{
    const retry=extra=>{abortCheck(controller.signal);port.postMessage({type:'progress',phase:'retry',bytes,total:totalBytes,count,files:totalFiles,...extra});};
    let totalBytes=0,totalFiles=0,bytes=0,count=0;
    const manifest=await GoduneOfflineFetch.manifest(url('offline-manifest.json'),{signal:controller.signal,retry});
    const pack=manifest.version===1 && [...manifest.routes,...(manifest.regions || [])].find(p=>p.slug===slug);if(!pack)throw new Error('Этот пакет пока нельзя загрузить.');
    const {paths,archived}=validate(pack),complete=await packages(true),existing=complete.find(p=>p.slug===slug && p.version===pack.version && p.cache.startsWith(PREFIX) && !(GoduneStorage.available() && pack.storage_bytes<pack.bytes && p.compressed_files===0));if(existing)return existing;
    const partial=await readDrafts(),resume=partial.find(d=>d.cache.startsWith(PREFIX) && d.pack.slug===slug && JSON.stringify(d.pack)===JSON.stringify(pack));
    abortCheck(controller.signal);name=resume?.cache || PREFIX+slug+':'+pack.version+':'+crypto.randomUUID();job.cache=name;const cache=await caches.open(name);
    if(!resume)await cache.put(draftURL,new Response(JSON.stringify({schema:1,pack,created_at:new Date().toISOString()}),{headers:{'Content-Type':'application/json'}}));
    totalBytes=pack.bytes;totalFiles=pack.resources.length;
    const verified=new Set(),ownPaths=new Set((await cache.keys()).map(r=>normalized(r.url))),sources=[...complete,...partial.map(d=>({...d.pack,cache:d.cache}))].filter(p=>p.cache!==name),copies=new Map(),archiveCopies=new Map();
    for(const source of sources){for(const [records,destination,current] of [[source.resources,copies,paths],[source.archives || [],archiveCopies,new Map((pack.archives || []).map(a=>[a.path,a]))]]){
      for(const resource of records){const wanted=current.get(resource.path);if(wanted && wanted.bytes===resource.bytes && wanted.sha256===resource.sha256){if(!destination.has(resource.path))destination.set(resource.path,[]);destination.get(resource.path).push(source.cache);}}
    }}
    let last=0,storedBytes=0,compressedFiles=0;
    async function store(resource,body,headers){
      abortCheck(controller.signal);const types=new Headers(headers);types.set('Content-Type',GoduneArchive.contentType(resource.path));const encoded=await GoduneStorage.encode(body,types,resource.path);
      abortCheck(controller.signal);await cache.put(url(resource.path),encoded.response);ownPaths.add(normalized(url(resource.path)));return encoded;
    }
    const progress=(phase,extra={})=>{const now=Date.now();if(now-last<100 && count<pack.resources.length && (phase==='unpack' || phase==='verify'))return;last=now;port.postMessage({type:'progress',bytes,total:pack.bytes,count,files:pack.resources.length,phase,...extra});};
    async function get(resource,archive=false){
      return GoduneOfflineFetch.request(url(resource.path),{signal:controller.signal,resource,digest:GoduneArchive.digest,retry,progress:archive?received=>progress('archive',{received,archiveBytes:resource.bytes}):undefined});
    }
    async function cached(resource,candidates=[]){
      for(const source of [name,...candidates]){
        abortCheck(controller.signal);if(source===name && !ownPaths.has(normalized(url(resource.path))))continue;
        const from=source===name?cache:await caches.open(source),response=await from.match(url(resource.path));if(!response)continue;
        let decoded;try{decoded=await GoduneStorage.decode(response,resource);}catch{if(source===name)await cache.delete(url(resource.path));continue;}
        const {body,headers}=decoded;abortCheck(controller.signal);
        if(body.byteLength!==resource.bytes || await GoduneArchive.digest(body)!==resource.sha256){if(source===name)await cache.delete(url(resource.path));continue;}
        abortCheck(controller.signal);const encoded=source!==name?await store(resource,body,headers):{bytes:decoded.stored_bytes,compressed:response.headers.get('X-Godune-Storage')==='gzip-v1'};
        return {body,headers,stored_bytes:encoded.bytes,compressed:encoded.compressed};
      }
    }
    // Re-check every reused byte; an interrupted or altered cache is never trusted.
    let scan=0,checked=0;const scans=Array.from({length:4},async()=>{while(scan<pack.resources.length){const r=pack.resources[scan++];
      const reused=await cached(r,copies.get(r.path));if(reused){verified.add(r.path);bytes+=r.bytes;count++;storedBytes+=reused.stored_bytes;compressedFiles+=Number(reused.compressed);}
      checked++;progress('verify',{checked,reusedBytes:bytes});
    }});
    const run=async tasks=>{const settled=await Promise.allSettled(tasks.map(task=>task.catch(error=>{controller.abort();throw error;}))),failed=settled.find(r=>r.status==='rejected' && r.reason.name!=='AbortError') || settled.find(r=>r.status==='rejected');if(failed)throw failed.reason;};
    await run(scans);progress('files');
    const ordinary=pack.resources.filter(r=>!archived.has(r.path) && !verified.has(r.path)),selected=[];
    for(const archive of pack.archives || []){
      const missing=archive.resources.filter(path=>!verified.has(path)).map(path=>paths.get(path));if(!missing.length)continue;
      const canUnpack=typeof DecompressionStream==='function';
      const saved=canUnpack && (ownPaths.has(normalized(url(archive.path))) || archiveCopies.has(archive.path))?await cached(archive,archiveCopies.get(archive.path)):undefined;
      if(canUnpack && (saved || GoduneArchive.preferArchive(archive,missing)))selected.push(archive);else ordinary.push(...missing);
    }
    let next=0;
    const tasks=Array.from({length:Math.min(4,ordinary.length)},async()=>{while(next<ordinary.length){const r=ordinary[next++],{body,headers}=await get(r);abortCheck(controller.signal);const stored=await store(r,body,headers);storedBytes+=stored.bytes;compressedFiles+=Number(stored.compressed);verified.add(r.path);bytes+=body.byteLength;count++;progress('files');}});
    await run(tasks);
    for(const archive of selected){if(archive.resources.every(path=>verified.has(path)))continue;
      let saved=await cached(archive,archiveCopies.get(archive.path));if(!saved){saved=await get(archive,true);await cache.put(url(archive.path),new Response(saved.body,{headers:saved.headers}));ownPaths.add(normalized(url(archive.path)));}
      await GoduneArchive.unpack(saved.body,archive.resources.map(path=>paths.get(path)),async(resource,body)=>{abortCheck(controller.signal);if(verified.has(resource.path))return;
        const stored=await store(resource,body);storedBytes+=stored.bytes;compressedFiles+=Number(stored.compressed);verified.add(resource.path);bytes+=body.byteLength;count++;progress('unpack');},{signal:controller.signal});}
    abortCheck(controller.signal);if(bytes!==pack.bytes || count!==pack.resources.length)throw new Error('Не все файлы карты сохранены.');
    const record={...pack,storage_format:2,stored_bytes:storedBytes,compressed_files:compressedFiles,saved_at:new Date().toISOString()};await cache.put(metadataURL,new Response(JSON.stringify(record),{headers:{'Content-Type':'application/json'}}));abortCheck(controller.signal);job.committed=true;
    // No event can abort a committed version after this point: removals wait for done.
    try{
      const protectedNames=await clientSnapshots.protectedCaches();
      await Promise.allSettled([cache.delete(draftURL),...(pack.archives || []).map(archive=>cache.delete(url(archive.path))),...(await caches.keys()).filter(n=>slugCache(n,slug) && n!==name && !protectedNames.has(n)).map(old=>caches.delete(old))]);
    }catch{/* Cleanup failure must not undo a fully committed update. */}
    invalidate();return {...record,cache:name};
  }catch(error){if(name && (job.cancelled || error.name!=='OfflineNetworkError'))await caches.delete(name);invalidate();if(error.name==='AbortError')throw new Error('Загрузка отменена. Прежняя загрузка сохранена.');if(error.name==='QuotaExceededError')throw new Error('На телефоне не хватило места. Удалите другой пакет и попробуйте снова.');throw error;}
  finally{jobs.delete(slug);finish();}
}
function clearPackages(){
  if(clearing)return clearing;
  clearing=(async()=>{const active=[...jobs.values()];for(const job of active){job.cancelled=true;job.controller.abort();}await Promise.all(active.map(job=>job.done));await Promise.allSettled([...removals.values(),...packageReads]);for(const name of (await caches.keys()).filter(name=>packageCache(name)||name.startsWith('godune-routing:')))await caches.delete(name);invalidate();return true;})().finally(()=>{clearing=undefined;});return clearing;
}
function removePackage(slug){
  if(removals.has(slug))return removals.get(slug);
  const operation=(async()=>{const job=jobs.get(slug);if(job){job.cancelled=true;job.controller.abort();}if(job)await job.done;await Promise.allSettled([...packageReads]);for(const name of (await caches.keys()).filter(n=>slugCache(n,slug)))await caches.delete(name);invalidate();return true;})().finally(()=>removals.delete(slug));
  removals.set(slug,operation);return operation;
}
self.addEventListener('message',event=>{
  const port=event.ports[0],{type,slug,id}=event.data || {};if(!port)return;
  event.waitUntil((async()=>{try{let value;if(type==='LIST')value=await packages(true);else if(type==='DRAFTS')value=await drafts();else if(type==='MAPS')value=(await packages(true)).map(({slug,name,kind,bbox,version,checked_at})=>({slug,name,kind,bbox,version,checked_at}));else if(type==='DOWNLOAD' && typeof slug==='string')value=await download(slug,port,id);else if(type==='CANCEL'){const job=jobs.get(slug);if(job && job.id===id && !job.committed){job.cancelled=true;job.controller.abort();}value=true;}else if(type==='CLEAR')value=await clearPackages();else if(type==='REMOVE' && /^[a-z0-9-]+$/.test(slug))value=await removePackage(slug);else throw new Error('Не удалось выполнить действие.');port.postMessage({type:'done',value});}catch(error){port.postMessage({type:'error',message:error.message || 'Загрузка не удалась. Попробуйте снова.'});}})());
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
  event.respondWith((async()=>{
    const target=normalized(event.request.url),navigation=event.request.mode==='navigate';
    if(!navigation){
      const binding=await clientSnapshots.get(event.clientId);
      if(binding){
        // Read the bound package directly: it may have been superseded in LIST.
        const cache=await caches.open(binding.cache),metadata=await cache.match(metadataURL);
        if(metadata){try{
          const pack=await metadata.json();validate(pack);
          if(pack.version!==binding.version)return Response.error();
          const resource=pathsOf(pack).get(target);
          if(resource){
            let response=await cache.match(target,{ignoreSearch:true});
            try{
              if(!response)throw new Error('Missing snapshot resource');
              const decoded=await GoduneStorage.decode(response,resource);
              if(decoded.body.byteLength!==resource.bytes || await GoduneArchive.digest(decoded.body)!==resource.sha256)throw new Error('Damaged snapshot resource');
              response=new Response(decoded.body,{headers:decoded.headers});
            }catch{
              // Reconnecting is safe only when the original snapshot's bytes
              // are still available. A newer module never enters an old page.
              const checked=await GoduneOfflineFetch.request(target,{resource,digest:GoduneArchive.digest,delays:[]});
              response=new Response(checked.body,{headers:checked.headers});
            }
            return target.endsWith('.mp3')?await GoduneMedia.range(response,event.request.headers.get('Range')):response;
          }
          const path=decodeURIComponent(new URL(target).pathname.slice(new URL(ROOT).pathname.length));
          if(emptyTile(pack,path))return new Response(new Uint8Array(),{headers:{'Content-Type':'application/x-protobuf'}});
        }catch{return Response.error();}}
        // Explicitly removed packages are unavailable. Never replace their
        // modules/data with bytes from another cached release.
        if(!metadata)return Response.error();
        try{return await fetch(event.request);}catch{return Response.error();}
      }
    }
    try{
      const response=await fetch(event.request);
      if(navigation && response.ok)await clientSnapshots.set(event.resultingClientId,null);
      return response;
    }catch{
    const list=await packages(),client=event.clientId && await self.clients.get(event.clientId),clientURL=client && normalized(client.url);
    if(clientURL)list.sort((a,b)=>Number(pathsOf(b).has(clientURL))-Number(pathsOf(a).has(clientURL)));
    for(const pack of list){if(!pathsOf(pack).has(target))continue;const response=await caches.match(target,{cacheName:pack.cache,ignoreSearch:true});if(response){try{const restored=await GoduneStorage.restore(response,pathsOf(pack).get(target),GoduneArchive.digest);if(navigation)await clientSnapshots.set(event.resultingClientId,pack);return target.endsWith('.mp3')?await GoduneMedia.range(restored,event.request.headers.get('Range')):restored;}catch{/* Try another complete package; never expose internal gzip bytes. */}}}
    const path=decodeURIComponent(new URL(target).pathname.slice(new URL(ROOT).pathname.length));
    if(list.some(pack=>emptyTile(pack,path)))return new Response(new Uint8Array(),{headers:{'Content-Type':'application/x-protobuf'}});
    const routing=await caches.match(event.request,{cacheName:'godune-routing:v1'});if(routing)return routing;
    if(event.request.mode==='navigate'){const response=await (await caches.open(SHELL)).match(url('offline.html'));if(response)return response;}
    return Response.error();
  }})());
});
