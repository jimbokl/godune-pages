import {journeyDays,selectedDay,tripHasDraft} from './trip-days-state.mjs?v=22';
import {tripSignature} from './trip-light.mjs?v=12';
import {regionMapStyle} from './region-map.mjs?v=6';
import {bindMapTheme} from './map-theme.mjs?v=2';
import {downloadedMap,localMapStyle} from './offline-map.mjs?v=6';
import {loadTripTravelMatrix,tripRoadFeatures} from './travel-estimates.mjs?v=9';
import {waveLabel} from './day-wave.mjs?v=2';

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
  let map,markers=[],context='',signature='',revision=0,visible=false,loading=false,failed=false;
  const setStatus=text=>{status.textContent=text;};
  async function render(force=false) {
    if(!visible || loading)return;
    const trip=read(),next=tripSignature(trip);if(next===signature&&!force)return;
    signature=next;const ticket=++revision;
    const points=workspacePoints(trip,catalog),generated=!!selectedDay(trip).kosa_plan;
    if(!points.length){markers.forEach(m=>m.remove());markers=[];map?.getSource('walk')?.setData({type:'FeatureCollection',features:[]});setStatus(selectedDay(trip).kosa_plan?'Карты троп и пересадки — в поездке на косу. Автобусные участки не рисуем как пешую прогулку.':'Добавьте место — оно появится на карте.');return;}
    setStatus('Открываем карту дня…');loading=true;
    try {
      const lib=await mapLibrary(base);
      if(typeof lib.supported==='function'&&!lib.supported())throw new Error('webgl_unavailable');
      const local=await downloadedMap(base,null,points).catch(()=>null);
      const key=local?.route || 'region';
      if(map && context!==key){map.remove();map=null;markers=[];}
      if(!map) {
        context=key;failed=false;
        map=new lib.Map({container:frame,style:local && local.kind!=='region'?localMapStyle(local):regionMapStyle(base,local || {}),center:[points[0].lon,points[0].lat],zoom:13,attributionControl:false});
        map.addControl(new lib.NavigationControl({showCompass:false}),'top-right');
        map.addControl(new lib.AttributionControl({compact:false}),'bottom-right');
        map.on('error',()=>{failed=true;setStatus('Подложка не загрузилась полностью. Остановки доступны в списке.');});
        await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('map_timeout')),15000);map.once('load',()=>{clearTimeout(timer);resolve();});});
        map.addSource('walk',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
        map.addLayer({id:'walk-line',type:'line',source:'walk',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#986339','line-width':4}});
        bindMapTheme(map);
      }
      if(ticket!==revision || next!==tripSignature(read()))return;
      map.resize();markers.forEach(m=>m.remove());markers=[];
      points.forEach((point,index)=>{
        const button=el('button','day-map-dot',String(index+1));button.type='button';button.dataset.dayMapPoint=point.slug;button.setAttribute('aria-label',`${index+1}. ${point.name}`);
        button.addEventListener('click',()=>{
          onSelect?.(point.slug);
          const card=document.querySelector(`#trip-plan-stops [data-plan-point="${point.slug}"],#trip-plan-stops [data-journey-poi="${point.slug}"]`);
          if(card){card.tabIndex=-1;card.focus({preventScroll:true});card.scrollIntoView({block:'center',behavior:'auto'});}
        });
        markers.push(new lib.Marker({element:button}).setLngLat([point.lon,point.lat]).addTo(map));
      });
      const bounds=new lib.LngLatBounds();points.forEach(point=>bounds.extend([point.lon,point.lat]));map.fitBounds(bounds,{padding:55,maxZoom:15,duration:0});
      const matrix=generated?null:await loadTripTravelMatrix(base,trip,catalog).catch(()=>null),roads=generated?{type:'FeatureCollection',features:[]}:await tripRoadFeatures(trip,catalog,matrix,base);
      if(ticket!==revision || next!==tripSignature(read()))return;
      map.getSource('walk').setData(roads);
      if(!failed)setStatus(generated?'Метки — Эфа и выбранные места. Карты троп и пересадки — в поездке на косу; автобусные участки здесь не соединены пешей линией.':roads.features.length?'Линии — рассчитанные участки по открытой карте. Входы и доступ сверьте перед выходом.':'Показаны остановки. Дорога между ними ещё не уточнена.');
      mount.dataset.mapReady='true';
    } catch(error) {
      mount.dataset.mapFailure=error?.message || 'map_error';
      map?.remove();map=null;markers=[];signature='';mount.dataset.mapReady='false';
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
    aside.querySelectorAll('[data-day-map-point]').forEach(node=>{node.setAttribute('aria-pressed',String(node.dataset.dayMapPoint===id));});
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
