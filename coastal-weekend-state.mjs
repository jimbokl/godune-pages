import {prepareWizardPlan,wizardDefaults} from './planning-wizard-state.mjs?v=2026101208';
import {cleanTrip} from './trip-state.mjs?v=2026101208';
import {chooseTripDay,journeyDays,nextDate,validTripDate} from './trip-days-state.mjs?v=2026101208';
import {validParty} from './trip-party.mjs?v=1';

export const WEEKEND_ID='zelenogradsk-two-days';
const recipes=['wave-zelenogradsk-city-fish','wave-zelenogradsk-west-sea'];
export function weekendTarget(trip,ids=null){
  const days=journeyDays(trip);
  if(ids!==null){
    if(!Array.isArray(ids)||ids.length!==2||new Set(ids).size!==2)return {state:'missing'};
    const pair=ids.map(id=>days.find(day=>day.id===id));
    return pair.every(Boolean)?{state:'ready',days:pair}: {state:'missing'};
  }
  // Recover the saved pair on a clean URL, but never silently replace a broken link.
  for(let i=days.length-2;i>=0;i--)if(days[i].wave?.recipe===recipes[0]&&days[i+1].wave?.recipe===recipes[1])return {state:'ready',days:days.slice(i,i+2)};
  return null;
}
export function weekendSettings(days){
  const day=days[0],start=day.schedule?.start??600;
  return {date:day.date,time:`${String(Math.floor(start/60)).padStart(2,'0')}:${String(start%60).padStart(2,'0')}`,party:structuredClone(day.party||{version:1,adults:1,children:0}),pace:day.wave?.pace||'full'};
}
export function saveWeekend(trip,catalog,{ids=null,date=null,time='10:00',party={version:1,adults:2,children:0},pace='full',fields=[]}={}){
  if(date!==null&&(!validTripDate(date)||!validTripDate(nextDate(date))))throw Error('weekend_invalid_date');
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)||!['calm','full'].includes(pace)||!validParty(party))throw Error('weekend_invalid_settings');
  const start=Number(time.slice(0,2))*60+Number(time.slice(3));
  const target=weekendTarget(trip,ids);
  if(target?.state==='missing')throw Error('weekend_missing');
  if(!target){
    const proposal=prepareWizardPlan(trip,{...wizardDefaults(trip,catalog),area:'whole-trip',starter:WEEKEND_ID,base:null,transport:'foot',date,start,end:Math.min(1440,start+480),party,wave:{version:1,theme:'mixed',pace,recipe:null}},catalog);
    const next=proposal.trip;
    for(const [i,id]of proposal.targetIds.entries()){
      const day=next.itinerary.days.find(d=>d.id===id);
      day.name=i===0?'Зеленоградск · город и рыбный обед':'Зеленоградск · море и западный берег';
      day.source_route=recipes[i];
    }
    return {trip:cleanTrip(next,catalog),ids:proposal.targetIds};
  }
  const next=structuredClone(trip),pair=target.days.map(day=>next.itinerary.days.find(d=>d.id===day.id));
  for(const [index,day]of pair.entries()){
    if(fields.includes('date'))day.date=index?nextDate(date):date;
    if(fields.includes('time')){
      const schedule=day.schedule;
      day.schedule={...schedule,start,end:Math.min(1440,start+(schedule.end-schedule.start))};
    }
    if(fields.includes('party'))day.party=structuredClone(party);
    if(fields.includes('pace')&&day.wave){
      const from=day.wave.pace==='calm'?1.25:1,to=pace==='calm'?1.25:1;
      for(const stop of Object.values(day.schedule.stops))stop.visit=Math.min(1440,Math.max(1,Math.round(stop.visit/from*to/5)*5));
      day.schedule.reserve=pace==='calm'?15:10;day.wave.pace=pace;
    }
  }
  // Project the currently selected record before cleaning. Retain notes, menus,
  // bookings, expenses and hand-edited stops in both days and all other trips.
  const projected=chooseTripDay(next,next.itinerary.active);
  return {trip:cleanTrip(projected,catalog),ids:pair.map(d=>d.id)};
}
export function weekendGuideTrip(trip,catalog,ids){
  const target=weekendTarget(trip,ids);if(target?.state!=='ready')throw Error('weekend_missing');
  const next=structuredClone(trip);next.itinerary.days=structuredClone(target.days);next.itinerary.active=target.days[0].id;
  return cleanTrip(chooseTripDay(next,target.days[0].id),catalog);
}
