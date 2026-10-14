import {emptyTrip,cleanTrip} from './trip-state.mjs?v=2026101305';
import {chooseTripDay,validTripDate} from './trip-days-state.mjs?v=2026101305';
import {wizardDefaults,prepareWizardPlan} from './planning-wizard-state.mjs?v=2026101403';
import {calculateTransport,transportReceipt} from './transport-page-state.mjs?v=2026101305';
import {wizardBusChoice,wizardBusTargets,attachWizardBus} from './wizard-bus.mjs?v=2026101402';

const clone=value=>structuredClone(value);
const values={origin:['mow','spb','de','local'],arrival:['morning','day','evening'],departure:['day_out','evening_out'],base:['kgd','zel','svet','split'],goal:['tourist','realty','work']};
const clock=value=>typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const integer=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const parseClock=value=>{if(!clock(value))throw Error('weekend_invalid_time');return Number(value.slice(0,2))*60+Number(value.slice(3));};
const dayNo=date=>Number(date.slice(8,10));
const stable=value=>JSON.stringify(value,(_,row)=>row&&typeof row==='object'&&!Array.isArray(row)?Object.fromEntries(Object.keys(row).sort().map(key=>[key,row[key]])):row);
const stripBlock=(text,block)=>!block?text:(text===block?'':text.startsWith(block+'\n')?text.slice(block.length+1):text.endsWith('\n'+block)?text.slice(0,-block.length-1):text.split('\n'+block+'\n').join('\n'));

