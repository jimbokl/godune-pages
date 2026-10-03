import {offlineAction} from './offline.mjs?v=5';
import {mapGlyphs,roadLabelLayout,roadLabelPaint} from './region-map.mjs?v=5';
export function localMapStyle(data,base=new URL('.',import.meta.url)) {
  const polygon = kind => ['all',['==',['get','kind'],kind],['==',['geometry-type'],'Polygon']];
  const line = kind => ['all',['==',['get','kind'],kind],['==',['geometry-type'],'LineString']];
  return {version:8,glyphs:mapGlyphs(base),sources:{local:{type:'geojson',data,attribution:'© <a href="https://www.openstreetmap.org/copyright">Участники OpenStreetMap</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/">ODbL</a>'}},layers:[
    {id:'paper',type:'background',paint:{'background-color':'#f3f0e7'}},
    ...[['green','#dbe3d3'],['sand','#e8dcc4'],['water','#adc3c8'],['building','#d4cec0']].map(([kind,color])=>({id:`local-${kind}`,type:'fill',source:'local',filter:polygon(kind),paint:{'fill-color':color,'fill-opacity':kind==='building'?.86:1}})),
    {id:'local-road-halo',type:'line',source:'local',filter:line('road'),paint:{'line-color':'#c9c3b7','line-width':['interpolate',['linear'],['zoom'],12,1,17,9]}},
    {id:'local-roads',type:'line',source:'local',filter:line('road'),paint:{'line-color':['match',['get','highway'],['footway','path','steps'],'#a2a78f','#fffdfa'],'line-width':['interpolate',['linear'],['zoom'],12,.7,17,6]}},
    {id:'local-waterlines',type:'line',source:'local',filter:line('waterline'),paint:{'line-color':'#adc3c8','line-width':3}},
    {id:'local-coast',type:'line',source:'local',filter:line('coastline'),paint:{'line-color':'#90aab2','line-width':2}},
    {id:'local-rail',type:'line',source:'local',filter:line('rail'),paint:{'line-color':'#a5a7a1','line-width':1,'line-dasharray':[2,2]}},
    {id:'local-street-labels',type:'symbol',source:'local',minzoom:13,filter:['all',line('road'),['has','name']],layout:roadLabelLayout,paint:roadLabelPaint}
  ]};
}

let selected='';
export function chooseMap(slug){selected=slug;}
const inside=(p,b)=>p.lon>=b[0] && p.lon<=b[2] && p.lat>=b[1] && p.lat<=b[3];
export async function availableMaps(base){
  try{
    const packs=await offlineAction(base,{type:'MAPS'});
    // Packages saved before regional downloads have their bounds in the local map.
    for(const pack of packs)if(!pack.bbox){const r=await fetch(new URL(`data/offline-maps/${pack.slug}.geojson`,base));if(r.ok)pack.bbox=(await r.json()).bbox;}
    return packs.filter(p=>Array.isArray(p.bbox)).map(p=>({...p,route:p.slug}));
  }catch{return [];}
}
export async function downloadedMap(base,route,point,maps,ignoreSelection=false){
  maps=maps || await availableMaps(base);
  if(selected && !maps.some(p=>p.slug===selected))selected='';
  let choice=ignoreSelection?null:maps.find(p=>p.slug===selected);
  if(!choice && !navigator.onLine){
    const points=Array.isArray(point)?point:point?[point]:[];
    const scored=maps.map(p=>({p,score:points.filter(x=>inside(x,p.bbox)).length}));
    scored.sort((a,b)=>b.score-a.score || Number(b.p.kind==='region')-Number(a.p.kind==='region') || (b.p.bbox[2]-b.p.bbox[0])*(b.p.bbox[3]-b.p.bbox[1])-(a.p.bbox[2]-a.p.bbox[0])*(a.p.bbox[3]-a.p.bbox[1]));
    // A selected walk keeps its detailed local map unless a region covers its stops.
    choice=scored[0]?.p;
    if(route && choice?.kind!=='region')choice=maps.find(p=>p.slug===route) || choice;
  }
  if(choice?.kind==='region')return choice;
  const walk=choice?.slug || route;
  if(walk){const r=await fetch(new URL(`data/offline-maps/${walk}.geojson`,base));if(!r.ok)throw new Error('Карта прогулки недоступна');return r.json();}
  return null;
}
export function mapCoverage(root,base,maps,current,onChange){
  let panel=root.querySelector('[data-map-coverage]');
  if(!panel){
    panel=document.createElement('div');panel.className='map-coverage';panel.dataset.mapCoverage='';
    const label=document.createElement('label'),text=document.createElement('span'),select=document.createElement('select'),link=document.createElement('a');
    text.textContent='Карта с собой';select.setAttribute('aria-label','Покрытие скачанной карты');label.append(text,select);link.href=new URL('offline/',base);link.textContent='Скачать другую территорию →';panel.append(label,link);root.querySelector('#map-status').before(panel);
    select.addEventListener('change',()=>{chooseMap(select.value);onChange();});
  }
  const select=panel.querySelector('select');select.replaceChildren();
  const option=(value,name)=>{const o=document.createElement('option');o.value=value;o.textContent=name;select.append(o);};
  option('',navigator.onLine?'Вся область · онлайн':'Выбрать автоматически');
  for(const pack of maps)option(pack.slug,pack.kind==='region'?pack.name:`Прогулка: ${pack.name}`);
  select.value=selected || '';select.disabled=!maps.length;panel.dataset.coverage=current?.route || 'online';
  panel.hidden=navigator.onLine && !maps.length;
}
