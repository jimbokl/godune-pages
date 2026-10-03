import {loadScheduler} from './trip-scheduler.mjs?v=12';
import {THEME_KEY,LIGHT_KEY,validMode,balticTime,themeAppearance,lightClock,lightLocation,validSun} from './theme-state.mjs?v=1';
const root=document.documentElement,base=new URL('.',import.meta.url),control=document.querySelector('[data-theme-control]');
const system=matchMedia('(prefers-color-scheme: dark)');
let mode=validMode(root.dataset.themeMode),sun,location={label:'Калининград',lat:54.7104,lon:20.4522},date='',catalog,engine,revision=0;
const read=key=>{try{return localStorage.getItem(key);}catch{return null;}};
const trip=()=>{try{return JSON.parse(read('godune-trip:v1'));}catch{return null;}};
const remember=(key,value)=>{try{localStorage.setItem(key,value);return true;}catch{return false;}};
try {
  const cached=JSON.parse(read(LIGHT_KEY));
  if(cached?.date===balticTime().date && validSun(cached.sun)){
    date=cached.date;sun=cached.sun;
    if(typeof cached.location?.label==='string' && Number.isFinite(cached.location?.lat)&&Number.isFinite(cached.location?.lon))location=cached.location;
  }
}catch{/* A damaged record is replaced by the next Rust calculation. */}
function render() {
  const now=balticTime(),phase=themeAppearance(mode,date===now.date?sun:null,now.minute,system.matches),theme=phase==='day'?'day':'night';
  const changed=root.dataset.theme!==theme;
  root.dataset.theme=theme;root.dataset.lightPhase=phase;root.dataset.themeMode=mode;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content',theme==='night'?'#0c1c2b':'#bfd9e7');
  control?.querySelectorAll('[data-theme-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.themeMode===mode)));
  if(control){
    const name=mode==='auto'?'По солнцу':mode==='night'?'Ночь':'День';
    control.querySelector('[data-theme-name]').textContent=name;
    control.querySelector('summary').setAttribute('aria-label',`Свет на сайте: ${name}. Выбрать режим`);
    control.querySelector('[data-theme-place]').textContent=`Сегодня · ${location.label}`;
    const ready=date===now.date && validSun(sun);
    control.querySelector('[data-theme-times]').hidden=!ready;
    for(const key of ['sunset','dusk','astronomical_dusk'])control.querySelector(`[data-theme-event=${key}]`).textContent=lightClock(ready?sun[key]:null);
    control.querySelector('[data-theme-note]').textContent=ready?'Часы солнца по открытому горизонту. Облака, фонари и доступ на тропы проверяйте отдельно.':
      'Часы солнца пока недоступны. В режиме «Авто» используем светлую или тёмную тему вашего устройства.';
    control.querySelector('[data-theme-astronomy-note]').hidden=!ready || Number.isInteger(sun.astronomical_dusk);
  }
  if(changed)window.dispatchEvent(new CustomEvent('godune:theme-change',{detail:{theme,phase,mode}}));
  root.dataset.themeReady='true';
}
async function refresh() {
  const ticket=++revision,now=balticTime();
  try {
    if(!catalog) {const response=await fetch(new URL('data/catalog.json',base));if(!response.ok)throw Error('catalog');catalog=await response.json();}
    const next=lightLocation(catalog,locationPath(),trip());
    if(date===now.date && next.lat===location.lat && next.lon===location.lon && sun){render();return;}
    engine=engine || await loadScheduler(base);
    const result=engine.light({version:1,date:now.date,stops:[{id:'site-light',lat:next.lat,lon:next.lon,begins:null,leaves:null,outdoor:true}]});
    if(ticket!==revision)return;
    location=next;date=now.date;sun=result.stops[0]?.sun;
    if(validSun(sun))remember(LIGHT_KEY,JSON.stringify({date,location,sun}));
  }catch{if(ticket!==revision)return;sun=null;date='';}
  render();
}
function locationPath(){return window.location.pathname;}
control?.querySelectorAll('[data-theme-mode]').forEach(button=>button.addEventListener('click',()=>{
  mode=validMode(button.dataset.themeMode);
  const saved=remember(THEME_KEY,mode);render();
  control.querySelector('[data-theme-storage]').hidden=saved;
}));
document.addEventListener('pointerdown',event=>{if(control?.open&&!control.contains(event.target))control.open=false;});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&control?.open){control.open=false;control.querySelector('summary').focus();event.stopPropagation();}});
window.addEventListener('storage',event=>{if(event.key===THEME_KEY || event.key===null){mode=validMode(read(THEME_KEY));render();}if(event.key==='godune-trip:v1')refresh();});
window.addEventListener('godune:trip-change',refresh);
window.addEventListener('godune:memory-cleared',()=>{mode='auto';sun=null;date='';render();refresh();});
system.addEventListener('change',render);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
setInterval(()=>{if(!document.hidden)refresh();},60000);
render();refresh();
