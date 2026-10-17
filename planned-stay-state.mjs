import {prepareWizardPlan,wizardDefaults} from './planning-wizard-state.mjs?v=2026101706';
import {cleanTrip} from './trip-state.mjs?v=2026101706';
import {chooseTripDay,journeyDays,nextDate,validTripDate} from './trip-days-state.mjs?v=2026101706';
import {validParty} from './trip-party.mjs?v=2026101305';

export function stayProfile(catalog,id){
  const row=catalog.day_waves.itineraries.find(row=>row.id===id);
  if(!row?.days?.length)throw Error('stay_unknown');
  const recipes=row.days.map(day=>day.recipe);
  if(recipes.some(id=>!catalog.day_waves.recipes.some(recipe=>recipe.slug===id)))throw Error('stay_unknown');
  return {id,recipes,names:row.day_names||recipes.map(id=>catalog.day_waves.recipes.find(recipe=>recipe.slug===id).name)};
}
export function stayTarget(trip,profile,ids=null){
  const days=journeyDays(trip),count=profile.recipes.length;
  if(ids!==null){
    if(!Array.isArray(ids)||ids.length!==count||new Set(ids).size!==count)return {state:'missing'};
    const selected=ids.map(id=>days.find(day=>day.id===id));
    return selected.every(Boolean)?{state:'ready',days:selected}:{state:'missing'};
  }
  // Only a clean URL may recover a saved itinerary. Broken exact links stay broken.
  for(let i=days.length-count;i>=0;i--){
    if(profile.recipes.every((recipe,j)=>days[i+j].wave?.recipe===recipe))return {state:'ready',days:days.slice(i,i+count)};
  }
  return null;
}
export function staySettings(days){
  const day=days[0],start=day.schedule?.start??600;
  return {date:day.date,time:`${String(Math.floor(start/60)).padStart(2,'0')}:${String(start%60).padStart(2,'0')}`,party:structuredClone(day.party||{version:1,adults:1,children:0}),pace:day.wave?.pace||'full'};
}
export function saveStay(trip,catalog,profile,{ids=null,date=null,time='10:00',party={version:1,adults:2,children:0},pace='full',fields=[]}={}){
  const dates=[];let currentDate=date;
  for(const _ of profile.recipes){
    if(date!==null&&!validTripDate(currentDate))throw Error('weekend_invalid_date');
    dates.push(currentDate);currentDate=nextDate(currentDate);
  }
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)||!['calm','full'].includes(pace)||!validParty(party))throw Error('weekend_invalid_settings');
  const start=Number(time.slice(0,2))*60+Number(time.slice(3));
  const target=stayTarget(trip,profile,ids);
  if(target?.state==='missing')throw Error('weekend_missing');
  if(!target){
    const proposal=prepareWizardPlan(trip,{...wizardDefaults(trip,catalog),area:'whole-trip',starter:profile.id,base:null,transport:'foot',date,start,end:Math.min(1440,start+480),party,wave:{version:1,theme:'mixed',pace,recipe:null}},catalog);
    for(const [i,id]of proposal.targetIds.entries()){
      const day=proposal.trip.itinerary.days.find(day=>day.id===id);
      day.name=profile.names[i];day.source_route=profile.recipes[i];
    }
    return {trip:cleanTrip(proposal.trip,catalog),ids:proposal.targetIds};
  }
  const next=structuredClone(trip),selected=target.days.map(day=>next.itinerary.days.find(row=>row.id===day.id));
  for(const [index,day]of selected.entries()){
    if(fields.includes('date'))day.date=dates[index];
    if(fields.includes('time'))day.schedule={...day.schedule,start,end:Math.min(1440,start+(day.schedule.end-day.schedule.start))};
    if(fields.includes('party'))day.party=structuredClone(party);
    if(fields.includes('pace')&&day.wave){
      const from=day.wave.pace==='calm'?1.25:1,to=pace==='calm'?1.25:1;
      for(const stop of Object.values(day.schedule.stops))stop.visit=Math.min(1440,Math.max(1,Math.round(stop.visit/from*to/5)*5));
      day.schedule.reserve=pace==='calm'?15:10;day.wave.pace=pace;
    }
  }
  return {trip:cleanTrip(chooseTripDay(next,next.itinerary.active),catalog),ids:selected.map(day=>day.id)};
}
export function stayGuideTrip(trip,catalog,profile,ids){
  const target=stayTarget(trip,profile,ids);if(target?.state!=='ready')throw Error('weekend_missing');
  const next=structuredClone(trip);next.itinerary.days=structuredClone(target.days);next.itinerary.active=target.days[0].id;
  return cleanTrip(chooseTripDay(next,target.days[0].id),catalog);
}
