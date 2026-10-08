export const mapGlyphs=base=>new URL('assets/map-glyphs/{fontstack}/{range}.pbf',base).href.replaceAll('%7B','{').replaceAll('%7D','}');
export const roadLabelLayout={'symbol-placement':'line','text-field':['get','name'],'text-font':['Manrope Regular'],'text-size':['interpolate',['linear'],['zoom'],13,11,17,14],'text-max-angle':35,'symbol-spacing':300,'text-padding':4};
export const roadLabelPaint={'text-color':'#405c6a','text-halo-color':'#fffdfa','text-halo-width':1.5};
// Every map tile comes from godune.ru. No external raster, font or routing API.
export function regionMapStyle(base,coverage={}) {
  const source='baltic', layer=(id,type,sourceLayer,paint,filter,minzoom=5)=>({id,type,source,'source-layer':sourceLayer,paint,...(filter?{filter}:{}),minzoom});
  const kind=x=>['==',['get','kind'],x];
  const road=['==',['get','kind'],'road'];
  return {version:8,glyphs:mapGlyphs(base),sources:{baltic:{type:'vector',tiles:[new URL('data/region-map/{z}/{x}/{y}.pbf',base).href.replaceAll('%7B','{').replaceAll('%7D','}')],minzoom:5,maxzoom:13,bounds:coverage.bbox || [19.4,54.3,22.91,55.4],attribution:'© <a href="https://www.openstreetmap.org/copyright">Участники OpenStreetMap</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/">ODbL</a> · Карта: Балтийские дюны'}},layers:[
    {id:'sea',type:'background',paint:{'background-color':'#b9d5e3'}},
    layer('region-land','fill','land',{'fill-color':'#f2efe6'}),
    layer('region-green','fill','areas',{'fill-color':'#dce3d7','fill-opacity':.85},kind('green'),8),
    layer('region-sand','fill','areas',{'fill-color':'#e9ddc5'},kind('sand'),8),
    layer('region-water','fill','areas',{'fill-color':'#b9d5e3'},kind('water'),8),
    layer('region-coast','line','lines',{'line-color':'#93b6c8','line-width':1},kind('coastline'),8),
    layer('region-waterlines','line','lines',{'line-color':'#b9d5e3','line-width':['interpolate',['linear'],['zoom'],8,.5,15,3]},kind('waterline'),8),
    layer('region-building','fill','buildings',{'fill-color':'#d2c9b7','fill-opacity':.85},null,13),
    layer('region-road-halo','line','lines',{'line-color':'#c9c6bb','line-width':['interpolate',['linear'],['zoom'],8,.4,13,2,17,8]},['all',road,['!', ['in',['get','highway'],['literal',['path','footway','steps','cycleway','track']]]]],10),
    layer('region-roads','line','lines',{'line-color':['match',['get','highway'],['path','footway','steps','track'],'#aeb39f',['motorway','trunk','primary'],'#e5c99e','#fffdfa'],'line-width':['interpolate',['linear'],['zoom'],8,.5,13,1.5,17,6]},road,8),
    layer('region-rail','line','lines',{'line-color':'#98a3a7','line-width':1,'line-dasharray':[2,2]},kind('rail'),11),
    {id:'region-street-labels',type:'symbol',source,'source-layer':'lines',minzoom:13,filter:['all',road,['has','name']],layout:roadLabelLayout,paint:roadLabelPaint}
  ]};
}
export const mapCities=[['Калининград',20.507,54.71],['Зеленоградск',20.476,54.962],['Светлогорск',20.154,54.943],['Янтарный',19.939,54.872],['Балтийск',19.904,54.65],['Черняховск',21.809,54.631]];
