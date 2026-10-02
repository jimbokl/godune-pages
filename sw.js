/* Route packages are explicit downloads. Normal browsing stays network-first. */
const PREFIX = 'godune-walk-offline:v1:';
const SHELL = 'godune-offline-shell:v1';
const ROOT = self.registration.scope;
const metadataURL = new URL('__godune_package__', ROOT).href;
const jobs = new Map();
const packageReads = new Set();
let clearing;
const url = path => new URL(path, ROOT).href;
const normalized = value => {
  const u = new URL(value);
  u.search = ''; u.hash = '';
  if (u.pathname.endsWith('/')) u.pathname += 'index.html';
  return u.href;
};

self.addEventListener('install', event => event.waitUntil((async()=>{
  const response = await fetch(url('offline.html'), {cache:'no-store'});
  if (!response.ok) throw new Error('Offline page unavailable');
  await (await caches.open(SHELL)).put(url('offline.html'), response);
  await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

function packages() {
  if (clearing) return Promise.resolve([]);
  const read = readPackages();
  packageReads.add(read);
  return read.finally(() => packageReads.delete(read));
}

async function readPackages() {
  const result = [];
  for (const name of (await caches.keys()).filter(n=>n.startsWith(PREFIX))) {
    const cache = await caches.open(name), response = await cache.match(metadataURL);
    if (!response) continue;
    try {
      const record = await response.json();
      const stored = new Set((await cache.keys()).map(r=>normalized(r.url)));
      if (record.resources.every(r=>stored.has(normalized(url(r.path))))) result.push({...record, cache:name});
    } catch { /* A damaged or interrupted package is never described as ready. */ }
  }
  return result.sort((a,b)=>b.saved_at.localeCompare(a.saved_at));
}

async function download(slug, port, id) {
  if (clearing) throw new Error('Память сайта очищается. Загрузите прогулку после удаления.');
  if (jobs.has(slug)) throw new Error('Эта прогулка уже загружается.');
  const controller = new AbortController();
  let finish;
  const done = new Promise(resolve => {finish=resolve;});
  jobs.set(slug, {controller, id, done});
  let name;
  try {
    const manifestResponse = await fetch(url('offline-manifest.json'), {cache:'no-store',signal:controller.signal});
    if (!manifestResponse.ok) throw new Error('Не удалось получить список файлов. Попробуйте ещё раз.');
    const manifest = await manifestResponse.json();
    const pack = manifest.version === 1 && manifest.routes.find(r=>r.slug===slug);
    if (!pack) throw new Error('Эту прогулку пока нельзя загрузить.');
    const existing = (await packages()).find(p=>p.slug===slug && p.version===pack.version);
    if (existing) return existing;
    name = PREFIX + slug + ':' + pack.version + ':' + crypto.randomUUID();
    const cache = await caches.open(name);
    let bytes = 0, count = 0;
    for (const resource of pack.resources) {
      if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      const target = new URL(resource.path, ROOT);
      if (target.origin !== new URL(ROOT).origin || !target.pathname.startsWith(new URL(ROOT).pathname)) throw new Error('Не удалось проверить адрес файла.');
      const response = await fetch(target, {cache:'no-store',signal:controller.signal});
      if (!response.ok) throw new Error('Не все файлы загрузились. Предыдущая прогулка остаётся с вами.');
      const body = await response.arrayBuffer();
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', body))].map(n=>n.toString(16).padStart(2,'0')).join('');
      if (digest !== resource.sha256 || body.byteLength !== resource.bytes) throw new Error('Сайт обновился во время загрузки. Попробуйте ещё раз; прежняя прогулка сохранена.');
      await cache.put(target, new Response(body,{status:200,headers:response.headers}));
      bytes += body.byteLength; count++;
      port.postMessage({type:'progress',bytes,total:pack.bytes,count,files:pack.resources.length});
    }
    if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    const record = {...pack,saved_at:new Date().toISOString()};
    await cache.put(metadataURL,new Response(JSON.stringify(record),{headers:{'Content-Type':'application/json'}}));
    for (const old of (await caches.keys()).filter(n=>n.startsWith(PREFIX+slug+':') && n!==name)) await caches.delete(old);
    return {...record,cache:name};
  } catch (error) {
    if (name) await caches.delete(name);
    if (error.name==='AbortError') throw new Error('Загрузка отменена. Предыдущая прогулка сохранена.');
    if (error.name==='QuotaExceededError') throw new Error('На телефоне не хватило места. Удалите другую загруженную прогулку и попробуйте снова.');
    throw error;
  } finally { jobs.delete(slug); finish(); }
}

function clearPackages() {
  if (clearing) return clearing;
  clearing = (async () => {
    const active = [...jobs.values()];
    for (const job of active) job.controller.abort();
    await Promise.all(active.map(job=>job.done));
    await Promise.allSettled([...packageReads]);
    for (const name of (await caches.keys()).filter(name=>name.startsWith(PREFIX))) await caches.delete(name);
    return true;
  })().finally(() => { clearing = undefined; });
  return clearing;
}

self.addEventListener('message', event => {
  const port = event.ports[0], {type,slug,id} = event.data || {};
  if (!port) return;
  event.waitUntil((async()=>{
    try {
      let value;
      if (type==='LIST') value = await packages();
      else if (type==='DOWNLOAD' && typeof slug==='string') value = await download(slug,port,id);
      else if (type==='CANCEL') { const job=jobs.get(slug); if(job && job.id===id) job.controller.abort(); value=true; }
      else if (type==='CLEAR') value = await clearPackages();
      else if (type==='REMOVE' && typeof slug==='string') {
        jobs.get(slug)?.controller.abort();
        for (const name of (await caches.keys()).filter(n=>n.startsWith(PREFIX+slug+':'))) await caches.delete(name);
        value=true;
      } else throw new Error('Не удалось выполнить действие.');
      port.postMessage({type:'done',value});
    } catch(error) { port.postMessage({type:'error',message:error.message || 'Загрузка не удалась. Попробуйте снова.'}); }
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method!=='GET' || new URL(event.request.url).origin!==new URL(ROOT).origin) return;
  event.respondWith((async()=>{
    try { return await fetch(event.request); }
    catch {
      const list=await packages(), client=event.clientId && await self.clients.get(event.clientId);
      const clientURL=client && normalized(client.url);
      if(clientURL) list.sort((a,b)=>Number(b.resources.some(r=>normalized(url(r.path))===clientURL))-Number(a.resources.some(r=>normalized(url(r.path))===clientURL)));
      for(const pack of list) {
        const response=await caches.match(normalized(event.request.url),{cacheName:pack.cache,ignoreSearch:true});
        if(response) return response;
      }
      if(event.request.mode==='navigate') {
        const response=await (await caches.open(SHELL)).match(url('offline.html'));
        if(response) return response;
      }
      return Response.error();
    }
  })());
});
