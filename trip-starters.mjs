import {defaultSchedule} from './trip-schedule-state.mjs?v=18';
import {hasPreferences} from './day-preferences.mjs?v=7';
import {nextDate,mergeJourney,tripHasPlaces,journeyDays,selectedDay} from './trip-days-state.mjs?v=26';
import {waveChoices,waveStopSettings} from './day-wave.mjs?v=2';
// Editorial starting points, not promised bookings or verified tours.
const river={places:['ostrov-kanta','rybnaya-derevnya','muzej-mirovogo-okeana'],mode:'foot',start_at:null,night_at:null};
const villas={places:['villa-leo','villa-shmidt','kirha-korolevy-luizy','pergola-korolevy-luizy'],mode:'foot',start_at:null,night_at:null};
const resort={places:['kurortnyy-prospekt','kurhaus-kranc','byuvet-luizy','promenad-zelenogradsk'],mode:'foot',start_at:null,night_at:null};
const dunes={places:['tancuyushchiy-les','vysota-efa','smotrovaya-efa'],mode:'car',start_at:'promenad-zelenogradsk',night_at:'promenad-zelenogradsk'};
const forest={places:['korolevskiy-bor','plyazh-lesnoy'],mode:'car',start_at:'promenad-zelenogradsk',night_at:'promenad-zelenogradsk'};
const food={places:['kofeynya-slou','restoran-telegraf','restoran-oblaka'],mode:'foot',start_at:null,night_at:null};
const gates={places:['korolevskie-vorota','zakhaymskie-vorota','rybnaya-derevnya'],mode:'foot',start_at:null,night_at:null};
export const TRIP_STARTERS=[
 {id:'three',name:'3 дня',description:'Река, морской город и дюны',days:[river,resort,dunes]},
 {id:'five',name:'5 дней',description:'Виллы, берег и два дня на косе',days:[river,villas,resort,dunes,forest]},
 {id:'seven',name:'7 дней',description:'От городских прогулок до моря и вкусов',days:[river,villas,resort,dunes,forest,food,gates]},
];
export function tripStarterChoices(catalog) {
 const known=new Set((catalog?.poi || []).map(point=>point.slug));
 const existing=TRIP_STARTERS.filter(starter=>starter.days.every(day=>
  [...day.places,day.start_at,day.night_at].every(id=>id===null || known.has(id))));
 const recipes=new Map(waveChoices(catalog,(catalog.routes || []).filter(row=>row.mode==='walking'))
  .map(row=>[row.slug,{...row,theme:row.wave_theme}]));
 const ids=new Set(existing.map(row=>row.id));
 const editorial=(catalog?.day_waves?.version===1?catalog.day_waves.itineraries || []:[]).flatMap(row=>{
  if(!row || typeof row.id!=='string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.id) || ids.has(row.id)
    || typeof row.name!=='string' || !row.name || !Array.isArray(row.days) || !row.days.length
    || row.days.some(day=>!recipes.has(day?.recipe)
      || day.transport!==undefined && !['foot','car','bus','rail'].includes(day.transport)
      || day.transport_origin!==undefined && (day.transport!=='bus' || !['kaliningrad','zelenogradsk'].includes(day.transport_origin))))return [];
  ids.add(row.id);
  return [{...row,days:row.days.map(day=>{const recipe=recipes.get(day.recipe);return {
   places:recipe.stops.map(stop=>stop.poi),mode:day.transport==='car'?'car':'foot',start_at:null,night_at:recipe.return_to || null,recipe,
   ...(day.transport?{transport:day.transport}:{}),...(day.transport_origin?{transport_origin:day.transport_origin}:{})
  };})}];
 });
 return [...existing,...editorial];
}
export function addTripStarter(trip,id,catalog) {
 const starter=tripStarterChoices(catalog).find(row=>row.id===id);if(!starter)return trip;
 // A dated transport day needs the wizard's real timetable and confirmed preview.
 if(starter.days.some(day=>['bus','rail'].includes(day.transport)))return trip;
 const known=new Set(catalog.poi.map(p=>p.slug));
 if(starter.days.some(day=>[...day.places,day.start_at,day.night_at].some(place=>place && !known.has(place))))return trip;
 let date=trip.date;const {party,preferences}=selectedDay(trip);
 const days=starter.days.map((day,index)=>{
  const current=date;date=nextDate(date);
  return {id:`day-${index+1}`,date:current,places:[...day.places],schedule:{...defaultSchedule(),mode:day.mode,
   ...(day.recipe?{stops:waveStopSettings(day.recipe,catalog)}:{})},start_at:day.start_at,night_at:day.night_at,
   ...(day.recipe?{wave:{version:1,theme:day.recipe.theme,pace:'full',recipe:day.recipe.slug}}:{}),
   ...(party?{party:structuredClone(party)}:{}),...(preferences?{preferences:structuredClone(preferences)}:{}),note:day.recipe?.access_note || '',costs:{}};
 });
 const incoming={...trip,places:[...days[0].places],date:days[0].date,schedule:structuredClone(days[0].schedule),itinerary:{version:1,active:'day-1',people:trip.itinerary?.people || 1,days}};
 // A blank first screen is a placeholder; a populated draft is preserved.
 const hasDraft=tripHasPlaces(trip) || journeyDays(trip).some(day=>day.start_at || day.night_at || day.note || day.party || hasPreferences(day.preferences) || Object.keys(day.costs).length);
 return hasDraft?mergeJourney(trip,incoming,{...trip}):incoming;
}
