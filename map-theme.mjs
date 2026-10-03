const colors={
  sea:{'background-color':'#081724'},paper:{'background-color':'#15283a'},
  'region-land':{'fill-color':'#172b3c'},
  'region-green':{'fill-color':'#1c343d'},'local-green':{'fill-color':'#1c343d'},
  'region-sand':{'fill-color':'#363b3b'},'local-sand':{'fill-color':'#363b3b'},
  'region-water':{'fill-color':'#0b2031'},'local-water':{'fill-color':'#0b2031'},
  'region-building':{'fill-color':'#3d5061'},'local-building':{'fill-color':'#3d5061'},
  'region-coast':{'line-color':'#456e82'},'local-coast':{'line-color':'#456e82'},
  'region-waterlines':{'line-color':'#315369'},'local-waterlines':{'line-color':'#315369'},
  'region-road-halo':{'line-color':'#112132'},'local-road-halo':{'line-color':'#112132'},
  'region-roads':{'line-color':['match',['get','highway'],['path','footway','steps','track'],'#82958c',['motorway','trunk','primary'],'#b1946b','#778fa4']},
  'local-roads':{'line-color':['match',['get','highway'],['path','footway','steps'],'#82958c','#778fa4']},
  'region-rail':{'line-color':'#657484'},'local-rail':{'line-color':'#657484'},
  'region-street-labels':{'text-color':'#d0dde5','text-halo-color':'#172b3c'},
  'local-street-labels':{'text-color':'#d0dde5','text-halo-color':'#15283a'},
  'walk-line':{'line-color':'#e6b877'}
};
export function themedStyle(style,night=globalThis.document?.documentElement.dataset.theme==='night') {
  return {...style,layers:style.layers.map(layer=>({...layer,paint:{...layer.paint,...(night?colors[layer.id]:{})}}))};
}
// Change paints only. Camera, route, GPS, selected point and sources stay in place.
export function bindMapTheme(map) {
  const original=new Map();
  const apply=()=>{
    const night=document.documentElement.dataset.theme==='night';
    for(const [id,paint]of Object.entries(colors))if(map.getLayer(id)){
      if(!original.has(id))original.set(id,Object.fromEntries(Object.keys(paint).map(key=>[key,map.getPaintProperty(id,key)])));
      for(const key of Object.keys(paint))map.setPaintProperty(id,key,night?paint[key]:original.get(id)[key]);
    }
  };
  // Initial map styles use daytime paints; apply before the first rendered frame.
  map.on('style.load',apply);apply();window.addEventListener('godune:theme-change',apply);
  map.once('remove',()=>window.removeEventListener('godune:theme-change',apply));
  return apply;
}
