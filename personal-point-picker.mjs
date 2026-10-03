import {regionMapStyle} from './region-map.mjs?v=2';
import {isPersonalPoint} from './personal-points.mjs?v=1';
import {addressPicker} from './address-picker.mjs?v=1';
import {downloadedMap,localMapStyle} from './offline-map.mjs?v=4';
const element=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
let library;
function mapLibrary(base){
  if(globalThis.maplibregl)return Promise.resolve();
  if(!library)library=new Promise((resolve,reject)=>{
    const cssURL=new URL('assets/vendor/maplibre/maplibre-gl.css',base).href;
    if(![...document.querySelectorAll('link')].some(link=>link.href===cssURL)){const css=element('link');css.rel='stylesheet';css.href=cssURL;document.head.append(css);}
    const url=new URL('assets/vendor/maplibre/maplibre-gl.js',base).href;
    let script=[...document.scripts].find(script=>script.src===url);
    const done=()=>globalThis.maplibregl?resolve():reject(Error('Карта не открылась.'));
    const failed=error=>{script.remove();reject(error);};
    if(script){script.addEventListener('load',done,{once:true});script.addEventListener('error',failed,{once:true});}
    else {script=element('script');script.src=url;script.onload=done;script.onerror=failed;document.head.append(script);}
  }).catch(error=>{library=null;throw error;});return library;
}
export function pickPersonalPoint({base,initial,caption,focusPlace}){
  return new Promise(resolve=>{
    const lastFocus=document.activeElement,dialog=element('dialog',undefined,'personal-point-dialog');dialog.setAttribute('aria-labelledby','personal-point-title');
    const head=element('div',undefined,'dialog-top'),intro=element('div'),kicker=element('p','От вашей двери — к морю','eyebrow'),title=element('h2',caption);title.id='personal-point-title';intro.append(kicker,title);
    const close=element('button','×','icon-button');close.type='button';close.setAttribute('aria-label','Закрыть выбор точки');head.append(intro,close);
    const note=element('p','Найдите адрес, а затем уточните вход. Можно выбрать любое место на карте: сдвиньте его под прицел или нажмите на него.','personal-point-intro');
    const frame=element('div',undefined,'personal-map-frame'),canvas=element('div',undefined,'personal-point-map');canvas.setAttribute('aria-label','Карта для выбора личной точки');
    const cross=element('span','+','personal-map-cross');cross.setAttribute('aria-hidden','true');frame.append(canvas,cross);
    const status=element('p','Открываем карту…','personal-point-status');status.setAttribute('role','status');
    const form=element('form',undefined,'personal-point-form'),nameLabel=element('label','Как назвать эту точку'),name=element('input');name.name='point-name';name.type='text';name.required=true;name.value=isPersonalPoint(initial)?initial.name:'Моё жильё';nameLabel.append(name);
    const detail=element('details',undefined,'personal-coordinates'),summary=element('summary','Указать координаты'),fields=element('div',undefined,'personal-coordinate-fields');detail.append(summary,fields);
    const position=isPersonalPoint(initial)?[initial.lon,initial.lat]:focusPlace?[focusPlace.lon,focusPlace.lat]:[20.475,54.959];
    const lonLabel=element('label','Долгота'),latLabel=element('label','Широта'),lon=element('input'),lat=element('input');
    for(const [input,value,min,max]of [[lon,position[0],-180,180],[lat,position[1],-90,90]]){input.type='number';input.step='any';input.min=String(min);input.max=String(max);input.required=true;input.value=String(value);}
    lon.name='point-lon';lat.name='point-lat';lonLabel.append(lon);latLabel.append(lat);fields.append(lonLabel,latLabel);
    const privacy=element('p','Точка сохранится в этом браузере. Она попадёт в файл и ссылку, если вы решите поделиться поездкой.','personal-point-privacy');
    const picker=addressPicker({base,near:()=>[Number(lon.value),Number(lat.value)],onSelect:point=>{setPosition([point.lon,point.lat]);name.value=point.title.slice(0,120);name.setCustomValidity('');map?.jumpTo({center:[point.lon,point.lat],zoom:point.precision==='settlement'?12:point.precision==='street'?14:16});}});
    const actions=element('div',undefined,'personal-point-actions'),cancel=element('button','Отмена','journey-button'),save=element('button','Сохранить эту точку →','journey-save');cancel.type='button';save.type='submit';actions.append(cancel,save);form.append(nameLabel,detail,privacy,actions);dialog.append(head,note,picker.root,frame,status,form);document.body.append(dialog);
    let map,result=null,closed=false;
    const setPosition=p=>{lon.value=p[0].toFixed(6);lat.value=p[1].toFixed(6);status.textContent=`Выбрано: ${Number(lat.value).toFixed(5)}, ${Number(lon.value).toFixed(5)}. Дорога рассчитается после сохранения. Подход от двери до ближайшей дороги пока не учтён.`;};
    setPosition(position);dialog.showModal();picker.input.focus();
    close.onclick=cancel.onclick=()=>dialog.close();
    dialog.addEventListener('close',()=>{closed=true;picker.destroy();map?.remove();dialog.remove();lastFocus?.focus({preventScroll:true});resolve(result);},{once:true});
    form.addEventListener('submit',event=>{
      event.preventDefault();if(!name.value.trim()){name.setCustomValidity('Назовите эту точку.');name.reportValidity();return;}
      const candidate={kind:'personal',name:name.value.trim(),lon:Number(lon.value),lat:Number(lat.value)};
      if(!isPersonalPoint(candidate)){detail.open=true;status.textContent='Проверьте широту и долготу.';return;}
      result=candidate;dialog.close();
    });name.oninput=()=>name.setCustomValidity('');
    const coordinatesChanged=()=>{if(!lon.value||!lat.value||!lon.validity.valid||!lat.validity.valid)return;const p=[Number(lon.value),Number(lat.value)];if(isPersonalPoint({kind:'personal',name:'Точка',lon:p[0],lat:p[1]}))map?.jumpTo({center:p});};lon.onchange=lat.onchange=coordinatesChanged;
    mapLibrary(base).then(async()=>{
      if(closed)return;
      const entered=[Number(lon.value),Number(lat.value)],center=isPersonalPoint({kind:'personal',name:'Точка',lon:entered[0],lat:entered[1]})?entered:position;
      const local=await downloadedMap(base,null,{lon:center[0],lat:center[1]});if(closed)return;
      map=new maplibregl.Map({container:canvas,center:[Number(lon.value),Number(lat.value)],zoom:15,style:local?localMapStyle(local,base):regionMapStyle(base),attributionControl:false,locale:{'NavigationControl.ZoomIn':'Приблизить','NavigationControl.ZoomOut':'Отдалить','AttributionControl.ToggleAttribution':'Источники карты'}});
      map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');map.addControl(new maplibregl.AttributionControl({compact:false}));
      map.on('moveend',()=>{const p=map.getCenter();setPosition([p.lng,p.lat]);});map.on('click',event=>map.jumpTo({center:event.lngLat}));map.on('load',()=>{canvas.dataset.mapReady='true';const p=map.getCenter();setPosition([p.lng,p.lat]);});
      map.on('error',()=>{status.textContent='Часть подложки не загрузилась. Координаты можно указать вручную.';});
    }).catch(()=>{if(closed)return;detail.open=true;status.textContent='Карта не открылась. Поиск адреса и поля координат остаются доступны.';});
  });
}
