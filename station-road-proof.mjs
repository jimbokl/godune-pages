const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const coordinate=v=>object(v)&&Number.isFinite(v.lon)&&Number.isFinite(v.lat)&&Math.abs(v.lon)<=180&&Math.abs(v.lat)<=90;
const minute=v=>Number.isInteger(v)&&v>=0&&v<=1440;
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const leg=v=>v===null||object(v)&&Object.keys(v).length===2&&minute(v.minutes)&&Number.isFinite(v.distance_m)&&v.distance_m>=0;
export function validStationRoad(v,to,back){
  return object(v)&&Object.keys(v).length===5&&v.version===1&&coordinate(v.anchor)
    &&Object.keys(v.anchor).length===5&&typeof v.anchor.id==='string'&&typeof v.anchor.name==='string'&&/^https:\/\/www\.openstreetmap\.org\/node\/\d+$/.test(v.anchor.url)
    &&object(v.source)&&typeof v.source.id==='string'&&hash(v.source.sha256)&&hash(v.source.config_sha256)&&hash(v.source.profile_sha256?.foot)
    &&typeof v.source.snapshot_at==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(v.source.snapshot_at)
    &&typeof v.source.checked_at==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v.source.checked_at)
    &&leg(v.to)&&leg(v.back)&&(v.to!==null||v.back!==null)
    &&(v.to===null||v.to.minutes===to)&&(v.back===null||v.back.minutes===back);
}
export const stationRoadOrigin=(road,direction)=>road?.[direction]?'по карте':'по вашей оценке';
export const stationRoadNote=(road,direction)=>road?.[direction]
  ?` Карта от ${road.source.snapshot_at.slice(0,10)}: ${road.anchor.name}. Вход и место посадки сверьте перед поездкой.`:'';
export function forgetStationRoad(access,direction){
  if(!access.road)return;access.road[direction]=null;
  if(!access.road.to&&!access.road.back)delete access.road;
}
// Apply only untouched unknown fields (or refresh our own previous estimate).
export function applyStationRoad(access,road,fields,blocked=()=>false){
  const next=structuredClone(road),changed=[];
  for(const direction of ['to','back']){
    const field=fields[direction],value=next[direction];
    if(!value||blocked(direction)||(access[field]!==null&&!access.road?.[direction])){next[direction]=null;continue;}
    if(access[field]!==value.minutes)changed.push(direction);
    access[field]=value.minutes;
  }
  if(next.to||next.back)access.road=next;else delete access.road;
  return changed;
}
export function retainStationRoad(previous,to,back){
  if(!previous)return null;const copy=structuredClone(previous);
  if(copy.to?.minutes!==to)copy.to=null;
  if(copy.back?.minutes!==back)copy.back=null;
  return copy.to||copy.back?copy:null;
}
