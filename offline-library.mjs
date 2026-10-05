import {offlineAction,offlineWorker,offlineProgressText} from './offline.mjs?v=7';
const size=bytes=>`${(bytes/1048576).toLocaleString('ru-RU',{maximumFractionDigits:1})} МБ`;
export async function initOfflineLibrary(base) {
  const root=document.querySelector('[data-offline-library]');if(!root)return;
  const status=document.querySelector('#offline-library-status'),panels=[...root.querySelectorAll('[data-offline-package]')];
  let manifest=null,packs=[],partial=[],job=null,ready=false,generation=0;
  const $=(panel,selector)=>panel.querySelector(selector);
  async function readManifest(){
    if(!navigator.onLine)return;
    try{const r=await fetch(new URL('offline-manifest.json',base),{cache:'no-store'});if(r.ok){const value=await r.json();if(value.version===1 && Array.isArray(value.routes))manifest=value;}}catch{}
  }
  function render(){
    for(const panel of panels){
      const slug=panel.dataset.offlinePackage,pack=packs.find(p=>p.slug===slug),draft=partial.find(p=>p.slug===slug),current=[...(manifest?.routes || []),...(manifest?.regions || [])].find(p=>p.slug===slug),busy=job?.slug===slug;
      panel.dataset.packageReady=String(Boolean(pack));
      panel.dataset.packagePartial=String(Boolean(draft));
      const button=$(panel,'[data-package-download]'),remove=$(panel,'[data-package-remove]'),cancel=$(panel,'[data-package-cancel]'),bar=$(panel,'progress');
      button.disabled=!ready || Boolean(job) || !navigator.onLine;
      const regional=panel.dataset.packageKind==='region';
      button.textContent=busy?'Скачиваем…':draft?'Продолжить загрузку':pack?current && pack.version!==current.version?regional?'Обновить карту':'Обновить прогулку':'Проверить обновления':regional?'Скачать карту':'Скачать прогулку';
      remove.hidden=(!pack && !draft) || busy;remove.disabled=Boolean(job);cancel.hidden=!busy;bar.hidden=!busy;
      if(busy){$(panel,'[data-package-status]').textContent=job.message || (job.id?'Скачиваем файлы…':'Удаляем загрузку…');continue;}
      $(panel,'[data-package-status]').textContent=draft?`${pack?'Прежняя карта готова без сети. ':''}Новая загрузка не закончена · ${size(draft.bytes)} сохранено. Продолжите, когда будет связь.`:pack?`Готова без сети · ${size(pack.bytes)}. Загружена ${new Date(pack.saved_at).toLocaleDateString('ru-RU')}.`:!navigator.onLine?'Ещё не загружена. Скачайте, когда вернётся связь.':current?regional?`${size(current.download_bytes)} по сети · ${size(current.bytes)} в браузере. Карта, адреса и три способа передвижения.`:`Около ${size(current.bytes)} · карта, остановки и фотографии.`:'Размер пока неизвестен. Попробуйте скачать при устойчивой связи.';
    }
    status.textContent=job?'Сохраняем карту. Можно отменить; прежняя версия останется.':packs.length?`Готово без сети: ${packs.length} из ${panels.length}. Карты территорий открываются на общей карте, прогулки — по названию.`:navigator.onLine?'Выберите территорию или прогулку и дождитесь конца загрузки.':'Скачанных карт пока нет. Для загрузки нужна связь.';
  }
  async function refresh(){const ticket=++generation;const [value,draft]=await Promise.all([offlineAction(base,{type:'LIST'}),offlineAction(base,{type:'DRAFTS'}).catch(()=>[])]);if(ticket!==generation)return;packs=value;partial=draft;render();}
  try{await offlineWorker(base);await readManifest();ready=true;await refresh();root.dataset.libraryReady='true';}
  catch(error){status.textContent=error.message;for(const panel of panels)$(panel,'[data-package-status]').textContent='Загрузка в браузер пока недоступна. Трек GPX можно скачать отдельно.';root.dataset.libraryReady='error';return;}
  for(const panel of panels){
    const slug=panel.dataset.offlinePackage;
    $(panel,'[data-package-download]').addEventListener('click',async()=>{
      if(job || !navigator.onLine)return;const id=crypto.randomUUID();job={slug,id};render();$(panel,'progress').value=0;
      try{
        await offlineAction(base,{type:'DOWNLOAD',slug,id},value=>{
          if(value.total)$(panel,'progress').value=value.bytes/value.total;
          job.message=offlineProgressText(value);$(panel,'[data-package-status]').textContent=job.message;
        });
        job=null;await refresh();window.dispatchEvent(new Event('godune:offline-change'));
      }catch(error){job=null;await refresh().catch(()=>render());$(panel,'[data-package-status]').textContent=error.message;}
      finally{job=null;renderControls();}
    });
    $(panel,'[data-package-cancel]').addEventListener('click',()=>{if(job?.slug===slug)offlineAction(base,{type:'CANCEL',slug,id:job.id}).catch(error=>{$(panel,'[data-package-status]').textContent=error.message;});});
    $(panel,'[data-package-remove]').addEventListener('click',async()=>{
      if(job)return;job={slug};render();$(panel,'[data-package-cancel]').hidden=true;
      try{await offlineAction(base,{type:'REMOVE',slug});job=null;await refresh();$(panel,'[data-package-status]').textContent='Загрузка удалена. Дни и отметки поездки сохранены.';window.dispatchEvent(new Event('godune:offline-change'));}
      catch(error){job=null;await refresh().catch(()=>render());$(panel,'[data-package-status]').textContent=error.message;}
      finally{job=null;renderControls();}
    });
  }
  function renderControls(){for(const panel of panels){$(panel,'[data-package-download]').disabled=!ready || Boolean(job) || !navigator.onLine;$(panel,'[data-package-remove]').disabled=Boolean(job);if(!job){$(panel,'progress').hidden=true;$(panel,'[data-package-cancel]').hidden=true;}}}
  window.addEventListener('online',()=>readManifest().then(refresh).catch(()=>{}));
  window.addEventListener('offline',render);
  window.addEventListener('godune:memory-cleared',()=>refresh().catch(()=>{}));
  window.addEventListener('godune:offline-change',()=>refresh().catch(()=>{}));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden && !job)refresh().catch(()=>{});});
}
