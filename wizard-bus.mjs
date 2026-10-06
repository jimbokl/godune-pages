// The shared wizard attaches the existing dated bus roadbook. It never turns
// distant trails into walking segments or creates its own service calendar.
import {waveVisit} from './day-wave.mjs?v=2';
import {tripStarterChoices} from './trip-starters.mjs?v=21';
import {nextDate} from './trip-days-state.mjs?v=23';
import {kosaInput,kosaMetadata,kosaNote} from './kosa-plan-state.mjs?v=24';
import {kosaRoadbook} from './kosa-roadbook.mjs?v=22';
import {validBase} from './personal-points.mjs?v=3';
import {railHomeLocations} from './rail-access.mjs?v=2';
import {validStationRoad} from './station-road-proof.mjs?v=1';
const clone=v=>structuredClone(v);
const stable=v=>JSON.stringify(v,(_,row)=>row&&typeof row==='object'&&!Array.isArray(row)?Object.fromEntries(Object.keys(row).sort().map(key=>[key,row[key]])):row);
const points=new Set(['vysota-efa','smotrovaya-efa','tancuyushchiy-les']);
const compatible=ids=>ids.includes('vysota-efa')&&ids.every(id=>points.has(id));
export function wizardBusChoices(catalog){
  const route=catalog.routes.find(row=>row.slug==='vysota-efa');if(!route)return [];
  return [{...route,name:'Дюны Эфа без машины',description:'Электричка, если нужна, затем автобус № 210. Подберём рейс к дюнам и возвращение.',stops:[{poi:'vysota-efa'}],wave_theme:'mixed'},
    {...route,slug:'kosa-210-efa-forest',geometry:null,distance_m:null,minutes:null,name:'Дюны Эфа и Танцующий лес',description:'Две тропы и автобус между ними. Проверим время осмотра, пересадку и возвращение.',stops:[{poi:'vysota-efa'},{poi:'tancuyushchiy-les'}],wave_recipe:true,wave_theme:'mixed'}];
}
export function wizardBusTargets(catalog,answers){
  const route=wizardBusChoices(catalog).find(row=>row.slug===answers.route);
  const templates=answers.area==='whole-trip'?tripStarterChoices(catalog).find(row=>row.id===answers.starter)?.days||[]:route?[{places:route.stops.map(row=>row.poi)}]:[];
  let date=answers.date;
  return templates.flatMap((row,index)=>{const today=date;date=nextDate(date);return compatible(row.places)?[{index,date:today,walks:row.places.includes('tancuyushchiy-les')?'two':'one'}]:[];});
}
export function wizardBusChoice(answers,target){
  const old=answers.bus_days?.find(row=>row.day_index===target.index)?.plan;
  const city=old?.city==='kaliningrad'?'kaliningrad':'zelenogradsk',station=city==='kaliningrad'?(old?.station||'kaliningrad-north-zelenogradsk'):null;
  const location=answers.base||null;
  const same=old?.home_access?.city===city&&old.home_access.station===station&&stable(old.home_access.start_at)===stable(location)&&stable(old.home_access.return_at)===stable(location);
  const approach=same?old.home.approach:location?null:0,back=same?old.home.return_minutes:location?null:0;
  const plan={city,date:target.date,ready:answers.start,walks:target.walks,origin:location?'home':'station',pace:answers.wave?.pace==='full'?'ordinary':'gentle',
    first_visit:waveVisit(120,answers.wave?.pace||'calm'),second_visit:waveVisit(75,answers.wave?.pace||'calm'),boarding:old&&Object.hasOwn(old,'boarding')?old.boarding:15,
    home:{ready_at:answers.start,end_by:answers.end,approach,return_minutes:back},
    home_access:{version:1,city,station,start_at:clone(location),return_at:clone(location)},
    ...(city==='kaliningrad'?{station,to_station:approach,from_station:back,to_bus:old&&Object.hasOwn(old,'to_bus')?old.to_bus:10,to_train:old&&Object.hasOwn(old,'to_train')?old.to_train:10,rail_boarding:10}:{})};
  if(same&&old.home_access.road)plan.home_access.road=clone(old.home_access.road);
  return {day_index:target.index,plan};
}
export function validTransitAccess(access,plan){
  const fields=['version','city','station','start_at','return_at'];
  return !!access&&typeof access==='object'&&!Array.isArray(access)&&Object.keys(access).length===fields.length+(access.road===undefined?0:1)&&fields.every(key=>Object.hasOwn(access,key))
    &&access.version===1&&access.city===plan.city&&access.station===(plan.city==='kaliningrad'?plan.station:null)&&validBase(access.start_at)&&validBase(access.return_at)
    &&(access.road===undefined||validStationRoad(access.road,plan.home?.approach,plan.home?.return_minutes));
}
export function boundBusInput(trip,saved,input){
  if(!saved.home_access)return input;
  if(!validTransitAccess(saved.home_access,saved)||!saved.home||saved.home.ready_at!==trip.schedule?.start||saved.home.end_by!==trip.schedule?.end)throw Error('wizard_bus_changed');
  const locations=railHomeLocations(trip),next=clone(input);
  if(stable(locations.start_at)!==stable(saved.home_access.start_at))next.home.approach=null;
  if(stable(locations.return_at)!==stable(saved.home_access.return_at))next.home.return_minutes=null;
  if(next.rail){next.rail.to_station=next.home.approach;next.rail.from_station=next.home.return_minutes;}
  return next;
}
export function attachWizardBus(day,catalog,answers,index,target,context){
  const plan=answers.bus_days?.find(row=>row.day_index===index)?.plan;
  if(!target||!plan||plan.date!==day.date||plan.walks!==target.walks||plan.ready!==answers.start||plan.home?.end_by!==answers.end
    ||!validTransitAccess(plan.home_access,plan)||stable(plan.home_access.start_at)!==stable(day.start_at)||stable(plan.home_access.return_at)!==stable(day.night_at))throw Error('wizard_bus_changed');
  if(!context?.table||!context?.calculate?.transitDay)throw Error('wizard_bus_unavailable');
  const result=context.calculate.transitDay(kosaInput(plan,context.table,catalog));
  if(result.state!=='candidate')throw Error(`wizard_bus_${result.validity==='known'?result.state:result.validity||result.state}`);
  day.places=[];day.kosa_plan={...kosaMetadata(plan,result,context.table),fixed_transport:true};
  day.note=kosaNote(plan,result,context.table,catalog,context.maps);
  day.schedule={...day.schedule,mode:'foot',start:answers.start,end:answers.end,stops:{}};
  return {result,book:kosaRoadbook(plan,result,context.table,catalog,context.maps),answers:clone(plan)};
}
