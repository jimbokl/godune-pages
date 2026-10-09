import {bookingEffects} from './trip-bookings-state.mjs?v=3';
import {railWalkBases} from './rail-access.mjs?v=3';
// Directed, mode-specific estimates. Missing evidence never becomes zero travel.
import {baseId,personalPoints} from './personal-points.mjs?v=3';
import {baseTransport,mobilitySegments,accessModes,travelVia} from './day-mobility.mjs?v=4';
export const TRAVEL_MODES = {foot:'Пешком',bike:'На велосипеде',car:'На машине'};
export const travelMode = trip => trip.schedule?.mode || 'foot';
export const dayBases = trip => {const day=trip.itinerary?.days.find(day=>day.id===trip.itinerary.active) || {};const bookings=bookingEffects(trip);return railWalkBases(trip,{...day,start_at:baseId(bookings.start?.location||day.start_at),night_at:baseId(bookings.night?.location||day.night_at),end_at:baseId(bookings.end?.location)});};
export const previousPlace = (trip,id) => trip.places[trip.places.indexOf(id)-1] || (trip.places[0]===id ? dayBases(trip).start_at : null);
const placeFor=(catalog,id)=>catalog?.poi?.find(p=>p.slug===id);
const anchorFor=(catalog,id,mode)=>placeFor(catalog,id)?.arrival_points?.[mode];
const stable=value=>JSON.stringify(value,(_,v)=>v && typeof v==='object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])) : v);
// Rust/Python JSON writers may differ by one float ULP for the same GPS value.
const sameCoordinate=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)
  && Math.abs(a-b)<=4*Number.EPSILON*Math.max(1,Math.abs(a),Math.abs(b));