function presetOf(config,id){const preset=config?.presets?.find(row=>row.id===id);if(!preset)throw Error('weekend_unknown_preset');return preset;}
export function weekendDefaults(config,id){
 const preset=presetOf(config,id);
 return {preset:preset.id,origin:preset.origin,arrival:preset.arrival,departure:preset.departure,base:preset.base,goal:preset.goal,date:null,party:{version:1,adults:2,children:0},arrival_time:({morning:'08:30',day:'12:00',evening:'19:00'})[preset.arrival],departure_time:preset.departure==='day_out'?'14:00':'20:00',arrival_reserve:90,airport_reserve:180,travel_reserve:120,ferry_ready:465,ferry_boarding:15,ferry_shore:180};
}
function checked(config,settings){
 const preset=presetOf(config,settings?.preset);
 for(const key of Object.keys(values))if(!values[key].includes(settings[key]??preset[key]))throw Error(`weekend_invalid_${key}`);
 if(settings.date!==null&&!validTripDate(settings.date))throw Error('weekend_invalid_date');
 if(!clock(settings.arrival_time)||!clock(settings.departure_time))throw Error('weekend_invalid_time');
 for(const [key,min,max]of [['arrival_reserve',0,720],['airport_reserve',0,720],['travel_reserve',0,720],['ferry_ready',0,1439],['ferry_boarding',0,120],['ferry_shore',30,720]])if(!integer(settings[key],min,max))throw Error(`weekend_invalid_${key}`);
 const party=settings.party??{version:1,adults:2,children:0};
 if(party.version!==1||!integer(party.adults,1,20)||!integer(party.children,0,20)||party.adults+party.children>20)throw Error('weekend_invalid_party');
 const goal=config.goals?.[settings.goal??preset.goal];if(!goal)throw Error('weekend_invalid_goal');
 return {preset,goal,settings:{...weekendDefaults(config,preset.id),...settings,party:clone(party),goal:settings.goal??preset.goal}};
}
function effectiveDays(preset,goal,settings){
 const days=clone(preset.days);
 if(settings.goal!=='tourist'&&goal.recipe){
   const index=days.findIndex(day=>day.kind==='project');
   const target=index<0?0:index;
   days[target]={...days[target],name:goal.day_name, waveId:goal.recipe,kind:'project',note:goal.note||'',links:clone(goal.links||[])};
 }
 return days;
}
export function weekendDays(config,settings){
 const {preset,goal,settings:s}=checked(config,settings),days=effectiveDays(preset,goal,s);
 if(days.length<1||days.length>14)throw Error('weekend_invalid_length');
 let date=s.date;const start=days.map((day,index)=>{
  if(date!==null&&!validTripDate(date))throw Error('weekend_date_overflow');
  const row={...clone(day),id:`day-${index+1}`,date};
  if(date){const next=new Date(`${date}T12:00:00Z`);next.setUTCDate(next.getUTCDate()+1);date=next.toISOString().slice(0,10);if(!validTripDate(date)&&index<days.length-1)throw Error('weekend_date_overflow');}
  return row;
 });
 return start;
}
function overlayCatalog(catalog,id,days){
 const original=catalog?.day_waves?.version===1?catalog.day_waves.itineraries||[]:[];
 const itinerary={id:`weekend-${id}`,name:`Weekend ${id}`,description:'',days:days.map(day=>({recipe:day.waveId,transport:day.kind==='kosa'?'bus':'foot',...(day.kind==='kosa'?{transport_origin:'zelenogradsk'}:{})}))};
 return {...catalog,day_waves:{...(catalog.day_waves||{}),version:1,itineraries:[...original,itinerary]}};
}
function planningTimes(s,index,count){
 const arrival=parseClock(s.arrival_time)+s.arrival_reserve;
 const exit=parseClock(s.departure_time)-s.airport_reserve;
 let start=540,end=1080;
 if(index===0)start=Math.max(start,arrival);
 if(index===0&&s.arrival==='evening')end=parseClock('21:00');
 if(index===count-1&&s.departure==='day_out')end=Math.min(end,exit);
 else if(index===count-1)end=Math.min(end,exit);
 if(start>=end)throw Error('weekend_insufficient_day');
 return {start,end,short:index===0&&s.arrival==='evening'};
}
function itineraryAnswers(trip,catalog,preset,days,s){
 // The generated recipe must not inherit the active day, base, or scheduler
 // controls from the person's existing journey. That made a second save
 // produce a different route after the first save selected its first day.
 const planningTrip=cleanTrip(emptyTrip(),catalog),base=wizardDefaults(planningTrip,catalog),arrival=planningTimes(s,0,days.length),first=arrival.short?{start:540,end:1080}:arrival;
 const answers={...base,area:'whole-trip',starter:`weekend-${preset.id}`,date:s.date,start:first.start,end:first.end,transport:'auto',party:s.party,
   preferences:base.preferences,wave:{version:1,theme:'mixed',pace:'full',recipe:null}};
 const targets=wizardBusTargets(catalog,answers);
 if(targets.length)answers.bus_days=targets.map(target=>wizardBusChoice(answers,target));
 return answers;
}
function applyDaySettings(day,meta,links,note){
 day.weekend=meta;
 const material=links?.length?`Материалы: ${links.map(link=>`${link.label} (${link.url})`).join('; ')}`:'';
 day.note=[day.note,note,meta.base_note,material].filter(Boolean).join('\n');
}
function addFerry(trip,day,config,settings,context){
 const profile=context?.profiles?.find(row=>row.id==='baltic-ferry')||context?.ferryProfile;
 if(!profile||!context?.tables||!context?.calculate)throw Error('weekend_ferry_unavailable');
 if(!validTripDate(day.date))throw Error('weekend_ferry_date');
 const answers={date:day.date,ready:settings.ferry_ready,boarding:settings.ferry_boarding,shore:settings.ferry_shore,people:settings.party.adults+settings.party.children,exempt:0,bikes:1,mode:'foot',walks:'one',forest:60,origin:'kaliningrad-rail',station_walk:20,rail_boarding:settings.ferry_boarding};
 let result=calculateTransport(profile,answers,context.tables,context.calculate),routeAnswers=answers;
 // Prefer a dated, connected rail round trip. When it does not connect, keep
 // the published ferry calculation and label the user's KGD↔Baltiysk reserve
 // as personal; never turn that reserve into a fabricated timetable.
 if(result.rail_connection?.state!=='connected'){
   const pierReady=settings.ferry_ready+settings.travel_reserve;if(pierReady>1439)throw Error('weekend_ferry_time');
   const {station_walk,rail_boarding,...ferryAnswers}=answers;
   routeAnswers={...ferryAnswers,origin:'baltiysk',ready:pierReady};
   result=calculateTransport(profile,routeAnswers,context.tables,context.calculate);
 }
 if(!['needs_check','circular_candidate'].includes(result.state)||!result.day?.outward||!result.day?.inbound)throw Error(`weekend_ferry_${result.state}`);
 const receipt=transportReceipt(profile,routeAnswers,result),journeyStart=result.rail_connection?.state==='connected'?result.rail_connection.outward.departure:settings.ferry_ready,journeyEnd=result.rail_connection?.state==='connected'?result.rail_connection.inbound.arrival:(result.day?.circular?.finish_estimate??result.finish??routeAnswers.ready+settings.ferry_shore)+settings.travel_reserve;
 const availableEnd=day.schedule?.end??1440,baseReserve=['zel','svet'].includes(settings.base)?settings.travel_reserve:0;
 if(journeyEnd+baseReserve>availableEnd||journeyStart-baseReserve<(day.weekend?.day_index===0?parseClock(settings.arrival_time)+settings.arrival_reserve:0))throw Error('weekend_insufficient_day');
 day.schedule={...day.schedule,start:journeyStart-baseReserve,end:Math.max(journeyStart+1,journeyEnd+baseReserve)};
 day.transport_plans={version:1,entries:[{id:receipt.profile,receipt,saved_at:new Date().toISOString()}]};
 day.weekend.ferry={ready:settings.ferry_ready,boarding:settings.ferry_boarding,shore:settings.ferry_shore,travel_reserve:settings.travel_reserve};
 if(result.rail_connection?.state!=='connected')day.note=[day.note,`Дорога Калининград—Балтийск и обратно: личный запас ${settings.travel_reserve} мин в каждую сторону; расписанием не подтверждён.`].filter(Boolean).join('\n');
 return trip;
}
export function prepareWeekend(trip,catalog,config,settings,context={}){
 const {preset,goal,settings:s}=checked(config,settings),days=weekendDays(config,s),overlay=overlayCatalog(catalog,preset.id,days);
 const answers=itineraryAnswers(trip,overlay,preset,days,s);
 // Generate a clean proposal, then apply its day recipes to exact requested IDs at save time.
 const plan=prepareWizardPlan(cleanTrip(emptyTrip(),overlay),answers,overlay,context);
 if(plan.kind!=='journey'||plan.trip.itinerary.days.length!==days.length)throw Error('weekend_plan_unavailable');
 for(let i=0;i<days.length;i++){
  const day=plan.trip.itinerary.days[i],row=days[i],time=planningTimes(s,i,days.length);
  const area=row.waveId.includes('zelenogradsk')?'zel':row.waveId.includes('svetlogorsk')?'svet':row.waveId.includes('kaliningrad')?'kgd':'other';
  const outsideBase=s.base!=='split'&&area!==s.base;
  if(row.kind!=='kosa'&&row.kind!=='ferry'&&outsideBase){
   if(i>0)time.start+=s.travel_reserve;
   if(i<days.length-1)time.end-=s.travel_reserve;
  }
  if(time.start>=time.end)throw Error('weekend_insufficient_day');
  day.date=row.date;day.name=row.name;day.schedule={...day.schedule,start:time.start,end:time.end};
  if(row.kind==='kosa'){
   const target={...wizardBusTargets(overlay,answers).find(target=>target.index===i),origin:s.base==='kgd'?'kaliningrad':'zelenogradsk'};
   const local={...answers,start:time.start,end:time.end,bus_days:[]};
   if(s.base==='svet'){local.start+=s.travel_reserve;local.end-=s.travel_reserve;}
   local.bus_days=[wizardBusChoice(local,target)];
   const result=attachWizardBus(day,overlay,local,i,target,context);
   plan.bus={...plan.bus,[day.id]:result};
  }
  if(time.short){
   // An evening arrival gets the first existing stop as a brief promenade;
   // the longer recipe is retained only as provenance, not as the schedule.
   const first=day.places[0];day.places=first?[first]:[];
   if(day.schedule?.stops){const stop=first?day.schedule.stops[first]:null;day.schedule.stops=first&&stop?{[first]:stop}:{};}
   day.note=[day.note,'Короткая вечерняя прогулка после приезда; длинный маршрут перенесён на другой день.'].filter(Boolean).join('\n');
  }
  const baseNote=`База для планирования: ${{kgd:'Калининград',zel:'Зеленоградск',svet:'Светлогорск',split:'Калининград и приморский город'}[s.base]}. Личный запас на дорогу — ${s.travel_reserve} мин в одну сторону.${outsideBase&&row.kind!=='kosa'&&row.kind!=='ferry'?' Для выездного дня он вычтен из времени прогулки.':''}`;
  const meta={version:1,day_index:i,preset:preset.id,origin:s.origin,arrival:s.arrival,departure:s.departure,base:s.base,goal:s.goal,date:s.date,arrival_time:s.arrival_time,departure_time:s.departure_time,arrival_reserve:s.arrival_reserve,airport_reserve:s.airport_reserve,travel_reserve:s.travel_reserve,ferry_ready:s.ferry_ready,ferry_boarding:s.ferry_boarding,ferry_shore:s.ferry_shore,party:clone(s.party),day_name:row.name,kind:row.kind,links:clone(row.links||[]),base_note:baseNote,generated_places:clone(day.places),generated_note:[day.note,row.note,baseNote,row.links?.length?`Материалы: ${row.links.map(link=>`${link.label} (${link.url})`).join('; ')}`:''].filter(Boolean).join('\n')};
  applyDaySettings(day,meta,row.links,row.note);
  if(row.kind==='ferry')addFerry(plan.trip,day,config,s,context);
 }
 const active=plan.trip.itinerary.days.find(day=>day.id===plan.trip.itinerary.active);if(active){plan.trip.places=clone(active.places);if(active.schedule)plan.trip.schedule=clone(active.schedule);plan.trip.date=active.date;}
 return {...plan,trip:cleanTrip(plan.trip,overlay),days,settings:s,overlayCatalog:overlay};
}
export function saveWeekendPlan(trip,catalog,config,settings,{ids,context={},fresh=false}={}){
 const expected=weekendDays(config,settings).length;
 if(ids!==null&&ids!==undefined&&(!Array.isArray(ids)||ids.length!==expected||ids.some(id=>typeof id!=='string'||!id)))throw Error('weekend_ids_required');
 const proposal=prepareWeekend(trip,catalog,config,settings,context),saved=cleanTrip(trip,catalog),sourceDays=saved.itinerary?.days||[];
 let targetIds=ids;
 if(targetIds===null||targetIds===undefined){
   const recovered=fresh?[]:sourceDays.filter(day=>day.weekend?.preset===settings.preset&&day.weekend?.date===settings.date).sort((a,b)=>a.weekend.day_index-b.weekend.day_index);
   if(recovered.length===expected&&recovered.every((day,index)=>day.weekend.day_index===index))targetIds=recovered.map(day=>day.id);
   else {const used=new Set(sourceDays.map(day=>day.id));let nextNumber=1;targetIds=Array.from({length:expected},()=>{while(used.has(`day-${nextNumber}`))nextNumber++;const id=`day-${nextNumber++}`;used.add(id);return id;});}
 }
 const idSet=new Set();
 for(const id of targetIds)if(idSet.has(id)||sourceDays.some(day=>day.id===id)===false&&ids!==null&&ids!==undefined)throw Error('weekend_target_missing');else idSet.add(id);
 const next=saved.itinerary?clone(saved):{...emptyTrip(),...saved,itinerary:{version:1,active:targetIds[0],people:settings.party?.adults||1,days:[]}},days=next.itinerary.days;
 const generated=proposal.trip.itinerary.days;
 if(ids===null||ids===undefined){
   for(let i=0;i<targetIds.length;i++)if(!days.some(day=>day.id===targetIds[i]))days.push({...clone(generated[i]),id:targetIds[i]});
 }
 for(let i=0;i<targetIds.length;i++){
  const current=days.find(day=>day.id===targetIds[i]);if(!current)throw Error('weekend_target_missing');
  const generatedDay=generated[i],priorWeekend=clone(current.weekend||{}),priorGeneratedNote=priorWeekend.generated_note||'';
  const userNote=stripBlock(current.note||'',priorGeneratedNote);
  const personallyChanged=stable(current.places||[])!==stable(priorWeekend.generated_places||[]);
  if(priorWeekend.preset===settings.preset&&priorWeekend.goal!==settings.goal&&personallyChanged&&stable(priorWeekend.generated_places||[])!==stable(generatedDay.places))throw Error('weekend_goal_requires_fresh_days');
  if(generatedDay.transport_plans?.entries&&current.transport_plans?.entries){
   for(const entry of generatedDay.transport_plans.entries){const prior=current.transport_plans.entries.find(row=>row.id===entry.id&&stable(row.receipt)===stable(entry.receipt));if(prior)entry.saved_at=prior.saved_at;}
  }
  const reserved={id:current.id,places:current.places,menu_choices:current.menu_choices,visited:current.visited,costs:current.costs,bookings:current.bookings,service_visits:current.service_visits,party:current.party,preferences:current.preferences};
  for(const [key,value]of Object.entries(generatedDay))if(!['id','note','places','menu_choices','visited','costs','bookings','service_visits','party','preferences'].includes(key))current[key]=clone(value);
  current.date=generatedDay.date;current.schedule=clone(generatedDay.schedule);
  const manualPlaces=personallyChanged;
  current.places=manualPlaces?reserved.places:clone(generatedDay.places);
  for(const key of ['menu_choices','visited','costs','bookings','service_visits','party','preferences'])if(reserved[key]!==undefined)current[key]=reserved[key];
  current.weekend.day_index=i;current.weekend.generated_places=clone(generatedDay.places);current.weekend.generated_note=generatedDay.note;
  current.note=[...new Set([generatedDay.note,userNote].filter(Boolean))].join('\n');
 }
 next.itinerary.active=targetIds[0];next.date=days.find(day=>day.id===targetIds[0]).date;
 return {trip:cleanTrip(chooseTripDay(next,targetIds[0]),catalog),ids:[...targetIds]};
}
export function weekendGuideTrip(trip,catalog,ids){
 const clean=cleanTrip(trip,catalog);if(!Array.isArray(ids)||ids.some(id=>!clean.itinerary?.days.some(day=>day.id===id)))throw Error('weekend_target_missing');
 const days=ids.map(id=>clean.itinerary.days.find(day=>day.id===id));
 return {...clean,itinerary:{...clean.itinerary,active:ids[0],days:clone(days)}};
}
