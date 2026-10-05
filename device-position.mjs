// Shared device geometry. Coordinates are transient, never trip records.
export const EARTH_METERS=6371008.8;
const rad=Math.PI/180;
export function readPosition(position) {
  const {longitude:lon,latitude:lat,accuracy}=position?.coords || {};
  const timestamp=position?.timestamp;
  if(![lon,lat,accuracy,timestamp].every(Number.isFinite) || Math.abs(lon)>180 || Math.abs(lat)>90 || accuracy<0 || timestamp<=0)return null;
  return {lon,lat,accuracy,timestamp};
}
export function validCoordinates(point) {
  return Number.isFinite(point?.lat) && Number.isFinite(point?.lon) && Math.abs(point.lat)<=90 && Math.abs(point.lon)<=180;
}
export function distanceMeters(a,b) {
  if(!validCoordinates(a) || !validCoordinates(b))return null;
  const phi=(b.lat-a.lat)*rad,lambda=(b.lon-a.lon)*rad;
  const h=Math.sin(phi/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(lambda/2)**2;
  return 2*EARTH_METERS*Math.asin(Math.sqrt(Math.min(1,Math.max(0,h))));
}
