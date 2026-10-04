import {createSceneRenderer} from './scene-renderer.mjs';
import {rasterizeSceneMasks} from './scene-mask.mjs';

let renderer, profile, width, height, maskRevision=0;
const send=(id,value={})=>postMessage({id,...value});
async function setProfile(next){
  const ticket=++maskRevision;
  const pixels=await rasterizeSceneMasks(next,width,height);
  if(ticket!==maskRevision)return;
  renderer.setMask(pixels,width,height);profile=next;
}
self.onmessage=async({data})=>{
  const {id,type}=data;
  try{
    if(type==='init'){
      profile=data.profile;width=data.maskWidth;height=data.maskHeight;
      const mask=rasterizeSceneMasks(profile,width,height);mask.catch(()=>{});
      renderer=await createSceneRenderer(data.surface,()=>postMessage({error:'Контекст сцены потерян',fatal:true}));
      if(!renderer)throw new Error('WebGL в рабочем потоке недоступен');
      try{renderer.uploadPhoto(data.bitmap,data.sourceWindow);}finally{data.bitmap.close();}
      renderer.setMask(await mask,width,height);
      send(id,{marks:performance.getEntriesByType('mark').map(m=>({name:m.name,at:performance.timeOrigin+m.startTime}))});
    }else if(type==='photo'){
      try{renderer.uploadPhoto(data.bitmap,data.sourceWindow);}finally{data.bitmap.close();}
      send(id);
    }else if(type==='profile'){
      await setProfile(data.profile);send(id);
    }else if(type==='parameters'){
      profile=data.profile;
    }else if(type==='resize'){
      renderer.resize(...data.viewport);
    }else if(type==='draw'){
      const began=performance.now();renderer.draw(data.time,data.wind,profile);
      send(id,{drawn:true,cost:performance.now()-began});
    }else if(type==='dispose'){
      maskRevision++;renderer?.dispose();close();
    }
  }catch(error){send(id,{error:error.message,fatal:type==='init'||type==='draw'||type==='resize'});}
};
