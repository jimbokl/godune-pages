import {journeyDays,selectedDay,tripHasDraft} from './trip-days-state.mjs?v=23';
import {tripSignature} from './trip-light.mjs?v=13';
import {regionMapStyle} from './region-map.mjs?v=6';
import {bindMapTheme} from './map-theme.mjs?v=2';
import {downloadedMap,localMapStyle} from './offline-map.mjs?v=6';
import {loadTripTravelMatrix,tripRoadFeatures} from './travel-estimates.mjs?v=11';
import {waveLabel} from './day-wave.mjs?v=2';
import {vehicleArrival} from './day-mobility.mjs?v=3';
import {layoutMapMarkers} from './map-marker-layout.mjs?v=1';

const el=(tag,className,text)=>{const node=document.createElement(tag);node.className=className || '';if(text)node.textContent=text;return node;};
function disclose(node,title,id) {
  if(!node)return null;
  const details=el('details','day-disclosure');if(id)details.id=id;
  const summary=el('summary','',title);node.before(details);details.append(summary,node);return details;
}
export function workspaceSummary(trip) {
  const days=journeyDays(trip),day=selectedDay(trip);
  return {days:days.length,stops:trip.places.length,hasTrip:tripHasDraft(trip),name:day.name || waveLabel(day.wave) || `День ${Math.max(0,days.findIndex(row=>row.id===day.id))+1}`};
}
export function workspacePoints(trip,catalog) {
  const saved=selectedDay(trip).kosa_plan;
  const stops=saved&&['one','two'].includes(saved.walks)?['vysota-efa',...(saved.walks==='two'?['tancuyushchiy-les']:[]),...trip.places]:trip.places;
  return [...new Set(stops)].map(id=>catalog.poi.find(p=>p.slug===id)).filter(Boolean);
}
export function workspaceVehiclePoint(trip,catalog) {
  const arrival=vehicleArrival(trip,catalog),anchor=arrival?.anchor;
  if(!anchor || !Number.isFinite(anchor.lat) || !Number.isFinite(anchor.lon)
    || Math.abs(anchor.lat)>90 || Math.abs(anchor.lon)>180)return null;
  return {...anchor,mode:arrival.vehicle.mode,via:arrival.vehicle.via};
}
let library;
function mapLibrary(base) {
  if(window.maplibregl)return Promise.resolve(window.maplibregl);
  if(!library)library=new Promise((resolve,reject)=>{
    const css=el('link');css.rel='stylesheet';css.href=new URL('assets/vendor/maplibre/maplibre-gl.css',base);document.head.append(css);
    const script=el('script');script.src=new URL('assets/vendor/maplibre/maplibre-gl.js',base);
    script.onload=()=>resolve(window.maplibregl);script.onerror=()=>reject(new Error('map_library'));document.head.append(script);
  }).catch(error=>{library=null;throw error;});
  return library;
}

