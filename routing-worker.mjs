import {invokeRoute} from './browser-router.mjs?v=4';
let wasm;
const hex=buffer=>[...new Uint8Array(buffer)].map(n=>n.toString(16).padStart(2,'0')).join('');
const sha=bytes=>crypto.subtle.digest('SHA-256',bytes).then(hex);
async function initialise(base,mode){
  const cache=await caches.open('godune-routing:v1'),manifestURL=new URL('data/routing-graph/manifest.json',base);
  let response;try{response=await fetch(manifestURL,{cache:'no-cache'});if(!response.ok)throw Error();}catch{response=await cache.match(manifestURL);}
  if(!response)throw Error('Дорожный граф ещё не сохранён. Откройте расчёт при подключении к сети.');
  const manifest=await response.json(),row=manifest.profiles?.[mode];
  if(manifest.version!==1||!row||!manifest.source?.id||!row.path.startsWith('data/routing-graph/'))throw Error('Дорожный граф изменился. Обновите страницу.');
  const graphURL=new URL(row.path,base);if(graphURL.origin!==self.location.origin)throw Error('Неверный адрес дорожного графа.');
  graphURL.searchParams.set('sha',row.sha256);
  let graph=await cache.match(graphURL),bytes;
  if(graph){bytes=await graph.arrayBuffer();if(bytes.byteLength!==row.bytes||await sha(bytes)!==row.sha256){await cache.delete(graphURL);graph=null;}}
  if(!graph){const response=await fetch(graphURL,{cache:'no-cache'});if(!response.ok)throw Error('Не удалось загрузить дорожный граф.');bytes=await response.arrayBuffer();if(bytes.byteLength!==row.bytes||await sha(bytes)!==row.sha256)throw Error('Загрузка дороги неполная. Попробуйте ещё раз.');}
  const raw=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  if(raw.byteLength!==row.raw_bytes||await sha(raw)!==row.raw_sha256)throw Error('Дорожный граф повреждён.');
  const moduleURL=new URL('assets/route.wasm?v=2',base);let moduleResponse;
  try{moduleResponse=await fetch(moduleURL);if(!moduleResponse.ok)throw Error();}catch{moduleResponse=await cache.match(moduleURL);}
  if(!moduleResponse)throw Error('Расчёт дороги не загрузился.');
  const moduleCopy=moduleResponse.clone();
  wasm=(await WebAssembly.instantiate(await moduleResponse.arrayBuffer())).instance.exports;
  const facts=invokeRoute(wasm,new Uint8Array(raw),'route_load').graph;
  if(facts.mode!==mode||facts.source.id!==manifest.source.id)throw Error('Источник дороги изменился.');
  // Publish a cache entry only after decompression, checksum and Rust validation.
  if(!graph)await cache.put(graphURL,new Response(bytes,{headers:{'Content-Type':'application/gzip'}})).catch(()=>{});
  await cache.put(moduleURL,moduleCopy).catch(()=>{});
  await cache.put(manifestURL,new Response(JSON.stringify(manifest),{headers:{'Content-Type':'application/json'}})).catch(()=>{});
  for(const path of ['routing-worker.mjs?v=4','browser-router.mjs?v=4'])try{const target=new URL(path,base),response=await fetch(target);if(response.ok)await cache.put(target,response);}catch{/* The road can still be used for this visit. */}
  return facts;
}
self.onmessage=async event=>{
  const data=event.data;
  if(data.type==='init')try{const graph=await initialise(data.base,data.mode);self.postMessage({type:'ready',graph});}catch(error){self.postMessage({type:'failed',error:error.message || 'Дорожный граф не открылся.'});}
  else if(data.type==='route')try{
    if(!wasm)throw Error('Расчёт дороги ещё загружается.');
    const route=invokeRoute(wasm,new TextEncoder().encode(JSON.stringify({from:data.from,to:data.to})),'route_plan').route;
    self.postMessage({type:'result',id:data.id,route});
  }catch(error){self.postMessage({type:'result',id:data.id,error:error.message});}
};
