// Editorial guidance is separate from timing, bookings and visited-place records.
import {guideProvenance,guideProvenanceTranscript,guideSourceUrl} from './guide-provenance.mjs?v=2';
export const GUIDE_VERSION=1;
const slug=value=>typeof value==='string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const unique=values=>[...new Set(values)];
const cleanText=value=>typeof value==='string'?value.trim():'';

export function guidePlaces(catalog,request={}) {
  const known=new Map((catalog?.poi || []).map(point=>[point.slug,point]));
  let ids,title,context;
  if(Object.hasOwn(request,'point')){
    if(!known.has(request.point))throw Error('guide_unknown_point');
    ids=[request.point];title=known.get(request.point).name;context=`point:${request.point}`;
  } else if(Object.hasOwn(request,'route')){
    const route=[...(catalog?.routes || []),...(catalog?.day_waves?.version===1?catalog.day_waves.recipes || []:[])].find(row=>row.slug===request.route);
    if(!route || !route.stops?.length || !route.stops.every(stop=>known.has(stop.poi)))throw Error('guide_unknown_route');
    ids=route.stops.map(stop=>stop.poi);title=route.name;context=`route:${route.slug}`;
  } else {
    const trip=request.trip;
    ids=Array.isArray(trip?.places)?trip.places:[];
    const saved=trip?.itinerary?.days?.find(day=>day.id===trip.itinerary.active)?.kosa_plan;
    if(saved)ids=['vysota-efa',...(saved.walks==='two'?['tancuyushchiy-les']:[]),...ids];
    if(ids.some(id=>!known.has(id)))throw Error('guide_unknown_point');
    title='Ваш день';context=`day:${slug(trip?.itinerary?.active)?trip.itinerary.active:'current'}`;
  }
  return {title,context,points:unique(ids).map(id=>known.get(id))};
}

export function buildGuide(catalog,request={}) {
  const {title,context,points}=guidePlaces(catalog,request);
  const registry=catalog?.virtual_guide,stories=registry?.version===GUIDE_VERSION?registry.stories || {}:{};
  const stops=points.map(point=>{
    const authored=stories[point.slug];
    const hasStory=authored && Array.isArray(authored.story) && authored.story.length && authored.story.every(value=>cleanText(value));
    return {id:point.slug,name:point.name,area:point.area_name,lat:point.lat,lon:point.lon,
      story:hasStory?authored.story.map(cleanText):[cleanText(point.description)].filter(Boolean),
      focus:hasStory?cleanText(authored.focus):'',practical:cleanText(point.access_note || point.practical),
      source:guideSourceUrl(point.source_url),checkedAt:cleanText(point.verified_at),
      kind:hasStory?'field_note':'place_card',
      provenance:guideProvenance(registry,hasStory?authored:null),
      photo:(point.photos || []).find(path=>typeof path==='string' && /^assets\/[a-zA-Z0-9_./-]+$/.test(path) && !path.includes('..')) || null};
  });
  return {version:GUIDE_VERSION,title,context,stops};
}

export function guideProgress(guide,index) {
  if(!Number.isInteger(index) || index<0 || index>=guide.stops.length)throw Error('guide_invalid_position');
  return {version:GUIDE_VERSION,context:guide.context,order:guide.stops.map(stop=>stop.id),point:guide.stops[index].id};
}
export function restoreGuide(guide,record) {
  if(record?.version!==GUIDE_VERSION || record.context!==guide.context || !Array.isArray(record.order)
    || JSON.stringify(record.order)!==JSON.stringify(guide.stops.map(stop=>stop.id)))return 0;
  return Math.max(0,guide.stops.findIndex(stop=>stop.id===record.point));
}
export function guideTranscript(guide) {
  const lines=[`${guide.title} · GoDune`,'Рассказ по остановкам. Переход к главе не отмечает посещение.',''];
  guide.stops.forEach((stop,index)=>{
    lines.push(`${String(index+1).padStart(2,'0')} · ${stop.name}`,`${stop.lat}, ${stop.lon}`,...stop.story.map(text=>text+'\n'));
    if(stop.focus)lines.push('Посмотрите вокруг: '+stop.focus);
    lines.push(...guideProvenanceTranscript(stop));
    if(stop.practical)lines.push('Перед выходом: '+stop.practical);
    lines.push(`Карточка: https://godune.ru/poi/${stop.id}/`);
    if(stop.source)lines.push('Источник карточки: '+stop.source);
    if(stop.checkedAt)lines.push('Дата данных карточки: '+stop.checkedAt);
    lines.push('');
  });
  return lines.join('\n');
}
