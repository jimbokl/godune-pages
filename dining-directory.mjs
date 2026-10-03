import {regionMapStyle} from './region-map.mjs?v=2';
import {bindMapTheme} from './map-theme.mjs?v=2';
const root=document.querySelector('[data-dining-directory]');
if(root) {
  const form=root.querySelector('.dining-filters'),cards=[...root.querySelectorAll('[data-dining-card]')];
  const status=root.querySelector('[data-dining-count]'),empty=root.querySelector('[data-dining-empty]');
  const toggle=root.querySelector('[data-dining-map-toggle]'),panel=root.querySelector('#dining-map-panel');
  const mapStatus=root.querySelector('[data-dining-map-status]'),base=new URL('./',import.meta.url);
  const normalize=value=>value.toLocaleLowerCase('ru').replaceAll('ё','е').normalize('NFKC');
  const searchText=new Map(cards.map(card=>{
    const d=card.dataset,items=[...card.querySelectorAll('.food-item-name')].map(item=>item.textContent);
    return [card,normalize([d.name,d.address,d.cuisine,d.category,...items].join(' '))];
  }));
  let map,library,markers=[],popup;
  function libraryReady() {
    if(window.maplibregl)return Promise.resolve();
    return library ||= new Promise((resolve,reject)=>{
      const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('assets/vendor/maplibre/maplibre-gl.css',base);document.head.append(css);
      const script=document.createElement('script');script.src=new URL('assets/vendor/maplibre/maplibre-gl.js',base);script.onload=resolve;script.onerror=()=>{library=null;script.remove();reject(new Error('map library'));};document.head.append(script);
    });
  }
  function select(card) {
    const d=card.dataset,content=document.createElement('div'),heading=document.createElement('strong'),address=document.createElement('p'),link=document.createElement('a');
    heading.textContent=d.name;address.textContent=d.address;link.textContent='Посмотреть карточку ↓';link.href=`#${d.id}`;
    link.addEventListener('click',()=>{card.querySelector('.dining-facts').open=true;popup?.remove();});content.append(heading,address,link);
    popup?.remove();popup=new window.maplibregl.Popup({maxWidth:'260px',closeButton:true}).setLngLat([Number(d.lon),Number(d.lat)]).setDOMContent(content).addTo(map);
  }
  function redraw() {
    if(!map?.isStyleLoaded())return;
    popup?.remove();markers.forEach(marker=>marker.remove());markers=[];
    cards.filter(card=>!card.hidden).forEach(card=>{
      const button=document.createElement('button');button.type='button';button.className='dining-pin';button.setAttribute('aria-label',`${card.dataset.name}, ${card.dataset.address}`);
      button.addEventListener('click',event=>{event.stopPropagation();select(card);});markers.push(new window.maplibregl.Marker({element:button}).setLngLat([Number(card.dataset.lon),Number(card.dataset.lat)]).addTo(map));
    });
  }
  async function showMap(card) {
    panel.hidden=false;toggle.setAttribute('aria-expanded','true');toggle.textContent='Скрыть карту';
    try {
      await libraryReady();
      if(!map) {
        map=new window.maplibregl.Map({container:'dining-map',style:regionMapStyle(base),center:[20.471,54.959],zoom:13.5,attributionControl:false,locale:{'NavigationControl.ZoomIn':'Приблизить','NavigationControl.ZoomOut':'Отдалить','Popup.Close':'Закрыть'}});
        bindMapTheme(map);map.addControl(new window.maplibregl.NavigationControl({showCompass:false}));map.addControl(new window.maplibregl.AttributionControl({compact:false}));
        map.on('error',()=>{mapStatus.hidden=false;mapStatus.textContent='Часть карты не загрузилась. Адреса и карточки ниже доступны.';});
        await new Promise((resolve,reject)=>{
          const timer=setTimeout(()=>reject(new Error('map load timeout')),20000);
          map.once('load',()=>{clearTimeout(timer);resolve();});
        });mapStatus.hidden=true;redraw();
      }
      map.resize();
      if(card){map.easeTo({center:[Number(card.dataset.lon),Number(card.dataset.lat)],zoom:15,duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:400});select(card);panel.scrollIntoView({block:'start',behavior:'instant'});}
    } catch {map?.remove();map=null;markers=[];mapStatus.hidden=false;mapStatus.textContent='Карта не загрузилась. Адреса и карточки ниже доступны; попробуйте открыть карту ещё раз.';}
  }
  function filter() {
    const query=normalize(form.elements.q.value.trim()),category=form.elements.category.value;
    const words=query.split(/\s+/).filter(Boolean);
    cards.forEach(card=>{
      const d=card.dataset,text=searchText.get(card);
      card.hidden=!!((category&&!d.category.split(' · ').includes(category)) || (form.elements.photos.checked&&d.photo!=='true') || (form.elements.menu.checked&&Number(d.menu)===0) || !words.every(word=>text.includes(word)));
    });
    const count=cards.filter(card=>!card.hidden).length;status.textContent=`Найдено: ${count}`;empty.hidden=count>0;redraw();
  }
  form.hidden=false;toggle.hidden=false;root.querySelectorAll('[data-dining-location]').forEach(button=>{button.hidden=false;button.addEventListener('click',()=>showMap(cards.find(card=>card.dataset.id===button.dataset.diningLocation)));});
  form.addEventListener('submit',event=>event.preventDefault());form.addEventListener('input',filter);form.addEventListener('change',filter);form.addEventListener('reset',()=>setTimeout(filter,0));
  toggle.addEventListener('click',()=>{if(panel.hidden)showMap();else{panel.hidden=true;toggle.setAttribute('aria-expanded','false');toggle.textContent='Показать на карте';}});
}
