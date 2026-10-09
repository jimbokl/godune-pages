import {buildGuide,guideProgress,restoreGuide,guideTranscript} from './virtual-guide-engine.mjs?v=4';
import {guideNarration} from './guide-provenance.mjs?v=2';
import {guideAudioRecord,createGuideAudioPlayer} from './guide-audio.mjs?v=2';
import {initGuideOffline} from './guide-offline.mjs?v=2';
import {clock} from './day-stop-view.mjs?v=1';
import {initGuideLocation} from './guide-location.mjs?v=1';

const KEY='godune-guide-progress-v1';
const element=(tag,text,className)=>{const node=document.createElement(tag);if(text)node.textContent=text;if(className)node.className=className;return node;};
export function initVirtualGuide({mount,workshop,catalog,base,storage}) {
  if(!mount)return null;
  if(!storage)try{storage=globalThis.localStorage;}catch{storage={getItem(){return null;},setItem(){throw Error('storage_denied');}};}
  const $=selector=>mount.querySelector(selector),select=$('[data-guide-select]'),body=$('[data-guide-body]'),status=$('[data-guide-status]');
  const params=new URL(location.href).searchParams;
  let request=params.has('point')?{point:params.get('point')}:params.has('route')?{route:params.get('route')}:{};
  let guide,index=0,voice=null,paused=false,speaking=false,utterance,audioRevision=0;
  let revision=0,journey=null,journeyModule=null,journeyState='idle';
  const speech=globalThis.speechSynthesis;
  const proximity=initGuideLocation({mount:$('[data-guide-location]'),current:()=>guide?.stops[index]?.id,onOpen:id=>go(guide?.stops.findIndex(stop=>stop.id===id))});
  const speakButton=$('[data-guide-speak]'),stopButton=$('[data-guide-stop]');
  const voiceNote=$('[data-guide-voice-note]'),audioDownload=$('[data-guide-audio-download]');
  const player=createGuideAudioPlayer({onChange:({state})=>{
    if(!player?.record)return;
    speakButton.textContent=state==='loading'?'Пауза':state==='playing'?'Пауза':state==='paused'?'Продолжить рассказ':'Послушать рассказ';
    stopButton.hidden=!['loading','playing','paused'].includes(state);
    if(voiceNote)voiceNote.textContent=state==='error'?'Не удалось открыть звук. Попробуйте ещё раз, когда появится связь. Рассказ можно прочитать ниже.':state==='loading'?'Открываем звук. Можно поставить на паузу.':recordedVoiceNote();
  }});
  const savedFiles=initGuideOffline({mount:$('[data-guide-offline]'),base,onChange:()=>{
    if(voiceNote && player.record && !['error','loading'].includes(player.state))voiceNote.textContent=recordedVoiceNote();
  }});
  function recordedVoiceNote(){return savedFiles?.state?.audio?'Записанный голос сохранён в браузере. Можно слушать без связи.':'Записанный голос. Скачайте звук, чтобы послушать без связи.';}
  function stopSpeech(){utterance=null;speaking=false;paused=false;speech?.cancel();player.stop();speakButton.textContent=player.record?'Послушать рассказ':'Послушать голосом телефона';stopButton.hidden=true;}
  function voices(){voice=speech?.getVoices().find(row=>/^ru(?:-|_)/i.test(row.lang)) || null;speakButton.disabled=!player.record&&(!voice || !globalThis.SpeechSynthesisUtterance);
    if(voiceNote&&!player.record)voiceNote.textContent=speakButton.disabled?'Рассказ можно прочитать ниже. Русский голос на этом устройстве недоступен.':'Для этой главы доступен голос телефона. Рассказ также можно прочитать ниже.';}
  function chapterAudio(stop){
    const current=++audioRevision;savedFiles.reset();player.select(null);voices();speakButton.textContent='Послушать голосом телефона';
    if(audioDownload){audioDownload.hidden=true;audioDownload.removeAttribute('href');}
    guideAudioRecord(catalog.virtual_guide?.audio,stop,base).then(record=>{
      if(current!==audioRevision)return;player.select(record);voices();
      if(record){speakButton.textContent='Послушать рассказ';if(voiceNote)voiceNote.textContent=recordedVoiceNote();
        if(audioDownload){audioDownload.href=record.url;audioDownload.download=`godune-${stop.id}.mp3`;audioDownload.hidden=false;}}
      savedFiles.update(stop,record);
    });
  }
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
  function renderJourney() {
    const slot=$('[data-guide-journey]');if(!slot)return;
    slot.replaceChildren();slot.dataset.state=journeyState;
    if(request.route || request.point)return;
    if(journeyState==='loading'){slot.append(element('p','Открываем время и дорогу из вашего плана…','guide-small'));return;}
    const view=journey && journeyModule.chapterJourney(guide,journey,index);
    if(!view){slot.append(element('p','Время и дорога сейчас недоступны. Рассказ можно читать; перед выходом откройте план дня.'));}
    else {
      const title='В вашем плане'+(Number.isInteger(view.visit?.time)?' · '+clock(view.visit.time):'');
      slot.append(element('h3',title),element('p',view.summary,'guide-small'));
      if(!view.visit)slot.append(element('p',view.note));
      const details=element('details');details.append(element('summary','Дорога и возвращение'));
      const appendRows=(rows,title)=>{
        if(!rows.length)return;details.append(element('h4',title));
        const list=element('ol');
        for(const row of rows){const item=element('li');item.dataset.journeyKind=row.kind;item.dataset.journeyState=row.state;
          item.append(element('p',(Number.isInteger(row.time)?clock(row.time)+' · ':'')+row.title,'guide-leg-title'),element('p',row.text));
          if(row.source?.checked_at)item.append(element('p','Дата проверки: '+row.source.checked_at,'guide-small'));
          if(/^https?:\/\//.test(row.source?.url || '')){const link=element('a','Источник расписания');link.href=row.source.url;item.append(link);}
          list.append(item);
        }
        details.append(list);
      };
      appendRows(view.before,'До этой остановки');
      if(view.visit)details.append(element('h4','На месте'),element('p',view.visit.text));
      appendRows(view.after,'После неё');
      if(view.planB)details.append(element('h4','Если планы изменились'),element('p',view.planB));
      if(view.visit)details.append(element('p',view.note,'guide-small'));
      slot.append(details);
    }
    const link=element('a','Открыть мой день →');link.href=new URL('planner/#trip-rail',base);slot.append(link);
  }
  function render({focus=false}={}) {
    stopSpeech();audioRevision++;body.replaceChildren();
    const active=guide?.stops.length>0;mount.dataset.guideReady='true';$('[data-guide-active]').hidden=!active;$('[data-guide-empty]').hidden=active;
    if(!active)return;
    const stop=guide.stops[index];$('[data-guide-title]').textContent=guide.title;
    chapterAudio(stop);
    $('[data-guide-count]').textContent=`${index+1} из ${guide.stops.length}`;
    const heading=element('h2',stop.name);heading.tabIndex=-1;heading.dataset.guidePoint=stop.id;
    body.append(element('p',stop.area,'eyebrow'),heading);
    if(!request.route && !request.point){const slot=element('section',undefined,'guide-navigation');slot.dataset.guideJourney='';slot.setAttribute('aria-label','Время и дорога по вашему плану');body.append(slot);renderJourney();}
    if(stop.photo){const img=element('img');img.src=new URL(stop.photo,base);img.alt=stop.name;img.loading='lazy';img.decoding='async';img.className='guide-photo';img.addEventListener('error',()=>img.remove(),{once:true});body.append(img);}
    for(const paragraph of stop.story)body.append(element('p',paragraph,'guide-story'));
    const provenance=stop.provenance;
    if(provenance.facts.length){
      const context=element('section',undefined,'guide-context');context.setAttribute('aria-label','Сведения о месте и их источники');
      for(const fact of provenance.facts){
        const part=element('section');part.append(element('h3',fact.kind==='legend'?'Городская легенда':'О месте'),element('p',fact.text,'guide-story'));
        const references=element('details',undefined,'guide-evidence');references.append(element('summary','Откуда эти сведения'));
        for(const source of fact.sources){const link=element('a',source.publisher+' · '+source.title);link.href=source.url;
          references.append(link,element('p','Страница загружена: '+source.capturedAt+'. Условия посещения могли измениться.'));}
        part.append(references);context.append(part);
      }
      body.append(context);
    }
    if(!stop.story.length)body.append(element('p','Рассказ для этой остановки ещё готовится. Координаты и соседние места доступны в карточке.'));
    if(stop.focus){const field=element('section',undefined,'guide-focus');field.append(element('h3','Посмотрите вокруг'),element('p',stop.focus));body.append(field);}
    const details=element('details',undefined,'guide-details');details.append(element('summary','Перед выходом и источник'));
    if(stop.practical)details.append(element('p',stop.practical));
    details.append(element('p',`${stop.lat}, ${stop.lon}`));
    details.append(element('p',stop.kind==='field_note'?'Авторские наблюдения GoDune. Практические данные смотрите в карточке места.':'Здесь пока краткое описание из карточки места.'));
    if(provenance.author)details.append(element('p','Текст: '+provenance.author+'. Редакционная проверка: '+provenance.reviewedAt+'.'));
    for(const source of provenance.observations){const link=element('a','Фото: '+source.title);link.href=source.url;
      details.append(link,element('p','Дата снимка: '+source.capturedAt+'. Сегодняшнее меню и обстановку уточняйте отдельно.'));}
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
    const current=++revision;journey=null;journeyState='idle';
    try{guide=buildGuide(catalog,{...request,trip:workshop.getState()});index=restoreGuide(guide,readProgress());status.textContent='Выбирайте главы сами. Подсказки по положению включаются по Вашему желанию.';}
    catch{guide=null;status.textContent='Такой остановки или прогулки в каталоге нет. Выберите другую выше.';}
    const personal=guide?.stops.length && !request.route && !request.point;
    if(personal)journeyState='loading';proximity.setPoints(guide?.stops);render();
    if(personal){
      const trip=structuredClone(workshop.getState());
      import('./virtual-guide-journey.mjs?v=25').then(async module=>{
        const day=await module.collectVirtualJourney({trip,catalog,base});
        if(current!==revision)return;journeyModule=module;journey=day;journeyState='ready';renderJourney();
      }).catch(()=>{if(current===revision){journeyState='unavailable';renderJourney();}});
    }
  }
  function go(position){if(!guide || !Number.isInteger(position) || position<0 || position>=guide.stops.length)return;index=position;render({focus:true});saveProgress();proximity.refresh();}
  select.addEventListener('change',()=>{const [kind,...parts]=select.value.split(':');request=kind==='route'?{route:parts.join(':')}:kind==='point'?{point:parts.join(':')}:{};
    const url=new URL(location.href);url.searchParams.delete('route');url.searchParams.delete('point');for(const [key,value] of Object.entries(request))url.searchParams.set(key,value);history.replaceState(null,'',url);load();});
  $('[data-guide-prev]').addEventListener('click',()=>go(index-1));$('[data-guide-next]').addEventListener('click',()=>go(index+1));
  speakButton.addEventListener('click',()=>{
    if(player.record){player.toggle();return;}
    if(speaking){paused=!paused;if(paused)speech.pause();else speech.resume();speakButton.textContent=paused?'Продолжить рассказ':'Пауза';return;}
    voices();if(!voice || !guide?.stops[index])return;
    const stop=guide.stops[index];const current=new SpeechSynthesisUtterance(guideNarration(stop));
    utterance=current;current.voice=voice;current.lang='ru-RU';current.rate=.94;speaking=true;speakButton.textContent='Пауза';stopButton.hidden=false;
    current.onend=()=>{if(utterance===current)stopSpeech();};current.onerror=()=>{if(utterance===current){stopSpeech();status.textContent='Голос сейчас недоступен. Рассказ можно прочитать или скачать.';}};
    speech.speak(current);
  });
  stopButton.addEventListener('click',stopSpeech);
  $('[data-guide-download]').addEventListener('click',()=>{if(!guide?.stops.length)return;
    const plan=journey ? journeyModule.virtualJourneyTranscript(journey) : !request.route && !request.point?'Время и дорога не приложены. Перед выходом откройте план дня.':'';
    const url=URL.createObjectURL(new Blob([guideTranscript(guide),plan?'\n'+plan:''],{type:'text/plain;charset=utf-8'}));const a=element('a');a.href=url;a.download='godune-rasskaz.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='Файл рассказа подготовлен. Сохраните его на устройстве.';});
  window.addEventListener('godune:trip-change',()=>{if(!request.route&&!request.point)load();});
  window.addEventListener('godune:memory-cleared',()=>{try{storage.removeItem(KEY);}catch{}load();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopSpeech();});window.addEventListener('pagehide',stopSpeech);
  select.disabled=false;load();return {reload:load};
}
