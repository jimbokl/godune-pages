import {instantiateWasm} from './wasm-loader.mjs?v=1';
const events=['dawn','sunrise','sunset','dusk','nautical_dawn','nautical_dusk','astronomical_dawn','astronomical_dusk'];
let engine;
export function calculateSun(wasm,date,lat,lon) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(lat)||!Number.isFinite(lon))throw Error('invalid_input');
  const [year,month,day]=date.split('-').map(Number);
  return Object.fromEntries(events.map((key,index)=>{
    const minute=wasm.solar_minute(year,month,day,lat,lon,index);
    if(minute===-2)throw Error('invalid_input');
    return [key,minute<0?null:minute];
  }));
}
export function loadSunClock(base) {
  if(!engine)engine=fetch(new URL('assets/sun.wasm?v=1',base)).then(async response=>{
    if(!response.ok)throw Error('Не удалось рассчитать часы солнца.');
    const {instance}=await instantiateWasm(response,{name:'sun'});
    return (date,lat,lon)=>calculateSun(instance.exports,date,lat,lon);
  }).catch(error=>{engine=null;throw error;});
  return engine;
}
