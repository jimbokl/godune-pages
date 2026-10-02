// Directed, mode-specific estimates. Missing evidence never becomes zero travel.
import {baseId,personalPoints} from './personal-points.mjs?v=1';
export const TRAVEL_MODES = {foot:'Пешком',bike:'На велосипеде',car:'На машине'};
export const travelMode = trip => trip.schedule?.mode || 'foot';
export const dayBases = trip => {const day=trip.itinerary?.days.find(day=>day.id===trip.itinerary.active) || {};return {...day,start_at:baseId(day.start_at),night_at:baseId(day.night_at)};};
export const previousPlace = (trip,id) => trip.places[trip.places.indexOf(id)-1] || (trip.places[0]===id ? dayBases(trip).start_at : null);
const placeFor=(catalog,id)=>catalog?.poi?.find(p=>p.slug===id);
const anchorFor=(catalog,id,mode)=>placeFor(catalog,id)?.arrival_points?.[mode];
const stable=value=>JSON.stringify(value,(_,v)=>v && typeof v==='object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])) : v);
export function sameArrival(catalog,a,b,mode) {
  const x=anchorFor(catalog,a,mode),y=anchorFor(catalog,b,mode);
  return !!x && !!y && x.id===y.id && x.lat===y.lat && x.lon===y.lon;
}
function currentPoint(catalog,matrix,id) {
  if(typeof id==='string'&&id.startsWith('@'))return matrix?.personal_points?.some(p=>p.slug===id&&`@${p.lon},${p.lat}`===id) || false;
  const a=placeFor(catalog,id),b=matrix?.points?.find(p=>p.slug===id);
  return !!a && !!b && a.lat===b.lat && a.lon===b.lon
    && stable(a.arrival_points||{})===stable(b.arrival_points||{});
}
export function resolveAccess(trip,id,catalog,matrix) {
  const index=trip.places.indexOf(id);
  if(index<0)return null;
  return resolveAccessBetween(trip,id,previousPlace(trip,id),trip.places[index+1] || dayBases(trip).night_at,catalog,matrix);
}
export function resolveAccessBetween(trip,id,previous,next,catalog,matrix) {
  const mode=travelMode(trip),anchor=anchorFor(catalog,id,mode);
  if(!anchor)return null;
  const leg=direction=>{
    const shared=direction==='approach'?sameArrival(catalog,previous,id,mode):sameArrival(catalog,id,next,mode);
    if(shared)return {origin:'shared',minutes:0};
    if(!matrix || matrix.version!==1 || !matrix.source?.id)return {origin:'unknown',status:'unavailable',minutes:null};
    if(!currentPoint(catalog,matrix,id))return {origin:'unknown',status:'changed_point',minutes:null};
    const row=matrix.access_legs?.[`${mode}/${id}/${direction}`];
    return row?.status==='estimate' && Number.isInteger(row.minutes) && row.minutes>=0 && row.minutes<=1440
      ? {...row,origin:'estimate'} : {...row,origin:'unknown',minutes:null};
  };
  return {anchor,mode,approach:leg('approach'),back:leg('return'),source:matrix?.source};
}
export function manualLeg(trip, id) {
  const leg=trip.schedule?.stops?.[id]?.leg, previous=previousPlace(trip,id);
  if(!leg || !previous)return null;
  return leg?.from===previous && (leg.mode ? leg.mode===travelMode(trip) : trip.schedule?.mode===undefined) ? leg : null;
}
export function resolveTravel(trip, id, catalog, matrix) {
  const mode=travelMode(trip), previous=previousPlace(trip,id);
  if(!previous)return {origin:'start',minutes:0,mode};
  const manual=manualLeg(trip,id);
  if(manual)return {origin:'manual',minutes:manual.minutes,mode};
  return resolvePair(trip,previous,id,catalog,matrix);
}
export function resolvePair(trip,previous,id,catalog,matrix) {
  const mode=travelMode(trip);
  if(previous===id && placeFor(catalog,id))return {origin:'same_place',minutes:0,mode};
  if(!matrix || matrix.version!==1 || !matrix.source?.id)return {origin:'unknown',status:'unavailable',minutes:null,mode};
  for(const slug of [previous,id]) {
    if(!currentPoint(catalog,matrix,slug))return {origin:'unknown',status:'changed_point',minutes:null,mode};
  }
  const legMode=sameArrival(catalog,previous,id,mode)?'foot':mode;
  const leg=matrix.legs?.[`${legMode}/${previous}/${id}`];
  if(!leg)return {origin:'unknown',status:'missing_pair',minutes:null,mode};
  if(leg.status!=='estimate' || !Number.isInteger(leg.minutes) || leg.minutes<0 || leg.minutes>1440)
    return {...leg,origin:'unknown',minutes:null,mode,source:matrix.source};
  return {...leg,origin:'estimate',mode,leg_mode:legMode,source:matrix.source};
}
const matrices=new Map();
export function loadTravelMatrix(base) {
  const url=new URL('data/travel-matrix.json',base).href;
  if(!matrices.has(url))matrices.set(url,fetch(url,{cache:'no-cache'}).then(async response=>{
    if(!response.ok)throw new Error('Travel estimates unavailable');
    const matrix=await response.json();
    if(matrix.version!==1 || !Array.isArray(matrix.points) || !matrix.legs || !matrix.source?.id)throw new Error('Invalid travel estimates');
    return matrix;
  }).catch(error=>{matrices.delete(url);throw error;}));
  return matrices.get(url);
}
const personalLegs=new Map();
globalThis.addEventListener?.('godune:memory-clearing',()=>personalLegs.clear());
export function sameRoadSource(a,b){
  if(!a?.id||!b?.id||typeof a.sha256!=='string'||typeof a.config_sha256!=='string'||!a.profile_sha256)return false;
  // Matrix IDs additionally fingerprint catalogue entrances. Compare the actual
  // pinned map, engine and profiles before combining either generation.
  const {id:matrixId,...matrixSource}=a,{id:graphId,...graphSource}=b;
  return stable(matrixSource)===stable(graphSource);
}
export async function loadTripTravelMatrix(base,trip,catalog){
  const matrix=await loadTravelMatrix(base),points=personalPoints(trip);if(!points.length)return matrix;
  const bases=dayBases(trip),mode=travelMode(trip),copy={...matrix,points:[...matrix.points,...points],personal_points:points,legs:{...matrix.legs}};
  const pairs=trip.places.flatMap(id=>[...(bases.start_at?.startsWith('@')?[[bases.start_at,id]]:[]),...(bases.night_at?.startsWith('@')?[[id,bases.night_at]]:[])]);
  if(!pairs.length)return copy;
  try{
    const {loadBrowserRouter}=await import('./browser-router.mjs?v=1');const route=await loadBrowserRouter(base,mode);
    if(!sameRoadSource(matrix.source,route.graph.source))return copy;
    await Promise.all(pairs.map(async([from,to])=>{
      const key=`${mode}/${from}/${to}`,point=id=>points.find(p=>p.slug===id)||catalog.poi.find(p=>p.slug===id),a=point(from),b=point(to);
      if(!a||!b)return;const anchor=p=>p.arrival_points?.[mode] || p;
      const x=anchor(a),y=anchor(b),cacheKey=`${new URL(base).href}/${matrix.source.id}/${key}/${x.lon},${x.lat}/${y.lon},${y.lat}`;
      if(!personalLegs.has(cacheKey))personalLegs.set(cacheKey,route([x.lon,x.lat],[y.lon,y.lat]).catch(error=>{personalLegs.delete(cacheKey);throw error;}));
      const result=await personalLegs.get(cacheKey);copy.legs[key]={...result,engine:'godune-route',dynamic:true};
    }));
  }catch{/* Static estimates remain usable; unresolved personal roads stay unknown. */}
  return copy;
}
export function decodePath(text) {
  let at=0,lat=0,lon=0;const coordinates=[];
  const delta=()=>{let value=0,shift=0,b;
    do {b=text.charCodeAt(at++)-63;if(!Number.isFinite(b)||b<0||b>63||shift>30)throw new Error('Invalid path');value+=(b&31)*2**shift;shift+=5;} while(b>=32);
    return value%2 ? -(Math.floor(value/2)+1) : value/2;
  };
  while(at<text.length) {lat+=delta();lon+=delta();const point=[lon/100000,lat/100000];if(Math.abs(point[0])>180||Math.abs(point[1])>90)throw new Error('Invalid coordinate');coordinates.push(point);}
  return coordinates;
}
const geometries=new Map();
async function loadGeometry(base,mode,from,source) {
  const url=new URL(`data/travel-geometries/${mode}/${from}.json`,base).href,key=`${url}/${source}`;
  if(!geometries.has(key))geometries.set(key,fetch(url,{cache:'no-cache'}).then(async response=>{
    if(!response.ok)throw new Error('Road geometry unavailable');
    const data=await response.json();
    if(data.version!==1 || data.source_id!==source || !data.legs)throw new Error('Road geometry changed');
    return data;
  }).catch(error=>{geometries.delete(key);throw error;}));
  return geometries.get(key);
}
export async function tripRoadFeatures(trip,catalog,matrix,base,visible=trip.places) {
  const auto={...trip,schedule:{...trip.schedule,stops:{}}}, mode=travelMode(trip), bases=dayBases(trip);
  const shown=new Set(visible), pairs=trip.places.slice(1).map((to,i)=>[trip.places[i],to]);
  if(trip.places.length && bases.start_at && shown.has(trip.places[0])) {pairs.unshift([bases.start_at,trip.places[0]]);shown.add(bases.start_at);}
  if(trip.places.length && bases.night_at && shown.has(trip.places.at(-1))) {pairs.push([trip.places.at(-1),bases.night_at]);shown.add(bases.night_at);}
  const rows=await Promise.all(pairs.map(async ([from,to])=>{
    if(!shown.has(from) || !shown.has(to))return null;
    // A hand-entered time does not verify the path or change its geometry.
    const leg=resolvePair(auto,from,to,catalog,matrix);
    if(leg.origin!=='estimate')return null;
    try {
      const legMode=leg.leg_mode || mode;
      let coordinates=leg.dynamic?leg.geometry:null;
      if(!coordinates){const chunk=await loadGeometry(base,legMode,from,matrix.source.id),path=chunk.legs[to];if(!path)return null;coordinates=decodePath(path.points);}
      if(coordinates.length<2)return null;
      return {type:'Feature',properties:{from,to,mode:legMode,kind:'travel',minutes:leg.minutes,source_id:matrix.source.id},geometry:{type:'LineString',coordinates}};
    }catch{return null;}
  }));
  const accesses=visible.map(id=>[id,resolveAccess(trip,id,catalog,matrix),['approach','return']]);
  if(bases.start_at && shown.has(bases.start_at))accesses.push([bases.start_at,resolveAccessBetween(trip,bases.start_at,null,trip.places[0],catalog,matrix),['return']]);
  if(bases.night_at && shown.has(bases.night_at))accesses.push([bases.night_at,resolveAccessBetween(trip,bases.night_at,trip.places.at(-1),null,catalog,matrix),['approach']]);
  for(const [id,access,kinds] of accesses) {
    if(!access)continue;
    for(const [kind,leg]of [['approach',access.approach],['return',access.back]]) {
      if(!kinds.includes(kind) || leg.origin!=='estimate' || !leg.geometry)continue;
      try {
        const coordinates=decodePath(leg.geometry);if(coordinates.length<2)continue;
        rows.push({type:'Feature',properties:{from:id,to:id,mode:'foot',kind,minutes:leg.minutes,source_id:matrix.source.id},geometry:{type:'LineString',coordinates}});
      }catch{}
    }
  }
  return {type:'FeatureCollection',features:rows.filter(Boolean)};
}
