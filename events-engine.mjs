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
export function eventPeriod(event,today){
 if(!calendarDate(today))throw new TypeError('Invalid calendar date');
 return event.date<today?'past':'upcoming';
}
export function eventMatches(event,{today,date='',city='',period='upcoming'}){
 return eventPeriod(event,today)===period&&(!date||event.date===date)&&(!city||event.city===city);
}
export function validateEvents(data,catalog,today){
 if(!calendarDate(today)||data.version!==1||!calendarDate(data.checked_at)||data.checked_at>today||!Array.isArray(data.events))throw new TypeError('Invalid event registry');
 const ids=new Set(),cities=new Map(),places=new Set(catalog.poi.map(p=>p.slug)),routes=new Set(catalog.routes.map(r=>r.slug));
 const text=(v)=>typeof v==='string'&&!!v.trim();const time=v=>typeof v==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
 for(const e of data.events){
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(e.id)||ids.has(e.id))throw new TypeError('Duplicate/invalid event id');ids.add(e.id);
  for(const k of ['title','city','city_name','venue','description','kind'])if(!text(e[k]))throw new TypeError('Missing event '+k);
  if(e.admission!==null&&!text(e.admission))throw new TypeError('Invalid admission');
  if(cities.has(e.city)&&cities.get(e.city)!==e.city_name)throw new TypeError('Inconsistent city');cities.set(e.city,e.city_name);
  if(!calendarDate(e.date)||!time(e.starts)||!(e.ends===null||(time(e.ends)&&e.ends>e.starts)))throw new TypeError('Invalid event time');
  if(!['scheduled','cancelled','postponed'].includes(e.status))throw new TypeError('Invalid event status');
  if(!(e.price===null||(typeof e.price==='number'&&Number.isFinite(e.price)&&e.price>=0&&e.currency==='RUB')))throw new TypeError('Unknown price is not zero');
 if(e.poi&&!places.has(e.poi)||e.route&&!routes.has(e.route))throw new TypeError('Unknown event link');
  const image=e.image;
  const localImage=v=>typeof v==='string'&&/^assets\/[a-z0-9/_-]+\.(?:webp|avif|jpe?g|png)$/.test(v);
  if(!image||!localImage(image.src)||!localImage(image.src_small)||!text(image.alt)||!['photo','illustration'].includes(image.kind)||![image.width,image.height].every(v=>Number.isSafeInteger(v)&&v>0))throw new TypeError('Missing or invalid event image');
  const s=data.sources[e.source];if(!s||!text(s.name)||!calendarDate(s.checked_at)||s.checked_at>today||!/^[a-f0-9]{64}$/.test(s.sha256))throw new TypeError('Missing source evidence');
  for(const url of [s.url,s.organizer?.url]){const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password)throw new TypeError('Invalid source URL');}
  if(!text(s.organizer?.name))throw new TypeError('Missing organizer');
 }
 return data;
}
