import {loadTripTravelMatrix,travelMode} from './travel-estimates.mjs?v=2026101305';
import {baseTransport} from './day-mobility.mjs?v=2026101305';
import {personalPoints} from './personal-points.mjs?v=2026101305';

// The ordinary foot/car timeline needs the same directed estimates and access
// evidence, but does not consume bicycle surface samples. Other consumers keep
// the full matrix; bicycle and personal-coordinate days use that API directly.
const matrices=new Map();
export async function loadTripTimingMatrix(base,trip,catalog) {
  if(travelMode(trip)==='bike' || baseTransport(trip)?.mode==='bike' || personalPoints(trip).length)
    return loadTripTravelMatrix(base,trip,catalog);
  const url=new URL('data/travel-matrix-timing.json',base).href;
  if(!matrices.has(url))matrices.set(url,fetch(url,{cache:'no-cache'}).then(async response=>{
    if(!response.ok)throw new Error('Timing matrix unavailable');
    const matrix=await response.json();
    if(matrix.version!==1 || matrix.timing_only!==true || !Array.isArray(matrix.points) || !matrix.legs || !matrix.source?.id)
      throw new Error('Invalid timing matrix');
    return matrix;
  }).catch(error=>{matrices.delete(url);throw error;}));
  try{return await matrices.get(url);}
  catch{return loadTripTravelMatrix(base,trip,catalog);}
}
