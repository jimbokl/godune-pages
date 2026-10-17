// Portable observation, distinct from current registry/fetch time.
const keys=(v,allowed)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>allowed.includes(k));
const text=v=>typeof v==='string'&&!!v.trim();
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!v.startsWith('0000')&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const zoned=(v,precise=false)=>{
 if(typeof v!=='string')return false;
 const m=/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(v);
 return !!m&&date(m[1])&&Number(m[2])<24&&Number(m[3])<60&&Number(m[4])<60&&(!precise||Number(m[4])===0&&(!m[5]||Number(m[5])===0))&&Number.isFinite(Date.parse(v));
};
const instant=v=>zoned(v,true);
const sourceURL=v=>{try{const u=new URL(v);return typeof v==='string'&&['http:','https:'].includes(u.protocol)&&!!u.hostname;}catch{return false;}};
export function eventRegionalStart(e){
 if(typeof e?.start_time!=='string'||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(e.start_time)||!Number.isFinite(Date.parse(e.start_time)))return null;
 const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kaliningrad',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(e.start_time));
 const v=Object.fromEntries(p.filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
 return {date:`${v.year}-${v.month}-${v.day}`,minute:Number(v.hour)*60+Number(v.minute)};
}
export function validEventSnapshot(e,visit){
 if(!keys(e,['version','id','venue_id','place_id','title','start_time','end_time','timezone','status','source_url','verified_at','price_range'])||e.version!==1||![e.id,e.venue_id,e.title].every(text)||!(e.place_id===null||text(e.place_id))||e.timezone!=='Europe/Kaliningrad'||!['scheduled','cancelled','postponed'].includes(e.status)||!sourceURL(e.source_url)||!(date(e.verified_at)||zoned(e.verified_at))||!instant(e.start_time)||!(e.end_time===null||instant(e.end_time)&&Date.parse(e.end_time)>Date.parse(e.start_time)))return false;
 const p=e.price_range;
 if(p!==null&&(!keys(p,['min','max','currency','kind'])||!Number.isFinite(p.min)||p.min<0||p.min>90071992547409||!(p.max===null||Number.isFinite(p.max)&&p.max>=p.min&&p.max<=90071992547409)||p.currency!=='RUB'||!['exact','from','range'].includes(p.kind)||p.kind==='exact'&&p.max!==p.min||p.kind==='range'&&p.max===null||p.kind==='from'&&p.max!==null))return false;
 if(!visit)return true;
 const start=eventRegionalStart(e),input=visit.selection?.visit?.input;
 return !!input?.timing&&!!visit.identity&&visit.category==='event'&&visit.selection.visit.kind==='manual'&&input.date===start.date&&input.session_start===start.minute&&input.timing.activity===(e.end_time===null?null:(Date.parse(e.end_time)-Date.parse(e.start_time))/60000)&&(!e.place_id||visit.identity.place_id===e.place_id)&&visit.identity.service_id===`event:${e.id}`&&visit.selection.activity_id===e.id;
}
export function eventSnapshot(event,venue){
 const e={version:1,id:event.id,venue_id:event.venue_id,place_id:venue&&Object.hasOwn(venue,'place_id')?venue.place_id:event.place_id??null,title:event.title,start_time:event.start_time,end_time:event.end_time??null,timezone:event.timezone,status:event.status,source_url:event.source_url,verified_at:event.verified_at,price_range:event.price_range??null};
 if(!validEventSnapshot(e))throw Error('Сведения о времени или источнике события нужно уточнить.');
 return e;
}
export const eventSnapshotGuard=e=>JSON.stringify(['id','venue_id','place_id','title','start_time','end_time','timezone','status','source_url','verified_at','price_range'].map(k=>k==='price_range'&&e[k]?[e[k].min,e[k].max,e[k].currency,e[k].kind]:e[k]??null));
