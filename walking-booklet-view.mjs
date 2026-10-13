// A walking day shares evidence between its plan, places and chosen dishes.
// Services, transport, expenses and bookings retain their complete chapters.
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
    const key=JSON.stringify([source.url||'',source.checked_at||'',source.url?'':source.name||'']);
    if(!bySource.has(key)){bySource.set(key,sources.length+1);sources.push({...source,number:sources.length+1});}
    return `[${bySource.get(key)}]`;
  };
  const rows=(day.rows||[]).map(row=>({...row,references:[...new Set([row.source,...(row.sources||[])].filter(Boolean).map(reference))]}));
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
  return {day,rows,cards,access,meals,sources};
}
