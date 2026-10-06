import {railHomeLocations} from './rail-access.mjs?v=2';
import {kosaClock} from './kosa-plan-state.mjs?v=24';
import {retainStationRoad,forgetStationRoad} from './station-road-proof.mjs?v=1';
const stable=v=>JSON.stringify(v,(_,row)=>row&&typeof row==='object'&&!Array.isArray(row)?Object.fromEntries(Object.keys(row).sort().map(key=>[key,row[key]])):row);

export function editedKosaHome(fields,binding,locations,home) {
  const station=fields.city==='kaliningrad'?fields.station:null;
  const sameTransport=binding.city===fields.city&&binding.station===station;
  const approach=!locations.start_at?0:sameTransport&&stable(locations.start_at)===stable(binding.start_at)?home.approach:null;
  const back=!locations.return_at?0:sameTransport&&stable(locations.return_at)===stable(binding.return_at)?home.return_minutes:null;
  const road=sameTransport?retainStationRoad(binding.road,approach,back):null;
  return {...fields,origin:locations.start_at?'home':'station',home:{ready_at:fields.ready,end_by:home.end_by,approach,return_minutes:back},
    home_access:{version:1,city:fields.city,station,...structuredClone(locations),...(road?{road}:{})},
    ...(fields.city==='kaliningrad'?{to_station:approach,from_station:back}:{})};
}

export function initKosaHomeEditor({form,trip,saved,getTrip}) {
  if(!saved?.home_access||!saved.home)return {read:fields=>fields,active:false};
  const home=editedKosaHome({...saved,ready:trip.schedule?.start??saved.ready},saved.home_access,railHomeLocations(trip),{...saved.home,end_by:trip.schedule?.end??saved.home.end_by}).home;
  const binding={...structuredClone(saved.home_access),...railHomeLocations(trip)};
  const panel=document.createElement('fieldset');panel.className='kosa-home-fields';panel.dataset.kosaHomeEditor='true';
  const legend=document.createElement('legend');legend.textContent='От жилья и обратно';panel.append(legend);
  const fields={};
  for(const [name,caption,value,type]of [['approach','До первой посадки, мин',home.approach,'number'],['return_minutes','После возвращения до жилья, мин',home.return_minutes,'number'],['end_by','Вернуться не позже',kosaClock(Math.min(home.end_by,1439)),'time']]){
    const label=document.createElement('label'),input=document.createElement('input');label.textContent=caption;input.type=type;input.dataset.kosaHomeField=name;input.value=value??'';input.required=name==='end_by';
    if(type==='number'){input.min='0';input.max='1440';input.step='1';input.inputMode='numeric';input.placeholder='Пока не знаю';}
    input.addEventListener('input',()=>{if(name!=='end_by')forgetStationRoad(binding,name==='approach'?'to':'back');home[name]=input.value===''?null:type==='time'?Number(input.value.slice(0,2))*60+Number(input.value.slice(3)):Number(input.value);});label.append(input);panel.append(label);fields[name]=input;
  }
  const note=document.createElement('p');note.textContent='Рейсы и дорога до жилья считаются вместе. Пустое поле означает, что время дороги ещё неизвестно.';panel.append(note);
  form.querySelector('[type=submit]').before(panel);
  form.elements.ready.value=kosaClock(trip.schedule?.start??saved.ready);
  form.addEventListener('change',event=>{
    if(!['city','station'].includes(event.target.name))return;
    delete binding.road;binding.city=form.elements.city.value;binding.station=binding.city==='kaliningrad'?form.elements.station.value:null;
    for(const key of ['approach','return_minutes']){home[key]=null;fields[key].value='';}
  });
  return {active:true,read:fields=>editedKosaHome(fields,binding,railHomeLocations(getTrip()),home)};
}
