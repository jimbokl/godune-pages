import {validIntent,kaliningradToday} from './planner-intent-state.mjs?v=2026102101';

export function intentEndpoint(config,base){
  if(!config||Object.keys(config).sort().join(',')!=='enabled,endpoint,version'||config.version!==1||config.enabled!==true||typeof config.endpoint!=='string')throw Error('intent_unavailable');
  const origin=new URL(base),endpoint=new URL(config.endpoint,origin);
  if(endpoint.username||endpoint.password||endpoint.hash||!(endpoint.protocol==='https:'||endpoint.origin===origin.origin&&['localhost','127.0.0.1','[::1]'].includes(origin.hostname)&&endpoint.protocol==='http:'))throw Error('intent_unavailable');
  return endpoint.href;
}
export async function requestPlannerIntent({text,draft,options,base,signal,fetcher=fetch,timeout=46000}){
  if(typeof text!=='string'||!text.trim()||text.length>2000)throw Error('intent_input');
  if(draft!==null&&!validIntent(draft,options))throw Error('intent_invalid');
  const controller=new AbortController(),abort=()=>controller.abort();
  if(signal?.aborted)throw Error('intent_aborted');
  signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const configResponse=await fetcher(new URL('data/planner-intent-config.json',base),{signal:controller.signal,cache:'no-store',credentials:'omit'});
    if(!configResponse.ok)throw Error('intent_unavailable');
    const endpoint=intentEndpoint(await configResponse.json(),base);
    const response=await fetcher(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:1,messages:[{role:'user',content:text.trim()}],reference_date:kaliningradToday(),options,draft}),signal:controller.signal,credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
    if(!response.ok)throw Error('intent_network');
    const raw=await response.text();if(raw.length>16000)throw Error('intent_invalid');
    let value;try{value=JSON.parse(raw);}catch{throw Error('intent_invalid');}
    if(!value||Object.keys(value).sort().join(',')!=='intent,provider,version'||value.version!==1||!validIntent(value.intent,options)||!value.provider||Object.keys(value.provider).sort().join(',')!=='kind,model'||value.provider.kind!=='llm'||typeof value.provider.model!=='string'||!value.provider.model.trim()||value.provider.model.length>160)throw Error('intent_invalid');
    if(controller.signal.aborted)throw Error('intent_aborted');
    return value;
  }catch(error){if(controller.signal.aborted)throw Error(signal?.aborted?'intent_aborted':'intent_timeout');throw error;}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
