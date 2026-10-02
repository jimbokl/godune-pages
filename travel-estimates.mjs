// Directed, mode-specific estimates. Missing evidence never becomes zero travel.
export const TRAVEL_MODES = {foot:'Пешком',bike:'На велосипеде',car:'На машине'};
export const travelMode = trip => trip.schedule?.mode || 'foot';
export function manualLeg(trip, id) {
  const leg=trip.schedule?.stops?.[id]?.leg, previous=trip.places[trip.places.indexOf(id)-1];
  if(!leg || !previous)return null;
  return leg?.from===previous && (leg.mode ? leg.mode===travelMode(trip) : trip.schedule?.mode===undefined) ? leg : null;
}
export function resolveTravel(trip, id, catalog, matrix) {
  const mode=travelMode(trip), previous=trip.places[trip.places.indexOf(id)-1];
  if(!previous)return {origin:'start',minutes:0,mode};
  const manual=manualLeg(trip,id);
  if(manual)return {origin:'manual',minutes:manual.minutes,mode};
  if(!matrix || matrix.version!==1 || !matrix.source?.id)return {origin:'unknown',status:'unavailable',minutes:null,mode};
  const current=slug=>catalog?.poi?.find(p=>p.slug===slug), cached=slug=>matrix.points?.find(p=>p.slug===slug);
  for(const slug of [previous,id]) {
    const a=current(slug),b=cached(slug);
    if(!a || !b || a.lat!==b.lat || a.lon!==b.lon)return {origin:'unknown',status:'changed_point',minutes:null,mode};
  }
  const leg=matrix.legs?.[`${mode}/${previous}/${id}`];
  if(!leg)return {origin:'unknown',status:'missing_pair',minutes:null,mode};
  if(leg.status!=='estimate' || !Number.isInteger(leg.minutes) || leg.minutes<0 || leg.minutes>1440)
    return {...leg,origin:'unknown',minutes:null,mode,source:matrix.source};
  return {...leg,origin:'estimate',mode,source:matrix.source};
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
  const auto={...trip,schedule:{...trip.schedule,stops:{}}}, mode=travelMode(trip);
  const rows=await Promise.all(trip.places.slice(1).map(async (to,i)=>{
    const from=trip.places[i];
    if(!visible.includes(from) || !visible.includes(to))return null;
    // A hand-entered time does not verify the path or change its geometry.
    const leg=resolveTravel(auto,to,catalog,matrix);
    if(leg.origin!=='estimate')return null;
    try {
      const chunk=await loadGeometry(base,mode,from,matrix.source.id),path=chunk.legs[to];
      if(!path)return null;
      const coordinates=decodePath(path.points);
      if(coordinates.length<2)return null;
      return {type:'Feature',properties:{from,to,mode,minutes:leg.minutes,source_id:matrix.source.id},geometry:{type:'LineString',coordinates}};
    }catch{return null;}
  }));
  return {type:'FeatureCollection',features:rows.filter(Boolean)};
}