export function sameArrival(catalog,a,b,mode) {
  const x=anchorFor(catalog,a,mode),y=anchorFor(catalog,b,mode);
  return !!x && !!y && x.id===y.id && x.lat===y.lat && x.lon===y.lon;
}
function currentPoint(catalog,matrix,id) {
  if(typeof id==='string'&&id.startsWith('@'))return matrix?.personal_points?.some(p=>p.slug===id&&`@${p.lon},${p.lat}`===id) || false;
  const a=placeFor(catalog,id),b=matrix?.points?.find(p=>p.slug===id);
  return !!a && !!b && sameCoordinate(a.lat,b.lat) && sameCoordinate(a.lon,b.lon)
    && stable(a.arrival_points||{})===stable(b.arrival_points||{});
}
export function resolveAccess(trip,id,catalog,matrix) {
  const index=trip.places.indexOf(id);
  if(index<0)return null;
  const bases=dayBases(trip);
  return resolveAccessBetween(trip,id,previousPlace(trip,id),trip.places[index+1] || bases.night_at || bases.end_at,catalog,matrix);
}
export function resolveAccessBetween(trip,id,previous,next,catalog,matrix) {
  const profiles=accessModes(trip,id,previous,next,dayBases(trip));
  const mode=profiles.approach!=='foot'?profiles.approach:profiles.return,anchor=anchorFor(catalog,id,mode);
  if(!anchor)return null;
  const leg=direction=>{
    if(profiles[direction]==='foot')return {origin:'shared',minutes:0};
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
  const mode=mobilitySegments(trip,previous,id,dayBases(trip))[0].mode;
  return leg?.from===previous && (leg.mode ? leg.mode===mode : trip.schedule?.mode===undefined)
    && (leg.via || null)===travelVia(trip,previous,id,dayBases(trip)) ? leg : null;
}
export function resolveTravel(trip, id, catalog, matrix) {
  const mode=travelMode(trip), previous=previousPlace(trip,id);
  if(!previous)return {origin:'start',minutes:0,mode};
  const manual=manualLeg(trip,id);
  if(manual)return {origin:'manual',minutes:manual.minutes,mode:manual.mode || mode};
  return resolvePair(trip,previous,id,catalog,matrix);
}
export function resolvePair(trip,previous,id,catalog,matrix) {
  const segments=mobilitySegments(trip,previous,id,dayBases(trip));
  const vehicle=baseTransport(trip);
  if(vehicle && segments.some(part=>part.kind==='travel' && part.mode===vehicle.mode && (part.from===vehicle.via || part.to===vehicle.via)) && !anchorFor(catalog,vehicle.via,vehicle.mode))
    return {origin:'unknown',status:'parking_unverified',mode:vehicle.mode,minutes:null};
  if(segments.length===1)return resolveRoadPair(previous,id,catalog,matrix,segments[0].mode);
  const parts=segments.map(part=>{
    if(part.kind==='travel')return {...resolveRoadPair(part.from,part.to,catalog,matrix,part.mode),...part};
    if(!anchorFor(catalog,part.from,part.mode))return {...part,origin:'unknown',status:'parking_unverified',minutes:null};
    const row=matrix?.version===1 && matrix.source?.id && currentPoint(catalog,matrix,part.from)?matrix.access_legs?.[`${part.mode}/${part.from}/${part.kind}`]:null;
    const known=row?.status==='estimate' && Number.isInteger(row.minutes) && row.minutes>=0 && row.minutes<=1440;
    return {...row,...part,origin:known?'estimate':'unknown',minutes:known?row.minutes:null,leg_mode:'foot'};
  });
  const resolved=parts.every(part=>part.origin==='estimate' || part.origin==='same_place');
  const minutes=resolved?parts.reduce((sum,part)=>sum+part.minutes,0):null,complete=resolved && minutes<=1440;
  return {origin:complete?'estimate':'unknown',status:complete?'estimate':resolved?'long_leg':'incomplete_journey',mode:baseTransport(trip).mode,
    minutes:complete?minutes:null,
    distance_m:complete && parts.every(part=>part.origin==='same_place' || Number.isFinite(part.distance_m))?parts.reduce((sum,part)=>sum+(part.distance_m || 0),0):null,
    parts,source:matrix?.source};
}
function resolveRoadPair(previous,id,catalog,matrix,mode) {
  if(previous===id && placeFor(catalog,id))return {origin:'same_place',minutes:0,mode};
  if(!matrix || matrix.version!==1 || !matrix.source?.id)return {origin:'unknown',status:'unavailable',minutes:null,mode};
  for(const slug of [previous,id]) {
    if(!currentPoint(catalog,matrix,slug))return {origin:'unknown',status:'changed_point',minutes:null,mode};
  }
  if(previous===id)return {origin:'same_place',minutes:0,distance_m:0,mode,source:matrix.source};
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
  const bases=dayBases(trip);
  const pairs=trip.places.flatMap(id=>[...(bases.start_at?.startsWith('@')?[[bases.start_at,id]]:[]),...(bases.night_at?.startsWith('@')?[[id,bases.night_at]]:[])]);
  if(bases.end_at?.startsWith('@') && trip.places.length)pairs.push([bases.night_at||trip.places.at(-1),bases.end_at]);
  if(bases.night_at?.startsWith('@') && bases.end_at && !bases.end_at.startsWith('@'))pairs.push([bases.night_at,bases.end_at]);
  const segments=pairs.flatMap(([from,to])=>mobilitySegments(trip,from,to,bases)).filter(part=>part.kind==='travel' && (part.from?.startsWith('@') || part.to?.startsWith('@')));
  return directedMatrix(base,catalog,matrix,points,segments);
}
// Explicit pairs also serve roads to transport hubs, outside the walking day.
// They use the same pinned graph, worker and directed cache as personal origins.
export async function loadDirectedTravelMatrix(base,catalog,{points,pairs}) {
  return directedMatrix(base,catalog,await loadTravelMatrix(base),points,pairs);
}
export const resolveDirectedTravel=(from,to,catalog,matrix,mode='foot')=>resolveRoadPair(from,to,catalog,matrix,mode);
async function directedMatrix(base,catalog,matrix,points,segments) {
  const ids=new Set();
  for(const point of points) {
    if(!point || !Number.isFinite(point.lon) || !Number.isFinite(point.lat) || Math.abs(point.lon)>180 || Math.abs(point.lat)>90
      || point.slug!==`@${point.lon},${point.lat}` || ids.has(point.slug))throw Error('Invalid personal road point');
    ids.add(point.slug);
  }
  if(segments.some(part=>!Object.hasOwn(TRAVEL_MODES,part.mode)||typeof part.from!=='string'||typeof part.to!=='string'))throw Error('Invalid directed road pair');
  const copy={...matrix,points:[...matrix.points,...points],personal_points:points,legs:{...matrix.legs}};
  if(!segments.length)return copy;
  const profiles=[...new Set(segments.map(part=>part.mode))];
  await Promise.all(profiles.map(async mode=>{try{
    const {loadBrowserRouter}=await import('./browser-router.mjs?v=4');const route=await loadBrowserRouter(base,mode);
    if(!sameRoadSource(matrix.source,route.graph.source))return;
    await Promise.all(segments.filter(part=>part.mode===mode).map(async({from,to})=>{
      const key=`${mode}/${from}/${to}`,point=id=>points.find(p=>p.slug===id)||catalog.poi.find(p=>p.slug===id),a=point(from),b=point(to);
      if(!a||!b)return;const anchor=p=>p.arrival_points?.[mode] || p;
      const x=anchor(a),y=anchor(b),cacheKey=`${new URL(base).href}/${stable(matrix.source)}/${key}/${x.lon},${x.lat}/${y.lon},${y.lat}`;
      if(!personalLegs.has(cacheKey))personalLegs.set(cacheKey,route([x.lon,x.lat],[y.lon,y.lat]).catch(error=>{personalLegs.delete(cacheKey);throw error;}));
      const result=await personalLegs.get(cacheKey);copy.legs[key]={...result,engine:'godune-route',dynamic:true};
    }));
  }catch{/* Failure of one profile does not erase another resolved road. */}}));
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
  if(trip.places.length && bases.end_at && shown.has(trip.places.at(-1))){pairs.push([bases.night_at||trip.places.at(-1),bases.end_at]);shown.add(bases.end_at);}
  const segments=pairs.flatMap(([from,to])=>shown.has(from) && shown.has(to)?mobilitySegments(auto,from,to,bases):[]);
  const rows=await Promise.all(segments.map(async ({from,to,mode:profile,kind})=>{
    if(kind!=='travel') {
      if(matrix?.version!==1 || !matrix.source?.id || !currentPoint(catalog,matrix,from))return null;
      const access=matrix?.access_legs?.[`${profile}/${from}/${kind}`];
      if(access?.status!=='estimate' || !access.geometry)return null;
      try {const coordinates=decodePath(access.geometry);if(coordinates.length<2)return null;return {type:'Feature',properties:{from,to,mode:'foot',kind,minutes:access.minutes,source_id:matrix.source.id},geometry:{type:'LineString',coordinates}};}catch{return null;}
    }
    // A hand-entered time does not verify the path or change its geometry.
    const leg=resolveRoadPair(from,to,catalog,matrix,profile);
    if(leg.origin!=='estimate')return null;
    try {
      const legMode=leg.leg_mode || profile;
      let coordinates=leg.dynamic?leg.geometry:null,sections=leg.bike_profile?.sections;
      if(!coordinates){const chunk=await loadGeometry(base,legMode,from,matrix.source.id),path=chunk.legs[to];if(!path)return null;coordinates=decodePath(path.points);sections=path.bike_sections;}
      if(coordinates.length<2)return null;
      return {type:'Feature',properties:{from,to,mode:legMode,kind:'travel',minutes:leg.minutes,source_id:matrix.source.id,...(legMode==='bike'?{bike_profile:leg.bike_profile,bike_sections:sections}: {})},geometry:{type:'LineString',coordinates}};
    }catch{return null;}
  }));
  const accesses=visible.map(id=>[id,resolveAccess(trip,id,catalog,matrix),['approach','return']]);
  if(bases.start_at && shown.has(bases.start_at))accesses.push([bases.start_at,resolveAccessBetween(trip,bases.start_at,null,trip.places[0],catalog,matrix),['return']]);
  if(bases.night_at && shown.has(bases.night_at))accesses.push([bases.night_at,resolveAccessBetween(trip,bases.night_at,trip.places.at(-1),bases.end_at,catalog,matrix),bases.end_at?['approach','return']:['approach']]);
  if(bases.end_at && shown.has(bases.end_at))accesses.push([bases.end_at,resolveAccessBetween(trip,bases.end_at,bases.night_at||trip.places.at(-1),null,catalog,matrix),['approach']]);
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