function initDayMap({mount,read,base,catalog,onSelect}) {
  const frame=mount.querySelector('.day-map-canvas'),status=mount.querySelector('.day-map-status');
  let map,mapLib,markers=[],parkingDetail,parkingButton,parkingPin,stopDetail,stopReturn=[],leaders,layoutFrame=0,displayPoints=[],context='',signature='',revision=0,visible=false,loading=false,failed=false;
  const stopMarkers=new Map();
  const setStatus=text=>{status.textContent=text;};
  const closeStops=(restoreFocus=true)=>{
    stopDetail?.remove();stopDetail=null;
    for(const row of stopMarkers.values())row.button.setAttribute('aria-expanded','false');
    if(restoreFocus){const row=[...stopMarkers.values()].find(row=>row.ids.includes(stopReturn[0]));row?.button.focus();}
    stopReturn=[];
  };
  const resetStops=()=>{closeStops(false);for(const row of stopMarkers.values())row.marker.remove();stopMarkers.clear();leaders?.replaceChildren();};
  const selectStop=point=>{
    closeStops(false);onSelect?.(point.slug);
    const card=document.querySelector(`#trip-plan-stops [data-plan-point="${point.slug}"],#trip-plan-stops [data-journey-poi="${point.slug}"]`);
    if(card){card.tabIndex=-1;card.focus({preventScroll:true});card.scrollIntoView({block:'center',behavior:'auto'});}
  };
  const closeParking=(restoreFocus=true)=>{
    parkingDetail?.remove();parkingDetail=null;
    parkingButton?.setAttribute('aria-expanded','false');
    if(restoreFocus&&parkingButton?.isConnected)parkingButton.focus();
    parkingButton=null;
  };
  const openStops=(button,members)=>{
    if(button.getAttribute('aria-expanded')==='true'){closeStops();return;}
    closeParking(false);closeStops(false);stopReturn=members.map(p=>p.slug);
    const detail=el('section','day-parking-detail day-stops-detail');detail.id='day-stops-detail';detail.tabIndex=-1;detail.setAttribute('aria-labelledby','day-stops-title');
    const heading=el('div','day-parking-heading'),title=el('h4','','Места рядом');title.id='day-stops-title';
    const close=el('button','day-parking-close','×');close.type='button';close.setAttribute('aria-label','Закрыть список мест');close.addEventListener('click',()=>closeStops());
    heading.append(title,close);detail.append(heading,el('p','','Выберите остановку — откроем её в вашем дне.'));
    const list=el('ol','day-map-choices');
    for(const point of members){const item=el('li'),choice=el('button','',`${point.index+1}. ${point.name}`);choice.type='button';choice.dataset.dayMapChoose=point.slug;choice.addEventListener('click',()=>selectStop(point));item.append(choice);list.append(item);}
    detail.append(list);frame.after(detail);stopDetail=detail;button.setAttribute('aria-expanded','true');
    detail.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();closeStops();}});detail.focus({preventScroll:true});detail.scrollIntoView({block:'nearest',behavior:'auto'});
  };
  function layoutStops() {
    if(!map||!mapLib||!displayPoints.length)return;
    const rect=frame.getBoundingClientRect();if(rect.width<44||rect.height<44)return;
    const points=displayPoints.map((point,index)=>({...point,index,...map.project([point.lon,point.lat])}));
    const obstacles=[{left:rect.width-56,right:rect.width,top:0,bottom:100}];
    if(parkingPin){const pin=parkingPin.getBoundingClientRect(),label=parkingPin.querySelector('.day-map-parking-label').getBoundingClientRect();obstacles.push({left:Math.min(pin.left,label.left)-rect.left,right:Math.max(pin.right,label.right)-rect.left,top:Math.min(pin.top,label.top)-rect.top,bottom:pin.bottom-rect.top+23});}
    const rows=layoutMapMarkers(points,{width:rect.width,height:rect.height,obstacles}),keys=new Set(),active=[...stopMarkers.values()].find(row=>row.button===document.activeElement)?.ids;
    const svg=[];
    for(const row of rows){
      const ids=row.members.map(p=>p.slug),key=ids.join('|');keys.add(key);let current=stopMarkers.get(key);
      if(!current){
        const group=row.members.length>1,button=el('button',`day-map-dot${group?' day-map-group':''}`);button.type='button';button.dataset.dayMapStops=JSON.stringify(row.members.map(p=>({id:p.slug,number:p.index+1})));
        if(group){button.dataset.dayMapGroup=key;button.append(el('span','',String(row.members.length)),el('small','',row.members.length%100>=11&&row.members.length%100<=14||row.members.length%10===0||row.members.length%10>=5?'мест':row.members.length%10===1?'место':'места'));button.setAttribute('aria-label',`Места рядом: ${row.members.map(p=>`${p.index+1}. ${p.name}`).join('; ')}`);button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','day-stops-detail');button.addEventListener('click',()=>openStops(button,row.members));}
        else {const point=row.members[0];button.textContent=String(point.index+1);button.dataset.dayMapPoint=point.slug;button.dataset.lat=String(point.lat);button.dataset.lon=String(point.lon);button.setAttribute('aria-label',`${point.index+1}. ${point.name}`);button.addEventListener('click',()=>selectStop(point));}
        current={ids,button,marker:new mapLib.Marker({element:button}).setLngLat([row.members[0].lon,row.members[0].lat]).addTo(map)};stopMarkers.set(key,current);
      }
      const point=row.members[0],anchor=row.members.length===1?[point.lon,point.lat]:map.unproject([row.anchor.x,row.anchor.y]);
      current.marker.setLngLat(anchor).setOffset([row.x-row.anchor.x,row.y-row.anchor.y]);current.button.hidden=!row.visible;
      current.button.setAttribute('aria-pressed',String(row.members.some(p=>document.querySelector(`[data-plan-point="${p.slug}"][data-day-selected="true"]`))));
      if(stopDetail&&ids.some(id=>stopReturn.includes(id)))current.button.setAttribute('aria-expanded','true');
      if(row.visible)for(const origin of row.members){const dx=row.x-origin.x,dy=row.y-origin.y,distance=Math.hypot(dx,dy);if(distance<3)continue;const line=document.createElementNS('http://www.w3.org/2000/svg','line');line.setAttribute('x1',origin.x);line.setAttribute('y1',origin.y);line.setAttribute('x2',row.x-dx/distance*22);line.setAttribute('y2',row.y-dy/distance*22);const dot=document.createElementNS('http://www.w3.org/2000/svg','circle');dot.setAttribute('cx',origin.x);dot.setAttribute('cy',origin.y);dot.setAttribute('r',3);svg.push(line,dot);}
    }
    for(const [key,row] of stopMarkers)if(!keys.has(key)){row.marker.remove();stopMarkers.delete(key);}
    if(active&&!frame.contains(document.activeElement)){[...stopMarkers.values()].find(row=>row.ids.includes(active[0]))?.button.focus({preventScroll:true});}
    if(!leaders){leaders=document.createElementNS('http://www.w3.org/2000/svg','svg');leaders.classList.add('day-map-leaders');leaders.setAttribute('aria-hidden','true');frame.append(leaders);}
    leaders.setAttribute('viewBox',`0 0 ${rect.width} ${rect.height}`);leaders.replaceChildren(...svg);mount.dataset.markersReady='true';
  }
  const queueLayout=()=>{if(layoutFrame)return;mount.dataset.markersReady='false';layoutFrame=requestAnimationFrame(()=>{layoutFrame=0;layoutStops();});};
  async function render(force=false) {
    if(!visible || loading)return;
    const trip=read(),next=tripSignature(trip);if(next===signature&&!force)return;
    signature=next;const ticket=++revision;
    mount.dataset.mapReady='false';delete mount.dataset.mapFailure;
    closeParking(false);resetStops();displayPoints=[];parkingPin=null;
    const points=workspacePoints(trip,catalog),parking=workspaceVehiclePoint(trip,catalog),mapPoints=[...points,...(parking?[parking]:[])],generated=!!selectedDay(trip).kosa_plan;
    if(!mapPoints.length){markers.forEach(m=>m.remove());markers=[];map?.getSource('walk')?.setData({type:'FeatureCollection',features:[]});setStatus(selectedDay(trip).kosa_plan?'Карты троп и пересадки — в поездке на косу. Автобусные участки не рисуем как пешую прогулку.':'Добавьте место — оно появится на карте.');return;}
    setStatus('Открываем карту дня…');loading=true;
    try {
      const lib=await mapLibrary(base);mapLib=lib;
      if(typeof lib.supported==='function'&&!lib.supported())throw new Error('webgl_unavailable');
      const local=await downloadedMap(base,null,mapPoints).catch(()=>null);
      const key=local?.route || 'region';
      if(map && context!==key){leaders?.remove();leaders=null;map.remove();map=null;markers=[];}
      if(!map) {
        context=key;failed=false;
        map=new lib.Map({container:frame,style:local && local.kind!=='region'?localMapStyle(local):regionMapStyle(base,local || {}),center:[mapPoints[0].lon,mapPoints[0].lat],zoom:13,attributionControl:false});
        map.addControl(new lib.NavigationControl({showCompass:false}),'top-right');
        map.addControl(new lib.AttributionControl({compact:false}),'bottom-right');
        map.on('idle',()=>{mount.dataset.mapTheme=document.documentElement.dataset.theme;});
        map.on('move',queueLayout);map.on('resize',queueLayout);
        map.on('error',()=>{failed=true;setStatus('Подложка не загрузилась полностью. Остановки доступны в списке.');});
        await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('map_timeout')),15000);map.once('load',()=>{clearTimeout(timer);resolve();});});
        map.addSource('walk',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
        map.addLayer({id:'walk-line',type:'line',source:'walk',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#986339','line-width':4}});
        bindMapTheme(map);
      }
      if(ticket!==revision || next!==tripSignature(read()))return;
      map.resize();markers.forEach(m=>m.remove());markers=[];
      if(parking) {
        const label=parking.mode==='car'?'Машина':'Велосипед',button=el('button','day-map-parking');button.type='button';
        button.dataset.dayMapParking=parking.via;button.dataset.lon=String(parking.lon);button.dataset.lat=String(parking.lat);
        button.append(el('span','day-map-parking-symbol','P'),el('span','day-map-parking-label',label));
        button.setAttribute('aria-label',`${label}: ${parking.name}. Парковка в вашем плане`);button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','day-parking-detail');
        button.addEventListener('click',event=>{
          event.stopPropagation();
          if(button.getAttribute('aria-expanded')==='true'){closeParking();return;}
          closeStops(false);closeParking(false);parkingButton=button;
          const detail=el('section','day-parking-detail');detail.id='day-parking-detail';detail.tabIndex=-1;detail.setAttribute('aria-labelledby','day-parking-title');
          const heading=el('div','day-parking-heading'),title=el('h4','','Парковка в вашем плане');title.id='day-parking-title';
          const close=el('button','day-parking-close','×');close.type='button';close.setAttribute('aria-label','Закрыть подробности парковки');close.addEventListener('click',()=>closeParking());
          heading.append(title,close);detail.append(heading,el('p','day-parking-name',parking.name),el('p','',`GPS: ${parking.lat.toFixed(5)}, ${parking.lon.toFixed(5)}`));
          if(parking.note)detail.append(el('p','',parking.note));
          if(parking.source)detail.append(el('p','day-parking-source',`${parking.source.name}. Проверено: ${parking.source.checked_at}.`));
          frame.after(detail);parkingDetail=detail;
          button.setAttribute('aria-expanded','true');
          detail.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();closeParking();}});
          detail.focus({preventScroll:true});
          detail.scrollIntoView({block:'nearest',behavior:'auto'});
        });
        markers.push(new lib.Marker({element:button,anchor:'bottom',offset:[0,-20]}).setLngLat([parking.lon,parking.lat]).addTo(map));
        parkingPin=button;
      }
      const bounds=new lib.LngLatBounds();mapPoints.forEach(point=>bounds.extend([point.lon,point.lat]));map.fitBounds(bounds,{padding:parking?{top:140,bottom:65,left:65,right:65}:55,maxZoom:15,duration:0});
      displayPoints=points;layoutStops();
      const matrix=generated?null:await loadTripTravelMatrix(base,trip,catalog).catch(()=>null),roads=generated?{type:'FeatureCollection',features:[]}:await tripRoadFeatures(trip,catalog,matrix,base);
      if(ticket!==revision || next!==tripSignature(read()))return;
      map.getSource('walk').setData(roads);
      if(!failed)setStatus((generated?'Метки — Эфа и выбранные места. Карты троп и пересадки — в поездке на косу; автобусные участки здесь не соединены пешей линией.':roads.features.length?'Линии — рассчитанные участки по открытой карте. Входы и доступ сверьте перед выходом.':'Показаны остановки. Дорога между ними ещё не уточнена.')+(parking?` Метка «${parking.mode==='car'?'Машина':'Велосипед'}» — парковка в вашем плане.`:''));
      mount.dataset.mapReady='true';
    } catch(error) {
      mount.dataset.mapFailure=error?.message || 'map_error';
      resetStops();leaders?.remove();leaders=null;map?.remove();map=null;markers=[];signature='';mount.dataset.mapReady='false';
      setStatus('Карта сейчас недоступна. Ваш день и остановки остаются в списке.');
    } finally {
      loading=false;
      if(signature && signature!==tripSignature(read()))render();
    }
  }
  const observer=new IntersectionObserver(entries=>{if(entries.some(row=>row.isIntersecting)){visible=true;render();}},{rootMargin:'100px'});observer.observe(frame);
  mount.querySelector('[data-day-map-retry]').addEventListener('click',()=>{visible=true;render(true);});
  const resize=new ResizeObserver(()=>map?.resize());resize.observe(frame);
  return {render,show(){visible=true;map?.resize();render();},focus(id){const point=catalog.poi.find(row=>row.slug===id);if(point&&map){map.flyTo({center:[point.lon,point.lat],zoom:15,duration:0});}}};
}

