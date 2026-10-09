import {emptyTrip,cleanTrip} from './trip-state.mjs?v=29';
import {ensureJourney,selectedDay,addTripDay,dayHasContent,validTripDate} from './trip-days-state.mjs?v=26';
import {planInput,planTravel} from './trip-schedule-state.mjs?v=18';
import {bikeProfile,bikeRouteFacts} from './bike-route-profile.mjs';

export const bikeGuard=trip=>JSON.stringify(trip);
const integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
export function bikeSettings(raw){
 const value={area:raw.area||'all',date:raw.date,start:Number(raw.start),available:Number(raw.available),
  max_km:raw.max_km===''||raw.max_km==null?null:Number(raw.max_km),surface:raw.surface||'any',
  adults:Number(raw.adults),children:Number(raw.children),trailer:raw.trailer===true};
 if(!validTripDate(value.date)||!integer(value.start,0,1439)||!integer(value.available,30,720)||value.start+value.available>1440
  ||!integer(value.adults,1,100)||!integer(value.children,0,100)||value.max_km!==null&&(!Number.isFinite(value.max_km)||value.max_km<=0||value.max_km>1000)
  ||!['any','hard','no_steps'].includes(value.surface)||value.trailer&&!value.children
  ||!['all','kaliningrad','zelenogradsk','svetlogorsk','baltiysk'].includes(value.area))throw Error('Проверьте дату, время и состав компании.');
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
 day.party={version:1,adults:settings.adults,children:settings.children};
 day.note=`Велопрогулка: ${ride.name}. Осмотр снаружи. ${settings.trailer?'С детским прицепом. ':''}Путь в одну сторону, от первой остановки до последней. Дорога к старту и от финиша, прокат и возвращение велосипеда добавляются отдельно.`;
 return cleanTrip(trip,catalog);
}
const hard=new Set(['paved','asphalt','concrete','paving_stones','cobblestone']);
const sourced=fact=>typeof fact?.source?.url==='string'&&/^https?:\/\//.test(fact.source.url)&&validTripDate(fact.source.checked_at);
const supported=fact=>fact?.value===true&&sourced(fact);
const partList=travel=>travel?.parts?.length?travel.parts.flatMap(partList):[travel];

// Selection uses the same directed roads and Rust day plan as My Day/PDF.
// An absent road/profile is not zero distance and cannot satisfy a strict filter.
export function assessBikeRide(ride,settings,catalog,matrix,engine){
 const trip=bikeTrip(ride,settings,catalog),input=planInput(trip,catalog,matrix),plan=engine(input);
 const travels=trip.places.map(id=>planTravel(trip,id,catalog,matrix));
 const parts=travels.slice(1).flatMap(row=>partList(row.travel)),access=travels.flatMap(row=>row.access?[row.access.approach,row.access.back]:[]);
 const all=[...parts,...access].filter(p=>p?.origin!=='same_place'&&!(p?.origin==='shared'&&p.minutes===0));
 const unknownRoad=all.some(p=>p?.origin!=='estimate'||!Number.isFinite(p?.distance_m)||p.distance_m<0||p.minutes==null);
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
 if(['conflict','overrun'].includes(plan.status)&&!excluded.length)excluded.push('В расчёте дня есть конфликт времени.');
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
 return {id:ride.id,ride,trip,plan,input,distance_m:distance,duration_minutes:duration,
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
