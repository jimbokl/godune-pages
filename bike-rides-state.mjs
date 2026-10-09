import {emptyTrip,cleanTrip} from './trip-state.mjs?v=30';
import {ensureJourney,selectedDay,addTripDay,dayHasContent,validTripDate} from './trip-days-state.mjs?v=27';
import {planInput,planTravel,planBaseTravel} from './trip-schedule-state.mjs?v=19';
import {dayBases,resolveAccessBetween,resolveDirectedTravel} from './travel-estimates.mjs?v=13';
import {bookingEffects} from './trip-bookings-state.mjs?v=3';
import {bikeProfile,bikeRouteFacts} from './bike-route-profile.mjs';
import {inspectTripServiceDay} from './trip-service-day-state.mjs?v=8';
import {projectDayMap} from './day-map-state.mjs?v=7';

export const bikeGuard=trip=>JSON.stringify(trip);
const integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
export function bikeSettings(raw){
 const value={area:raw.area||'all',date:raw.date,start:Number(raw.start),available:Number(raw.available),
  max_km:raw.max_km===''||raw.max_km==null?null:Number(raw.max_km),surface:raw.surface||'any',
  adults:Number(raw.adults),children:Number(raw.children),trailer:raw.trailer===true,
  journey:raw.journey||'loop',start_at:raw.start_at||null,end_at:raw.end_at||null,
  return_by:raw.return_by===''||raw.return_by==null?null:Number(raw.return_by),return_buffer:Number(raw.return_buffer??15)};
 if(!validTripDate(value.date)||!integer(value.start,0,1439)||!integer(value.available,30,720)||value.start+value.available>1440
  ||!integer(value.adults,1,100)||!integer(value.children,0,100)||value.max_km!==null&&(!Number.isFinite(value.max_km)||value.max_km<=0||value.max_km>1000)
  ||!['any','hard','no_steps'].includes(value.surface)||value.trailer&&!value.children
  ||!['all','kaliningrad','zelenogradsk','svetlogorsk','baltiysk'].includes(value.area))throw Error('Проверьте дату, время и состав компании.');
 if(!['loop','one_way'].includes(value.journey)||![value.start_at,value.end_at].every(v=>v===null||typeof v==='string'&&/^[a-z0-9-]+$/.test(v))
  ||value.return_by!==null&&!integer(value.return_by,0,1439)||!integer(value.return_buffer,0,1440))throw Error('Проверьте начало и возвращение.');
 if((value.journey==='loop'||value.end_at||value.return_by!==null)&&(value.return_by??Math.min(1439,value.start+value.available))-value.return_buffer<=value.start)throw Error('Оставьте время на прогулку: срок возвращения с запасом должен быть позже старта.');
 if(value.return_by!==null&&value.journey==='one_way'&&!value.end_at)throw Error('Выберите точку возвращения или поездку по кругу.');
 return value;
}
export function validateBikeRides(data,catalog){
 if(data?.version!==1||!Array.isArray(data.rides)||!data.rides.length)throw Error('Не удалось открыть велопрогулки.');
 const seen=new Set(),known=new Map(catalog.poi.map(p=>[p.slug,p]));
 for(const ride of data.rides){
  if(!/^[a-z0-9-]+$/.test(ride.id)||seen.has(ride.id)||typeof ride.name!=='string'||!ride.name||!Array.isArray(ride.stops)||ride.stops.length<2
   ||new Set(ride.stops.map(s=>s.poi)).size!==ride.stops.length||ride.stops.some(s=>!known.has(s.poi)||known.get(s.poi).area!==ride.area||!integer(s.visit_minutes,0,240)))throw Error('Повреждён набор велопрогулок.');
  seen.add(ride.id);
 }
 return data;
}
export function bikeTrip(ride,settings,catalog){
 const places=ride.stops.map(s=>s.poi),stops=Object.fromEntries(ride.stops.map(s=>[s.poi,
  {visit:s.visit_minutes,pause:0,leg:null,window:null,visit_scope:'outside'}]));
 const trip=ensureJourney(cleanTrip({...emptyTrip(),places,date:settings.date,schedule:{start:settings.start,end:settings.start+settings.available,reserve:10,mode:'bike',stops}},catalog));
 const day=selectedDay(trip);
 const known=id=>catalog.poi.some(p=>p.slug===id);
 if([settings.start_at,settings.end_at].some(id=>id&&!known(id)))throw Error('Выбранной точки нет в каталоге. Выберите начало и возвращение заново.');
 day.start_at=settings.start_at||null;
 const end=settings.end_at||(settings.journey==='loop'?settings.start_at||places[0]:null);
 if(end)day.bookings=[{id:'booking-1',kind:'return',name:'Вернуться после велопрогулки',status:'planned',date:settings.date,
  time:settings.return_by??Math.min(1439,settings.start+settings.available),duration:1,buffer:settings.return_buffer,
  location:end,target:null,binding:'end',private:{reference:'',note:''}}];
 day.party={version:1,adults:settings.adults,children:settings.children};
 day.note=`Велопрогулка: ${ride.name}. Осмотр снаружи. ${settings.trailer?'С детским прицепом. ':''}${end?'Возвращение включено в расчёт дня.':'Путь в одну сторону; возвращение не выбрано.'} Прокат добавляется отдельно.`;
 return cleanTrip(trip,catalog);
}
const hard=new Set(['paved','asphalt','concrete','paving_stones','cobblestone']);
const sourced=fact=>typeof fact?.source?.url==='string'&&/^https?:\/\//.test(fact.source.url)&&validTripDate(fact.source.checked_at);
const supported=fact=>fact?.value===true&&sourced(fact);
const partList=travel=>travel?.parts?.length?travel.parts.flatMap(partList):[travel];

