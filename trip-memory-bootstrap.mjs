import {TRIP_KEY,emptyTrip,cleanTrip} from './trip-state.mjs?v=28';

// The catalog and planner enter the same saved draft, including older route lists.
export function loadTrip(storage,catalog){
 try{
  const raw=storage.getItem(TRIP_KEY);
  if(raw!==null){
   try{const rawState=JSON.parse(raw);return {state:cleanTrip(rawState,catalog),rawState,rawText:raw,available:true};}
   catch{return {state:emptyTrip(),rawText:raw,available:true};}
  }
  let routes=[];
  try{routes=JSON.parse(storage.getItem('godune-routes')||'[]');}catch{}
  return {state:cleanTrip({...emptyTrip(),routes},catalog),available:true};
 }catch{return {state:emptyTrip(),available:false};}
}
