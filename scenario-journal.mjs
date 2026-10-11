// Local, allowlisted evidence of explicit actions. Never store form values,
// Trip content, URLs, coordinates, names, notes or travel dates here.
export const SCENARIO_JOURNAL_KEY='godune-scenario-journal:v1';
export const JOURNAL_SOURCES=['wizard','kosa','transport','rest','gastro','rental','guide','trip-edit'];
export const JOURNAL_ACTIONS=['selected','compared','calculated','saved','pdf_ready','second_day','refused','failed','abandoned'];
export const JOURNAL_REASONS=['conflict','transport','travel','hours','walking_allowance','walking_unknown','not_calculated','light','light_unknown','storage','stale','cancelled','calculation','pdf'];
const criteriaKeys=['calculated','conflicts_shown','return_accounted'];
const origins=['local_acceptance','user_observation'];
const idOk=value=>typeof value==='string'&&/^[a-z0-9-]{8,80}$/.test(value);
const timeOk=value=>Number.isSafeInteger(value)&&value>=0;
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const boolOrNull=value=>value===null||typeof value==='boolean';
const hashOk=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);

export function validateScenarioJournal(value) {
  if(!exact(value,['version','generation','attempts'])||value.version!==1||!idOk(value.generation)||!value.attempts||typeof value.attempts!=='object'||Array.isArray(value.attempts))throw Error('Invalid scenario journal');
  for(const [id,row]of Object.entries(value.attempts)) {
    if(!idOk(id)||!exact(row,['source','origin','started_at','events'])||!JOURNAL_SOURCES.includes(row.source)||!origins.includes(row.origin)||!timeOk(row.started_at)||!Array.isArray(row.events))throw Error('Invalid journal attempt');
    const ids=new Set();let previous=row.started_at;
    for(const event of row.events) {
      if(!exact(event,['id','action','at','reason','criteria','bindings'])||!idOk(event.id)||ids.has(event.id)||!JOURNAL_ACTIONS.includes(event.action)||!timeOk(event.at)||event.at<previous||event.reason!==null&&!JOURNAL_REASONS.includes(event.reason))throw Error('Invalid journal event');
      if(event.criteria!==null&&(!exact(event.criteria,criteriaKeys)||!Object.values(event.criteria).every(boolOrNull)))throw Error('Invalid journal criteria');
      if(!Array.isArray(event.bindings)||!event.bindings.every(hashOk)||event.action!=='saved'&&event.bindings.length)throw Error('Invalid journal bindings');
      if(event.action==='calculated'?event.criteria===null:event.criteria!==null)throw Error('Invalid calculation event');
      ids.add(event.id);previous=event.at;
    }
  }
  return value;
}

export function journalSummary(record) {
  const groups=new Map();
  for(const row of Object.values(record?.attempts||{})) {
    const key=`${row.origin}:${row.source}`;
    if(!groups.has(key))groups.set(key,{origin:row.origin,source:row.source,started:0,saved:0,usable:0,pdf_ready:0,second_day:0,actions:{},refusals:{},usable_ms:[]});
    const group=groups.get(key);group.started++;
    let calculation=null,usable=null,saved=false;
    for(const event of row.events) {
      group.actions[event.action]=(group.actions[event.action]||0)+1;
      if(event.reason)group.refusals[event.reason]=(group.refusals[event.reason]||0)+1;
      if(event.action==='calculated')calculation=event.criteria;
      if(event.action==='saved'){saved=true;if(!usable&&['wizard','kosa'].includes(row.source)&&calculation&&Object.values(calculation).every(value=>value===true))usable=event;}
    }
    group.saved+=saved?1:0;group.usable+=usable?1:0;
    if(usable)group.usable_ms.push(usable.at-row.started_at);
    for(const action of ['pdf_ready','second_day'])group[action]+=row.events.some(event=>event.action===action)?1:0;
  }
  return [...groups.values()].sort((a,b)=>`${a.origin}:${a.source}`.localeCompare(`${b.origin}:${b.source}`));
}

