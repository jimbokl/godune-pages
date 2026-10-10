import {selectedDay} from './trip-days-state.mjs?v=27';
import {activateTimeline,timelineGuard} from './trip-service-timeline-state.mjs';
import {inspectTripServiceDay} from './trip-service-day-state.mjs';
import {projectDayMap,projectedRoadFeatures} from './day-map-state.mjs?v=7';
import {bikeRouteFacts} from './bike-route-profile.mjs';

const modes={bike:'На велосипеде',foot:'Пешком',car:'На машине'};
const escape=value=>String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const point=p=>Array.isArray(p)&&p.length===2&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;
const valid=f=>f?.geometry?.type==='LineString'&&f.geometry.coordinates.length>=2&&f.geometry.coordinates.every(point)&&Object.hasOwn(modes,f.properties?.mode);
const tag=(name,value)=>`<${name}>${escape(value)}</${name}>`;

// A GPX is a read-only projection of the selected day. Separate segments retain
// road direction and gaps; no route point asks a navigator to invent a road.
export async function collectDayGpx({trip,catalog,matrix,engine,base}){
 let copy=structuredClone(trip);
 if(selectedDay(copy).kosa_plan)throw Error('gpx_generated_day');
 if(!Object.hasOwn(selectedDay(copy),'timeline'))copy=activateTimeline(copy,timelineGuard(copy));
 const day=selectedDay(copy),assessment=inspectTripServiceDay(engine,copy,catalog,matrix);
 const projection=projectDayMap(copy,catalog,assessment);
 const roads=await projectedRoadFeatures(projection,catalog,matrix,base);
 const features=roads.features.filter(valid),gaps=[];
 for(const c of projection.connections){
  const expected=projection.roads.filter(r=>r.connectionKey===c.key);
  const actual=features.filter(f=>f.properties.connection_key===c.key);
  if(!expected.length||expected.length!==actual.length||c.rows.some(r=>['bus','rail','ferry','notice'].includes(r.kind)))gaps.push(c.title);
 }
 if(!features.length)throw Error('gpx_no_paths');
 const title=day.name?.trim()||`Мой день${day.date?' · '+day.date:''}`;
 const partial=gaps.length>0||projection.omittedStops>0;
 const notes=[`День: ${day.date||'дата не выбрана'}.`,
  partial?`Известные участки пути. ${gaps.length?`Без трека: ${gaps.join('; ')}. `:''}${projection.omittedStops?`Без координат: ${projection.omittedStops} остановок.`:''}`:`Путь выбранного дня${projection.points.some(p=>p.boundaryLabel==='Возвращение')?', включая выбранное возвращение':''}.`,
  `Дороги: ${matrix.source.name}. Проверка: ${matrix.source.checked_at}.`,
  '© OpenStreetMap contributors, ODbL.'];
 const segments=features.map((feature,i)=>{
  const p=feature.properties;
  const facts=p.mode==='bike'?bikeRouteFacts({origin:'estimate',mode:'bike',distance_m:Object.values(p.bike_profile?.surfaces||{}).reduce((a,b)=>a+b,0),bike_profile:p.bike_profile}):[];
  return {coordinates:feature.geometry.coordinates,mode:p.mode,from:p.from,to:p.to,connection:p.connection_key,
   description:[`Участок ${i+1}: ${modes[p.mode]}.`,...facts].join(' ')};
 });
 const trackModes=new Set(segments.map(s=>s.mode)),type=trackModes.size>1?'multimodal':{bike:'cycling',car:'driving',foot:'walking'}[segments[0].mode];
 const waypoints=projection.points.map(p=>({lat:p.lat,lon:p.lon,name:[p.boundaryLabel||p.number,p.name].filter(Boolean).join(' · '),description:p.boundaryLabel||'Остановка выбранного дня'}));
 const xml=`<?xml version="1.0" encoding="UTF-8"?>\n<gpx xmlns="http://www.topografix.com/GPX/1/1" xmlns:gd="https://godune.ru/gpx/1" version="1.1" creator="GoDune.ru">\n`+
  `<metadata>${tag('name',title)}${tag('desc',notes.join(' '))}<copyright author="OpenStreetMap contributors"><license>https://opendatacommons.org/licenses/odbl/1-0/</license></copyright><link href="https://godune.ru/"><text>GoDune.ru · Балтийские дюны</text></link></metadata>\n`+
  waypoints.map(p=>`<wpt lat="${p.lat}" lon="${p.lon}">${tag('name',p.name)}${tag('desc',p.description)}</wpt>`).join('\n')+
  `\n<trk>${tag('name',title)}${tag('desc',[...notes,...segments.map(s=>s.description)].join(' '))}${tag('type',type)}\n`+
  segments.map(s=>`<trkseg>${s.coordinates.map(p=>`<trkpt lat="${p[1]}" lon="${p[0]}"/>`).join('')}<extensions>${tag('gd:mode',s.mode)}${tag('gd:from',s.from)}${tag('gd:to',s.to)}${tag('gd:description',s.description)}</extensions></trkseg>`).join('\n')+
  '\n</trk>\n</gpx>\n';
 const id=String(day.id||'day').replace(/[^a-z0-9-]/gi,'-');
 return {xml,filename:`godune-${day.date||'plan'}-${id}${partial?'-known-sections':''}.gpx`,partial,gaps,omittedStops:projection.omittedStops,segments,waypoints};
}
