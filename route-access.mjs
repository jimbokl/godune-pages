// One sourced profile for the published walk, its preview and the saved day.
const dateValid=value=>typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
export function accessSourceValid(source) {
  if(!source || typeof source.name!=='string' || !source.name.trim() || !dateValid(source.checked_at) || !['official_source','field_checked','map_estimate'].includes(source.verification))return false;
  try {const url=new URL(source.url);return url.protocol==='https:' && !!url.hostname && !url.username && !url.password;}catch{return false;}
}
export function mobilityEvidenceValid(value) {
  return !!value && value.version===1 && ['present','none','unknown'].includes(value.stairs)
    && ['passable','blocked','unknown'].includes(value.stroller) && ['segment','place','route'].includes(value.extent);
}
export const accessExtentLabel={route:'Линия прогулки',place:'На месте',segment:'Отдельный участок'};
export function routeAccessProfile(choice,catalog) {
  const entries=[],stops=choice.stops || (choice.places || []).map(poi=>({poi}));
  if(mobilityEvidenceValid(choice.mobility) && accessSourceValid(choice.mobility.source) && typeof choice.mobility.text==='string' && choice.mobility.text.trim()) {
    entries.push({id:'route-line',name:choice.name || 'Линия прогулки',label:'По карте маршрута',text:choice.mobility.text,
      ...structuredClone(choice.mobility),source:structuredClone(choice.mobility.source),poi:null});
  }
  for(const stop of stops) {
    const point=catalog.poi.find(point=>point.slug===stop.poi);if(!point)continue;
    for(const fact of point.visit_conditions || []) {
      if(fact.kind!=='access' || !accessSourceValid(fact.source) || typeof fact.text!=='string' || !fact.text.trim() || stop.visit_scope==='outside' && fact.scope==='service')continue;
      entries.push({id:`${point.slug}:${fact.id}`,poi:point.slug,name:point.name,label:fact.label || 'Условия посещения',text:fact.text,
        ...(mobilityEvidenceValid(fact.mobility)?structuredClone(fact.mobility):{extent:'place',stairs:'unknown',stroller:'unknown'}),
        scope:fact.scope,source:structuredClone(fact.source)});
    }
  }
  const distinct=[],groups=new Map();
  for(const row of entries){
    if(!row.poi){distinct.push(row);continue;}
    const key=JSON.stringify([row.label,row.text,row.extent,row.stairs,row.stroller,row.scope || null,row.source.name,row.source.url,row.source.checked_at,row.source.verification]);
    const existing=groups.get(key);
    if(existing){if(!existing.applies_to.some(point=>point.poi===row.poi))existing.applies_to.push({poi:row.poi,name:row.name});existing.name=existing.applies_to.map(point=>point.name).join('; ');}
    else{row.applies_to=[{poi:row.poi,name:row.name}];groups.set(key,row);distinct.push(row);}
  }
  const stairs=distinct.some(row=>row.stairs==='present'),blocked=distinct.some(row=>row.stroller==='blocked'),partial=distinct.some(row=>row.stroller==='passable' && row.extent!=='route');
  return {version:1,route_id:choice.slug || null,entries:distinct,stairs:stairs?'present':'unknown',stroller:blocked?'blocked':partial?'partial':'unknown',
    summary:stairs?'Есть сведения о лестницах':partial?'Есть сведения о проходе с коляской на отдельных участках':'Проход на всём пути ещё не проверен',
    gaps:['Проход без лестниц и с коляской на всём пути ещё не проверен.','Покрытие, уклон и места для отдыха по всей линии ещё нужно уточнить.']};
}
export function tripAccessProfile(trip,catalog) {
  const day=trip.itinerary?.days.find(row=>row.id===trip.itinerary.active),places=[...new Set([...(day?.kosa_plan?['vysota-efa',...(day.kosa_plan.walks==='two'?['tancuyushchiy-les']:[])]:[]),...(trip.places || [])])];
  const candidates=[...(catalog.routes || []),...(catalog.day_waves?.recipes || [])];
  const recipe=candidates.find(row=>row.slug===day?.wave?.recipe);
  // A saved recipe's geometry does not describe reordered stops, another ending
  // or a driving day. Keep the local facts when that geometry no longer applies.
  const rail=trip.schedule?.rail,service=catalog.rail_services?.find(row=>row.id===rail?.service);
  const walkEnd=service && rail?.access && service.arrival_poi===rail.access.station?rail.access.station:day?.night_at;
  const same=recipe && !day?.bookings?.length && (trip.schedule?.mode || 'foot')==='foot'
    && JSON.stringify(recipe.stops.map(stop=>stop.poi))===JSON.stringify(places)
    && (!recipe.return_to || walkEnd===recipe.return_to);
  const choice={...(same?recipe:{}),places,stops:places.map(poi=>({poi,visit_scope:trip.schedule?.stops?.[poi]?.visit_scope})),name:same?recipe.name:'Ваш день'};
  return routeAccessProfile(choice,catalog);
}
