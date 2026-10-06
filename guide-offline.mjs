import {offlineAction} from './offline.mjs?v=9';
import {guideOfflineState} from './guide-offline-state.mjs?v=1';

export function initGuideOffline({mount,base,onChange=()=>{},readPackages=()=>offlineAction(base,{type:'LIST'})}) {
  if(!mount)return {update(){},reset(){},get state(){return null;}};
  const summary=mount.querySelector('summary'),rows=mount.querySelector('[data-guide-offline-rows]');
  let stop=null,record=null,state=null,revision=0;
  function render(value){
    state=value;mount.dataset.state=value?'checked':'unavailable';rows.replaceChildren();
    const add=(kind,text,ready)=>{const li=document.createElement('li');li.dataset.offlineKind=kind;li.dataset.ready=String(ready);li.textContent=text;rows.append(li);};
    summary.textContent=value?.text && value?.map?'Текст и карта с Вами':'Перед выходом: без связи';
    if(!value)add('unknown','Не удалось проверить загрузки. Перед выходом откройте раздел «Без сети».',false);
    else{
      add('text',value.text?'Текст этой главы сохранён.':'Эта версия рассказа ещё не сохранена. Можно скачать текст отдельным файлом.',value.text);
      add('map',value.map?`Карта вокруг точки сохранена: ${value.map.name}.`:'Карта вокруг точки ещё не скачана.',Boolean(value.map));
      const mb=value.audioBytes?(value.audioBytes/1048576).toLocaleString('ru-RU',{maximumFractionDigits:1}):'';
      add('audio',record?value.audio?`Записанный голос сохранён · ${mb} МБ.`:'Записанный голос ещё не сохранён. Скачайте звук отдельным файлом.':'Записи этой главы пока нет. Голос телефона может требовать связь.',value.audio);
    }
    onChange(value);
  }
  async function refresh(){
    const ticket=++revision,current=stop,currentRecord=record;if(!current)return;
    state=null;onChange(null);mount.dataset.state='checking';summary.textContent='Проверяем, что уже с Вами…';rows.replaceChildren();
    try{
      const packs=await readPackages();
      const value=await guideOfflineState({stop:current,record:currentRecord,packs,base});
      if(ticket===revision)render(value);
    }catch{if(ticket===revision)render(null);}
  }
  const update=(chapter,audio)=>{stop=chapter;record=audio;state=null;refresh();};
  const reset=()=>{revision++;stop=null;record=null;state=null;rows.replaceChildren();mount.dataset.state='checking';summary.textContent='Проверяем, что уже с Вами…';};
  for(const name of ['godune:offline-change','godune:memory-cleared','online','offline','pageshow'])window.addEventListener(name,refresh);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  window.addEventListener('pagehide',()=>revision++);
  return {update,reset,get state(){return state;}};
}
