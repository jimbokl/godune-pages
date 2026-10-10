import {endBookingLabel} from './trip-bookings-state.mjs?v=3';
// Read-only map projection. The day engine owns timing; a named stop never
// borrows the coordinates of a nearby attraction or a straight-line path.
import {selectedDay} from './trip-days-state.mjs?v=27';
import {tripSignature} from './trip-light.mjs?v=15';
import {timelineOrder} from './trip-service-timeline-state.mjs';
import {serviceVisitRows,validServiceVisit} from './trip-service-visits-contract.mjs';
import {selectedConnectionRows,unusedConnectionRows} from './trip-service-transfer-view.mjs';
import {directedRoadFeature,directedAccessFeature} from './day-map-geometry.mjs?v=4';
import {vehicleParkingReference} from './day-vehicle-itinerary.mjs?v=3';
import {dayJourneyBoundaries,boundaryForEntry} from './day-journey-boundaries.mjs?v=4';
import {rentalActivityStops} from './trip-rental-view.mjs';

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
 let totalStops=day.kosa_plan?fallback.length:order.length;
 const name=e=>boundaryForEntry(boundaries,e)?.anchor?.name||(e?.kind==='service'?visits.find(v=>v.id===e.id)?.name:catalog.poi.find(p=>p.slug===e?.id)?.name);
 const add=(value,key,deduplicate=true)=>{if(!located(value)||deduplicate&&keys.has(key))return;keys.add(key);points.push(value);};
 for(const [index,entry] of (day.kosa_plan?fallback.map(p=>({kind:'place',id:p.slug})):order).entries()){
  if(entry.kind==='place'){
   const p=catalog.poi.find(p=>p.slug===entry.id);if(p)add({...p,entry:{...entry},number:index+1,kind:'place'},JSON.stringify(['poi',p.slug]),false);
  }else{
   const v=visits.find(v=>v.id===entry.id),assessment=result?.visits?.find(row=>row.id===entry.id);
   const rental=validServiceVisit(v)&&v.selection.visit.kind==='rental';
   if(rental)totalStops+=1+(v.selection.visit.input.activity?.itinerary.order.length||0);
   if(!validServiceVisit(v)||!assessment?.assessment||assessment.context!=='ready')continue;
   const input=v.selection.visit.input;
   const anchorId=v.selection.visit.kind==='rental'?input.pickup.point.anchor_id:input.selection?.entrance;
   const anchor=input.graph?.anchors?.find(a=>a.id===anchorId),p=anchor?anchorMapPoint(anchor,catalog):v.point;
   if(p)add({...p,slug:entry.id,name:v.name,entry:{...entry},number:index+1,kind:'service',source:anchor?.source||v.point&&{reference:v.point.source_id,checked_at:v.point.checked_at}},anchor?locationKey(anchor):JSON.stringify([p.lat,p.lon]),false);
   if(rental){
    const stops=rentalActivityStops(v,assessment.assessment,catalog);
    const back=input.graph.anchors.find(a=>a.id===input.return_at.point.anchor_id);
    for(const [i,stop] of [...stops,{id:`${entry.id}:return`,name:back?.name||'Пункт возврата',anchor:back}].entries()){
     const point=anchorMapPoint(stop.anchor,catalog);if(!point)continue;
     const returning=i===stops.length;
     add({...point,slug:stop.id,name:stop.name,entry:{...entry},number:`${index+1}.${i+1}`,kind:'service',rental:true,
      ...(returning?{boundaryLabel:'Возврат велосипеда'}:{})},locationKey(stop.anchor),false);
    }
   }
  }
 }
 if(!mixed)return {mixed:false,points,connections,roads,unused:[],totalStops,omittedStops:totalStops-points.length};
 const scheduled=result.itinerary.order;
 for(const row of boundaries.rows){
  const entry=scheduled.find(e=>e.kind===row.entry.kind&&e.id===row.entry.id);if(!entry)continue;
  const connection=result.itinerary.connections.find(c=>row.entry.kind==='origin'?c.from===entry.schedule_id:c.to===entry.schedule_id);
  const p=anchorMapPoint(row.anchor,catalog);
  if(p)add({...p,slug:row.entry.id,name:row.anchor.name,kind:'transfer',label:row.entry.kind==='origin'?'↑':'↩',boundary:true,boundaryLabel:row.entry.kind==='origin'?'Начало':row.entry.kind==='destination'&&boundaries.bookings.end?endBookingLabel(boundaries.bookings.end):'Возвращение',connectionKey:connection?JSON.stringify([connection.from,connection.to]):null},locationKey(row.anchor),false);
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
 function connection(c,key,title,target=null){
  if(!c.selection&&c.status==='shared')return;
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
  connections.push({key,title,target,status:c.status,selected:!!c.selection,rows,unknown});
 }
 const renderedRentals=new Set();
 function rentalRoads(entry){
  if(entry?.kind!=='service'||renderedRentals.has(entry.id))return;
  renderedRentals.add(entry.id);
  const row=result.visits?.find(v=>v.id===entry.id),cycle=row?.assessment?.rental;
  if(row?.context!=='ready'||!cycle)return;
  const emit=(leg,phase)=>{
   if(!leg||leg.from===leg.to&&leg.minutes===0)return;
   const a=leg.anchors.find(a=>a.id===leg.from),b=leg.anchors.find(a=>a.id===leg.to);
   connection({from:leg.from,to:leg.to,leg,status:leg.status},JSON.stringify(['rental',entry.id,phase,leg.from,leg.to]),`${a?.name||'Начало пути'} → ${b?.name||'Возвращение'}`,{kind:'service',id:entry.id});
  };
  emit(cycle.approach,'approach');
  for(const [i,c] of (cycle.activity?.itinerary.connections||[]).entries()){
   const anchors=cycle.activity.itinerary.graph?.anchors||visits.find(v=>v.id===entry.id)?.selection.visit.input.activity.itinerary.graph.anchors||[];
   const nested=cycle.activity.itinerary.order;
   const label=id=>{const e=nested.find(e=>e.schedule_id===id);return catalog.poi.find(p=>p.slug===e?.id)?.name||anchors.find(a=>a.id===e?.id)?.name||e?.id;};
   connection(c,JSON.stringify(['rental',entry.id,'activity',i]),`${label(c.from)||'Выдача велосипеда'} → ${label(c.to)||'Конец прогулки'}`,{kind:'service',id:entry.id});
  }
  emit(cycle.return_road,'return');emit(cycle.after_return,'after_return');
 }
 for(const c of result.itinerary.connections){
  const from=entryFor(c.from),to=entryFor(c.to);rentalRoads(from);
  connection(c,JSON.stringify([c.from,c.to]),`${name(from)||'Начало пути'} → ${name(to)||'Возвращение'}`,!boundaryForEntry(boundaries,to)&&(to?.kind==='place'||to?.kind==='service')?{kind:to.kind,id:to.id}:null);
 }
 for(const entry of scheduled)rentalRoads(entry);
 return {mixed:true,points,connections,roads,unused:unusedConnectionRows(result.itinerary),totalStops,omittedStops:totalStops-points.filter(p=>p.kind!=='transfer').length};
}
export async function projectedRoadFeatures(projection,catalog,matrix,base){
 const features=await Promise.all(projection.roads.map(async road=>{
  if(!road.sources.some(s=>s.reference===matrix?.source?.id&&s.checked_at===matrix.source.checked_at))return null;
  const feature=road.kind==='access'?directedAccessFeature(road.from,road.vehicle_mode,road.direction,catalog,matrix):await directedRoadFeature(road.from,road.to,catalog,matrix,base,road.mode);
  return feature?{...feature,properties:{...feature.properties,connection_key:road.connectionKey}}:null;
 }));
 return {type:'FeatureCollection',features:features.filter(Boolean)};
}
