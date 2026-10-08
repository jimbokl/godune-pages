// Current order and directed facts enter Rust; computed values stay out of memory.
import {timelineOrder} from './trip-service-timeline-state.mjs';
import {resolveDirectedTravel,travelMode} from './travel-estimates.mjs?v=11';
import {transferChoices,validTransferConnections} from './trip-transfer-connections-contract.mjs';
import {dayJourneyBoundaries,usesJourneyBoundaries} from './day-journey-boundaries.mjs?v=3';
import {vehicleItinerary} from './day-vehicle-itinerary.mjs?v=1';
const physical=anchor=>JSON.stringify([anchor.kind,anchor.revision,anchor.location]);
export function serviceItineraryInput(trip,day,plan,visits,catalog,matrix){
 const graph={version:1,anchors:[],links:[]},anchors=new Map(),boundVisits=structuredClone(visits),mode=travelMode(trip);
 for(const visit of boundVisits){
  if(!['directed','rental'].includes(visit.selection.visit.kind))continue;
  const input=visit.selection.visit.input;
  const aliases=new Map();
  for(const anchor of input.graph.anchors){
   const existing=anchors.get(anchor.id);
   if(existing&&physical(existing)!==physical(anchor))throw Error('service_timeline_anchor_conflict');
   let id=anchor.id;
   // A matching location does not allow us to discard a different source.
   if(existing&&JSON.stringify(existing.source)!==JSON.stringify(anchor.source)){
    id=JSON.stringify([visit.id,anchor.id]);while(anchors.has(id))id+='_';
   }
   aliases.set(anchor.id,id);
   if(!anchors.has(id)){const saved={...structuredClone(anchor),id};anchors.set(id,saved);graph.anchors.push(saved);}
  }
  for(const link of input.graph.links)graph.links.push({...structuredClone(link),id:JSON.stringify([visit.id,link.id]),from:aliases.get(link.from),to:aliases.get(link.to)});
  // Alias the calculation copy consistently; the saved selection is untouched.
  for(const anchor of input.graph.anchors)anchor.id=aliases.get(anchor.id);
  for(const link of input.graph.links){link.from=aliases.get(link.from);link.to=aliases.get(link.to);}
  const rental=visit.selection.visit.kind==='rental';
  for(const key of rental?['from','use_end','back_to']:['from','entrance','exit','back_to'])input.selection[key]=aliases.get(input.selection[key]);
  if(rental){
   const point=v=>{v.anchor_id=aliases.get(v.anchor_id);};
   point(input.pickup.point);point(input.return_at.point);
   for(const term of input.terms){point(term.pickup);for(const v of term.returns||[])point(v);}
  }
 }
 const placeAnchors=new Map();
 for(const stop of plan.stops){
  const place=catalog.poi.find(p=>p.slug===stop.id);
  if(!place)continue;
  const anchor={id:`__timeline_place_${place.slug}`,name:place.name,kind:'landmark',revision:`catalog:${place.slug}:${place.lat},${place.lon}`,location:{kind:'catalog',reference_kind:'poi',id:place.slug},source:null};
  const existing=anchors.get(anchor.id);
  if(existing&&physical(existing)===physical(anchor)){placeAnchors.set(place.slug,existing.id);continue;}
  while(anchors.has(anchor.id))anchor.id+='_';
  anchors.set(anchor.id,anchor);graph.anchors.push(anchor);placeAnchors.set(place.slug,anchor.id);
 }
 const available=new Set(boundVisits.map(v=>v.id)),ordinary=new Set(day.places);
 const order=timelineOrder(day).filter(entry=>entry.kind==='place'?ordinary.has(entry.id):available.has(entry.id)).map(entry=>{
  const visit=entry.kind==='service'?boundVisits.find(v=>v.id===entry.id):null;
  const selected=['directed','rental'].includes(visit?.selection.visit.kind)?visit.selection.visit.input.selection:null;
  return {...entry,arrival_anchor:selected?.from||placeAnchors.get(entry.id)||null,departure_anchor:selected?.back_to||placeAnchors.get(entry.id)||null};
 });
 const boundaries=dayJourneyBoundaries(day,catalog);
 let boundaryOrigin=null,destination=null;
 if(usesJourneyBoundaries(day,catalog)&&order.length){
  // Rust owns the origin/destination travel. Drop the old zero-visit wrappers
  // so the start and reserve are counted once, including service-only days.
  plan.stops=plan.stops.filter(stop=>!['__day_origin','__day_night','__day_departure'].includes(stop.id));
  for(const row of boundaries.rows)if(row.anchor){anchors.set(row.anchor.id,row.anchor);graph.anchors.push(structuredClone(row.anchor));}
  boundaryOrigin=boundaries.origin&&anchors.has(boundaries.origin.id)?boundaries.origin.id:null;
  destination=boundaries.destination&&anchors.has(boundaries.destination.id)?boundaries.destination.id:null;
  if(boundaries.checkpoint){
   const id=boundaries.checkpoint.id;
   plan.stops.push({id,visit:0,pause:0,travel:null,opening:[{open:boundaries.bookings.night?.time??0,close:1440}]});
   order.push({kind:'place',id,arrival_anchor:anchors.has(id)?id:null,departure_anchor:anchors.has(id)?id:null});
  }
 }
 const synthetic=plan.stops.filter(stop=>!ordinary.has(stop.id)&&!order.some(entry=>entry.id===stop.id)).map(stop=>({kind:'place',id:stop.id,arrival_anchor:null,departure_anchor:null}));
 order.unshift(...synthetic.filter(entry=>entry.id==='__day_origin'));order.push(...synthetic.filter(entry=>entry.id!=='__day_origin'));
 if(mode==='foot'&&matrix?.source?.id&&matrix.source.checked_at){
  const roadOrder=[...(boundaryOrigin?[{id:boundaryOrigin,departure_anchor:boundaryOrigin}]:[]),...order,...(destination?[{id:destination,arrival_anchor:destination}]:[])];
  for(let i=1;i<roadOrder.length;i++){
   const from=roadOrder[i-1],to=roadOrder[i],a=anchors.get(from.departure_anchor),b=anchors.get(to.arrival_anchor);
   const identity=anchor=>anchor?.location?.kind==='catalog'&&anchor.location.reference_kind==='poi'?anchor.location.id:anchor?.location?.kind==='point'?`@${anchor.location.lon},${anchor.location.lat}`:null;
   const fromId=identity(a),toId=identity(b);if(!fromId||!toId)continue;
   const road=resolveDirectedTravel(fromId,toId,catalog,matrix,'foot');
   // A boundary and stop may reference the exact same current catalogue
   // entity under separate IDs. Only that identity permits a zero road.
   const shared=road.origin==='same_place'&&physical(a)===physical(b)&&JSON.stringify(a.source)===JSON.stringify(b.source);
   if(road.origin!=='estimate'&&!shared)continue;
   graph.links.push({id:`map:${from.id}:${to.id}`,from:from.departure_anchor,to:to.arrival_anchor,
    from_revision:anchors.get(from.departure_anchor).revision,to_revision:anchors.get(to.arrival_anchor).revision,
    mode:'foot',claim:{kind:'minutes',minutes:road.minutes},basis:'map_estimate',
    source:{reference:matrix.source.id,checked_at:matrix.source.checked_at,valid_from:null,valid_until:null}});
  }
 }
 // Without accommodation or trains the walking day starts at its first landmark.
 const first=order[0],origin=boundaryOrigin||(!boundaries.origin&&!plan.rail&&!synthetic.length&&first?.kind==='place'?first.arrival_anchor:null);
 const selected_connections=[];
 if(Object.hasOwn(day,'transfer_connections')){
  if(!validTransferConnections(day.transfer_connections))throw Error('service_transfer_connections_unsupported');
  for(const choice of transferChoices(day)){
   const aliases=new Map();
   // Private namespaces keep independent evidence and stale revisions intact.
   for(const a of choice.graph.anchors){
    let id=JSON.stringify(['connection',choice.id,a.id]);while(anchors.has(id))id+='_';
    if(aliases.has(a.id))throw Error('service_transfer_connections_unsupported');
    aliases.set(a.id,id);const saved={...structuredClone(a),id};anchors.set(id,saved);graph.anchors.push(saved);
   }
   const linkIds=new Set(graph.links.map(link=>link.id));
   for(const link of choice.graph.links){
    let id=JSON.stringify(['connection',choice.id,link.id]);while(linkIds.has(id))id+='_';linkIds.add(id);
    graph.links.push({...structuredClone(link),id,from:aliases.get(link.from),to:aliases.get(link.to)});
   }
   const steps=choice.steps.map(step=>step.kind==='road'?{...step,from:aliases.get(step.from),to:aliases.get(step.to)}:{kind:'ride',ride:{...structuredClone(step.ride),from:aliases.get(step.ride.from),to:aliases.get(step.ride.to)}});
   selected_connections.push({from:structuredClone(choice.from),to:structuredClone(choice.to),steps,selected_date:choice.date});
  }
 }
 const itinerary={version:1,order,graph,mode,origin,destination,...(selected_connections.length?{selected_connections}:{})};
 const vehicle=vehicleItinerary(trip,itinerary,catalog,matrix,day.date);
 graph.anchors.push(...vehicle.anchors);graph.links.push(...vehicle.links);
 if(vehicle.connections.length){itinerary.selected_connections=[...selected_connections,...vehicle.connections];}
 if(vehicle.connections.length||vehicle.anchors.length){
  // Every approach/return is now an explicit physical road in Rust. Retaining
  // legacy stop.access here would count the same parking walk a second time.
  for(const stop of plan.stops)delete stop.access;
 }
 return {itinerary,visits:boundVisits};
}
