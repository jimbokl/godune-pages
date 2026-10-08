// Read-only map projection. The day engine owns timing; a named stop never
// borrows the coordinates of a nearby attraction or a straight-line path.
import {selectedDay} from './trip-days-state.mjs?v=24';
import {tripSignature} from './trip-light.mjs?v=13';
import {timelineOrder} from './trip-service-timeline-state.mjs';
import {serviceVisitRows,validServiceVisit} from './trip-service-visits-contract.mjs';
import {selectedConnectionRows,unusedConnectionRows} from './trip-service-transfer-view.mjs';
import {directedRoadFeature,directedAccessFeature} from './day-map-geometry.mjs?v=2';
import {vehicleParkingReference} from './day-vehicle-itinerary.mjs?v=1';
import {dayJourneyBoundaries,boundaryForEntry} from './day-journey-boundaries.mjs?v=3';

export const dayMapSignature=trip=>JSON.stringify([tripSignature(trip),selectedDay(trip).timeline,selectedDay(trip).service_visits,selectedDay(trip).transfer_connections]);
const located=p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180;
const locationKey=a=>a?.location?.kind==='catalog'?JSON.stringify([a.location.reference_kind,a.location.id]):a?.location?.kind==='point'?JSON.stringify([a.location.lat,a.location.lon]):null;
export function anchorMapPoint(anchor,catalog){
 try{if(JSON.parse(anchor?.id)?.[0]==='vehicle-parking'&&!vehicleParkingReference(anchor,catalog))return null;}catch{/* Independent anchor namespaces need no vehicle interpretation. */}
 let point,reference=anchor?.location;
 if(reference?.kind==='point')point=reference;
 if(reference?.kind==='catalog'){
  const rows=reference.reference_kind==='poi'?catalog.poi:reference.reference_kind==='dining'?catalog.dining:null;
  point=rows?.find(p=>(p.slug||p.id)===reference.id);
  if(anchor.revision?.startsWith('catalog:')&&anchor.revision!==`catalog:${reference.id}:${point?.lat},${point?.lon}`)return null;
 }
 return located(point)?{lat:point.lat,lon:point.lon,revision:anchor.revision,source:structuredClone(anchor.source||null)}:null;
}
export function projectDayMap(trip,catalog,result=null,fallback=[]){
 const day=selectedDay(trip),visits=serviceVisitRows(day),order=timelineOrder(day),points=[],keys=new Set(),connections=[],roads=[];
 const mixed=!!result?.itinerary,boundaries=dayJourneyBoundaries(day,catalog);
 const name=e=>boundaryForEntry(boundaries,e)?.anchor?.name||(e?.kind==='service'?visits.find(v=>v.id===e.id)?.name:catalog.poi.find(p=>p.slug===e?.id)?.name);
 const add=(value,key,deduplicate=true)=>{if(!located(value)||deduplicate&&keys.has(key))return;keys.add(key);points.push(value);};
 for(const [index,entry] of (day.kosa_plan?fallback.map(p=>({kind:'place',id:p.slug})):order).entries()){
  if(entry.kind==='place'){
   const p=catalog.poi.find(p=>p.slug===entry.id);if(p)add({...p,entry:{...entry},number:index+1,kind:'place'},JSON.stringify(['poi',p.slug]),false);
  }else{
   const v=visits.find(v=>v.id===entry.id),assessment=result?.visits?.find(row=>row.id===entry.id);
   if(!validServiceVisit(v)||!assessment?.assessment||assessment.context!=='ready')continue;
   const input=v.selection.visit.input;
   const anchorId=v.selection.visit.kind==='rental'?input.pickup.point.anchor_id:input.selection?.entrance;
   const anchor=input.graph?.anchors?.find(a=>a.id===anchorId),p=anchor?anchorMapPoint(anchor,catalog):v.point;
   if(p)add({...p,slug:entry.id,name:v.name,entry:{...entry},number:index+1,kind:'service',source:anchor?.source||v.point&&{reference:v.point.source_id,checked_at:v.point.checked_at}},anchor?locationKey(anchor):JSON.stringify([p.lat,p.lon]),false);
  }
 }
 if(!mixed)return {mixed:false,points,connections,roads,unused:[],totalStops:day.kosa_plan?fallback.length:order.length,omittedStops:(day.kosa_plan?fallback.length:order.length)-points.length};
 const scheduled=result.itinerary.order;
 for(const row of boundaries.rows){
  const entry=scheduled.find(e=>e.kind===row.entry.kind&&e.id===row.entry.id);if(!entry)continue;
  const connection=result.itinerary.connections.find(c=>row.entry.kind==='origin'?c.from===entry.schedule_id:c.to===entry.schedule_id);
  const p=anchorMapPoint(row.anchor,catalog);
  if(p)add({...p,slug:row.entry.id,name:row.anchor.name,kind:'transfer',label:row.entry.kind==='origin'?'↑':'↩',boundary:true,boundaryLabel:row.entry.kind==='origin'?'Начало':row.entry.kind==='destination'&&boundaries.bookings.end?'Отъезд':'Возвращение',connectionKey:connection?JSON.stringify([connection.from,connection.to]):null},locationKey(row.anchor));
 }
 const entryFor=id=>scheduled.find(e=>e.schedule_id===id);
 function knownRoad(leg,key){
  if(!leg||!['known','estimate'].includes(leg.status))return;
  const a=leg.anchors.find(a=>a.id===leg.from),b=leg.anchors.find(a=>a.id===leg.to);
  if(!anchorMapPoint(a,catalog)||!anchorMapPoint(b,catalog))return;
  const candidates=leg.candidates.filter(c=>c.status==='current'&&c.link.basis==='map_estimate');
  if(!candidates.length)return;
  const pa=vehicleParkingReference(a,catalog),pb=vehicleParkingReference(b,catalog),poi=v=>v?.location.kind==='catalog'&&v.location.reference_kind==='poi'?v.location.id:null;
  const sources=candidates.map(c=>structuredClone(c.link.source));
  if(leg.mode==='foot'&&(pa&&poi(b)===pa.id||pb&&poi(a)===pb.id)){
   const p=pa||pb;roads.push({kind:'access',from:p.id,to:p.id,mode:'foot',vehicle_mode:p.mode,direction:pa?'approach':'return',connectionKey:key,sources});return;
  }
  const identity=(anchor,parking)=>parking?(parking.mode===leg.mode?parking.id:null):poi(anchor)||(anchor.location.kind==='point'?`@${anchor.location.lon},${anchor.location.lat}`:null);
  const from=identity(a,pa),to=identity(b,pb);if(!from||!to)return;
  roads.push({from,to,mode:leg.mode,connectionKey:key,sources});
 }
 for(const c of result.itinerary.connections){
  if(!c.selection&&c.status==='shared')continue;
  const from=entryFor(c.from),to=entryFor(c.to),key=JSON.stringify([c.from,c.to]),title=`${name(from)||'Начало пути'} → ${name(to)||'Возвращение'}`;
  const rows=selectedConnectionRows(c,{id:key,title})||[{id:key,kind:'walk',time:c.departure,title:c.leg?.mode==='bike'?'На велосипеде':c.leg?.mode==='car'?'На машине':'Пешком',text:c.leg?.minutes==null?'Время дороги пока неизвестно.':`${c.leg.minutes} мин в пути.`,status:c.status,sources:(c.leg?.candidates||[]).map(v=>({name:v.link.source.reference,checked_at:v.link.source.checked_at}))}];
  const anchors=(c.journey?.transfers||[]).flatMap(t=>t.anchors||t.road?.anchors||[]);
  const unknown=[];
  for(const anchor of anchors){
   const p=anchorMapPoint(anchor,catalog),physical=locationKey(anchor);
   if(!p){if(!unknown.includes(anchor.name))unknown.push(anchor.name);continue;}
   add({...p,slug:anchor.id,name:anchor.name,kind:'transfer',connectionKey:key,label:'↔'},physical);
  }
  if(c.selection){for(const transfer of c.journey?.transfers||[])knownRoad(transfer.road,key);}
  else knownRoad(c.leg,key);
  connections.push({key,title,target:!boundaryForEntry(boundaries,to)&&(to?.kind==='place'||to?.kind==='service')?{kind:to.kind,id:to.id}:null,status:c.status,selected:!!c.selection,rows,unknown});
 }
 return {mixed:true,points,connections,roads,unused:unusedConnectionRows(result.itinerary),totalStops:order.length,omittedStops:order.length-points.filter(p=>p.kind!=='transfer').length};
}
export async function projectedRoadFeatures(projection,catalog,matrix,base){
 const features=await Promise.all(projection.roads.map(async road=>{
  if(!road.sources.some(s=>s.reference===matrix?.source?.id&&s.checked_at===matrix.source.checked_at))return null;
  const feature=road.kind==='access'?directedAccessFeature(road.from,road.vehicle_mode,road.direction,catalog,matrix):await directedRoadFeature(road.from,road.to,catalog,matrix,base,road.mode);
  return feature?{...feature,properties:{...feature.properties,connection_key:road.connectionKey}}:null;
 }));
 return {type:'FeatureCollection',features:features.filter(Boolean)};
}
