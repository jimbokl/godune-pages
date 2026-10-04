import {offlineAction} from './offline.mjs?v=6';

const SLUG='region-coast';
const REQUIRED=[
  'kurshskaya-kosa/bez-mashiny/index.html', 'kosa-offline.mjs', 'kosa-planner.mjs',
  'kosa-pdf.mjs', 'kosa-pdf-worker.mjs', 'kosa-pdf-renderer.mjs',
  'data/kosa-bus-210.json', 'data/kosa-interchanges.json', 'guides/manifest.json',
  ...['vysota-efa','tancuyushchiy-les'].flatMap(slug=>['phone','print'].map(format=>`guides/${slug}-${format}.pdf`)),
];
const size=bytes=>`${(bytes/1048576).toLocaleString('ru-RU',{maximumFractionDigits:1})} МБ`;

// A saved whole-region map may already cover the coast: don't download it twice.
export function kosaOfflinePack(packs, expected) {
  const usable=packs.filter(pack=>[SLUG,'region-all'].includes(pack.slug)
    && REQUIRED.every(path=>pack.resources?.some(resource=>resource.path===path)));
  return (expected && usable.find(pack=>containsVersion(pack,expected))) || usable[0] || null;
}
function containsVersion(pack,expected) {
  const saved=new Map(pack.resources.map(row=>[row.path,row.sha256]));
  return expected.resources.every(row=>saved.get(row.path)===row.sha256);
}

export async function initKosaOffline(base) {
  const root=document.querySelector('[data-kosa-offline]');
  if (!root || root.dataset.offlineReady==='true') return;
  const status=root.querySelector('[data-kosa-offline-status]');
  const button=root.querySelector('[data-kosa-offline-download]');
  const cancel=root.querySelector('[data-kosa-offline-cancel]');
  const bar=root.querySelector('progress');
  let manifest=null, pack=null, job=null, checking=false, generation=0;
  const current=()=>manifest?.regions?.find(row=>row.slug===SLUG);
  function upToDate() {
    if (!pack || !current()) return null;
    return containsVersion(pack,current());
  }
  function render() {
    root.dataset.packageReady=String(Boolean(pack));
    button.disabled=checking || Boolean(job) || !navigator.onLine;
    cancel.hidden=!job;
    bar.hidden=!job;
    button.textContent=job?'Скачиваем…':pack?upToDate()===false?'Обновить карту и путеводители':'Проверить обновления':'Скачать карту и путеводители';
    if (job) { status.textContent=job.message; return; }
    if (checking) {status.textContent='Проверяем обновления…';return;}
    if (pack) {
      status.textContent=`Готово без сети · ${size(pack.bytes)} в браузере. Скачано ${new Date(pack.saved_at).toLocaleDateString('ru-RU')}. ${upToDate()===false?'Есть новая версия. Прежняя останется до конца обновления.':'Карта, расчёт дня и путеводители доступны в скачанной версии.'}`;
    } else if (!navigator.onLine) {
      status.textContent='Карта для этой поездки ещё не скачана. Загрузите её, когда вернётся связь. Если PDF уже сохранён в файлах телефона, он откроется без сайта.';
    } else if (current()) {
      status.textContent=`${size(current().download_bytes)} по сети · ${size(current().bytes)} в браузере. Пока карта не скачана; дождитесь конца загрузки.`;
    } else {
      status.textContent='Размер пока не удалось узнать. При устойчивой связи можно повторить загрузку; готовность подтвердим после проверки всех файлов.';
    }
  }
  async function readManifest() {
    if (!navigator.onLine) return;
    try {
      const response=await fetch(new URL('offline-manifest.json',base),{cache:'no-store'});
      if (response.ok) { const value=await response.json(); if(value.version===1 && Array.isArray(value.regions)) manifest=value; }
    } catch { /* Saved complete packages remain available without the network. */ }
  }
  async function refresh() {
    const ticket=++generation;
    const packs=await offlineAction(base,{type:'LIST'});
    if(ticket!==generation) return;
    pack=kosaOfflinePack(packs,current());render();
  }
  status.textContent='Проверяем, что уже скачано…';
  await Promise.all([readManifest(),refresh()]);
  render();root.dataset.offlineReady='true';
  button.addEventListener('click',async()=>{
    if(job || checking || !navigator.onLine) return;
    // Already covered by the full-region package; checking needn't create a second copy.
    checking=true;render();
    try {await readManifest();await refresh();}
    catch(error) {status.textContent=error.message;checking=false;button.disabled=!navigator.onLine;return;}
    checking=false;
    if(!navigator.onLine) {render();return;}
    if(pack && upToDate()===true) {render();return;}
    const id=crypto.randomUUID();job={id,message:'Скачиваем карту и путеводители…'};bar.value=0;render();
    try {
      await offlineAction(base,{type:'DOWNLOAD',slug:SLUG,id},value=>{
        bar.value=value.bytes/value.total;
        job.message=value.phase==='archive'?`Скачиваем карту · ${size(value.received)} из ${size(value.archiveBytes)}`:value.phase==='unpack'?`Сохраняем карту · ${Math.floor(value.bytes/value.total*100)}%`:`Скачиваем страницы и путеводители · ${Math.floor(value.bytes/value.total*100)}%`;
        render();
      });
      job=null;await refresh();
      if(!pack) throw new Error('Не удалось подтвердить все файлы поездки. Повторите загрузку; прежние карты остаются в «Моих скачанных картах».');
      window.dispatchEvent(new Event('godune:offline-change'));
    } catch(error) {
      job=null;await refresh().catch(()=>render());status.textContent=error.message;
    } finally {job=null;button.disabled=!navigator.onLine;cancel.hidden=true;bar.hidden=true;}
  });
  cancel.addEventListener('click',()=>{
    if(job) offlineAction(base,{type:'CANCEL',slug:SLUG,id:job.id}).catch(error=>{status.textContent=error.message;});
  });
  const safelyRefresh=()=>refresh().catch(()=>{status.textContent='Не удалось проверить скачанные файлы. Откройте «Мои скачанные карты» или попробуйте снова.';});
  window.addEventListener('online',()=>readManifest().then(safelyRefresh));
  window.addEventListener('offline',render);
  window.addEventListener('godune:offline-change',safelyRefresh);
  window.addEventListener('godune:memory-cleared',safelyRefresh);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden && !job) safelyRefresh();});
}
