import {defaultSchedule} from './trip-schedule-state.mjs?v=6';
import {nextDate,mergeJourney,tripHasPlaces,journeyDays} from './trip-days-state.mjs?v=6';
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
export function addTripStarter(trip,id,catalog) {
 const starter=TRIP_STARTERS.find(row=>row.id===id);if(!starter)return trip;
 const known=new Set(catalog.poi.map(p=>p.slug));
 if(starter.days.some(day=>[...day.places,day.start_at,day.night_at].some(place=>place && !known.has(place))))return trip;
 let date=trip.date;
 const days=starter.days.map((day,index)=>{
  const current=date;date=nextDate(date);
  return {id:`day-${index+1}`,date:current,places:[...day.places],schedule:{...defaultSchedule(),mode:day.mode},start_at:day.start_at,night_at:day.night_at,note:'',costs:{}};
 });
 const incoming={...trip,places:[...days[0].places],date:days[0].date,schedule:structuredClone(days[0].schedule),itinerary:{version:1,active:'day-1',people:trip.itinerary?.people || 1,days}};
 // A blank first screen is a placeholder; a populated draft is preserved.
 const hasDraft=tripHasPlaces(trip) || journeyDays(trip).some(day=>day.start_at || day.night_at || day.note || Object.keys(day.costs).length);
 return hasDraft?mergeJourney(trip,incoming,{...trip}):incoming;
}
