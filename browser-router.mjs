// The shared Rust ABI is also exercised directly by the native/WASM parity check.
export function invokeRoute(wasm,bytes,method) {
  const p=wasm.route_alloc(bytes.length);let result,length;
  try {
    new Uint8Array(wasm.memory.buffer,p,bytes.length).set(bytes);result=wasm[method](p,bytes.length);
    length=new DataView(wasm.memory.buffer).getUint32(result,true);
    const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(new Uint8Array(wasm.memory.buffer,result+4,length)));
    if(!value.ok)throw Error(value.error);return value;
  }finally{wasm.route_free(p,bytes.length);if(result!==undefined&&length!==undefined)wasm.route_free(result,length+4);}
}
const routers=new Map();
const stops=new Map();
globalThis.addEventListener?.('godune:memory-clearing',()=>{for(const stop of [...stops.values()])stop('Память дороги очищена.');});
export function loadBrowserRouter(base,mode) {
  if(!['foot','bike','car'].includes(mode))return Promise.reject(Error('Неизвестный способ передвижения.'));
  const key=`${new URL(base).href}/${mode}`;
  if(!routers.has(key))routers.set(key,new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('routing-worker.mjs?v=4',base),{type:'module'}),pending=new Map();let id=0,ready=false;
    const fail=message=>{const error=Error(message);if(!ready)reject(error);for(const task of pending.values())task.reject(error);pending.clear();routers.delete(key);stops.delete(key);worker.terminate();};
    stops.set(key,fail);
    worker.onerror=()=>fail('Расчёт дороги не открылся. Точки поездки сохранены.');
    worker.onmessage=event=>{
      const data=event.data;
      if(data.type==='ready'){
        ready=true;const route=(from,to)=>new Promise((resolve,reject)=>{const ticket=++id;pending.set(ticket,{resolve,reject});worker.postMessage({type:'route',id:ticket,from,to});});
        route.graph=data.graph;resolve(route);
      }else if(data.type==='failed')fail(data.error);
      else if(data.type==='result'){const task=pending.get(data.id);if(!task)return;pending.delete(data.id);data.error?task.reject(Error(data.error)):task.resolve(data.route);}
    };
    worker.postMessage({type:'init',base:new URL(base).href,mode});
  }));
  return routers.get(key);
}
