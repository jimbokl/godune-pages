import {journeyDays,selectedDay} from './trip-days-state.mjs?v=2026101205';
// The private day is hashed locally only to match a later PDF to the exact
// saved snapshot. Neither that content nor the hash is sent to a server.
export async function tripJournalBindings(trip,{scope='trip',environment=globalThis}={}) {
  if(!environment.crypto?.subtle)return [];
  const stable=value=>JSON.stringify(value,(_,row)=>row&&typeof row==='object'&&!Array.isArray(row)?Object.fromEntries(Object.keys(row).sort().map(key=>[key,row[key]])):row);
  try{const days=scope==='day'?[selectedDay(trip)]:journeyDays(trip);return await Promise.all(days.map(async day=>Array.from(new Uint8Array(await environment.crypto.subtle.digest('SHA-256',new TextEncoder().encode(stable(day))))).map(byte=>byte.toString(16).padStart(2,'0')).join('')));}catch{return [];}
}

export function scheduleJournalCriteria(schedule,assessment) {
  const finishKnown=Number.isFinite(schedule?.finish)&&schedule?.unknown_legs===0;
  const end=schedule?.stops?.at(-1);
  const returnIncluded=!!schedule&&(schedule.rail?.state==='fits'||['__day_night','__day_departure'].includes(end?.id));
  return {calculated:assessment?.calculated===true,conflicts_shown:true,return_accounted:finishKnown&&returnIncluded};
}

export function kosaJournalCriteria(roadbook,assessment) {
  return {calculated:assessment?.calculated===true,conflicts_shown:true,return_accounted:Number.isFinite(roadbook?.finish)&&assessment?.calculated===true};
}
