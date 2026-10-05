import {readPosition} from './device-position.mjs?v=1';
import {nearbyPlaces} from './place-proximity.mjs?v=1';

const node=(tag,text)=>{const el=document.createElement(tag);if(text)el.textContent=text;return el;};
const meters=value=>value>=1000?`${(Math.ceil(value/100)/10).toLocaleString('ru-RU')} км`:`${Math.ceil(value/10)*10} м`;
export function initGuideLocation({mount,onOpen,current,geo=globalThis.navigator?.geolocation,now=()=>Date.now(),secure=globalThis.isSecureContext}) {
  const locate=mount.querySelector('[data-guide-locate]'),stop=mount.querySelector('[data-guide-location-stop]');
  const status=mount.querySelector('[data-guide-location-status]'),choices=mount.querySelector('[data-guide-nearby]');
  let points=[],watch=null,token=0,fix=null,message='',destroyed=false;
  const announce=text=>{if(status.textContent!==text)status.textContent=text;};
  function render() {
    choices.replaceChildren();stop.hidden=watch===null;
    locate.textContent=watch!==null?'Обновить положение':'Показать рядом';
    locate.setAttribute('aria-busy',String(watch!==null && !fix && !message));
    let view=fix ? nearbyPlaces(points,fix,{now:now()}) : null;
    mount.dataset.locationState=message?'error':view?.state || (watch!==null?'searching':'off');
    if(message){announce(message);return;}
    if(!view){announce(watch!==null?'Ищем положение. Разрешите доступ, если телефон спросит.':'Покажем остановки этой прогулки рядом с Вами.');return;}
    const accuracy=`Точность сигнала ±${meters(view.accuracy)}.`;
    const explanations={invalid:'Телефон передал неполное положение. Ждём новый сигнал.',stale:'Положение устарело. Ждём новый сигнал.',imprecise:`${accuracy} Пока нельзя уверенно выбрать остановку.`,empty:'У остановок пока нет координат. Выберите главу в списке.',uncertain:`${accuracy} Вы можете быть рядом с остановкой. Выберите главу в списке.`,far:`${accuracy} Остановок этой прогулки рядом пока нет.`};
    if(!view.matches.length){announce(explanations[view.state]);return;}
    announce(`${view.state==='ambiguous'?'Рядом несколько остановок. Выберите рассказ.':'Остановка рядом.'} ${accuracy}`);
    const generation=token;
    for(const place of view.matches){
      const li=node('li'),button=node('button');button.type='button';button.dataset.guideNearby=place.id;
      const opened=current()===place.id;
      const distance=place.distance<10?'рядом с точкой на карте':`примерно ${meters(place.distance)} по прямой`;
      button.append(node('strong',place.name),node('span',opened?'Эта глава открыта':`Открыть рассказ · ${distance}`));
      button.disabled=opened;
      button.addEventListener('click',()=>{if(generation!==token || !points.some(point=>point.id===place.id))return;onOpen(place.id);render();});
      li.append(button);choices.append(li);
    }
  }
  function clear(note='') {
    token++;if(watch!==null)geo?.clearWatch(watch);watch=null;fix=null;message=note;render();
  }
  function start() {
    clear();
    if(destroyed)return;
    if(!secure || !geo?.watchPosition){message='Телефон не может показать положение в этой вкладке. Главы можно выбирать вручную.';render();return;}
    const generation=token;
    try {
      watch=geo.watchPosition(position=>{
        if(destroyed || generation!==token)return;
        const parsed=readPosition(position);
        if(parsed && fix && parsed.timestamp<fix.timestamp)return;
        fix=position;message='';render();
      },error=>{
        if(destroyed || generation!==token)return;
        if(error?.code===1){clear('Доступ к положению закрыт. Выберите главу вручную или разрешите доступ в настройках браузера.');return;}
        fix=null;message=error?.code===3?'Телефон пока не нашёл положение. Ждём сигнал; главы можно выбирать вручную.':'Положение сейчас недоступно. Ждём сигнал; главы можно выбирать вручную.';render();
      },{enableHighAccuracy:true,maximumAge:10000,timeout:20000});
      render();
    }catch{clear('Положение сейчас недоступно. Выберите главу вручную или попробуйте ещё раз.');}
  }
  const hide=()=>{if(document.hidden && watch!==null)clear('Подсказки по положению выключены, пока вкладка закрыта. Включите их, когда продолжите прогулку.');};
  const leave=()=>clear(),forget=()=>clear();
  locate.addEventListener('click',start);stop.addEventListener('click',leave);
  document.addEventListener('visibilitychange',hide);window.addEventListener('pagehide',leave);window.addEventListener('godune:memory-clearing',forget);
  const timer=setInterval(()=>{if(watch!==null && fix)render();},15000);
  render();
  return {setPoints(next){clear();points=Array.isArray(next)?next:[];render();},refresh:render,destroy(){clear();destroyed=true;clearInterval(timer);locate.removeEventListener('click',start);stop.removeEventListener('click',leave);document.removeEventListener('visibilitychange',hide);window.removeEventListener('pagehide',leave);window.removeEventListener('godune:memory-clearing',forget);}};
}
