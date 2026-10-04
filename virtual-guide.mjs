import {buildGuide,guideProgress,restoreGuide,guideTranscript} from './virtual-guide-engine.mjs?v=1';

const KEY='godune-guide-progress-v1';
const element=(tag,text,className)=>{const node=document.createElement(tag);if(text)node.textContent=text;if(className)node.className=className;return node;};
export function initVirtualGuide({mount,workshop,catalog,base,storage}) {
  if(!mount)return null;
  if(!storage)try{storage=globalThis.localStorage;}catch{storage={getItem(){return null;},setItem(){throw Error('storage_denied');}};}
  const $=selector=>mount.querySelector(selector),select=$('[data-guide-select]'),body=$('[data-guide-body]'),status=$('[data-guide-status]');
  const params=new URL(location.href).searchParams;
  let request=params.has('point')?{point:params.get('point')}:params.has('route')?{route:params.get('route')}:{};
  let guide,index=0,voice=null,paused=false,speaking=false,utterance;
  const speech=globalThis.speechSynthesis;
  const speakButton=$('[data-guide-speak]'),stopButton=$('[data-guide-stop]');
  function stopSpeech(){utterance=null;speaking=false;paused=false;speech?.cancel();speakButton.textContent='Послушать рассказ';stopButton.hidden=true;}
  function voices(){voice=speech?.getVoices().find(row=>/^ru(?:-|_)/i.test(row.lang)) || null;speakButton.disabled=!voice || !globalThis.SpeechSynthesisUtterance;}
  voices();speech?.addEventListener('voiceschanged',voices);
  const choices=[...catalog.routes.filter(row=>row.mode==='walking'),...(catalog.day_waves?.recipes || [])];
  select.replaceChildren(new Option('Мой выбранный день','day'),...choices.map(row=>new Option(`${row.area_name} · ${row.name}`,`route:${row.slug}`)));
  if(request.point){select.add(new Option(catalog.poi.find(row=>row.slug===request.point)?.name || 'Неизвестное место',`point:${request.point}`));select.value=`point:${request.point}`;}
  else if(request.route)select.value=`route:${request.route}`;
  function readProgress(){try{const records=JSON.parse(storage.getItem(KEY) || 'null');return records?.version===1?records.contexts?.[guide.context]:null;}catch{return null;}}
  function saveProgress(){
    try{let records;try{records=JSON.parse(storage.getItem(KEY) || 'null');}catch{}
      const contexts=records?.version===1 && records.contexts && typeof records.contexts==='object' && !Array.isArray(records.contexts)?records.contexts:{};
      storage.setItem(KEY,JSON.stringify({version:1,contexts:{...contexts,[guide.context]:guideProgress(guide,index)}}));status.textContent='Эта глава сохранена в браузере. Отметки посещения не изменились.';}
    catch{status.textContent='Глава открыта только в этой вкладке. Можно скачать весь рассказ.';}
  }
  function render({focus=false}={}) {
    stopSpeech();body.replaceChildren();
    const active=guide?.stops.length>0;mount.dataset.guideReady='true';$('[data-guide-active]').hidden=!active;$('[data-guide-empty]').hidden=active;
    if(!active)return;
    const stop=guide.stops[index];$('[data-guide-title]').textContent=guide.title;
    $('[data-guide-count]').textContent=`${index+1} из ${guide.stops.length}`;
    const heading=element('h2',stop.name);heading.tabIndex=-1;heading.dataset.guidePoint=stop.id;
    body.append(element('p',stop.area,'eyebrow'),heading);
    if(stop.photo){const img=element('img');img.src=new URL(stop.photo,base);img.alt=stop.name;img.loading='lazy';img.decoding='async';img.className='guide-photo';img.addEventListener('error',()=>img.remove(),{once:true});body.append(img);}
    for(const paragraph of stop.story)body.append(element('p',paragraph,'guide-story'));
    if(!stop.story.length)body.append(element('p','Рассказ для этой остановки ещё готовится. Координаты и соседние места доступны в карточке.'));
    if(stop.focus){const field=element('section',undefined,'guide-focus');field.append(element('h3','Посмотрите вокруг'),element('p',stop.focus));body.append(field);}
    const details=element('details',undefined,'guide-details');details.append(element('summary','Перед выходом и источник'));
    if(stop.practical)details.append(element('p',stop.practical));
    details.append(element('p',`${stop.lat}, ${stop.lon}`));
    details.append(element('p',stop.kind==='field_note'?'Рассказ — редакционная полевая заметка. Практические данные смотрите в карточке места.':'Здесь пока краткое описание из карточки места.'));
    if(stop.checkedAt)details.append(element('p','Дата данных карточки: '+stop.checkedAt));
    if(/^https?:\/\//.test(stop.source)){const source=element('a','Источник карточки');source.href=stop.source;details.append(source);}
    body.append(details);
    $('[data-guide-place]').href=new URL(`poi/${stop.id}/`,base);
    $('[data-guide-map]').href=new URL(`?map=${stop.id}`,base);
    $('[data-guide-prev]').disabled=index===0;$('[data-guide-next]').disabled=index===guide.stops.length-1;
    $('[data-guide-next]').textContent=index<guide.stops.length-1?'Следующая остановка →':'Все главы открыты';
    const list=$('[data-guide-chapters]');list.replaceChildren(...guide.stops.map((row,i)=>{const li=element('li'),button=element('button',`${String(i+1).padStart(2,'0')} · ${row.name}`);button.type='button';button.dataset.guideChapter=row.id;if(i===index)button.setAttribute('aria-current','step');button.addEventListener('click',()=>go(i));li.append(button);return li;}));
    if(focus){heading.focus({preventScroll:true});heading.scrollIntoView({block:'start',behavior:'auto'});}
  }
  function load(){
    try{guide=buildGuide(catalog,{...request,trip:workshop.getState()});index=restoreGuide(guide,readProgress());status.textContent='Выбирайте главы сами. Гид не следит за Вашим положением и не меняет поездку.';}
    catch{guide=null;status.textContent='Такой остановки или прогулки в каталоге нет. Выберите другую выше.';}
    render();
  }
  function go(position){if(!guide || position<0 || position>=guide.stops.length)return;index=position;render({focus:true});saveProgress();}
  select.addEventListener('change',()=>{const [kind,...parts]=select.value.split(':');request=kind==='route'?{route:parts.join(':')}:kind==='point'?{point:parts.join(':')}:{};
    const url=new URL(location.href);url.searchParams.delete('route');url.searchParams.delete('point');for(const [key,value] of Object.entries(request))url.searchParams.set(key,value);history.replaceState(null,'',url);load();});
  $('[data-guide-prev]').addEventListener('click',()=>go(index-1));$('[data-guide-next]').addEventListener('click',()=>go(index+1));
  speakButton.addEventListener('click',()=>{
    if(speaking){paused=!paused;if(paused)speech.pause();else speech.resume();speakButton.textContent=paused?'Продолжить рассказ':'Пауза';return;}
    voices();if(!voice || !guide?.stops[index])return;
    const stop=guide.stops[index];const current=new SpeechSynthesisUtterance([stop.name,...stop.story,stop.focus?'Посмотрите вокруг. '+stop.focus:''].join(' '));
    utterance=current;current.voice=voice;current.lang='ru-RU';current.rate=.94;speaking=true;speakButton.textContent='Пауза';stopButton.hidden=false;
    current.onend=()=>{if(utterance===current)stopSpeech();};current.onerror=()=>{if(utterance===current){stopSpeech();status.textContent='Голос сейчас недоступен. Рассказ можно прочитать или скачать.';}};
    speech.speak(current);
  });
  stopButton.addEventListener('click',stopSpeech);
  $('[data-guide-download]').addEventListener('click',()=>{if(!guide?.stops.length)return;const url=URL.createObjectURL(new Blob([guideTranscript(guide)],{type:'text/plain;charset=utf-8'}));const a=element('a');a.href=url;a.download='godune-rasskaz.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='Файл рассказа подготовлен. Сохраните его на устройстве.';});
  window.addEventListener('godune:trip-change',()=>{if(!request.route&&!request.point)load();});
  window.addEventListener('godune:memory-cleared',()=>{try{storage.removeItem(KEY);}catch{}load();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopSpeech();});window.addEventListener('pagehide',stopSpeech);
  select.disabled=false;load();return {reload:load};
}
