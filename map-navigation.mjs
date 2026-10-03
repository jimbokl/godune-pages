// Device coordinates remain in this module's memory, never in trip state.
const earth = 6371008.8, rad = Math.PI / 180;
const empty = () => ({type:'FeatureCollection',features:[]});
export function readPosition(position) {
  const {longitude:lon,latitude:lat,accuracy} = position?.coords || {};
  const timestamp = position?.timestamp;
  if (![lon,lat,accuracy,timestamp].every(Number.isFinite) || Math.abs(lon)>180 || Math.abs(lat)>90 || accuracy<0 || timestamp<=0) return null;
  return {lon,lat,accuracy,timestamp};
}
export function accuracyArea(fix) {
  if (!fix || fix.accuracy>=Math.PI*earth) return empty();
  const phi=fix.lat*rad, lambda=fix.lon*rad, d=fix.accuracy/earth, ring=[];
  for(let i=0;i<=64;i++) {
    const angle=2*Math.PI*(i%64)/64;
    const lat=Math.asin(Math.sin(phi)*Math.cos(d)+Math.cos(phi)*Math.sin(d)*Math.cos(angle));
    const lon=lambda+Math.atan2(Math.sin(angle)*Math.sin(d)*Math.cos(phi),Math.cos(d)-Math.sin(phi)*Math.sin(lat));
    ring.push([lon/rad,lat/rad]);
  }
  return {type:'FeatureCollection',features:[{type:'Feature',properties:{accuracy:fix.accuracy},geometry:{type:'Polygon',coordinates:[ring]}}]};
}
export function within(fix,bbox) {return fix.lon>=bbox[0] && fix.lon<=bbox[2] && fix.lat>=bbox[1] && fix.lat<=bbox[3];}
export function neighborEntries(entries,anchor,project,radius=44) {
  const center=project([anchor.point.lon,anchor.point.lat]);
  return entries.map((entry,index)=>{const p=project([entry.point.lon,entry.point.lat]);return {entry,index,distance:Math.hypot(p.x-center.x,p.y-center.y)};})
    .filter(row=>row.distance<=radius).sort((a,b)=>a.distance-b.distance || a.index-b.index).map(row=>row.entry);
}
const element=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text)el.textContent=text;return el;};
const button=(text,className)=>{const el=element('button',className,text);el.type='button';return el;};
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initMapNavigation({map,root,bbox,local=false}) {
  const canvas=root.querySelector('#interactive-map');
  const shell=element('div','map-surface');canvas.before(shell);shell.append(canvas);
  const tools=element('div','map-location-tools');
  const locate=button('Где я','map-locate'),follow=button('Следовать','map-follow'),stop=button('Выключить GPS','map-gps-stop');
  locate.dataset.mapLocate='';follow.dataset.mapFollow='';stop.dataset.mapGpsStop='';
  follow.setAttribute('aria-pressed','false');follow.hidden=stop.hidden=true;
  const status=element('p','map-location-status','Покажите своё положение на карте.');status.setAttribute('role','status');
  const actions=element('div','map-location-actions');actions.append(locate,follow,stop);
  const note=element('p','map-location-note','Положение нужно только этой карте. В поездку оно не записывается.');
  tools.append(actions,status,note);shell.before(tools);
  const panel=element('section','map-choice');panel.hidden=true;panel.setAttribute('aria-label','Выбор места на карте');
  const heading=element('h3','map-choice-heading');heading.tabIndex=-1;
  const close=button('×','map-choice-close');close.setAttribute('aria-label','Закрыть выбор места');
  const head=element('div','map-choice-head'),body=element('div','map-choice-body');head.append(heading,close);panel.append(head,body);shell.append(panel);
  let entries=[],group=[],selected,origin,watch=null,revision=0,fix=null,following=false,needsCenter=false,gpsMarker=null,lastError='',destroyed=false;
  const geo=navigator.geolocation;
  const announce=text=>{if(status.textContent!==text)status.textContent=text;};
  const inside=()=>fix && within(fix,bbox);
  const old=()=>fix && Date.now()-fix.timestamp>120000;
  function textStatus() {
    if(!fix)return lastError || (watch!==null?'Ищем положение. Если браузер спросит, разрешите доступ.':'Покажите своё положение на карте.');
    const accuracy=fix.accuracy>=1000?`${(fix.accuracy/1000).toLocaleString('ru-RU',{maximumFractionDigits:1})} км`:`${Math.ceil(fix.accuracy)} м`;
    const time=new Date(fix.timestamp).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
    const coverage=inside()?'':`${local?' Вы вне скачанного фрагмента карты.':' Для этого положения подложка области не показана.'} Координаты ${fix.lat.toFixed(5)}, ${fix.lon.toFixed(5)}.`;
    return `${lastError?lastError+' Последняя точка. ':old()?'Положение не обновлялось больше двух минут. ':''}Точность ±${accuracy} · сигнал в ${time}.${coverage}`;
  }
  function refresh() {
    root.dataset.gpsState=watch===null?(lastError?'error':'off'):fix?(old() || lastError?'stale':'active'):'searching';
    follow.hidden=stop.hidden=watch===null;
    follow.setAttribute('aria-pressed',String(following));
    locate.textContent=watch!==null && !fix?'Ищем…':'Где я';locate.setAttribute('aria-busy',String(watch!==null && !fix));
    gpsMarker?.getElement().classList.toggle('is-stale',Boolean(old() || lastError));
    map.setPaintProperty('device-accuracy-fill','fill-opacity',old() || lastError ? .06 : .14);
    announce(textStatus());
  }
  function center(initial=false) {
    if(!fix || !inside())return;
    const camera={center:[fix.lon,fix.lat],duration:reduced()?0:350};
    if(initial)camera.zoom=Math.max(8,Math.min(16,16-Math.log2(Math.max(20,fix.accuracy)/20)));
    map.easeTo(camera);
  }
  function clearLocation(message='') {
    revision++;if(watch!==null)geo?.clearWatch(watch);watch=null;fix=null;following=false;needsCenter=false;lastError=message;
    gpsMarker?.remove();gpsMarker=null;map.getSource('device-accuracy')?.setData(empty());refresh();
  }
  function onPosition(position,token) {
    if(destroyed || token!==revision)return;
    const next=readPosition(position);if(!next || (fix && next.timestamp<fix.timestamp))return;
    const first=!fix;fix=next;lastError='';
    map.getSource('device-accuracy').setData(accuracyArea(fix));
    if(!gpsMarker){const dot=element('span','map-gps-dot');dot.setAttribute('aria-hidden','true');gpsMarker=new maplibregl.Marker({element:dot}).setLngLat([fix.lon,fix.lat]).addTo(map);}
    else gpsMarker.setLngLat([fix.lon,fix.lat]);
    if(following && !old())center(first || needsCenter);needsCenter=false;refresh();
  }
  function onError(error,token) {
    if(destroyed || token!==revision)return;
    if(error.code===1){clearLocation('Браузер не разрешил доступ к положению. Измените разрешение для сайта и нажмите «Где я».');return;}
    lastError=error.code===3?'Положение пока не найдено.':'Устройство пока не передало положение.';refresh();
  }
  function start() {
    if(watch!==null){following=true;center(true);refresh();return;}
    if(!globalThis.isSecureContext || !geo){lastError='Этот браузер не может показать положение. Карта и остановки доступны.';refresh();return;}
    lastError='';following=true;needsCenter=true;const token=++revision;
    try {watch=geo.watchPosition(p=>onPosition(p,token),e=>onError(e,token),{enableHighAccuracy:true,maximumAge:10000,timeout:20000});refresh();}
    catch {clearLocation('Положение пока недоступно. Нажмите «Где я», чтобы попробовать снова.');}
  }
  map.addSource('device-accuracy',{type:'geojson',data:empty()});
  map.addLayer({id:'device-accuracy-fill',type:'fill',source:'device-accuracy',paint:{'fill-color':'#3c83bc','fill-opacity':.14}});
  map.addLayer({id:'device-accuracy-line',type:'line',source:'device-accuracy',paint:{'line-color':'#3575a3','line-width':1.5,'line-opacity':.6,'line-dasharray':[3,2]}});
  const locateClick=()=>start(),followClick=()=>{following=!following;if(following)center(true);refresh();},stopClick=()=>clearLocation();
  locate.addEventListener('click',locateClick);follow.addEventListener('click',followClick);stop.addEventListener('click',stopClick);
  const moved=e=>{if(e.originalEvent && following){following=false;refresh();}};map.on('movestart',moved);
  const timer=setInterval(()=>{if(watch!==null)refresh();},15000);
  const hidden=()=>{if(document.hidden)clearLocation();};
  document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',stopClick);window.addEventListener('godune:memory-clearing',stopClick);
  if(root.tagName==='DIALOG')root.addEventListener('close',stopClick);

  function closeChoice(restore=false) {
    panel.hidden=true;body.replaceChildren();selected=null;group=[];
    entries.forEach(e=>e.element.classList.remove('is-selected'));
    if(restore && origin?.isConnected)origin.focus({preventScroll:true});
  }
  function detail(entry,focus=true) {
    selected=entry;panel.hidden=false;heading.textContent=entry.point.name;body.replaceChildren();
    entries.forEach(e=>e.element.classList.toggle('is-selected',e===entry));
    if(group.length>1){const back=button(`← Рядом на карте: ${group.length}`,'map-choice-back');back.addEventListener('click',()=>showGroup(group));body.append(back);}
    body.append(entry.content);if(focus)heading.focus({preventScroll:true});
  }
  function showGroup(neighbors,focus=true) {
    group=neighbors;selected=null;panel.hidden=false;heading.textContent='Рядом на карте';body.replaceChildren();
    const note=element('p','map-choice-note',`Мест в этом участке карты: ${group.length}. Выберите одно.`),list=element('ul','map-neighbor-list');
    group.forEach(entry=>{const li=element('li'),pick=button('','map-neighbor-pick');pick.dataset.mapChoose=entry.id;
      const name=element('strong','',entry.point.name),meta=element('small','',entry.meta || entry.point.category_name || 'Ваша точка');pick.append(name,meta);pick.addEventListener('click',()=>detail(entry));li.append(pick);list.append(li);});
    body.append(note,list);if(focus)list.querySelector('button')?.focus({preventScroll:true});
  }
  function pick(entry,event) {
    event.preventDefault();event.stopPropagation();origin=entry.element;
    const neighbors=neighborEntries(entries,entry,p=>map.project(p));group=neighbors;
    if(neighbors.length>1)showGroup(neighbors);else detail(entry);
  }
  const closeClick=()=>closeChoice(true);close.addEventListener('click',closeClick);
  const escape=e=>{if(e.key==='Escape' && !panel.hidden){e.preventDefault();e.stopPropagation();closeChoice(true);}};root.addEventListener('keydown',escape);
  const blank=()=>closeChoice();map.on('click',blank);
  function unbind(){entries.forEach(e=>e.element.removeEventListener('click',e.listener));}
  function counts() {
    entries.forEach(e=>{const count=neighborEntries(entries,e,p=>map.project(p)).length;e.element.dataset.neighbors=String(count);
      e.element.setAttribute('aria-label',e.label+(count>1?` · рядом на карте ещё ${count-1}`:''));});
    if(!panel.hidden && !selected && origin){const anchor=entries.find(e=>e.element===origin);if(anchor)showGroup(neighborEntries(entries,anchor,p=>map.project(p)),false);}
  }
  map.on('moveend',counts);
  function setEntries(next) {
    closeChoice();unbind();entries=next;
    entries.forEach(e=>{e.label=e.element.getAttribute('aria-label') || e.point.name;e.listener=event=>pick(e,event);e.element.addEventListener('click',e.listener);});counts();
  }
  function destroy() {
    if(destroyed)return;clearLocation();closeChoice();unbind();destroyed=true;clearInterval(timer);
    map.off('movestart',moved);map.off('moveend',counts);map.off('click',blank);
    document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',stopClick);window.removeEventListener('godune:memory-clearing',stopClick);
    root.removeEventListener('close',stopClick);root.removeEventListener('keydown',escape);
    tools.remove();shell.before(canvas);shell.remove();
  }
  return {setEntries,closeChoice,destroy};
}
