// Read the portable transport settings into physical roads, without migrating
// or writing the saved day. Rust remains the only owner of timing and fit.
import {baseTransport} from './day-mobility.mjs?v=4';
import {manualLeg,resolveAccessBetween,resolveDirectedTravel,sameArrival} from './travel-estimates.mjs?v=11';
const physical=a=>JSON.stringify([a?.kind,a?.revision,a?.location]);
const poiId=a=>a?.location?.kind==='catalog'&&a.location.reference_kind==='poi'?a.location.id:null;
const roadId=a=>poiId(a)||(a?.location?.kind==='point'?`@${a.location.lon},${a.location.lat}`:null);
const minute=v=>Number.isInteger(v)&&v>=0&&v<=1440;
const evidence=s=>s?.id&&s.checked_at?{reference:s.id,checked_at:s.checked_at,valid_from:null,valid_until:null}:null;
export function vehicleItinerary(trip,itinerary,catalog,matrix,date){
 const base=baseTransport(trip),mode=base?.mode||trip.schedule?.mode;
 if(!['car','bike'].includes(mode)||trip.schedule?.rail)return {anchors:[],links:[],connections:[]};
 const anchors=[],links=[],connections=[],known=new Map(itinerary.graph.anchors.map(a=>[a.id,a]));
 const fallback={reference:'Настройки транспорта в вашем плане',checked_at:date,valid_from:date,valid_until:date};
 const source=evidence(matrix?.source)||fallback;
 const add=a=>{while(known.has(a.id))a.id+='_';known.set(a.id,a);anchors.push(a);return a;};
 const lookup=id=>known.get(id);
 const landmark=id=>{
  const p=catalog.poi.find(p=>p.slug===id);if(!p)return null;
  const a={id:JSON.stringify(['vehicle-place',id]),name:p.name,kind:'landmark',revision:`catalog:${id}:${p.lat},${p.lon}`,location:{kind:'catalog',reference_kind:'poi',id},source:null};
  return [...known.values()].find(v=>physical(v)===physical(a))||add(a);
 };
 const parkingCache=new Map();
 const parking=(a,boundary=false)=>{
  if(boundary&&a?.location?.kind==='point')return a;
  const key=a?.id||'unknown';if(parkingCache.has(key))return parkingCache.get(key);
  const p=catalog.poi.find(p=>p.slug===poiId(a)),v=p?.arrival_points?.[mode];
  const valid=v&&Number.isFinite(v.lat)&&Math.abs(v.lat)<=90&&Number.isFinite(v.lon)&&Math.abs(v.lon)<=180&&v.source?.url&&v.source.checked_at;
  const point=add({id:JSON.stringify(['vehicle-parking',mode,key,p?.slug||null]),name:valid?v.name:`Место для ${mode==='car'?'машины':'велосипеда'} у ${a?.name||'остановки'} пока не проверено`,kind:'parking',
   revision:valid?`point:${v.lat},${v.lon}`:`parking:unknown:${key}`,location:valid?{kind:'point',lat:v.lat,lon:v.lon}:{kind:'unknown'},
   source:valid?{reference:v.source.url,checked_at:v.source.checked_at,valid_from:null,valid_until:null}:null});
  parkingCache.set(key,point);return point;
 };
 const access=(a,direction)=>{
  const id=poiId(a);if(!id)return null;
  return resolveAccessBetween({places:[id],schedule:{mode}},id,null,null,catalog,matrix)?.[direction==='approach'?'approach':'back'];
 };
 const nodes=[...(itinerary.origin?[{entry:{kind:'origin',id:itinerary.origin},arrival_anchor:itinerary.origin,departure_anchor:itinerary.origin}]:[]),
  ...itinerary.order.map(e=>({...e,entry:{kind:e.kind,id:e.id}})),
  ...(itinerary.destination?[{entry:{kind:'destination',id:itinerary.destination},arrival_anchor:itinerary.destination,departure_anchor:itinerary.destination}]:[])];
 const pairKey=(a,b)=>JSON.stringify([a.kind,a.id,b.kind,b.id]);
 const chosen=new Set((itinerary.selected_connections||[]).map(c=>pairKey(c.from,c.to)));
 for(let i=1;i<nodes.length;i++){
  const from=nodes[i-1],to=nodes[i],a=lookup(from.departure_anchor),b=lookup(to.arrival_anchor);
  if(!a||!b||chosen.has(pairKey(from.entry,to.entry)))continue;
  const steps=[],key=pairKey(from.entry,to.entry);
  const road=(x,y,profile,result=null,customSource=source,basis='map_estimate')=>{
   if(!x||!y||x.id===y.id)return;
   const minutes=result&&['estimate','same_place','manual'].includes(result.origin)&&minute(result.minutes)?result.minutes:null;
   links.push({id:JSON.stringify(['vehicle-road',key,steps.length]),from:x.id,to:y.id,from_revision:x.revision,to_revision:y.revision,mode:profile,
    claim:minutes===null?{kind:'unknown'}:{kind:'minutes',minutes},basis,source:structuredClone(customSource)});
   steps.push({kind:'road',from:x.id,to:y.id,mode:profile});return links.at(-1);
  };
  const walk=(x,y)=>road(x,y,'foot',resolveDirectedTravel(roadId(x),roadId(y),catalog,matrix,'foot'));
  const accessRoad=(place,park,direction)=>{
   if(place?.id===park?.id)return;
   const leg=access(place,direction);
   road(direction==='approach'?park:place,direction==='approach'?place:park,'foot',leg);
  };
  const vehicleRoad=(x,y,px,py,manual=null)=>{
   const verified=px.location.kind!=='unknown'&&py.location.kind!=='unknown';
   return road(px,py,mode,verified?(manual?{origin:'manual',minutes:manual.minutes}:resolveDirectedTravel(roadId(x),roadId(y),catalog,matrix,mode)):null,
    manual?{reference:'Ваша оценка времени дороги',checked_at:date,valid_from:date,valid_until:date}:source,manual?'user_estimate':'map_estimate');
  };
  const direct=(x,y,fromBase=false,toBase=false,manual=null)=>{
   if(!manual&&sameArrival(catalog,poiId(x),poiId(y),mode)){walk(x,y);return;}
   const px=parking(x,fromBase),py=parking(y,toBase);
   accessRoad(x,px,'return');vehicleRoad(x,y,px,py,manual);accessRoad(y,py,'approach');
  };
  const outward=base&&from.entry.kind==='origin',returning=base&&(to.entry.kind==='destination'||to.entry.id==='__day_night');
  const afterNight=base&&from.entry.id==='__day_night';
  const originalManual=to.entry.kind==='place'?manualLeg(trip,to.entry.id):null;
  // A duration bound to the former neighbour is never applied after inserting
  // a service or reordering the timeline.
  const manual=originalManual&&originalManual.from===roadId(a)?originalManual:null;
  if(physical(a)===physical(b)&&a.location.kind!=='unknown')road(a,b,base?'foot':mode,{origin:'same_place',minutes:0},{...fallback,reference:'Один и тот же ориентир в вашем плане'},'field_checked');
  else if(outward||returning){
   const via=landmark(base.via)||add({id:JSON.stringify(['vehicle-place',base.via]),name:base.via,kind:'landmark',revision:`missing:${base.via}`,location:{kind:'unknown'},source:null});
   const pv=parking(via);
   if(outward){
    const pa=parking(a,true);accessRoad(a,pa,'return');const vehicleLink=vehicleRoad(a,via,pa,pv,manual&&roadId(b)===base.via?manual:null);accessRoad(via,pv,'approach');walk(via,b);
    if(manual&&roadId(b)!==base.via){
     // A legacy aggregate includes driving and walking through `via`. Keep it
     // saved, but do not invent a split into physical components.
     if(vehicleLink){vehicleLink.claim={kind:'unknown'};vehicleLink.source={...fallback,reference:`Ваша общая оценка ${manual.minutes} мин через парковку; время отдельных участков не задано`};}
    }
   }else if(roadId(b)===base.via)walk(a,b);
   else{walk(a,via);accessRoad(via,pv,'return');const pb=parking(b,true);vehicleRoad(via,b,pv,pb);accessRoad(b,pb,'approach');}
  }else if(base&&!afterNight){
   road(a,b,'foot',manual?{origin:'manual',minutes:manual.minutes}:resolveDirectedTravel(roadId(a),roadId(b),catalog,matrix,'foot'),manual?{...fallback,reference:'Ваша оценка времени дороги'}:source,manual?'user_estimate':'map_estimate');
  }else direct(a,b,from.entry.kind==='origin'||afterNight,to.entry.kind==='destination'||to.entry.id==='__day_night',manual);
  if(steps.length)connections.push({from:structuredClone(from.entry),to:structuredClone(to.entry),steps,selected_date:date});
 }
 return {anchors,links,connections};
}

// Geometry projection may recognize only our current, sourced parking ports.
// Other arbitrary points retain their own identity and cannot borrow a POI road.
export function vehicleParkingReference(anchor,catalog){
 let id;try{id=JSON.parse(anchor?.id);}catch{return null;}
 if(!Array.isArray(id)||id[0]!=='vehicle-parking'||!['car','bike'].includes(id[1])||anchor.kind!=='parking')return null;
 for(const p of catalog.poi.filter(p=>p.slug===id[3])){const v=p.arrival_points?.[id[1]];
  if(v&&anchor.revision===`point:${v.lat},${v.lon}`&&anchor.location?.kind==='point'&&anchor.location.lat===v.lat&&anchor.location.lon===v.lon&&anchor.source?.reference===v.source?.url&&anchor.source?.checked_at===v.source?.checked_at)return {id:p.slug,mode:id[1],parking_id:v.id};
 }
 return null;
}
