// Route geometry for an explicitly projected, sourced road. This never supplies
// timing or a straight-line substitute for an unknown transfer.
import {TRAVEL_MODES,resolveDirectedTravel,resolveAccessBetween,decodePath} from './travel-estimates.mjs?v=13';
const chunks=new Map();
export async function directedRoadFeature(from,to,catalog,matrix,base,profile='foot') {
 if(!Object.hasOwn(TRAVEL_MODES,profile))return null;
 const leg=resolveDirectedTravel(from,to,catalog,matrix,profile);
 if(leg.origin!=='estimate')return null;
 try{
  const mode=leg.leg_mode||profile;let coordinates=leg.dynamic?leg.geometry:null,sections=leg.bike_profile?.sections;
  if(!coordinates){
   const url=new URL(`data/travel-geometries/${mode}/${from}.json`,base).href,key=`${url}/${matrix.source.id}/${matrix.source.checked_at}`;
   if(!chunks.has(key))chunks.set(key,fetch(url,{cache:'no-cache'}).then(async response=>{if(!response.ok)throw Error('geometry_unavailable');const chunk=await response.json();if(chunk.version!==1||chunk.source_id!==matrix.source.id||!chunk.legs)throw Error('geometry_changed');return chunk;}).catch(error=>{chunks.delete(key);throw error;}));
   const path=(await chunks.get(key)).legs[to];if(!path)return null;coordinates=decodePath(path.points);sections=path.bike_sections;
  }
  if(!Array.isArray(coordinates)||coordinates.length<2||coordinates.some(p=>!Array.isArray(p)||p.length!==2||!Number.isFinite(p[0])||!Number.isFinite(p[1])||Math.abs(p[0])>180||Math.abs(p[1])>90))return null;
  return {type:'Feature',properties:{from,to,mode,kind:'travel',minutes:leg.minutes,source_id:matrix.source.id,...(mode==='bike'?{bike_profile:leg.bike_profile,bike_sections:sections}: {})},geometry:{type:'LineString',coordinates}};
 }catch{return null;}
}
export function directedAccessFeature(id,profile,direction,catalog,matrix){
 if(!['car','bike'].includes(profile)||!['approach','return'].includes(direction))return null;
 const access=resolveAccessBetween({places:[id],schedule:{mode:profile}},id,null,null,catalog,matrix);
 const leg=access?.[direction==='approach'?'approach':'back'];
 if(leg?.origin!=='estimate'||!leg.geometry||!matrix?.source?.id||!matrix.source.checked_at)return null;
 try{const coordinates=decodePath(leg.geometry);
  if(coordinates.length<2)return null;
  return {type:'Feature',properties:{from:id,to:id,mode:'foot',kind:direction,minutes:leg.minutes,source_id:matrix.source.id},geometry:{type:'LineString',coordinates}};
 }catch{return null;}
}
