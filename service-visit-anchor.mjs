// A service without a published map point still has an identity. Personal road
// estimates can refer to it; no coordinates or door accuracy are implied.
export function serviceVisitAnchor(visit,catalog){
 const place=visit?.event?.place_id&&catalog?.poi?.find(p=>p.slug===visit.event.place_id);
 if(place)return {id:`__timeline_service_${visit.id}`,name:visit.name,kind:'landmark',revision:`catalog:${place.slug}:${place.lat},${place.lon}`,location:{kind:'catalog',reference_kind:'poi',id:place.slug},source:null};
 if(visit?.selection?.visit?.kind!=='manual')return null;
 const p=visit.point;
 if(p)return {id:`__timeline_service_${visit.id}`,name:visit.name,kind:'landmark',revision:`point:${p.lat},${p.lon}`,
  location:{kind:'point',lat:p.lat,lon:p.lon},source:{reference:p.source_id,checked_at:p.checked_at,valid_from:null,valid_until:null}};
 const identity=visit.identity||{};
 return {id:`__timeline_service_${visit.id}`,name:visit.name,kind:'landmark',
  revision:JSON.stringify(['service',identity.place_id,identity.branch_id,visit.address]),
  location:{kind:'unknown'},source:null};
}
