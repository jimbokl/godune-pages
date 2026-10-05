import {buildGuide} from './virtual-guide-engine.mjs?v=4';
import {verifiedOfflineResource} from './offline-evidence.mjs?v=1';

const inside=(stop,bbox)=>Array.isArray(bbox) && bbox.length===4 && bbox.every(Number.isFinite)
  && stop.lon>=bbox[0] && stop.lon<=bbox[2] && stop.lat>=bbox[1] && stop.lat<=bbox[3];
const pointTile=stop=>{
  const count=2**13,radians=stop.lat*Math.PI/180;
  return `data/region-map/13/${Math.floor((stop.lon+180)/360*count)}/${Math.floor((1-Math.asinh(Math.tan(radians))/Math.PI)/2*count)}.pbf`;
};

export async function guideOfflineState({stop,record,packs,base,readCache}) {
  const options=readCache?{readCache}:undefined,result={text:false,map:null,audio:false,audioBytes:0};
  if(!stop)return result;
  const shell=await verifiedOfflineResource(packs,'guide/index.html',base,null,options);
  if(shell){
    // The browser may contain an older catalog. Compare the whole visible chapter,
    // including practical notes and sources, rather than trusting its presence.
    for(const pack of packs || []){
      const saved=await verifiedOfflineResource([pack],'data/catalog.json',base,null,options);
      if(!saved)continue;
      try{
        const catalog=JSON.parse(new TextDecoder().decode(saved.body));
        const chapter=buildGuide(catalog,{point:stop.id}).stops[0];
        if(JSON.stringify(chapter)===JSON.stringify(stop)){result.text=true;break;}
      }catch{/* Keep looking for the current chapter in another complete package. */}
    }
  }
  for(const pack of packs || []){
    const path=pack.kind==='region'?'data/region-map/source.json':`data/offline-maps/${pack.slug}.geojson`;
    const map=await verifiedOfflineResource([pack],path,base,null,options);if(!map)continue;
    try{
      const data=JSON.parse(new TextDecoder().decode(map.body)),bbox=pack.kind==='region'?pack.bbox:data.bbox;
      if(!inside(stop,bbox))continue;
      if(pack.kind==='region'){
        if(data.version!==1)continue;
        const tile=await verifiedOfflineResource([pack],pointTile(stop),base,null,options);
        if(!tile?.body.byteLength)continue;
      }else if(data.type!=='FeatureCollection' || !Array.isArray(data.features) || !data.features.length)continue;
      result.map={name:pack.name,slug:pack.slug};break;
    }catch{}
  }
  if(record){
    const path=new URL(record.url).pathname.slice(new URL(base).pathname.length);
    const saved=await verifiedOfflineResource(packs,path,base,record.sha256,options);
    if(saved){result.audio=true;result.audioBytes=saved.body.byteLength;}
  }
  return result;
}
