// Directory pins are geographic landmarks, never verified doors or walking time.
import {savedServiceContexts} from './service-context.mjs?v=16';
export function diningSpatialTemplate(rows){
 const ids=new Set(),anchors=[],candidates=[];
 for(const row of rows){
  if(typeof row.id!=='string'||!row.id||ids.has(row.id))throw Error('Не удалось прочитать места каталога.');
  ids.add(row.id);
  const id=`dining-pin:${row.id}`,known=!!(row.source?.reference&&row.source?.checked_at)&&Number.isFinite(row.lat)&&Number.isFinite(row.lon)&&Math.abs(row.lat)<=90&&Math.abs(row.lon)<=180;
  anchors.push({id,name:row.name||row.id,kind:'landmark',revision:known?`point:${row.lat},${row.lon}`:'unknown',location:known?{kind:'point',lat:row.lat,lon:row.lon}:{kind:'unknown'},source:row.source?.reference&&row.source?.checked_at?{reference:row.source.reference,checked_at:row.source.checked_at,valid_from:null,valid_until:null}:null});
  candidates.push({id:row.id,anchor_ids:[id]});
 }
 return {version:1,graph:{version:1,anchors,links:[]},candidates};
}
export function diningPublicContexts(catalog,area){
 const routes=catalog.routes.filter(route=>route.area===area);
 return savedServiceContexts({trip:{routes:routes.map(route=>route.slug)},catalog}).map(context=>({...context,id:`public-${context.id}`}));
}
