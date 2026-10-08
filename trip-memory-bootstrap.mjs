import {TRIP_KEY,emptyTrip,cleanTrip} from './trip-state.mjs?v=27';

// The catalog and planner enter the same saved draft, including older route lists.
export function loadTrip(storage,catalog){
 try{
  const raw=storage.getItem(TRIP_KEY);
  if(raw!==null){
   try{return {state:cleanTrip(JSON.parse(raw),catalog),available:true};}
   catch{return {state:emptyTrip(),available:true};}
  }
  let routes=[];
  try{routes=JSON.parse(storage.getItem('godune-routes')||'[]');}catch{}
  return {state:cleanTrip({...emptyTrip(),routes},catalog),available:true};
 }catch{return {state:emptyTrip(),available:false};}
}
