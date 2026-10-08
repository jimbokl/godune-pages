import {regionMapStyle} from './region-map.mjs';
import {bindMapTheme} from './map-theme.mjs';

let library;
async function loadLibrary(base) {
  if(window.maplibregl)return;
  if(!library)library=new Promise((resolve,reject)=>{
    const href=new URL('assets/vendor/maplibre/maplibre-gl.css',base).href;
    if(![...document.querySelectorAll('link[rel=stylesheet]')].some(e=>e.href===href)){
      const css=document.createElement('link');css.rel='stylesheet';css.href=href;document.head.append(css);
    }
    const script=document.createElement('script');script.src=new URL('assets/vendor/maplibre/maplibre-gl.js',base);
    const timer=setTimeout(()=>{script.remove();library=null;reject(Error('map library timeout'));},20000);
    script.onload=()=>{clearTimeout(timer);resolve();};script.onerror=()=>{clearTimeout(timer);script.remove();library=null;reject(Error('map library'));};
    document.head.append(script);
  });
  await library;
}

export async function createServiceMap(container,places,base,status) {
  const located=places.filter(p=>p.point);
  const fallback={update(){},resize(){}};
  await loadLibrary(base);
  const gl=window.maplibregl;
  if(typeof gl.supported==='function'&&!gl.supported()){status.textContent='На этом устройстве удобнее пользоваться списком мест.';container.hidden=true;return fallback;}
  let map;
  try{map=new gl.Map({container,style:regionMapStyle(base),center:located[0]?.point||[20.5,54.9],zoom:13,attributionControl:false,locale:{'NavigationControl.ZoomIn':'Приблизить','NavigationControl.ZoomOut':'Отдалить'}});}
  catch{status.textContent='На этом устройстве удобнее пользоваться списком мест.';container.hidden=true;return fallback;}
  bindMapTheme(map);map.addControl(new gl.NavigationControl({showCompass:false}));map.addControl(new gl.AttributionControl({compact:false}));
  let markers=[],ids=[];
  function update(nextIDs,nextPlaces=places) {
    ids=[...nextIDs];markers.forEach(v=>v.remove());markers=[];
    const shown=ids.map(id=>nextPlaces.find(v=>v.id===id)).filter(p=>p?.point);
    for(const place of shown){
      const a=document.createElement('a');a.className='service-map-pin';a.href=`#service-${encodeURIComponent(place.id)}`;
      a.textContent=String(ids.indexOf(place.id)+1);a.setAttribute('aria-label',place.name);
      a.addEventListener('click',()=>document.getElementById(`service-${place.id}`)?.querySelector('summary')?.focus({preventScroll:true}));
      markers.push(new gl.Marker({element:a}).setLngLat(place.point).addTo(map));
    }
    container.dataset.mapIds=JSON.stringify(ids);container.dataset.pinIds=JSON.stringify(shown.map(v=>v.id));
    if(shown.length){const bounds=new gl.LngLatBounds();shown.forEach(v=>bounds.extend(v.point));map.fitBounds(bounds,{padding:55,maxZoom:14,duration:0});}
    status.textContent=shown.length===ids.length?'':`На карте: ${shown.length} из ${ids.length}. Остальные места доступны в списке.`;
  }
  try{
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('map timeout')),20000);map.once('load',()=>{clearTimeout(timer);resolve();});});
  }catch(error){map.remove();throw error;}
  map.on('error',()=>{status.textContent='Часть карты не загрузилась. Карточки и адреса доступны в списке.';});
  return {update,resize(){map.resize();}};
}
