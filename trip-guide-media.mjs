// Rasterize our own static maps and photographs only when a guide is requested.
// A document never needs a network connection to display its maps afterwards.
const escape=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export const guideHash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
export function overviewSvg(day,land,water={routes:{}}) {
  const points=day.stops.filter(p=>Number.isFinite(p.lon)&&Number.isFinite(p.lat));
  if(!points.length)return null;
  const w=1000,h=700,margin=80,cos=Math.cos(points.reduce((n,p)=>n+p.lat,0)/points.length*Math.PI/180);
  const xs=points.map(p=>p.lon*cos),ys=points.map(p=>p.lat),xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys);
  const scale=Math.min((w-2*margin)/Math.max(xmax-xmin,.006*cos),(h-2*margin)/Math.max(ymax-ymin,.006));
  const center=[(xmin+xmax)/2,(ymin+ymax)/2],xy=([lon,lat])=>[w/2+(lon*cos-center[0])*scale,h/2-(lat-center[1])*scale];
  const path=ring=>ring.map((c,i)=>{const [x,y]=xy(c);return `${i?'L':'M'}${x.toFixed(1)},${y.toFixed(1)}`;}).join('');
  const ground=(land.features || []).filter(f=>['Polygon','MultiPolygon'].includes(f.geometry?.type)).map(f=>{
    const polys=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
    return `<path fill="#f3f1e8" stroke="#c3ceca" stroke-width="2" fill-rule="evenodd" d="${polys.map(poly=>poly.map(r=>path(r)+'Z').join('')).join('')}"/>`;
  }).join('');
  const rivers=Object.values(water.routes || {}).flatMap(c=>c.features || []).filter(f=>['Polygon','MultiPolygon'].includes(f.geometry?.type)).map(f=>{
    const polys=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
    return `<path fill="#c8dde8" stroke="#93b5c8" stroke-width="1.5" fill-rule="evenodd" d="${polys.map(poly=>poly.map(r=>path(r)+'Z').join('')).join('')}"/>`;
  }).join('');
  const roads=(day.roads?.features || []).filter(f=>f.geometry?.type==='LineString').map(f=>`<path fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" d="${path(f.geometry.coordinates)}"/><path fill="none" stroke="#4b7d9d" stroke-width="6" stroke-linecap="round" d="${path(f.geometry.coordinates)}"/>`).join('');
  const markers=points.map((p,i)=>{const [x,y]=xy([p.lon,p.lat]);return `<g><circle cx="${x}" cy="${y}" r="25" fill="#fff" stroke="#365e78" stroke-width="3"/><text x="${x}" y="${y+8}" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#233d4b">${i+1}</text><title>${escape(p.name)}</title></g>`;}).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="1000" height="700" fill="#c8dde8"/>${ground}${rivers}${roads}${markers}<path d="M948 65 L960 28 L972 65" fill="#233d4b"/><text x="960" y="89" text-anchor="middle" font-family="sans-serif" font-size="22" fill="#233d4b">С</text></svg>`;
}
async function raster(bytes,type,{signal,maxWidth=1000,jpeg=false}={}) {
  signal?.throwIfAborted();
  const url=URL.createObjectURL(new Blob([bytes],{type})),img=new Image();
  try {
    await new Promise((resolve,reject)=>{const cancel=()=>{img.src='';reject(signal.reason || new DOMException('Отменено','AbortError'));};
      img.onload=()=>{signal?.removeEventListener('abort',cancel);resolve();};img.onerror=()=>{signal?.removeEventListener('abort',cancel);reject(Error('guide_image_unreadable'));};
      signal?.addEventListener('abort',cancel,{once:true});img.src=url;if(signal?.aborted)cancel();});
    signal?.throwIfAborted();const ratio=Math.min(1,maxWidth/img.naturalWidth),canvas=document.createElement('canvas');
    canvas.width=Math.round(img.naturalWidth*ratio);canvas.height=Math.round(img.naturalHeight*ratio);
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('guide_canvas_unavailable');
    ctx.fillStyle='#f8f8f3';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,jpeg?'image/jpeg':'image/png',.87));if(!blob)throw Error('guide_image_unreadable');
    const result={bytes:new Uint8Array(await blob.arrayBuffer()),width:canvas.width,height:canvas.height,kind:jpeg?'jpeg':'png'};
    signal?.throwIfAborted();canvas.width=canvas.height=1;return result;
  }finally{img.src='';URL.revokeObjectURL(url);}
}
export async function collectGuideMedia(snapshot,base,{signal,onProgress=()=>{}}={}) {
  const read=async path=>{signal?.throwIfAborted();const r=await fetch(new URL(path,base),{signal});if(!r.ok)throw Error('guide_maps_unavailable');return {bytes:new Uint8Array(await r.arrayBuffer()),type:r.headers.get('content-type')};};
  const json=async path=>JSON.parse(new TextDecoder().decode((await read(path)).bytes));
  const [land,source,water]=await Promise.all([json('data/region-map/land.geojson'),json('data/region-map/source.json'),json('data/guide-water.json')]);
  const media={maps:{},photos:{},overview:{},qrs:{},source,warnings:[]};
  const qr=async id=>{const r=await read(`assets/guide-qrs/${id}.svg`);return raster(r.bytes,'image/svg+xml',{signal});};
  media.qrs.planner=await qr('planner');
  const unique=new Map(snapshot.days.flatMap(d=>d.stops).map(p=>[p.id,p]));
  for(const point of unique.values()){
    signal?.throwIfAborted();onProgress(`Готовим карту: ${point.name}…`);
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(point.id))throw Error('guide_unknown_point');
    const path=`assets/card-maps/${point.id}-day.svg`,raw=await read(path);
    media.maps[point.id]={...await raster(raw.bytes,'image/svg+xml',{signal}),path,sha256:await guideHash(raw.bytes)};
    media.qrs[point.id]=await qr(point.id);
    if(point.photo){try{const photo=await read(point.photo);media.photos[point.id]={...await raster(photo.bytes,photo.type || 'image/jpeg',{signal,jpeg:true,maxWidth:1100}),path:point.photo,sha256:await guideHash(photo.bytes)};}
      catch(error){signal?.throwIfAborted();media.warnings.push(`Фото «${point.name}» не загрузилось. Карта и текст сохранены.`);}}
  }
  for(const day of snapshot.days){const svg=overviewSvg(day,land,water);if(svg)media.overview[day.id]=await raster(new TextEncoder().encode(svg),'image/svg+xml',{signal});}
  return media;
}
