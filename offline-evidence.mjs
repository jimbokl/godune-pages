import './offline-storage.js?v=1';

const digest=async body=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',body))].map(n=>n.toString(16).padStart(2,'0')).join('');
const safePath=path=>typeof path==='string' && !path.startsWith('/') && !path.includes(':') && !path.includes('\\') && !path.includes('?') && !path.includes('#') && path.split('/').every(part=>part && part!=='.' && part!=='..');

// Read only complete packages returned by the shared worker. No network request,
// cache deletion or implicit download; try another package if a file is damaged.
export async function verifiedOfflineResource(packs,path,base,expectedHash,{readCache=(name,url)=>caches.match(url,{cacheName:name,ignoreSearch:true})}={}) {
  if(!safePath(path))return null;
  for(const pack of packs || []){
    const resource=pack.resources?.find(row=>row.path===path);
    if(!resource || !pack.cache || expectedHash && resource.sha256!==expectedHash)continue;
    try{
      const response=await readCache(pack.cache,new URL(path,base).href);
      if(!response || !response.ok)continue;
      const {body}=await globalThis.GoduneStorage.decode(response,resource);
      if(body.byteLength!==resource.bytes || await digest(body)!==resource.sha256)continue;
      return {body,resource,pack};
    }catch{/* A damaged copy is not evidence of offline readiness. */}
  }
  return null;
}
