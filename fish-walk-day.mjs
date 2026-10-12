import {saveTourDay} from './gastronomy.mjs?v=2026101208';
import {selectedDay,chooseTripDay,validTripDate,validJourneyProjection} from './trip-days-state.mjs?v=2026101208';
import {resolveTripDayLink} from './trip-day-link.mjs?v=1';

export function fishWalkTarget(trip,tour,id=null){
 if(id!==null)return resolveTripDayLink(trip,id);
 const day=selectedDay(trip);
 return JSON.stringify(day.places)===JSON.stringify(tour.places)?{state:'ready',day}:null;
}
export function fishWalkSettings(day){
 const start=day?.schedule?.start??720;
 return {date:day?.date??null,time:`${String(Math.floor(start/60)).padStart(2,'0')}:${String(start%60).padStart(2,'0')}`};
}
// Update only the fields exposed here; keep all edits made in My Day intact.
export function saveFishWalkDay(trip,tour,food,{id=null,date=null,time='12:00',edit=false}={}){
 if(date!==null&&!validTripDate(date))throw Error('invalid_date');
 if(typeof time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('invalid_time');
 const target=fishWalkTarget(trip,tour,id);
 if(target&&target.state!=='ready')throw Error('linked_day_missing');
 if(!target)return saveTourDay(trip,tour,food,{name:'Зеленоградск на рыбной волне',theme:'fish',date,time,max_minutes:Math.max(180,tour.total_minutes||0)});
 const next=chooseTripDay(trip,target.day.id);
 if(!edit)return next;
 const day=selectedDay(next),before=day.schedule||{start:720,end:900,reserve:10,stops:{}};
 const start=Number(time.slice(0,2))*60+Number(time.slice(3));
 const schedule={...structuredClone(before),start,end:Math.min(1440,start+before.end-before.start)};
 Object.assign(day,{date,schedule});
 Object.assign(next,{date,month:date?Number(date.slice(5,7)):null,schedule:structuredClone(schedule)});
 if(!validJourneyProjection(next))throw Error('invalid_fish_day');
 return next;
}
