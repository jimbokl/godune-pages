import {emptyProfile,validProfile,applyProfileAction} from './personalization-state.mjs?v=2026101904';
export const PROFILE_DB='godune-context-profile', PROFILE_KEY='godune-context-profile:v1';
const copy=value=>structuredClone(value);

// Separate from Trip's database, clock, history and mirrors. Messages only wake
// readers: every write re-reads the authoritative record in one transaction.
export function createProfileMemory(catalog,environment=globalThis){
  let current=emptyProfile(),db,storage,mode='loading',saved=false,issue=null,queue=Promise.resolve(),closed=false;
  const listeners=new Set();let channel;
  try{storage=environment.localStorage;}catch{}
  try{channel=new environment.BroadcastChannel(PROFILE_DB);}catch{}
  const notify=()=>{for(const listener of listeners){try{listener(snapshot());}catch{/* Views do not own persistence. */}}};
  const snapshot=()=>({record:copy(current),saved,mode,issue});
  function checked(raw){
    if(raw===undefined || raw===null)return null;
    let value=raw;
    try{if(typeof raw==='string')value=raw.length>150000?null:JSON.parse(raw);}catch{throw Error('profile-damaged-or-newer');}
    // A record written before the system clock moved back remains readable.
    const highWater=Math.max(Date.now(),Date.parse(value?.last_seen_at) || 0);
    if(!validProfile(value,catalog,highWater))throw Error('profile-damaged-or-newer');
    return value;
  }
  function adopt(record,persisted=true){
    if(record && saved && (record.generation<current.generation || record.generation===current.generation && record.revision<current.revision))return;
    current=record || current;saved=persisted;issue=null;notify();
  }
  function failure(error){saved=false;issue=error.message==='profile-damaged-or-newer'?'damaged':'unavailable';notify();}
  const readDB=()=>new Promise((resolve,reject)=>{
    const tx=db.transaction('profile','readonly'),request=tx.objectStore('profile').get('current');
    tx.oncomplete=()=>{try{resolve(checked(request.result));}catch(error){reject(error);}};
    tx.onabort=()=>reject(tx.error || Error('profile-unavailable'));tx.onerror=()=>{};
  });
  const ready=(async()=>{
    try{
      db=await new Promise((resolve,reject)=>{
        const request=environment.indexedDB.open(PROFILE_DB,1);
        let refused=false;
        request.onupgradeneeded=()=>request.result.createObjectStore('profile');
        request.onsuccess=()=>{if(refused)request.result.close();else resolve(request.result);};
        request.onerror=()=>{refused=true;reject(request.error);};request.onblocked=()=>{refused=true;reject(Error('profile-blocked'));};
      });
      if(closed){db.close();return;}
      db.onversionchange=()=>{db.close();db=null;mode='unavailable';failure(Error('profile-unavailable'));};
      mode='indexeddb';adopt(await readDB());
    }catch(error){
      if(db){failure(error);return;}
      mode='local';
      try{if(!storage)throw Error('profile-unavailable');adopt(checked(storage.getItem(PROFILE_KEY)));}catch(problem){failure(problem);}
    }
  })();
  async function sync(){
    await ready;if(closed)return;
    try{const record=db?await readDB():checked(storage.getItem(PROFILE_KEY));if(record && (record.revision!==current.revision || record.generation!==current.generation))adopt(record);}
    catch(error){failure(error);}
  }
  function transaction(action,generation){
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('profile','readwrite'),store=tx.objectStore('profile'),request=store.get('current');let result,problem;
      request.onsuccess=()=>{
        try{
          let latest;
          try{latest=checked(request.result) || current;}catch(error){if(action.type!=='reset')throw error;latest=current;}
          if(action.type!=='reset' && latest.generation!==generation){result={record:latest,saved:true,conflict:true};return;}
          const record=applyProfileAction(latest,action,catalog);
          if(record!==latest)store.put(record,'current');
          result={record,saved:true,conflict:false};
        }catch(error){problem=error;tx.abort();}
      };
      tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(problem || tx.error || Error('profile-unavailable'));tx.onerror=()=>{};
    });
  }
  function change(action,{generation=current.generation}={}){
    action=copy(action);
    const work=async()=>{
      await ready;
      try{
        let result;
        if(db)result=await transaction(action,generation);
        else{
          const local=()=>{
            let latest;
            try{if(!storage)throw Error('profile-unavailable');latest=checked(storage.getItem(PROFILE_KEY)) || current;}
            catch(error){if(action.type!=='reset')throw error;latest=current;}
            if(action.type!=='reset' && latest.generation!==generation)return {record:latest,saved:true,conflict:true};
            const record=applyProfileAction(latest,action,catalog);
            storage.setItem(PROFILE_KEY,JSON.stringify(record));return {record,saved:true,conflict:false};
          };
          // localStorage has no atomic compare-and-set. Without Web Locks keep
          // edits in this tab instead of overwriting a concurrent durable edit.
          if(!environment.navigator?.locks?.request)throw Error('profile-unavailable');
          result=await environment.navigator.locks.request(PROFILE_DB,local);
        }
        adopt(result.record,result.saved);
        if(!result.conflict){try{channel?.postMessage({revision:current.revision});}catch{/* Durable write already succeeded. */}}
        return {...snapshot(),conflict:result.conflict};
      }catch(error){
        // Preserve damaged/future records. Explicit reset is the sole recovery.
        // Storage failure cannot reject a successful, separate Trip action.
        try{current=applyProfileAction(current,action,catalog);}catch{}
        failure(error);return {...snapshot(),conflict:false};
      }
    };
    const pending=queue.then(work,work);queue=pending.catch(()=>{});return pending;
  }
  const onStorage=event=>{if(event.key===PROFILE_KEY)sync();};
  environment.addEventListener?.('storage',onStorage);
  if(channel)channel.onmessage=()=>sync();
  return {ready,sync,change,get:snapshot,subscribe(callback){listeners.add(callback);return ()=>listeners.delete(callback);},close(){closed=true;db?.close();channel?.close();environment.removeEventListener?.('storage',onStorage);listeners.clear();}};
}