export function createScenarioJournal(storage,environment=globalThis,{origin}={}) {
  origin ||= environment[Symbol.for('godune:observation-origin')] || (['localhost','127.0.0.1','[::1]','::1'].includes(environment.location?.hostname)?'local_acceptance':'user_observation');
  if(!origins.includes(origin))throw Error('Invalid journal origin');
  let epoch=0,serial=Promise.resolve();const listeners=new Set();
  const now=()=>Math.trunc(environment.Date?.now?.()??Date.now());
  const id=()=>environment.crypto?.randomUUID?.()||`journal-${now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  function read(){const raw=storage.getItem(SCENARIO_JOURNAL_KEY);return raw===null?null:validateScenarioJournal(JSON.parse(raw));}
  function write(operation,token=epoch) {
    const work=async()=>{
      const locked=()=>{
        if(token!==epoch)return false;
        try{const record=read(),next=operation(record);if(!next)return false;validateScenarioJournal(next);storage.setItem(SCENARIO_JOURNAL_KEY,JSON.stringify(next));for(const listener of listeners)listener();return true;}catch{return false;}
      };
      try{return environment.navigator?.locks?.request?await environment.navigator.locks.request('godune-scenario-journal',locked):locked();}catch{return false;}
    };
    const pending=serial.then(work,work);serial=pending.catch(()=>false);return pending;
  }
  function begin(source) {
    if(!JOURNAL_SOURCES.includes(source))throw Error('Unknown journal source');
    const handle={id:id(),epoch,startedAt:now(),generation:null};
    handle.started=write(record=>{
      record ||= {version:1,generation:id(),attempts:{}};
      handle.generation=record.generation;
      record.attempts[handle.id]={source,origin,started_at:handle.startedAt,events:[]};return record;
    },handle.epoch);return handle;
  }
  async function event(handle,action,{reason=null,criteria=null,bindings=[]}={}) {
    if(!handle||handle.epoch!==epoch||!JOURNAL_ACTIONS.includes(action)||!await handle.started)return false;
    // Project incoming data onto the contract; extra caller properties never persist.
    const safeCriteria=criteria===null?null:Object.fromEntries(criteriaKeys.map(key=>[key,criteria[key]??null]));
    return write(record=>{
      if(!record||record.generation!==handle.generation)return false;
      const row=record.attempts[handle.id];if(!row)return false;
      const at=now();if(at<(row.events.at(-1)?.at??row.started_at))return false;
      if(['saved','pdf_ready','second_day','abandoned'].includes(action)&&row.events.some(item=>item.action===action))return false;
      row.events.push({id:id(),action,at,reason,criteria:safeCriteria,bindings:[...new Set(bindings)]});return record;
    },handle.epoch);
  }
  function resume(bindings) {
    if(!bindings.length)return null;
    try {
      const record=read();if(!record)return null;
      const rows=Object.entries(record.attempts).filter(([,row])=>row.origin===origin&&row.events.some(item=>item.action==='saved'&&item.bindings.some(hash=>bindings.includes(hash)))).sort((a,b)=>b[1].started_at-a[1].started_at);
      const row=rows[0];return row?{id:row[0],epoch,generation:record.generation,started:Promise.resolve(true)}:null;
    }catch{return null;}
  }
  async function followUp(action,bindings) {
    if(!['pdf_ready','second_day'].includes(action))return false;
    return event(resume(bindings),action);
  }
  const clear=()=>{epoch++;};
  const changed=event=>{if(event.key===null||event.key===SCENARIO_JOURNAL_KEY){if(event.newValue===null)epoch++;for(const listener of listeners)listener();}};
  environment.addEventListener?.('godune:memory-clearing',clear);environment.addEventListener?.('godune:memory-cleared',clear);environment.addEventListener?.('storage',changed);
  return {begin,event,resume,followUp,
    export(){try{const record=read();return {version:1,scope:'this-browser-explicit-scenarios',state:record?'observed':'no_observations',record,groups:journalSummary(record)};}catch{return {version:1,scope:'this-browser-explicit-scenarios',state:'unavailable',record:null,groups:[]};}},
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    destroy(){epoch++;listeners.clear();environment.removeEventListener?.('godune:memory-clearing',clear);environment.removeEventListener?.('godune:memory-cleared',clear);environment.removeEventListener?.('storage',changed);}};
}
