import {AUTO_SCHEMA,DEFAULT_AUTO_CONFIG,validAutoConfig,autoContext,autoBackups,ruleAutoPlan,validAutoPlan,prepareAutoDay} from './auto-day-state.mjs?v=2026101903';
import {planInput} from './trip-schedule-state.mjs?v=2026101305';

// A key never belongs in the client. Deployment may enable only an existing
// same-origin proxy AND a separately established consent to share this context.
export async function requestAutoLLM({config,context,catalog,base,fetcher=fetch,signal}){
  if(!validAutoConfig(config) || !config.llm.enabled || !config.llm.endpoint || !config.llm.context_consent)return {status:'disabled'};
  const endpoint=new URL(config.llm.endpoint,base);
  if(endpoint.origin!==new URL(base).origin)return {status:'disabled'};
  // No profile identifiers, interest/activity history, visited places, notes,
  // bookings or personal coordinates are sent, including in request headers.
  const candidates=context.routes.map(route=>({route:route.slug,places:route.stops.map(stop=>stop.poi),backups:[...new Set(context.routes.filter(row=>row.area===route.area).flatMap(row=>row.stops.map(stop=>stop.poi)))],area:route.area,weather:context.weatherFor(route).status==='fresh'?{rain_mm:context.weatherFor(route).hour.rain_mm}:null}));
  try{
    const response=await fetcher(endpoint,{method:'POST',credentials:'omit',referrerPolicy:'no-referrer',headers:{'Content-Type':'application/json'},signal,body:JSON.stringify({schema:AUTO_SCHEMA,context:{date:context.date,start:context.start,end:context.end,mode:'foot',rain:context.rain},candidates})});
    if(!response.ok)return {status:'failed'};
    const raw=await response.text();if(raw.length>16000)return {status:'invalid'};
    const value=JSON.parse(raw);
    return validAutoPlan(value,context,catalog)?{status:'valid',plan:value}:{status:'invalid'};
  }catch{return {status:signal?.aborted?'timeout':'invalid'};}
}
function bounded(promise,milliseconds,fallback){
  let timer;return Promise.race([promise,new Promise(resolve=>{timer=setTimeout(()=>resolve(fallback),milliseconds);})]).finally(()=>clearTimeout(timer));
}
const timedFit=(schedule,plan)=>!['overrun','conflict'].includes(schedule.status) && schedule.unknown_legs===0 && Number.isFinite(schedule.finish) && schedule.finish<=plan.end && schedule.stops.length===plan.places.length && schedule.stops.every(stop=>Number.isFinite(stop.begins) && Number.isFinite(stop.leaves) && stop.begins>=plan.start && stop.leaves<=plan.end);
export async function assembleAutoDay({current,record,catalog,base,calculate,loadMatrix,config=DEFAULT_AUTO_CONFIG,weather=null,rain=false,rainTarget=null,ranking=null,now=new Date(),fetcher=fetch,deadline=4200}){
  const started=performance.now(),remaining=()=>Math.max(0,deadline-(performance.now()-started));
  const context=autoContext(current,record,catalog,{now,weather,rain,rainTarget,ranking});
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.min(1100,remaining()));
  let llm;
  try{llm=await bounded(requestAutoLLM({config,context,catalog,base,fetcher,signal:controller.signal}),Math.min(1150,remaining()),{status:'timeout'});}finally{clearTimeout(timer);controller.abort();}
  const plans=llm.status==='valid'?[llm.plan]:[];
  for(const route of context.routes){try{const plan=ruleAutoPlan(context,catalog,route);for(const backup of autoBackups(context,catalog,route,plan.places))plans.push({...plan,backup});}catch{}}
  for(const plan of plans){
    if(remaining()<80)break;
    const proposal=prepareAutoDay(current,plan,context,catalog);
    const matrix=await bounded(Promise.resolve().then(()=>loadMatrix(proposal.trip)).catch(()=>null),Math.min(700,remaining()-40),null);
    const schedule=calculate(planInput(proposal.trip,catalog,matrix));
    if(!timedFit(schedule,plan))continue;
    // The displayed backup must itself form a calculated two-point day in the
    // same window. Its road evidence and warnings stay in the common engine.
    const backupContext={...context,rain:true,rainTarget:plan.backup};
    let backupVerified=false;
    for(const route of context.routes.filter(route=>route.stops.some(stop=>stop.poi===plan.backup))){
      try{
        const backupPlan=ruleAutoPlan(backupContext,catalog,route),backupProposal=prepareAutoDay(current,backupPlan,backupContext,catalog);
        const backupMatrix=await bounded(Promise.resolve().then(()=>loadMatrix(backupProposal.trip)).catch(()=>null),Math.min(350,Math.max(0,remaining()-40)),null);
        const backupSchedule=calculate(planInput(backupProposal.trip,catalog,backupMatrix));
        if(timedFit(backupSchedule,backupPlan)){backupVerified=true;break;}
      }catch{}
    }
    if(!backupVerified)continue;
    const wet=context.weatherFor(proposal.route);
    return {...proposal,schedule,matrix,sourceJSON:JSON.stringify(current),llm:llm.status,source:llm.status==='valid' && plan===llm.plan?'llm':'rules',weatherStatus:wet.status,elapsed:performance.now()-started};
  }
  throw Error('auto_no_fit');
}
