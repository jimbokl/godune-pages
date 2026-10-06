import {baseId,isPersonalPoint} from './personal-points.mjs?v=3';
import {loadDirectedTravelMatrix,resolveDirectedTravel,sameRoadSource} from './travel-estimates.mjs?v=10';
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const coordinate=v=>object(v)&&Number.isFinite(v.lon)&&Number.isFinite(v.lat)&&Math.abs(v.lon)<=180&&Math.abs(v.lat)<=90;
const minute=v=>Number.isInteger(v)&&v>=0&&v<=1440;
const registries=new Map();
async function registry(base){
  const url=new URL('data/station-access.json',base).href;
  if(!registries.has(url))registries.set(url,fetch(url).then(async response=>{
    if(!response.ok)throw Error('station_access_unavailable');const value=await response.json();
    if(value.version!==1||!object(value.services)||!object(value.anchors)||!object(value.source))throw Error('station_access_invalid');return value;
  }).catch(error=>{registries.delete(url);throw error;}));
  return registries.get(url);
}
export async function loadStationRoad(base,catalog,location,hub){
  const data=await registry(base),id=hub==='zelenogradsk-bus'?hub:data.services[hub],anchor=data.anchors[id];
  if(!coordinate(anchor))return {state:'unknown',reason:'unmapped_station'};
  const home=isPersonalPoint(location)?location:catalog.poi.find(p=>p.slug===location);
  if(!coordinate(home))return {state:'unknown',reason:'unknown_home'};
  const point=value=>({...value,slug:`@${value.lon},${value.lat}`}),a=point(home),b=point(anchor);
  const points=[...new Map([a,b].map(p=>[p.slug,p])).values()];
  const matrix=await loadDirectedTravelMatrix(base,catalog,{points,pairs:[{mode:'foot',from:a.slug,to:b.slug},{mode:'foot',from:b.slug,to:a.slug}]});
  if(!sameRoadSource(data.source,matrix.source))return {state:'unknown',reason:'changed_map'};
  const snapshot=direction=>['estimate','same_place'].includes(direction.origin)&&minute(direction.minutes)&&Number.isFinite(direction.distance_m)
    ?{minutes:direction.minutes,distance_m:direction.distance_m}:null;
  const to=snapshot(resolveDirectedTravel(a.slug,b.slug,catalog,matrix)),back=snapshot(resolveDirectedTravel(b.slug,a.slug,catalog,matrix));
  if(!to&&!back)return {state:'unknown',reason:'no_path'};
  const road={version:1,anchor:{id,name:anchor.name,lon:anchor.lon,lat:anchor.lat,url:anchor.url},source:structuredClone(matrix.source),to,back};
  return {state:to&&back?'ready':'partial',road};
}
export const stationRoadKey=(index,location,hub)=>JSON.stringify([index,baseId(location),hub]);
// This cache belongs only to a wizard draft. A late worker reply cannot save a
// trip or overwrite a field the traveller has touched, including an empty one.
export function stationRoadDraft({base,catalog,changed}){
  const requests=new Map(),manual=new Map();
  function touch(key,direction){if(!manual.has(key))manual.set(key,new Set());manual.get(key).add(direction);}
  function request({key,location,hub,apply}){
    if(!location)return;
    if(requests.has(key)){const saved=requests.get(key);if(saved.road)queueMicrotask(()=>{if(apply(saved.road,direction=>manual.get(key)?.has(direction)===true))changed();});return;}
    const row={state:'loading'};requests.set(key,row);
    row.pending=loadStationRoad(base,catalog,location,hub).catch(()=>({state:'unknown',reason:'unavailable'})).then(result=>{
      Object.assign(row,result);if(result.road)apply(result.road,direction=>manual.get(key)?.has(direction)===true);changed();
    });
  }
  return {request,touch,state:key=>requests.get(key)?.state,
    async prepare(){await Promise.all([...requests.values()].filter(row=>row.state==='loading').map(row=>row.pending));},
    retry(key){requests.delete(key);}};
}
