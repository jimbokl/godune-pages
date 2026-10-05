import {readPosition,distanceMeters,validCoordinates} from './device-position.mjs?v=1';

// A nearby catalog point is not an entrance, a safe path or proof of a visit.
export const PROXIMITY_DEFAULTS=Object.freeze({radius:150,maxAccuracy:100,maxAge:120000,futureTolerance:10000});
export function nearbyPlaces(points,position,{now=Date.now(),...overrides}={}) {
  const policy={...PROXIMITY_DEFAULTS,...overrides};
  if(!Object.values(policy).every(value=>Number.isFinite(value) && value>=0) || !Number.isFinite(now))throw Error('proximity_invalid_policy');
  const fix=readPosition(position);
  if(!fix)return {state:'invalid',matches:[]};
  if(fix.timestamp>now+policy.futureTolerance || now-fix.timestamp>policy.maxAge)return {state:'stale',matches:[],accuracy:fix.accuracy};
  if(fix.accuracy>policy.maxAccuracy)return {state:'imprecise',matches:[],accuracy:fix.accuracy};
  const seen=new Set();
  const candidates=(Array.isArray(points)?points:[]).flatMap((point,index)=>{
    const id=point?.id ?? point?.slug;
    if(typeof id!=='string' || !id || seen.has(id) || !validCoordinates(point))return [];
    seen.add(id);const distance=distanceMeters(fix,point);
    return [{id,index,name:point.name,distance,lower:Math.max(0,distance-fix.accuracy),upper:distance+fix.accuracy}];
  }).sort((a,b)=>a.distance-b.distance || a.index-b.index);
  if(!candidates.length)return {state:'empty',matches:[],accuracy:fix.accuracy};
  const first=candidates[0];
  if(first.upper>policy.radius)return {state:first.lower<=policy.radius?'uncertain':'far',matches:[],accuracy:fix.accuracy};
  // When accuracy intervals overlap, retain the choice instead of guessing.
  const matches=candidates.filter(row=>row.lower<=first.upper && row.lower<=policy.radius)
    .map(({id,name,distance})=>({id,name,distance}));
  return {state:matches.length===1?'nearby':'ambiguous',matches,accuracy:fix.accuracy};
}