// Selection uses the same directed roads and Rust day plan as My Day/PDF.
// An absent road/profile is not zero distance and cannot satisfy a strict filter.
export function assessBikeRide(ride,settings,catalog,matrix,engine){
 const trip=bikeTrip(ride,settings,catalog),input=planInput(trip,catalog,matrix);
 // A day with physical boundaries uses the same itinerary as My Day and PDF.
 // Its explicit origin, parking walks and return must not be approximated by
 // the legacy sequence of places before saving.
 const shared=dayBases(trip).start_at||bookingEffects(trip).end?inspectTripServiceDay(engine,trip,catalog,matrix):null;
 const plan=shared?.places||engine(input);
 const travels=trip.places.map(id=>planTravel(trip,id,catalog,matrix));
 const bases=dayBases(trip),returning=bases.end_at?planBaseTravel(trip,'end',catalog,matrix):null;
 let parts=travels.filter((_,i)=>i>0||bases.start_at).flatMap(row=>partList(row.travel));
 if(returning)parts.push(...partList(returning.travel));
 let access=travels.flatMap(row=>row.access?[row.access.approach,row.access.back]:[]);
 if(bases.start_at){const a=resolveAccessBetween(trip,bases.start_at,null,trip.places[0],catalog,matrix);if(a)access.push(a.back);}
 if(returning){const a=resolveAccessBetween(trip,bases.end_at,returning.from,null,catalog,matrix);if(a)access.push(a.approach);}
 if(shared){
  parts=[];access=[];
  for(const road of projectDayMap(trip,catalog,shared).roads){
   if(road.kind==='access'){
    const legs=resolveAccessBetween(trip,road.from,null,null,catalog,matrix);
    access.push(legs?.[road.direction==='approach'?'approach':'back']);
   }else parts.push(resolveDirectedTravel(road.from,road.to,catalog,matrix,road.mode));
  }
 }
 const all=[...parts,...access].filter(p=>p?.origin!=='same_place'&&!(p?.origin==='shared'&&p.minutes===0));
 const unknownRoad=plan.unknown_legs>0||all.some(p=>p?.origin!=='estimate'||!Number.isFinite(p?.distance_m)||p.distance_m<0||p.minutes==null);
 const bikeParts=parts.filter(p=>(p?.leg_mode||p?.mode)==='bike'&&p.origin!=='same_place');
 const profiles=bikeParts.map(bikeProfile),profileKnown=bikeParts.length>0&&profiles.every(Boolean);
 const surfaces={},reasons=[],excluded=[];
 if(profileKnown)for(const p of profiles)for(const [key,n]of Object.entries(p.surfaces))surfaces[key]=(surfaces[key]||0)+n;
 const distance=unknownRoad?null:all.reduce((sum,p)=>sum+p.distance_m,0);
 const duration=plan.finish==null||plan.unknown_legs>0||unknownRoad?null:plan.finish-settings.start;
 if(unknownRoad)reasons.push('Не все участки дороги рассчитаны.');
 if(!profileKnown)reasons.push('Не хватает сведений о велосипедной дороге.');
 if(duration===null&&!unknownRoad)reasons.push('Полное время пока неизвестно.');
 if(duration!==null&&duration>settings.available)excluded.push('Не помещается в выбранное время.');
 if(returning&&plan.finish!==null&&plan.finish>input.end)excluded.push('Не успеваем вернуться с выбранным запасом.');
 if(['conflict','overrun'].includes(plan.status)&&!excluded.length)excluded.push(returning?'Не успеваем вернуться с выбранным запасом.':'В расчёте дня есть конфликт времени.');
 if(settings.max_km!==null&&distance!==null&&distance>settings.max_km*1000)excluded.push('Длиннее выбранного расстояния.');
 if(settings.surface==='hard'&&profileKnown){
  if(Object.entries(surfaces).some(([key,n])=>n>0&&key!=='missing'&&!hard.has(key)))excluded.push('Есть участки без твёрдого покрытия.');
  if((surfaces.missing||0)>0)reasons.push('Покрытие части дороги не указано.');
 }
 if(settings.surface==='no_steps'&&profileKnown){
  if(profiles.some(p=>p.steps_m>0))excluded.push('На дороге есть лестницы.');
  if(profiles.some(p=>p.unmapped_m>0))reasons.push('Сведения о лестницах есть не для всей дороги.');
 }
 if(settings.children){
  const key=settings.trailer?'trailer':'children',fact=ride.party_support?.[key];
  if(fact?.value===false&&sourced(fact))excluded.push(settings.trailer?'Проезд с прицепом не подходит.':'Проезд для детей не подходит.');
  else if(!supported(fact))reasons.push(settings.trailer?'Проезд с детским прицепом пока не подтверждён.':'Условия проезда с детьми пока не подтверждены.');
  if(profileKnown&&profiles.some(p=>p.elevation===null))reasons.push('Для оценки нагрузки с детьми не хватает уклонов.');
 }
 const facts=profileKnown?bikeRouteFacts({origin:'estimate',mode:'bike',parts:bikeParts}):[];
 if(reasons.length)selectedDay(trip).note+=' Уточнить перед поездкой: '+[...new Set(reasons)].join(' ');
 const deadline=bookingEffects(trip).end,finishId=shared?.itinerary?.order.find(s=>s.kind==='destination')?.schedule_id||'__day_departure';
 const arrival=plan.stops.find(s=>s.id===finishId)?.begins??null;
 return {id:ride.id,ride,trip,plan,input,distance_m:distance,duration_minutes:duration,
  returning:deadline?{at:deadline.location,by:deadline.time,buffer:deadline.buffer,arrival,slack:arrival==null?null:deadline.time-deadline.buffer-arrival}:null,
  bike_m:profileKnown?bikeParts.reduce((n,p)=>n+p.distance_m,0):null,surfaces,
  facts,reasons:[...new Set(reasons)],excluded,state:excluded.length?'does_not_fit':reasons.length?'needs_info':'fits'};
}
export function selectBikeRides(data,settings,catalog,matrix,engine){
 validateBikeRides(data,catalog);
 return data.rides.filter(r=>settings.area==='all'||r.area===settings.area)
  .map(r=>assessBikeRide(r,settings,catalog,matrix,engine))
  .sort((a,b)=>({fits:0,needs_info:1,does_not_fit:2}[a.state]-{fits:0,needs_info:1,does_not_fit:2}[b.state])||(a.duration_minutes??Infinity)-(b.duration_minutes??Infinity)||a.id.localeCompare(b.id));
}
export function appendBikeDay(original,preview,catalog,guard){
 if(bikeGuard(original)!==guard)throw Error('Поездка изменилась. Повторите подбор перед сохранением.');
 if(preview.state==='does_not_fit')throw Error('Измените условия: эта прогулка в них не помещается.');
 const current=ensureJourney(original),next=current.itinerary.days.length===1&&!dayHasContent(current)&&!current.routes?.length?current:addTripDay(current);
 const source=selectedDay(preview.trip),id=selectedDay(next).id,target={...structuredClone(source),id};
 next.itinerary.days[next.itinerary.days.findIndex(d=>d.id===id)]=target;
 next.places=[...target.places];next.date=target.date;next.month=Number(target.date.slice(5,7));next.schedule=structuredClone(target.schedule);
 return cleanTrip(next,catalog);
}
