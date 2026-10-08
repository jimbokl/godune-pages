/* An offline document keeps one complete application snapshot for its lifetime.
 * CacheStorage bindings survive a service-worker restart; Trip data is separate. */
(function(scope){
  const CACHE='godune-offline-clients:v1';
  function create({root,caches,clients}){
    const known=new Map(),key=id=>new URL('__godune_client__/'+encodeURIComponent(id),root).href;
    async function get(id){
      if(!id)return null;
      if(known.has(id))return known.get(id);
      let record=null;
      try{const response=await (await caches.open(CACHE)).match(key(id));if(response){
        const value=await response.json();
        if(typeof value.cache==='string' && /^godune-walk-offline:v[12]:/.test(value.cache))record=value;
      }}catch{/* A missing binding never authorises an unrelated snapshot. */}
      known.set(id,record);return record;
    }
    async function set(id,pack){
      if(!id)return;
      const cache=await caches.open(CACHE),record=pack?{cache:pack.cache,version:pack.version}:null;
      if(record)await cache.put(key(id),new Response(JSON.stringify(record),{headers:{'Content-Type':'application/json'}}));
      else await cache.delete(key(id));
      known.set(id,record);
    }
    async function protectedCaches(){
      const active=await clients.matchAll({type:'window',includeUncontrolled:true}),ids=new Set(active.map(client=>client.id));
      const cache=await caches.open(CACHE),protectedNames=new Set();
      for(const request of await cache.keys()){
        const id=decodeURIComponent(new URL(request.url).pathname.split('/').at(-1));
        if(!ids.has(id)){await cache.delete(request);known.delete(id);continue;}
        const record=await get(id);if(record)protectedNames.add(record.cache);
      }
      return protectedNames;
    }
    return {get,set,protectedCaches};
  }
  scope.GoduneOfflineClients={create};
  if(typeof module!=='undefined')module.exports=scope.GoduneOfflineClients;
})(globalThis);
