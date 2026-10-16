// Route coordinates use latitude,longitude (unlike the Yandex ll marker).
const modes={foot:'pd',walking:'pd',bike:'bc',cycling:'bc',car:'auto',driving:'auto',transit:'mt',bus:'mt'};
export function yandexRouteUrl(points,mode='foot'){
 if(!Array.isArray(points)||!points.length)return null;
 const coordinates=[];
 for(const point of points){
  const lat=point?.lat,lon=point?.lon;
  if(typeof lat!=='number'||typeof lon!=='number'||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return null;
  const value=`${lat},${lon}`;
  if(coordinates.at(-1)!==value)coordinates.push(value);
 }
 const url=new URL('https://yandex.ru/maps/');
 url.searchParams.set('rtext',coordinates.length===1?`~${coordinates[0]}`:coordinates.join('~'));
 url.searchParams.set('rtt',modes[mode]||'pd');
 return url.href;
}
export function dayYandexRouteUrl(day,catalog){
 if(!day)return null;
 const extra=day.kosa_plan&&['one','two'].includes(day.kosa_plan.walks)?['vysota-efa',...(day.kosa_plan.walks==='two'?['tancuyushchiy-les']:[])]:[];
 const places=day.places||[],ids=[...extra.filter(id=>!places.includes(id)),...places];
 if(day.source_route&&day.night_at)ids.push(day.night_at);
 return yandexRouteUrl(ids.map(id=>typeof id==='object'?id:catalog.poi.find(point=>point.slug===id)),day.kosa_plan?'transit':day.schedule?.mode);
}
export function updateYandexRoute(anchor,href){
 if(!anchor)return;
 anchor.hidden=!href;
 if(href)anchor.href=href;else anchor.removeAttribute('href');
 anchor.target='_blank';anchor.rel='noopener noreferrer';
}
