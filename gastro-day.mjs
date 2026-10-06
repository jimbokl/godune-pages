// One captured food day, shared by preview, road calculation and trip storage.
import {defaultSchedule} from './trip-schedule-state.mjs?v=15';
import {resolvePair,resolveAccessBetween} from './travel-estimates.mjs?v=8';
import {validRail} from './trip-rail-state.mjs?v=5';
import {baseId} from './personal-points.mjs?v=3';
export function foodTrip(food,settings,places=food.venues.map(v=>v.slug)) {
  const date=settings.date || null, start=Number(settings.time?.slice(0,2) || 12)*60+Number(settings.time?.slice(3) || 0);
  const schedule={...defaultSchedule(),mode:'foot',start,end:Math.min(1440,start+Number(settings.max_minutes)),reserve:10};
  if(validRail(settings.rail))schedule.rail=structuredClone(settings.rail);
  for(const id of places) {
    const venue=food.venues.find(v=>v.slug===id);
    schedule.stops[id]={visit:venue?.visit ?? 30,pause:0,leg:null,window:null};
  }
  const trip={version:1,places:[...places],routes:[],filters:{area:'all',minutes:'all'},date,month:date?Number(date.slice(5,7)):null,schedule};
  if(settings.anchors?.start_at || settings.anchors?.night_at)trip.itinerary={version:1,active:'day-1',people:1,days:[{
    id:'day-1',date,places:[...places],schedule:structuredClone(schedule),start_at:settings.anchors.start_at || null,
    night_at:settings.anchors.night_at || null,note:'',costs:{}
  }]};
  return trip;
}
export function anchorRequest(food,settings,catalog,matrix) {
  const trip=foodTrip(food,settings),out={};
  for(const [field,key] of [['start_at','origin'],['night_at','destination']]) {
    const id=baseId(settings.anchors?.[field]);if(!id)continue;
    out[key]={legs:[]};
    for(const v of food.venues) {
      const from=key==='origin'?id:v.slug,to=key==='origin'?v.slug:id;
      const leg=resolvePair(trip,from,to,catalog,matrix);
      const distance=leg.origin==='same_place'?0:leg.distance_m;
      const meters=Number.isFinite(distance)&&distance>=0?Math.ceil(distance):null;
      if(!Number.isInteger(leg.minutes)||leg.minutes<0||leg.minutes>720||!Number.isInteger(meters)||meters<0)continue;
      const access=resolveAccessBetween(trip,id,key==='origin'?null:v.slug,key==='origin'?v.slug:null,catalog,matrix);
      out[key].legs.push({venue:v.slug,minutes:leg.minutes,meters,needs_check:leg.origin==='estimate',
        ...(access?{access:{approach:key==='origin'?0:access.approach.minutes,return_minutes:key==='origin'?access.back.minutes:0,needs_check:true}}:{})});
    }
  }
  return out;
}
