// Personal locations belong to the trip, never to the public POI catalogue.
export const isPersonalPoint=value=>!!value && typeof value==='object' && !Array.isArray(value) && value.kind==='personal'
  && Object.keys(value).every(key=>['kind','name','lon','lat'].includes(key)) && typeof value.name==='string' && value.name.trim().length>0
  && Number.isFinite(value.lon) && Math.abs(value.lon)<=180 && Number.isFinite(value.lat) && Math.abs(value.lat)<=90;
export const validBase=value=>value===null || typeof value==='string' || isPersonalPoint(value);
export const baseId=value=>isPersonalPoint(value)?`@${value.lon},${value.lat}`:value;
export const baseName=(value,catalog)=>isPersonalPoint(value)?value.name:catalog?.poi?.find(p=>p.slug===value)?.name || 'Точка поездки';
export const personalPoints=trip=>[...new Map((trip.itinerary?.days || []).flatMap(day=>[day.start_at,day.night_at]).filter(isPersonalPoint).map(point=>[baseId(point),{...point,slug:baseId(point)}])).values()];