export function initDayWorkspace({mount,read,base,catalog}) {
  const guideLink=el('a','day-guide-link','Открыть гида по этому дню →');guideLink.href=new URL('guide/',base);
  if(!mount)return {render(){}};
  const planner=document.body.dataset.tool==='planner',journey=mount.querySelector('.trip-journey');
  if(!journey)return {render(){}};
  mount.dataset.dayWorkspace=planner?'planner':'home';
  const bookings=disclose(journey.querySelector('#trip-bookings'),'Билеты и ночёвка','day-booking-tools');
  const expenses=disclose(journey.querySelector('.trip-expenses'),'Расходы дня','day-expense-tools');
  const tools=disclose(journey.querySelector('.journey-tools'),'Добавить или изменить день','journey-actions');
  const inspiration=mount.querySelector('.workshop-inspiration');
  if(!planner) {
    disclose(mount.querySelector('#trip-rail'),'Электрички и дорога','day-rail-tools');
    const link=el('a','button button-dark','Открыть мой день →');link.href=new URL('planner/',base);journey.querySelector('.journey-heading').after(link);
    return {render(){const summary=workspaceSummary(read());bookings.querySelector('summary').textContent=`Билеты и ночёвка${summary.hasTrip?' · уточнить':''}`;}};
  }
  document.body.classList.add('day-planner');
  const starters=journey.querySelector('.journey-starters');if(starters&&tools)tools.append(starters);
  const settings=document.querySelector('#planner-trip-settings');settings.open=true;
  const work=el('div','day-workspace'),thread=el('div','day-thread'),aside=el('aside','day-map-panel');aside.setAttribute('aria-label','Карта выбранного дня');
  const tabs=el('div','day-view-tabs');tabs.setAttribute('aria-label','Вид дня');
  for(const [value,title] of [['list','Мой день'],['map','Карта']]){const button=el('button','',title);button.type='button';button.dataset.dayView=value;button.setAttribute('aria-pressed',String(value==='list'));tabs.append(button);}
  const header=el('div','day-toolbar'),name=el('p','day-name');name.id='day-workspace-name';
  const actions=el('div','day-main-actions'),share=mount.querySelector('#trip-share');if(share){share.textContent='Взять с собой ↗';actions.append(share);}
  const add=el('a','day-add-place','＋ Добавить место');add.href=new URL('map/',base);actions.append(add);
  actions.append(guideLink);header.append(name,actions);journey.querySelector('#journey-days').after(header);
  const dates=mount.querySelector('.trip-dates');if(dates)header.prepend(dates);
  header.after(tabs,work);work.dataset.view='list';work.append(thread,aside);
  const empty=el('div','day-empty');empty.innerHTML='<p class="eyebrow">Впереди целый день</p><h3>С чего начнём?</h3><p>Выберите готовую прогулку или добавьте свои места.</p><button class="button button-dark" type="button" data-day-start>Выбрать прогулку →</button>';thread.append(empty);
  const timeline=mount.querySelector('.trip-schedule');if(timeline)thread.append(timeline);
  const draft=mount.querySelector('#trip-draft');if(draft){thread.append(draft);disclose(draft,'Изменить порядок и остановки','day-stop-tools');}
  aside.innerHTML='<div class="day-map-heading"><h3>Ваш путь</h3><a data-full-map>Открыть карту ↗</a></div><div class="day-map-canvas" role="region" aria-label="Собственная карта остановок"></div><p class="day-map-status" role="status">Добавьте место — оно появится на карте.</p><button class="day-map-retry" type="button" data-day-map-retry>Обновить карту</button>';
  aside.querySelector('[data-full-map]').href=new URL('map/?view=trip',base);
  const selectPoint=id=>{
    thread.querySelectorAll('[data-plan-point],[data-journey-poi]').forEach(node=>{node.dataset.daySelected=String((node.dataset.planPoint || node.dataset.journeyPoi)===id);});
    aside.querySelectorAll('[data-day-map-stops]').forEach(node=>{node.setAttribute('aria-pressed',String(JSON.parse(node.dataset.dayMapStops).some(point=>point.id===id)));});
  };
  const dayMap=initDayMap({mount:aside,read,base,catalog,onSelect:id=>{
    work.dataset.view='list';tabs.querySelectorAll('button').forEach(node=>node.setAttribute('aria-pressed',String(node.dataset.dayView==='list')));selectPoint(id);
  }});
  thread.addEventListener('click',event=>{
    if(event.target.closest('a,button,input,select,summary'))return;
    const card=event.target.closest('[data-plan-point]');if(card){selectPoint(card.dataset.planPoint);dayMap.focus(card.dataset.planPoint);}
  });
  const extras=el('div','day-extras');work.after(extras);
  for(const node of [bookings,expenses,journey.querySelector('#journey-details'),journey.querySelector('#journey-overview'),tools])if(node)extras.append(node);
  const more=el('details','day-disclosure day-more');more.id='day-more-tools';more.append(el('summary','','Дорога, погода и память'));extras.after(more);
  for(const node of [mount.querySelector('#trip-rail'),mount.querySelector('#trip-weather'),mount.querySelector('#trip-utilities')])if(node)more.append(node);
  if(inspiration){const explore=el('details','day-disclosure day-explore');explore.append(el('summary','','Ещё идеи для вашего дня'),inspiration);more.after(explore);}
  empty.querySelector('[data-day-start]').addEventListener('click',()=>{const wizard=document.querySelector('#planner-new-day');wizard.open=true;wizard.scrollIntoView({block:'start'});});
  document.querySelector('#planner-new-day')?.addEventListener('click',event=>{
    if(event.target.closest('a[href="#my-trip"]'))document.querySelector('#planner-new-day').open=false;
  });
  tabs.addEventListener('click',event=>{const button=event.target.closest('[data-day-view]');if(!button)return;work.dataset.view=button.dataset.dayView;tabs.querySelectorAll('button').forEach(node=>node.setAttribute('aria-pressed',String(node===button)));if(button.dataset.dayView==='map')dayMap.show();});
  let initialized=false;
  return {render(){
    const trip=read(),summary=workspaceSummary(trip),n=summary.stops;name.textContent=selectedDay(trip).kosa_plan?'День на куршской волне · дорога и возвращение':`${summary.name} · ${n} ${n%100>=11&&n%100<=14?'остановок':n%10===1?'остановка':n%10>=2&&n%10<=4?'остановки':'остановок'}`;
    empty.hidden=summary.stops>0 || !!selectedDay(trip).kosa_plan || !!trip.schedule?.rail;
    if(!initialized){const wizard=document.querySelector('#planner-new-day');if(wizard&&summary.hasTrip&&!location.hash.includes('planning-wizard'))wizard.open=false;initialized=true;}
    const stopTools=document.querySelector('#day-stop-tools > summary');if(stopTools)stopTools.textContent=`Изменить порядок и остановки · ${summary.stops}`;
    const bookingsCount=selectedDay(trip).bookings?.length || 0;bookings.querySelector('summary').textContent=`Билеты и ночёвка${bookingsCount?` · ${bookingsCount}`:''}`;
    dayMap.render();
  }};
}
