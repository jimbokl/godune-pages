// Shared with the worker and deterministic native/WASM comparison tests.
const ignored=new Set(['г','город','д','дом','т']);
// Unicode letters are explicit: JavaScript \w covers only ASCII.
export function words(value){return (String(value).toLocaleLowerCase('ru').replaceAll('ё','е').match(/[0-9]+|\p{Alphabetic}+/gu)||[]).filter(w=>!ignored.has(w)).map(w=>['к','корп'].includes(w)?'корпус':w==='стр'?'строение':w==='ул'?'улица':w==='пр'?'проспект':w);}
export function fallbackAddressScore(text,query){const all=words(text),terms=words(query);if(!terms.length)return 0;if(text.includes('\t')){const house=words(text.split('\t').at(-1)),tail=terms.at(-1),numeric=/^\d+$/.test(tail)?tail:tail.length===1&&/^\d+$/.test(terms.at(-2)||'')?terms.at(-2):null;if(numeric&&!house.includes(numeric))return 0;if(numeric&&tail.length===1&&!/^\d+$/.test(tail)&&!house.includes(tail))return 0;}let n=0;for(const term of terms){if(all.includes(term))n+=/^\d+$/.test(term)?30:10;else if(!/^\d+$/.test(term)&&all.some(w=>w.startsWith(term)))n+=5;else return 0;}return n;}
export function makeAddressIndex(data){
 if(data.version!==1||!Array.isArray(data.records))throw Error('Формат адресов не поддерживается.');
 const rows=data.records.map(r=>({id:r[0],name:r[1],locality:r[2],street:r[3],house:r[4],lon:r[5],lat:r[6],precision:r[7],text:r.slice(1,5).join('\t')}));
 const tokens=new Map();
 rows.forEach((r,i)=>{const keys=new Set(words(r.text).flatMap(w=>/^\d+$/.test(w)?['#'+w]:[w.slice(0,1),w.slice(0,2)]));for(const key of keys){if(!tokens.has(key))tokens.set(key,[]);tokens.get(key).push(i);}});
 return {rows,tokens,metadata:{snapshot_at:data.snapshot_at,counts:data.counts}};
}
export function searchAddresses(index,query,score=fallbackAddressScore,near){
 const terms=words(query);if(!terms.length)return {results:[],total:0};
 const lists=terms.map(w=>index.tokens.get(/^\d+$/.test(w)?'#'+w:w.slice(0,2))||[]).sort((a,b)=>a.length-b.length);
 const candidates=lists[0],sets=lists.slice(1).map(x=>new Set(x)),ranked=[];
 for(const id of candidates){if(!sets.every(s=>s.has(id)))continue;const r=index.rows[id],n=score(r.text,query);if(!n)continue;
 const hasHouse=terms.some(w=>/^\d+$/.test(w)),priority=hasHouse?(r.precision==='building'?12:r.precision==='point'?10:0):(r.precision==='settlement'?12:r.precision==='street'?8:0);
 const distance=near?Math.hypot((r.lon-near[0])*Math.cos(near[1]*Math.PI/180),r.lat-near[1]):0;
 ranked.push({r,score:n+priority,distance});}
 ranked.sort((a,b)=>b.score-a.score||a.distance-b.distance||a.r.id.localeCompare(b.r.id,'en'));
 const unique=[],buckets=new Map();for(const x of ranked){const r=x.r,key=r.precision==='settlement'?'s:'+r.name:r.house?[r.locality,r.street,r.house].join('|'):r.id,bucket=buckets.get(key)||[];if(bucket.some(y=>Math.hypot(r.lon-y.r.lon,r.lat-y.r.lat)<.001))continue;bucket.push(x);buckets.set(key,bucket);unique.push(x);}return {results:unique.slice(0,8).map(x=>x.r),total:unique.length};
}
export async function loadAddressEngine(base){
 const response=await fetch(new URL('data/addresses.json',base));if(!response.ok)throw Error('Адреса не загрузились.');
 const index=makeAddressIndex(await response.json());let score=fallbackAddressScore,engine='javascript';
 try{const response=await fetch(new URL('assets/search.wasm',base));if(!response.ok)throw Error();const {instance}=await WebAssembly.instantiate(await response.arrayBuffer());const e=instance.exports,encoder=new TextEncoder();if(!e.address_text_score)throw Error();
 score=(text,query)=>{const a=encoder.encode(text),b=encoder.encode(query),ap=e.alloc(a.length),bp=e.alloc(b.length);try{const memory=new Uint8Array(e.memory.buffer);memory.set(a,ap);memory.set(b,bp);return e.address_text_score(ap,a.length,bp,b.length);}finally{e.dealloc(ap,a.length);e.dealloc(bp,b.length);}};engine='rust-wasm';}catch{/* The same matching contract keeps address picking usable without WASM. */}
 return {search:(query,near)=>({...searchAddresses(index,query,score,near),...index.metadata,engine})};
}
