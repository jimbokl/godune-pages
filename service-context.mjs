// Scope selection and display only. Distances and eligibility belong to trip-core.
import {endBookingLabel,bookingEffects,effectiveBookingDay,bookingDate} from './trip-bookings-state.mjs?v=3';

const point = value => value && Number.isFinite(value.lat) && Number.isFinite(value.lon)
  && Math.abs(value.lat)<=90 && Math.abs(value.lon)<=180;

export function savedServiceContexts({day,trip,catalog}) {
  const contexts=[];
  const days=trip.itinerary?.days?.length?trip.itinerary.days:day?[day]:[];
  for(const [index,rawDay] of days.entries()) {
    if(!/^day-[1-9]\d*$/.test(rawDay?.id))continue;
    const current=effectiveBookingDay(rawDay);
    const date=bookingDate(current.date)?new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(current.date+'T12:00:00Z')):'без даты';
    const suffix=days.length>1?` · День ${index+1} · ${date}`:'';
    for(const [key,label] of [['night_at','Жильё'],['start_at','Начало дня'],['end_at',endBookingLabel(bookingEffects({itinerary:{active:rawDay.id,days:[rawDay]}}).end)]]) {
      const saved=current[key],place=typeof saved==='string'?catalog.poi.find(p=>p.slug===saved):saved;
      if(typeof saved!=='string'&&saved?.kind!=='personal'
        ||!point(place)||typeof place.name!=='string'||!place.name.trim())continue;
      contexts.push({id:`trip-point-${current.id}-${key}`,name:`${label}: ${place.name}${suffix}`,mode:'foot',scope:{kind:'point',point:{lat:place.lat,lon:place.lon}}});
    }
  }
  for(const id of trip.routes||[]) {
    const route=catalog.routes.find(r=>r.slug===id);
    const mode={walking:'foot',cycling:'bike',driving:'car'}[route?.mode];
    if(!mode||!['map_routed','field_checked'].includes(route.verification_status)
      ||!route.verified_at||!route.geometry_source||route.geometry?.type!=='LineString'
      ||!Array.isArray(route.geometry.coordinates)||route.geometry.coordinates.length<2)continue;
    const geometry=route.geometry.coordinates.map(c=>Array.isArray(c)&&c.length===2?{lon:c[0],lat:c[1]}:null);
    if(!geometry.every(point))continue;
    contexts.push({id:`trip-route-${route.id}`,name:route.name,mode,scope:{kind:'route',id:route.id,mode,geometry,
      source:{reference:route.geometry_source,checked_at:route.verified_at,valid_from:null,valid_until:null}}});
  }
  return contexts;
}

export function spatialRequest(fields,date,template,contexts) {
  const kind=String(fields.get('scope_kind')||'all');
  if(kind==='all')return null;
  if(!['point','route'].includes(kind))throw Error('Проверьте, где искать места.');
  const id=String(fields.get(`scope_${kind}`)||'');
  const context=contexts.find(c=>c.id===id&&c.scope.kind===kind);
  if(!context)throw Error(kind==='point'?'Укажите место, рядом с которым искать.':'Укажите прогулку, вдоль которой искать.');
  const radius=String(fields.get('radius_m')||'');
  if(!['500','1000','2000','5000'].includes(radius))throw Error('Проверьте расстояние для поиска.');
  return {...structuredClone(template),date,mode:context.mode,scope:structuredClone(context.scope),radius_m:Number(radius),strict:fields.has('spatial_strict')};
}

export function spatialMarkers(markers,nearby) {
  if(!nearby)return markers;
  return markers.map(marker=>{
    const location=nearby.matches.find(m=>m.id===marker.id)?.anchor?.location;
    return {...marker,point:location?.kind==='point'?[location.lon,location.lat]:null};
  });
}

export function showSpatialDistance(cards,nearby) {
  for(const [id,card] of cards) {
    const label=card.querySelector('[data-spatial-distance]');if(!label)continue;
    label.hidden=!nearby;if(!nearby){label.textContent='';continue;}
    const found=nearby.matches.find(m=>m.id===id);
    label.textContent=found?.distance_m!=null?`${found.distance_m} м на карте ${nearby.scope.kind==='point'?'от выбранного места':'от прогулки'}`
      :found?.status==='stale'?'Положение требует свежих сведений':'Положение нужно уточнить';
  }
}

export function bindServiceContext(form,page,onChange) {
  if(!form.elements.namedItem('scope_kind'))return {update(){},async prepare(){},async refresh(){},usesSaved(){return false;},request(){return null;}};
  const kind=form.elements.namedItem('scope_kind'),pointSelect=form.elements.namedItem('scope_point'),routeSelect=form.elements.namedItem('scope_route');
  const status=form.querySelector('[data-context-status]'),load=form.querySelector('[data-load-contexts]');
  let contexts=structuredClone(page.contexts||[]),pending;
  function update(){
    for(const name of ['point','route','radius']){
      const wrapper=form.querySelector(`[data-context-${name}]`),shown=name==='radius'?kind.value!=='all':kind.value===name;
      wrapper.hidden=!shown;wrapper.querySelector('select').disabled=!shown;
    }
    form.querySelector('[data-context-options]').hidden=kind.value==='all';
    form.elements.namedItem('spatial_strict').disabled=kind.value==='all';
    form.querySelector('[data-distance-sort]').disabled=kind.value==='all';
    if(kind.value==='all'&&form.elements.namedItem('sort').value==='distance')form.elements.namedItem('sort').value='relevance';
  }
  async function loadSaved(notify=true){
    if(pending)return pending;
    if(notify)onChange();load.disabled=true;status.textContent='Открываем сохранённую поездку…';
    pending=(async()=>{
      const {savedServiceDay}=await import('./trip-service-visits-ui.mjs?v=22');
      const saved=savedServiceContexts(await savedServiceDay(new URL('./',import.meta.url)));
      contexts=[...(page.contexts||[]),...saved];
      for(const [select,type] of [[pointSelect,'point'],[routeSelect,'route']]){
        const selected=select.value,empty=document.createElement('option');empty.value='';empty.textContent=type==='point'?'Выберите место':'Выберите прогулку';
        select.replaceChildren(empty,...contexts.filter(c=>c.scope.kind===type).map(c=>{const option=document.createElement('option');option.value=c.id;option.textContent=c.name;return option;}));
        if(selected&&!contexts.some(c=>c.id===selected&&c.scope.kind===type)){
          const missing=document.createElement('option');missing.value=selected;missing.textContent=type==='point'?'Место удалено из поездки — выберите другое':'Прогулка удалена из поездки — выберите другую';select.append(missing);
        }
        select.value=selected;
      }
      status.textContent=saved.length?'Места и прогулки поездки обновлены.':'В поездке пока нет места с координатами или сохранённой прогулки.';
      return saved;
    })().finally(()=>{pending=null;load.disabled=false;});
    return pending;
  }
  load.addEventListener('click',()=>{loadSaved().catch(()=>{status.textContent='Не получилось открыть ваш день. Попробуйте ещё раз.';});});
  kind.addEventListener('change',update);update();
  const usesSaved=fields=>['point','route'].includes(fields.get('scope_kind'))&&String(fields.get(`scope_${fields.get('scope_kind')}`)||'').startsWith('trip-');
  return {update,usesSaved,request:fields=>spatialRequest(fields,String(fields.get('date')||''),page.spatial,contexts),
    async refresh(fields){if(usesSaved(fields))await loadSaved(false);},
    async prepare(params){
      if(['sr_scope_point','sr_scope_route'].some(key=>params.get(key)?.startsWith('trip-')))await loadSaved(false);
    }};
}
