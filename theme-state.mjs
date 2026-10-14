import {placePath} from './place-path.mjs?v=2026101406';
// Civil time and preferences are separate from the trip and its selected date.
export const THEME_KEY='godune-theme:v1', LIGHT_KEY='godune-light:v1';
export const validMode=value=>['day','night','auto'].includes(value)?value:'auto';
export const balticTime=(now=new Date())=>{
  const civil=new Date(now.getTime()+7200000);
  return {date:civil.toISOString().slice(0,10),minute:civil.getUTCHours()*60+civil.getUTCMinutes()};
};
export const validSun=sun=>sun && ['dawn','sunrise','sunset','dusk'].every(key=>Number.isInteger(sun[key])&&sun[key]>=0&&sun[key]<=1440)
  && sun.dawn<=sun.sunrise && sun.sunrise<sun.sunset && sun.sunset<=sun.dusk;
export function lightPhase(sun,minute) {
  if(!validSun(sun))return null;
  if(minute>=sun.sunrise && minute<sun.sunset)return 'day';
  if(minute>=sun.dawn && minute<sun.dusk)return 'twilight';
  return 'night';
}
export function themeAppearance(mode,sun,minute,systemNight=false) {
  mode=validMode(mode);
  return mode==='auto'?(lightPhase(sun,minute) || (systemNight?'night':'day')):mode;
}
export const lightClock=value=>Number.isInteger(value)?`${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`:'—';
export function lightLocation(catalog,path,trip) {
  const fallback={label:'Калининград',lat:54.7104,lon:20.4522};
  if(!catalog?.poi)return fallback;
  const poi=catalog.poi.find(p=>{
    const canonical=placePath(catalog,p.slug);
    if(canonical&&path.includes(`/${canonical}`))return true;
    // The lightweight solar feed intentionally omits geography. On a POI
    // page, match its stable slug at the end of the current site path; this
    // reads the page's existing canonical URL and does not infer an area.
    const segments=String(path).split('/').filter(Boolean);
    return !canonical&&typeof p.slug==='string'&&segments.length===2&&segments[1]===p.slug;
  });
  const route=catalog.routes?.find(r=>path.includes(`/routes/${r.slug}/`));
  const point=poi || catalog.poi.find(p=>p.slug===route?.stops?.[0]?.poi)
    || (/\/(planner|travel|map)\//.test(path)?catalog.poi.find(p=>p.slug===trip?.places?.[0]):null);
  return point && Number.isFinite(point.lat)&&Number.isFinite(point.lon)?{label:point.name,lat:point.lat,lon:point.lon}:fallback;
}
