// A walking day shares evidence between its plan, places and chosen dishes.
// Services, transport, expenses and bookings retain their complete chapters.
import {routineStopIssue} from './day-stop-view.mjs?v=2026101305';
import {serviceSourceCaption} from './service-provenance.mjs?v=2026101305';
const groupedIssue=issue=>routineStopIssue(issue)||['unknown_opening','unknown_kitchen'].includes(issue.code);
export function walkingSourceCaption(source){
  const observations=source.observations||[source],groups=new Map();
  for(const item of observations){
    const name=item.name===source.url?'Источник':item.name||'Источник',label=item.date_label||'проверено';
    const key=JSON.stringify([name,label]);
    if(!groups.has(key))groups.set(key,{name,date_label:label,dates:[]});
    const dates=groups.get(key).dates,date=item.checked_at||'дата не указана';
    if(!dates.includes(date))dates.push(date);
  }
  return [...groups.values()].map(group=>serviceSourceCaption({...group,checked_at:group.dates.join(', ')})).join('; ');
}
export function walkingBooklet(snapshot) {
  const day=snapshot.days?.[0];
  if(snapshot.days?.length!==1 || snapshot.transport_receipt || !day?.record ||
    day.record.schedule?.mode!=='foot' || day.kosa || day.transport_plans?.length ||
    day.services?.length || day.bookings?.length ||
    day.expenses || Object.keys(day.record.costs||{}).length || !day.stops?.length ||
    (day.entries||[]).some(entry=>entry.kind!=='place'))return null;
  const sources=[],bySource=new Map();
  const reference=source=>{
    if(!source)return '';
    // One URL has one reference number. Keep every dated observation instead
    // of silently replacing older checks with the newest date.
    const key=JSON.stringify(source.url?['url',source.url]:['name',source.name||'']);
    if(!bySource.has(key)){bySource.set(key,sources.length+1);sources.push({...source,number:sources.length+1,observations:[]});}
    const observations=sources[bySource.get(key)-1].observations;
    if(!observations.some(item=>item.name===source.name&&item.checked_at===source.checked_at&&item.date_label===source.date_label))observations.push({...source});
    return `[${bySource.get(key)}]`;
  };
  const calculations=new Map();
  const rows=(day.rows||[]).map(row=>{
    // Keep original row text and typed issues in the attachment. Only the
    // reading view separates repeated calculation notes from visit constraints.
    const structured=row.kind==='visit'&&typeof row.detail_text==='string'&&Array.isArray(row.issue_notes);
    if(structured)for(const issue of row.issue_notes.filter(groupedIssue)){
      const key=JSON.stringify([issue.code,issue.text]);
      if(!calculations.has(key))calculations.set(key,{code:issue.code,text:issue.text,places:[]});
      const places=calculations.get(key).places;if(!places.includes(row.title))places.push(row.title);
    }
    return {...row,plan_text:structured?[row.detail_text,...row.issue_notes.filter(issue=>!groupedIssue(issue)).map(issue=>issue.text)].filter(Boolean).join(' '):row.text,
      references:[...new Set([row.source,...(row.sources||[])].filter(Boolean).map(reference))]};
  });
  const visits=rows.filter(row=>row.kind==='visit'),structured=visits.length>0&&visits.every(row=>typeof row.detail_text==='string'&&Array.isArray(row.issue_notes));
  const entries=day.entries||day.stops.map((p,i)=>({kind:'place',id:p.id,number:i+1}));
  const cards=entries.map(entry=>{
    const place=day.stops.find(p=>p.id===entry.id);
    if(!place)return null;
    const conditions=[];
    for(const item of [...(place.conditions||[]),...(day.access?.entries||[]).filter(r=>r.extent==='place'&&(r.poi===place.id||r.applies_to?.some(p=>p.poi===place.id)))]){
      const key=String(item.text||'').replace(/\s+/g,' ').trim();
      if(!key)continue;
      const ref=reference(item.source);
      const prior=conditions.find(c=>c.text===key);
      if(prior){if(ref&&!prior.references.includes(ref))prior.references.push(ref);continue;}
      conditions.push({text:key,references:ref?[ref]:[]});
    }
    return {place,number:entry.number,conditions,reference:reference({name:place.name,url:place.source,checked_at:place.checkedAt})};
  });
  if(cards.some(card=>!card))return null;
  const access=(day.access?.entries||[]).filter(row=>row.extent!=='place'||!day.stops.some(p=>p.id===row.poi||row.applies_to?.some(v=>v.poi===p.id)))
    .map(row=>({...row,reference:reference(row.source)}));
  const meals=(day.menu_choices||[]).map(meal=>({...meal,reference:reference(meal.source)}));
  return {day,rows,cards,access,meals,sources,calculation_notes:[...calculations.values()],summary:structured&&day.status==='needs_check'?'':day.summary};
}
