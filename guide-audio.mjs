import {guideNarration} from './guide-provenance.mjs?v=2';

export async function narrationFingerprint(stop) {
  const bytes=new TextEncoder().encode(guideNarration(stop));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
}

// A recording belongs to the exact chapter text, including sourced facts.
export async function guideAudioRecord(registry,stop,base) {
  const row=registry?.version===1 && stop && Object.hasOwn(registry.clips || {},stop.id)?registry.clips[stop.id]:null;
  if(!row || !/^assets\/guide-audio\/[a-z0-9-]+\.mp3$/.test(row.path || '')
    || !/^[a-f0-9]{64}$/.test(row.narration_sha256 || '') || !/^[a-f0-9]{64}$/.test(row.sha256 || '')
    || !Number.isFinite(row.duration_seconds) || row.duration_seconds<=0)return null;
  try{
    if(await narrationFingerprint(stop)!==row.narration_sha256)return null;
    const url=new URL(row.path,base);
    return {url:url.href,duration:row.duration_seconds,sha256:row.sha256};
  }catch{return null;}
}

export function createGuideAudioPlayer({createAudio=()=>new Audio(),onChange=()=>{}}={}) {
  let audio=null,record=null,state='idle',revision=0,attempt=0;
  const emit=value=>{state=value;onChange({state,record});};
  function stop() {
    revision++;attempt++;const previous=audio;audio=null;
    if(previous){previous.pause();previous.removeAttribute('src');previous.load();}
    emit('idle');
  }
  function select(value){stop();record=value;emit('idle');}
  function play(current,token){
    const request=++attempt;
    const active=()=>audio===current&&revision===token&&request===attempt;
    try{Promise.resolve(current.play()).catch(()=>{if(active()){stop();emit('error');}});}catch{if(active()){stop();emit('error');}}
  }
  function start() {
    if(!record)return;
    const current=createAudio(),token=++revision;audio=current;
    current.preload='none';current.src=record.url;
    const active=()=>audio===current && token===revision;
    current.addEventListener('playing',()=>{if(active()&&state!=='paused')emit('playing');});
    current.addEventListener('waiting',()=>{if(active()&&state!=='paused')emit('loading');});
    current.addEventListener('ended',()=>{if(active())stop();});
    current.addEventListener('error',()=>{if(active()){stop();emit('error');}});
    emit('loading');
    play(current,token);
  }
  function toggle() {
    if(!audio){start();return;}
    if(state==='playing'||state==='loading'){attempt++;audio.pause();emit('paused');return;}
    if(state==='paused'){
      const current=audio,token=revision;emit('loading');
      play(current,token);
    }
  }
  return {select,toggle,stop,get state(){return state;},get record(){return record;}};
}
