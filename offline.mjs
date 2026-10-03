const size = bytes => `${(bytes/1048576).toLocaleString('ru-RU',{maximumFractionDigits:1})} МБ`;
let ready;
export function offlineWorker(base) {
  if (!ready) ready=(async()=>{
    if (!('serviceWorker' in navigator)) throw new Error('Этот браузер пока не сохраняет прогулки без сети. GPX можно скачать по ссылке выше.');
    const unavailable='Скачать прогулку в этом браузере пока не получилось. Попробуйте обновить страницу или возьмите GPX по ссылке выше.';
    const registration=await navigator.serviceWorker.register(new URL('sw.js',base),{scope:new URL('.',base).pathname,updateViaCache:'none'}).catch(error=>{throw new Error(unavailable,{cause:error});});
    if (!registration) throw new Error(unavailable);
    if (registration.active) return registration.active;
    const worker=registration.installing || registration.waiting;
    if (!worker) throw new Error('Загрузка пока недоступна. Попробуйте ещё раз.');
    return new Promise((resolve,reject)=>{
      const changed=()=>{if(worker.state==='activated'){worker.removeEventListener('statechange',changed);resolve(worker);}else if(worker.state==='redundant'){worker.removeEventListener('statechange',changed);reject(new Error('Не удалось подготовить загрузку. Попробуйте ещё раз.'));}};
      worker.addEventListener('statechange',changed); changed();
    });
  })().catch(error=>{ready=undefined;throw error;});
  return ready;
}
export async function offlineAction(base, data, progress) {
  const worker=await offlineWorker(base);
  return new Promise((resolve,reject)=>{
    const channel=new MessageChannel();
    channel.port1.onmessage=({data})=>{
      if(data.type==='progress') progress?.(data);
      else {channel.port1.close();if(data.type==='done') resolve(data.value);else reject(new Error(data.message));}
    };
    worker.postMessage(data,[channel.port2]);
  });
}
export async function offlinePaths(base) {
  try {const packs=await offlineAction(base,{type:'LIST'});return new Set(packs.flatMap(p=>p.resources.map(r=>new URL(r.path.replace(/index\.html$/,''),base).pathname)));}
  catch{return new Set();}
}
export async function initOffline(base) {
  if(document.querySelector('[data-offline-library]')) import(new URL('offline-library.mjs?v=3',base)).then(({initOfflineLibrary})=>initOfflineLibrary(base)).catch(()=>{document.querySelector('#offline-library-status').textContent='Загрузки пока не открылись. Попробуйте обновить страницу.';});
  const panel=document.querySelector('[data-offline-route]'), list=document.querySelector('#trip-offline-list');
  const banner=document.createElement('p');banner.className='offline-network';banner.setAttribute('role','status');
  banner.textContent='Без сети. Скачанные карты, прогулки и ваши отметки остаются с вами.';
  document.querySelector('main')?.prepend(banner);
  const network=()=>{banner.hidden=navigator.onLine;if(panel) button.disabled=busy || !initialized || !navigator.onLine;};
  const button=panel?.querySelector('[data-offline-download]'), remove=panel?.querySelector('[data-offline-remove]'), cancel=panel?.querySelector('[data-offline-cancel]'), status=panel?.querySelector('[data-offline-status]'), bar=panel?.querySelector('progress');
  let busy=false, initialized=false, id, manifest, packs=[];
  network();window.addEventListener('online',network);window.addEventListener('offline',network);
  async function refresh() {
    packs=await offlineAction(base,{type:'LIST'});
    if(list){list.replaceChildren(...packs.map(p=>{const li=document.createElement('li'),a=document.createElement('a');a.href=new URL(p.kind==='region'?'map/':`routes/${p.slug}/`,base);a.textContent=p.name;li.append(a);return li;}));list.closest('.trip-offline').hidden=!packs.length;}
    if(panel){
      const slug=panel.dataset.offlineRoute,pack=packs.find(p=>p.slug===slug),current=manifest?.routes.find(p=>p.slug===slug);
      remove.hidden=!pack;
      button.textContent=pack ? current && pack.version!==current.version ? 'Обновить прогулку' : 'Проверить обновления' : 'Скачать прогулку';
      if(pack) status.textContent=`Готова без сети · ${size(pack.bytes)}. Загружена ${new Date(pack.saved_at).toLocaleDateString('ru-RU')}. Условия посещения проверяйте перед выходом.`;
      else status.textContent=current ? `Около ${size(current.bytes)} на телефоне. Загружайте перед выходом, пока есть связь.` : navigator.onLine ? 'Подготовим карту и остановки перед выходом.' : 'Эта прогулка ещё не загружена. Подключитесь к сети, чтобы взять её с собой.';
    }
    network();
  }
  async function readManifest() {
    if(panel && navigator.onLine){try{const response=await fetch(new URL('offline-manifest.json',base),{cache:'no-store'});if(response.ok)manifest=await response.json();}catch{}}
  }
  try {
    await offlineWorker(base);
    await readManifest();
    await refresh();
  } catch(error){if(status)status.textContent=error.message;return;}
  window.addEventListener('online',()=>readManifest().then(refresh).catch(()=>{}));
  window.addEventListener('godune:offline-change',()=>refresh().catch(()=>{}));
  window.addEventListener('godune:memory-cleared',()=>refresh().catch(()=>{}));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden && !busy)refresh().catch(()=>{});});
  button?.addEventListener('click',async()=>{
    if(busy)return;busy=true;id=crypto.randomUUID();button.disabled=true;remove.hidden=true;cancel.hidden=false;bar.hidden=false;bar.value=0;
    status.textContent='Берём карту и остановки с собой…';let shown=-1;
    try{
      await offlineAction(base,{type:'DOWNLOAD',slug:panel.dataset.offlineRoute,id},value=>{bar.value=value.bytes/value.total;const percent=Math.floor(value.bytes/value.total*10)*10;if(percent!==shown){shown=percent;status.textContent=`Загружаем прогулку · ${percent}%`;}});
      busy=false;await refresh();window.dispatchEvent(new Event('godune:offline-change'));
    }catch(error){busy=false;await refresh().catch(()=>{});status.textContent=error.message;}
    finally{busy=false;cancel.hidden=true;bar.hidden=true;network();}
  });
  cancel?.addEventListener('click',()=>offlineAction(base,{type:'CANCEL',slug:panel.dataset.offlineRoute,id}).catch(()=>{}));
  remove?.addEventListener('click',async()=>{remove.disabled=true;try{await offlineAction(base,{type:'REMOVE',slug:panel.dataset.offlineRoute});await refresh();status.textContent='Загрузка удалена. Ваш выбор и пройденные остановки сохранены.';window.dispatchEvent(new Event('godune:offline-change'));}catch(error){status.textContent=error.message;}finally{remove.disabled=false;}});
  initialized=true;network();
}
