// Local measurement of an explicit planning attempt. No Trip content, names,
// dates of travel, coordinates, or network requests belong in this record.
export const PLANNING_PROGRESS_KEY='godune-planning-progress:v1';
const sources=new Set(['wizard','kosa']);
const reasons=new Set(['calculated','conflict','transport','travel','hours','not_calculated']);
const empty=()=>({version:1,attempts:{}});
const finiteTime=value=>Number.isSafeInteger(value)&&value>=0;
function read(storage) {
  try {
    const value=JSON.parse(storage.getItem(PLANNING_PROGRESS_KEY)||'null');
    if(value?.version!==1 || !value.attempts || Array.isArray(value.attempts))return empty();
    const attempts={};
    for(const [id,row]of Object.entries(value.attempts)) {
      if(!/^[a-z0-9-]{8,80}$/.test(id) || !sources.has(row?.source) || !finiteTime(row.started_at))continue;
      attempts[id]={source:row.source,started_at:row.started_at};
      if(['not_saved','incomplete','calculated'].includes(row.outcome))attempts[id].outcome=row.outcome;
      if(reasons.has(row.reason))attempts[id].reason=row.reason;
      if(finiteTime(row.usable_at) && row.usable_at>=row.started_at)attempts[id].usable_at=row.usable_at;
      if(finiteTime(row.elapsed_ms))attempts[id].elapsed_ms=row.elapsed_ms;
      for(const key of ['estimated','user_estimated','conditions_pending','field_checked'])if(typeof row[key]==='boolean')attempts[id][key]=row[key];
    }
    return {version:1,attempts};
  } catch {return empty();}
}

export function progressSummary(record) {
  const rows=Object.values(record.attempts),usable=rows.filter(row=>finiteTime(row.usable_at)),times=usable.filter(row=>finiteTime(row.elapsed_ms));
  return {started:rows.length,saved:rows.filter(row=>['incomplete','calculated'].includes(row.outcome)).length,
    usable:usable.length,completion_rate:rows.length?usable.length/rows.length:null,
    mean_time_ms:times.length?Math.round(times.reduce((sum,row)=>sum+row.elapsed_ms,0)/times.length):null,
    incomplete:rows.filter(row=>row.outcome==='incomplete' && !finiteTime(row.usable_at)).length,
    not_saved:rows.filter(row=>row.outcome==='not_saved' && !finiteTime(row.usable_at)).length,
    evidence:Object.fromEntries(['estimated','user_estimated','conditions_pending','field_checked'].map(key=>[key,usable.filter(row=>row[key]).length]))};
}

export function createPlanningProgress(storage,environment=globalThis) {
  let epoch=0,serial=Promise.resolve();
  const listeners=new Set();
  const now=()=>Math.trunc(environment.Date?.now?.()??Date.now());
  const changed=()=>{for(const listener of listeners)listener();};
  function write(operation,token=epoch) {
    const work=async()=>{
      const locked=()=>{
        if(token!==epoch)return false;
        const record=read(storage);
        if(!operation(record))return false;
        try{storage.setItem(PLANNING_PROGRESS_KEY,JSON.stringify(record));changed();return true;}catch{return false;}
      };
      try{return environment.navigator?.locks?.request?await environment.navigator.locks.request('godune-planning-progress',locked):locked();}catch{return false;}
    };
    const pending=serial.then(work,work);serial=pending.catch(()=>false);return pending;
  }
  function begin(source) {
    if(!sources.has(source))throw Error('Unknown planning source');
    const attempt={id:environment.crypto?.randomUUID?.()||`attempt-${now().toString(36)}-${Math.random().toString(36).slice(2)}`,epoch,startedAt:now()};
    attempt.started=write(record=>{record.attempts[attempt.id]={source,started_at:attempt.startedAt};return true;},attempt.epoch);
    return attempt;
  }
  async function saved(attempt,result,confirmed) {
    if(!attempt || attempt.epoch!==epoch || !await attempt.started)return false;
    return write(record=>{
      const row=record.attempts[attempt.id];if(!row || finiteTime(row.usable_at))return false;
      row.outcome=!confirmed?'not_saved':result.calculated?'calculated':'incomplete';
      row.reason=reasons.has(result.reason)?result.reason:'not_calculated';
      if(confirmed && result.calculated) {
        const finished=now();
        // A changed system clock cannot produce a fabricated zero-duration win.
        if(finished<row.started_at){row.outcome='incomplete';row.reason='not_calculated';return true;}
        row.usable_at=finished;row.elapsed_ms=finished-row.started_at;
        for(const key of ['estimated','user_estimated','conditions_pending','field_checked'])row[key]=result[key]===true;
      }
      return true;
    },attempt.epoch);
  }
  const clear=()=>{epoch++;changed();};
  const storageChanged=event=>{if(event.key===PLANNING_PROGRESS_KEY || event.key===null){if(event.newValue===null)epoch++;changed();}};
  environment.addEventListener?.('godune:memory-clearing',clear);
  environment.addEventListener?.('godune:memory-cleared',clear);
  environment.addEventListener?.('storage',storageChanged);
  return {begin,saved,summary:()=>progressSummary(read(storage)),
    export:()=>({version:1,scope:'this-browser-wizard-and-kosa',definition:'Начатый план → завершённый расчёт без препятствий и неизвестной важной дороги → подтверждённое сохранение в браузере. Оценки и условия, которые нужно уточнить, отделены от проверки на месте.',summary:progressSummary(read(storage)),record:read(storage)}),
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    destroy(){epoch++;listeners.clear();environment.removeEventListener?.('godune:memory-clearing',clear);environment.removeEventListener?.('godune:memory-cleared',clear);environment.removeEventListener?.('storage',storageChanged);}};
}
