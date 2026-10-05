// An explicit observation, separate from planned start and venue timestamps.
const object=v=>v && typeof v==='object' && !Array.isArray(v);
const date=v=>typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !v.startsWith('0000') && Number.isFinite(Date.parse(v+'T12:00:00Z')) && new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
export function validProgress(v) {
  return object(v) && [4,5].includes(Object.keys(v).length) && Object.keys(v).every(k=>['date','at','after','completed','return_from'].includes(k)) && (v.return_from===undefined || typeof v.return_from==='string' && !!v.return_from) && date(v.date) && Number.isInteger(v.at) && v.at>=0 && v.at<1440
    && typeof v.after==='string' && !!v.after && Array.isArray(v.completed) && v.completed.includes(v.after)
    && v.completed.every(id=>typeof id==='string' && !!id) && new Set(v.completed).size===v.completed.length;
}
export const visitedPlaces=trip=>trip.itinerary?.days.find(d=>d.id===trip.itinerary.active)?.visited || [];
export function currentProgress(trip) {
  const progress=trip.schedule?.progress;if(!progress)return null;
  if(!validProgress(progress) || progress.date!==trip.date)throw Error('progress_date');
  const visited=visitedPlaces(trip);
  if(progress.completed.some(id=>!trip.places.includes(id)) || visited.length!==progress.completed.length || visited.some(id=>!progress.completed.includes(id)))throw Error('progress_changed');
  return progress;
}
// Retain the original day/history. Only the scheduler's directed-road view is projected.
export function remainingTrip(trip) {
  const progress=currentProgress(trip);if(!progress)return trip;
  return {...trip,places:[progress.after,...trip.places.filter(id=>!progress.completed.includes(id))]};
}
