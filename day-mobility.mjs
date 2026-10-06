// A vehicle approach and a walking visit are separate parts of the same day.
// `via` remembers where the vehicle was left, including after a stop is removed
// or the remaining day is projected from an observed checkpoint.
export function validBaseTransport(value) {
  return value && typeof value==='object' && !Array.isArray(value)
    && Object.keys(value).every(key=>['version','mode','via'].includes(key))
    && value.version===1 && ['car','bike'].includes(value.mode)
    && typeof value.via==='string' && /^[a-z0-9][a-z0-9-]{0,127}$/.test(value.via);
}
export const baseTransport=trip=>(trip.schedule?.mode || 'foot')==='foot' && validBaseTransport(trip.schedule?.base_transport)?trip.schedule.base_transport:null;
export const baseTravelMode=trip=>baseTransport(trip)?.mode || trip.schedule?.mode || 'foot';

// Declarative, directed legs are shared by time, geometry and expenses.
// Access legs have their own measured geometry between a POI and its parking.
export function mobilitySegments(trip,from,to,bases) {
  const mode=trip.schedule?.mode || 'foot',vehicle=baseTransport(trip);
  const road=(from,to,mode)=>({kind:'travel',from,to,mode});
  if(!vehicle)return [road(from,to,mode)];
  if(from===bases.start_at && to===trip.places[0])return to===vehicle.via?[road(from,to,vehicle.mode)]
    :[road(from,vehicle.via,vehicle.mode),{kind:'approach',from:vehicle.via,to:vehicle.via,mode:vehicle.mode},road(vehicle.via,to,'foot')];
  const returning=from===trip.places.at(-1) && (to===bases.night_at || !bases.night_at && to===bases.end_at);
  if(returning && to!==vehicle.via) {
    return [road(from,vehicle.via,'foot'),{kind:'return',from:vehicle.via,to:vehicle.via,mode:vehicle.mode},road(vehicle.via,to,vehicle.mode)];
  }
  if(from===bases.night_at && to===bases.end_at)return [road(from,to,vehicle.mode)];
  return [road(from,to,mode)];
}

// Hand-entered travel time belongs to the same place where the vehicle was left.
export function travelVia(trip,from,to,bases) {
  const vehicle=baseTransport(trip),parts=mobilitySegments(trip,from,to,bases);
  return vehicle && (parts.length>1 || parts[0].mode===vehicle.mode)?vehicle.via:null;
}

export function accessModes(trip,id,previous,next,bases) {
  const mode=trip.schedule?.mode || 'foot',vehicle=baseTransport(trip);
  if(!vehicle)return {approach:mode,return:mode};
  return {
    approach:id===bases.night_at && id!==vehicle.via || id===bases.end_at ? vehicle.mode
      :id===trip.places[0] && id===vehicle.via && previous===bases.start_at && previous!==id ? vehicle.mode:'foot',
    return:id===bases.start_at && next && next!==id || id===bases.night_at && next===bases.end_at ? vehicle.mode:'foot'
  };
}

export function mobilityLabel(trip) {
  if(trip.schedule?.rail?.access?.version===1)return 'Электричка и пешая прогулка';
  const mode=trip.schedule?.mode || 'foot';
  return baseTransport(trip)?baseTransport(trip).mode==='car'?'До прогулки на машине, дальше пешком':'До прогулки на велосипеде, дальше пешком'
    :mode==='car'?'На машине':mode==='bike'?'На велосипеде':'Пешком';
}
