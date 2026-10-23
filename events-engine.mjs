// Calendar dates belong to the destination, not the visitor's timezone.
const iso=/^\d{4}-\d{2}-\d{2}$/;
export function calendarDate(value){
 if(typeof value!=='string'||!iso.test(value))return false;
 const d=new Date(value+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
}
export function regionDate(now=new Date()){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kaliningrad',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(x=>[x.type,x.value]));
 return `${p.year}-${p.month}-${p.day}`;
}
export const EVENT_TIMEZONE='Europe/Kaliningrad';
export function eventPath(id){
 if(typeof id!=='string'||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))throw new TypeError('Invalid event id');
 return `events/${id}/`;
}
const dayMs=86400000;
const instant=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(v)&&calendarDate(v.slice(0,10))&&Number.isFinite(Date.parse(v));
const kgd=v=>new Date(new Date(v).getTime()+7200000).toISOString().slice(0,19)+'+02:00';
export function regionClock(now=new Date()){
 const date=regionDate(now),parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:EVENT_TIMEZONE,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
 const hour=Number(parts.hour),minute=Number(parts.minute),tomorrow=new Date(Date.parse(date+'T12:00:00Z')+dayMs).toISOString().slice(0,10);
 return {date,tomorrow,hour,minute,timezone:EVENT_TIMEZONE,tomorrow_primary:hour>=22};
}
export function eventInterval(event){
 const start=event.start_time??`${event.date}T${event.starts}:00+02:00`;
 const end=event.end_time!==undefined?event.end_time:event.ends?`${event.end_date||event.date}T${event.ends}:00+02:00`:null;
 if(!instant(start)||end!==null&&(!instant(end)||Date.parse(end)<=Date.parse(start)))throw new TypeError('Invalid event interval');
 return {start:kgd(start),end:end===null?null:kgd(end),start_date:regionDate(new Date(start)),end_date:end===null?null:regionDate(new Date(end))};
}
export function normalizeEvent(event,registry={}){
 const interval=eventInterval(event),source=registry.sources?.[event.source]||{},venue=registry.venues?.[event.venue_id]||{};
 const place_id=Object.hasOwn(venue,'place_id')?venue.place_id:event.place_id??event.poi??null;
 return {...event,venue_id:event.venue_id??null,place_id,category:event.category??event.kind,
  timezone:EVENT_TIMEZONE,start_time:interval.start,end_time:interval.end,duration_estimate:event.duration_estimate??null,
  price_range:event.price_range!==undefined?event.price_range:event.price===null||event.price===undefined?null:{min:event.price,max:event.price,currency:event.currency,kind:'exact'},
  source_url:event.source_url??source.url??null,verified_at:event.verified_at??source.checked_at??null,observations:event.observations??[]};
}
export function eventOverlapsDate(event,date){
 if(!calendarDate(date))throw new TypeError('Invalid calendar date');
 const {start,end,start_date}=eventInterval(event);
 if(end===null)return start_date===date;
 const from=Date.parse(date+'T00:00:00+02:00');
 return Date.parse(start)<from+dayMs&&Date.parse(end)>from;
}
export function eventTiming(event,now=new Date()){
 const interval=eventInterval(event),today=regionDate(now),ms=new Date(now).getTime();
 if(!Number.isFinite(ms))throw new TypeError('Invalid as_of');
 const start=Date.parse(interval.start),end=interval.end===null?null:Date.parse(interval.end),needs_info=end===null;
 let phase;
 if(['cancelled','postponed'].includes(event.status))phase=event.status;
 else if(end!==null&&end<=ms)phase='ended';
 else if(start>ms)phase='upcoming';
 else if(end!==null)phase='now';
 else phase=interval.start_date<today?'past_unknown_end':'unknown_end';
 const archive=['ended','past_unknown_end','cancelled','postponed'].includes(phase);
 return {phase,now:phase==='now',eligible_today:!archive&&eventOverlapsDate(event,today)&&(end!==null||start>ms),archive,needs_info};
}
export function eventsForDate(registry,date,{now=new Date(),city='',venue_id='',includeChanged=false}={}){
 const seen=new Set();
 return registry.events.filter(e=>eventOverlapsDate(e,date)&&(!city||e.city===city)&&(!venue_id||e.venue_id===venue_id)&&(includeChanged||!['cancelled','postponed'].includes(e.status)))
  .map(e=>normalizeEvent(e,registry)).sort((a,b)=>a.start_time.localeCompare(b.start_time)||a.id.localeCompare(b.id))
  .filter(e=>!seen.has(e.id)&&seen.add(e.id));
}
export function eventCacheState(meta={},now=new Date(),expected={}){
 const ms=new Date(now).getTime(),fetched=instant(meta.fetched_at)?Date.parse(meta.fetched_at):NaN;
 const age=Number.isFinite(fetched)&&Number.isFinite(ms)&&ms>=fetched?(ms-fetched)/1000:null;
 return {age_seconds:age,expired6h:age===null||age>=21600,dated_snapshot12h:age===null||age>=43200,unknown_age:age===null,
  date_mismatch:!!expected.date&&meta.date!==expected.date,revision_mismatch:!!expected.revision&&meta.revision!==expected.revision};
}
export function coverageForDate(index,date){
 if(!calendarDate(date))throw new TypeError('Invalid calendar date');
 if(index.window&&(date<index.window.from||date>index.window.to))return {status:'outside_window',complete:false,sources:[]};
 return index.dates?.[date]?.coverage||{status:'unknown',complete:false,sources:[]};
}
export function eventPeriod(event,today){
 if(!calendarDate(today))throw new TypeError('Invalid calendar date');
 return event.date<today?'past':'upcoming';
}
export function eventMatches(event,{today,date='',city='',period='upcoming',saved=false,now}){
 const timing=now?eventTiming(event,now):null;
 const inPeriod=period==='saved'?saved:timing?period==='past'?timing.archive:!timing.archive&&(regionDate(now)!==eventInterval(event).start_date||timing.eligible_today):eventPeriod(event,today)===period;
 return inPeriod&&(!date||(now?eventOverlapsDate(event,date):event.date===date))&&(!city||event.city===city);
}
export function validateEvents(data,catalog,today){
 if(!calendarDate(today)||![1,2].includes(data.version)||!calendarDate(data.checked_at)||data.checked_at>today||!Array.isArray(data.events)||!data.sources||Array.isArray(data.sources)||typeof data.sources!=='object')throw new TypeError('Invalid event registry');
 const ids=new Set(),cities=new Map(),places=new Set(catalog.poi.map(p=>p.slug)),routes=new Set(catalog.routes.map(r=>r.slug));
 const text=(v)=>typeof v==='string'&&!!v.trim();const time=v=>typeof v==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
 const sourceUrl=value=>{
  if(typeof value!=='string'||/[\s\x00-\x1f\x7f\\\u0080-\uffff]/.test(value)||/%(?![a-f\d]{2})/i.test(value))throw new TypeError('Invalid source URL encoding');
  const u=new URL(value);
  if(u.protocol!=='https:'||!u.hostname||u.username||u.password||u.port&&u.port!=='443')throw new TypeError('Invalid source URL');
 };
 for(const e of data.events){
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(e.id)||ids.has(e.id))throw new TypeError('Duplicate/invalid event id');ids.add(e.id);
  for(const k of ['title','city','city_name','venue','description','kind'])if(!text(e[k]))throw new TypeError('Missing event '+k);
  if(e.admission!==null&&!text(e.admission))throw new TypeError('Invalid admission');
  if(cities.has(e.city)&&cities.get(e.city)!==e.city_name)throw new TypeError('Inconsistent city');cities.set(e.city,e.city_name);
  if(!calendarDate(e.date)||!time(e.starts)||!(e.ends===null||(time(e.ends)&&(e.ends>e.starts||data.version===2&&(e.end_date||e.end_time)))))throw new TypeError('Invalid event time');
  if(!['scheduled','cancelled','postponed'].includes(e.status))throw new TypeError('Invalid event status');
  if(!(e.price===null||(typeof e.price==='number'&&Number.isFinite(e.price)&&e.price>=0&&e.currency==='RUB')))throw new TypeError('Unknown price is not zero');
  const estimate=e.duration_estimate;
  if(estimate!==undefined&&estimate!==null&&(!Number.isSafeInteger(estimate.minutes)||estimate.minutes<=0||!['planning_assumption','published_duration'].includes(estimate.basis)||!text(estimate.label)||e.ends!==null||e.end_time!=null))throw new TypeError('Invalid planning duration estimate');
 if(e.poi&&!places.has(e.poi)||e.route&&!routes.has(e.route))throw new TypeError('Unknown event link');
  const image=e.image;
  const localImage=v=>typeof v==='string'&&/^assets\/[a-z0-9/_-]+\.(?:webp|avif|jpe?g|png)$/.test(v);
  if(!image||!localImage(image.src)||!localImage(image.src_small)||!text(image.alt)||!['photo','illustration'].includes(image.kind)||![image.width,image.height].every(v=>Number.isSafeInteger(v)&&v>0))throw new TypeError('Missing or invalid event image');
  const s=data.sources[e.source];if(!s||!text(s.name)||!calendarDate(s.checked_at)||s.checked_at>today||!/^[a-f0-9]{64}$/.test(s.sha256))throw new TypeError('Missing source evidence');
  const knownOrganizer=text(s.organizer?.name)&&text(s.organizer?.url);
  const knownPublisher=data.version===2&&s.organizer===null&&text(s.publisher?.name)&&text(s.publisher?.url)&&s.publisher?.role==='venue';
  if(!knownOrganizer&&!knownPublisher)throw new TypeError('Missing organizer or official venue publisher');
  for(const url of [s.url,...knownOrganizer?[s.organizer.url]:[s.publisher.url]])sourceUrl(url);
 }
 if(data.version===2){
  const dateOrInstant=v=>calendarDate(v)||instant(v);
  if(!dateOrInstant(data.updated_at)||data.updated_at.slice(0,10)>today||!data.venues||Array.isArray(data.venues))throw new TypeError('Invalid dataset metadata');
  for(const [id,v] of Object.entries(data.venues)){
   if(v.id!==id||!text(v.name)||!text(v.city)||!text(v.city_name)||v.place_id!==null&&!places.has(v.place_id))throw new TypeError('Invalid canonical venue');
   if(v.coordinates!==null&&v.coordinates!==undefined&&(!Number.isFinite(v.coordinates.lat)||!Number.isFinite(v.coordinates.lon)||Math.abs(v.coordinates.lat)>90||Math.abs(v.coordinates.lon)>180))throw new TypeError('Invalid venue coordinates');
  }
  for(const e of data.events){
   const interval=eventInterval(e),source=data.sources[e.source];
   if(e.regional_major!==undefined&&typeof e.regional_major!=='boolean')throw new TypeError('Invalid regional selection');
   if(e.timezone!==EVENT_TIMEZONE||!data.venues[e.venue_id]||data.venues[e.venue_id].city!==e.city||!text(e.category)||!instant(e.start_time)||e.end_time!==null&&!instant(e.end_time)||interval.start!==`${e.date}T${e.starts}:00+02:00`)throw new TypeError('Invalid canonical event');
   if(e.poi&&e.poi!==data.venues[e.venue_id].place_id)throw new TypeError('Event place differs from canonical venue');
   if(e.ends!==null&&(interval.end===null||interval.end.slice(11,16)!==e.ends)||e.ends===null&&interval.end!==null)throw new TypeError('Inconsistent event end');
   if(e.source_url!==source.url||!dateOrInstant(e.verified_at)||e.verified_at.slice(0,10)>today||!Array.isArray(e.observations)||!e.observations.length)throw new TypeError('Invalid event verification');
   sourceUrl(e.source_url);
   for(const o of e.observations){
    if(!dateOrInstant(o.verified_at)||o.verified_at.slice(0,10)>today||!/^[a-f0-9]{64}$/.test(o.sha256)||!['scheduled','cancelled','postponed'].includes(o.status)||o.date!==undefined&&!calendarDate(o.date)||o.start_time!==undefined&&!instant(o.start_time))throw new TypeError('Invalid observation');
    sourceUrl(o.source_url);
   }
   const p=e.price_range;
   if(p!==null&&(!['exact','from','range'].includes(p.kind)||p.currency!=='RUB'||typeof p.min!=='number'||!Number.isFinite(p.min)||p.min<0||p.max!==null&&(typeof p.max!=='number'||!Number.isFinite(p.max)||p.max<p.min)||p.kind==='exact'&&p.max!==p.min||p.kind==='from'&&p.max!==null||p.kind==='range'&&p.max===null))throw new TypeError('Invalid price range');
   if(e.price!==null&&(p===null||p.kind!=='exact'||p.min!==e.price))throw new TypeError('Exact price and range disagree');
  }
 }
 return data;
}
