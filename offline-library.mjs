import {offlineAction,offlineWorker} from './offline.mjs?v=3';
const size=bytes=>`${(bytes/1048576).toLocaleString('ru-RU',{maximumFractionDigits:1})} МБ`;
export async function initOfflineLibrary(base) {
  const root=document.querySelector('[data-offline-library]');if(!root)return;
  const status=document.querySelector('#offline-library-status'),panels=[...root.querySelectorAll('[data-offline-package]')];
  let manifest=null,packs=[],job=null,ready=false,generation=0;
  const $=(panel,selector)=>panel.querySelector(selector);
  async function readManifest(){
    if(!navigator.onLine)return;
    try{const r=await fetch(new URL('offline-manifest.json',base),{cache:'no-store'});if(r.ok){const value=await r.json();if(value.version===1 && Array.isArray(value.routes))manifest=value;}}catch{}
  }
  function render(){
    for(const panel of panels){
      const slug=panel.dataset.offlinePackage,pack=packs.find(p=>p.slug===slug),current=manifest?.routes.find(p=>p.slug===slug),busy=job?.slug===slug;
      panel.dataset.packageReady=String(Boolean(pack));
      const button=$(panel,'[data-package-download]'),remove=$(panel,'[data-package-remove]'),cancel=$(panel,'[data-package-cancel]'),bar=$(panel,'progress');
      button.disabled=!ready || Boolean(job) || !navigator.onLine;
      button.textContent=busy?'Скачиваем…':pack?current && pack.version!==current.version?'Обновить прогулку':'Проверить обновления':'Скачать прогулку';
      remove.hidden=!pack || busy;remove.disabled=Boolean(job);cancel.hidden=!busy;bar.hidden=!busy;
      if(busy)continue;
      $(panel,'[data-package-status]').textContent=pack?`Готова без сети · ${size(pack.bytes)}. Загружена ${new Date(pack.saved_at).toLocaleDateString('ru-RU')}.`:!navigator.onLine?'Ещё не загружена. Скачайте, когда вернётся связь.':current?`Около ${size(current.bytes)} · карта, остановки и фотографии.`:'Размер пока неизвестен. Попробуйте скачать при устойчивой связи.';
    }
    status.textContent=job?'Загружаем прогулку. Можно отменить; прежняя версия останется.':packs.length?`Готово без сети: ${packs.length} из ${panels.length}. Откройте скачанную прогулку по её названию.`:navigator.onLine?'Выберите прогулку и дождитесь окончания загрузки.':'Загруженных прогулок пока нет. Для скачивания нужна связь.';
  }
  async function refresh(){const ticket=++generation;const value=await offlineAction(base,{type:'LIST'});if(ticket!==generation)return;packs=value;render();}
  try{await offlineWorker(base);await readManifest();ready=true;await refresh();root.dataset.libraryReady='true';}
  catch(error){status.textContent=error.message;for(const panel of panels)$(panel,'[data-package-status]').textContent='Загрузка в браузер пока недоступна. Трек GPX можно скачать отдельно.';root.dataset.libraryReady='error';return;}
  for(const panel of panels){
    const slug=panel.dataset.offlinePackage;
    $(panel,'[data-package-download]').addEventListener('click',async()=>{
      if(job || !navigator.onLine)return;const id=crypto.randomUUID();job={slug,id};render();$(panel,'progress').value=0;
      try{
        await offlineAction(base,{type:'DOWNLOAD',slug,id},value=>{
          $(panel,'progress').value=value.bytes/value.total;
          $(panel,'[data-package-status]').textContent=`Скачиваем карту и остановки · ${Math.floor(value.bytes/value.total*100)}%`;
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
  window.addEventListener('offline',renderControls);
  window.addEventListener('godune:memory-cleared',()=>refresh().catch(()=>{}));
  window.addEventListener('godune:offline-change',()=>refresh().catch(()=>{}));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden && !job)refresh().catch(()=>{});});
}
