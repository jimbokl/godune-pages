import {
  engagementSummary,
  offlineProof,
  prepareEngagementDay,
  saveEngagementDay,
  kaliningradNow,
  solarStatus,
} from './engagement-state.mjs?v=2026101406';

const array=value=>Array.isArray(value)?value:[];
const node=(tag,attrs={},text='')=>{
  const element=document.createElement(tag);
  for(const [key,value] of Object.entries(attrs))if(value!==undefined&&value!==null)element.setAttribute(key,String(value));
  element.textContent=text;
  return element;
};
const stable=value=>JSON.stringify(value,(_,row)=>row&&typeof row==='object'&&!Array.isArray(row)?Object.fromEntries(Object.keys(row).sort().map(key=>[key,row[key]])):row);
const clock=minute=>minute===null||minute===undefined?'—':`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
const validPath=value=>typeof value==='string'&&value.startsWith('/')?value:null;
const safeStyle=(element,styles)=>Object.assign(element.style,styles);
const failures={
  engagement_invalid_context:'Не удалось прочитать подтверждённые связи этой страницы.',
  engagement_empty_selection:'Выберите место или связь для сборки дня.',
  engagement_invalid_date:'Укажите действительную дату дня.',
  engagement_no_matching_recipe:'Для выбранных мест пока нет подходящего готового маршрута. Откройте полный планировщик поездки.',
  wizard_bus_unavailable:'Для этой поездки нужен отдельный расчёт автобуса № 210. Откройте планировщик Куршской косы, чтобы сверить рейсы и возвращение.',
  wizard_rail_unavailable:'Для этой поездки нужен отдельный расчёт железной дороги. Откройте планировщик, чтобы сверить оба направления.',
};
const messageFor=error=>failures[error?.message]||failures[error?.cause?.message]||'День не сохранён. Проверьте дату и выбранные связи.';

function readContext(root){
  const script=root.querySelector('#engagement-context');
  if(!script)return null;
  try{const raw=JSON.parse(script.textContent||'null');return raw&&typeof raw==='object'?{...raw,version:raw.version??raw.schema_version}:null;}catch{return null;}
}
function routeMapRows(context,catalog,selectedPaths){
  const explicit=[...array(context.node?.map_paths),...array(context.core_bridge?.map_paths)];
  const rows=[context.node,...array(context.neighbors).filter(row=>selectedPaths.includes(row.path))].filter(Boolean);
  const poiIds=new Set(rows.flatMap(row=>array(row.poi_ids)));
  const routes=array(catalog?.routes).filter(route=>array(route.stops).some(stop=>poiIds.has(stop.poi)));
  const derived=routes.map(route=>`data/offline-maps/${encodeURIComponent(route.slug)}.geojson`);
  return {paths:[...new Set([...explicit,...derived].filter(path=>typeof path==='string'))],routes};
}
function transportPlanner(context,selectedPaths=[]){
  const rows=[context.node,...array(context.neighbors).filter(row=>selectedPaths.includes(row.path))].filter(Boolean);
  const text=rows.map(row=>`${row.kind||''} ${row.title||''} ${row.path||''} ${array(row.poi_ids).join(' ')}`).join(' ').toLowerCase();
  if(/курш|kursh|высота-эфа|танцующ|210/.test(text))return {type:'curonian',path:'/kurshskaya-kosa/bez-mashiny/',label:'Открыть планировщик Куршской косы: автобус № 210 и возвращение →'};
  if(/балтийск|балтийская-коса|baltic-spit|паром|переправ|ferry/.test(text))return {type:'ferry',path:'/dunes/baltic-spit/how-to-get/',label:'Открыть план переправы на Балтийскую косу →'};
  return null;
}
function nonTripKind(kind){return ['project','investment_model','tender','job'].includes(String(kind||'').toLowerCase());}
function investmentHref(context,base){
  const own=context.node?.path;
  const target=own==='/realty/how-it-works/'?'/realty/compare/':'/realty/how-it-works/';
  return new URL(target.replace(/^\//,''),base).href;
}
function plannerHref(root,base,context,type){
  if(type)return new URL(type.path.replace(/^\//,''),base).href;
  const explicit=context.core_bridge?.planner_url||context.decision_brief?.planner_url;
  if(typeof explicit==='string')return new URL(explicit,base).href;
  const existing=[...document.querySelectorAll('a[href]')].find(anchor=>/\/planner\//.test(anchor.pathname));
  return existing?.href||new URL('planner/',base).href;
}
function summaryText(summary){
  if(!summary.count)return 'Пока ничего не выбрано.';
  const duration=summary.duration_min===null?`время неизвестно для ${summary.duration_unknown} пунктов`:`около ${summary.duration_min} мин`;
  const price=summary.price_kopecks===null?`цена неизвестна для ${summary.price_unknown} пунктов`:`известная сумма ${new Intl.NumberFormat('ru-RU').format(summary.price_kopecks/100)} ₽`;
  return `${summary.count} пункта · ${duration} · ${price}. Неуказанные значения не считаются нулём.`;
}
function localDate(){return kaliningradNow().date;}
function timeMinute(value){
  const match=/^(\d{2}):(\d{2})$/.exec(value||'');
  if(!match)return null;
  const hour=Number(match[1]),minute=Number(match[2]);
  return hour<24&&minute<60?hour*60+minute:null;
}
function datePathLabel(path,context,catalog){
  if(path===location.pathname)return context.node?.title||'Эта страница';
  const row=array(context.neighbors).find(item=>item.path===path);
  if(row?.title)return row.title;
  const routePath=/^data\/offline-maps\/([^/]+)\.geojson$/.exec(path);
  const routeSlug=routePath?decodeURIComponent(routePath[1]):null;
  const route=array(catalog?.routes).find(item=>`/routes/${item.slug}/`===path||item.slug===routeSlug);
  return route?.name||'Карта маршрута';
}
function offlineDetails(original,base){
  if(!original)return null;
  const detail=node('details',{'data-engagement-offline-details':''});
  const summary=node('summary',{'data-engagement-offline':'','aria-live':'polite'},original.textContent||'Доступность офлайн не подтверждена.');
  safeStyle(summary,{minHeight:'44px',display:'flex',alignItems:'center',cursor:'pointer'});
  const body=node('div',{'data-engagement-offline-body':''});
  const resources=node('ul',{'data-engagement-offline-resources':''});
  const packages=node('ul',{'data-engagement-offline-packages':''});
  const link=node('a',{href:new URL('offline/',base).href,'data-engagement-offline-link':''},'Открыть комплекты для сохранения без сети →');
  safeStyle(link,{display:'inline-flex',alignItems:'center',minHeight:'44px',padding:'0 10px'});
  body.append(resources,node('p',{},'Сохранённые комплекты в этом браузере:'),packages,link);
  detail.append(summary,body);
  original.replaceWith(detail);
  return {detail,summary,resources,packages};
}
async function renderOfflinePanel(panel,{context,catalog,selectedPaths,base}={}){
  if(!panel)return;
  panel.resources.replaceChildren();panel.packages.replaceChildren();
  try{
    const {offlineAction}=await import('./offline.mjs?v=2026101305');
    const listed=await offlineAction(base,{type:'LIST'});
    const mapData=routeMapRows(context,catalog,selectedPaths);
    const mapPaths=mapData.paths;
    const proof=offlineProof(listed,{pagePath:location.pathname,mapPaths,base});
    const packages=Array.isArray(listed)?listed:Array.isArray(listed?.packages)?listed.packages:[];
    const missingPaths=new Set(proof.missing.map(path=>{try{return new URL(path,base).pathname;}catch{return path;}}));
    const readyMaps=mapPaths.filter(path=>{try{return !missingPaths.has(new URL(path,base).pathname);}catch{return false;}});
    panel.summary.textContent=mapPaths.length
      ?`${proof.pageReady?'Страница сохранена':'Страница не сохранена'} · карты ${readyMaps.length}/${mapPaths.length}`
      :`${proof.pageReady?'Страница сохранена':'Страница не сохранена'} · карта: путь не определён`;
    panel.summary.dataset.state=proof.ready?'ready':'missing';
    panel.resources.append(node('li',{},`${proof.pageReady?'Сохранена':'Не сохранена'}: эта страница`));
    for(const mapPath of mapPaths){
      const title=datePathLabel(mapPath,context,catalog),stored=!proof.missing.includes(mapPath);
      panel.resources.append(node('li',{},`${stored?'Сохранена':'Не сохранена'}: карта «${title}»`));
    }
    if(!mapPaths.length)panel.resources.append(node('li',{},'Карта для выбранных связей не определена; её статус неизвестен.'));
    if(packages.length){
      const knownLabels=new Map([[new URL(location.pathname,base).pathname,context.node?.title||'Эта страница']]);
      for(const row of [context.node,...array(context.neighbors)])if(validPath(row?.path)&&row?.title)knownLabels.set(new URL(row.path.replace(/^\//,''),base).pathname,row.title);
      for(const route of mapData.routes)knownLabels.set(new URL(`data/offline-maps/${encodeURIComponent(route.slug)}.geojson`,base).pathname,route.name||'Карта маршрута');
      for(const pack of packages){
        const name=pack?.name||pack?.title||'Сохранённый комплект',resources=array(pack?.resources);
        const item=node('li',{},name),list=node('ul',{});
        if(resources.length){
          for(let index=0;index<resources.length;index++){
            const resource=resources[index],path=typeof resource?.path==='string'?resource.path:null;
            let label=resource?.title||resource?.name;
            if(!label&&path){try{label=knownLabels.get(new URL(path,base).pathname);}catch{}}
            list.append(node('li',{},label||`Файл комплекта ${index+1}`));
          }
          item.append(list);
        }else item.append(document.createTextNode(' · ресурсов нет в списке'));
        panel.packages.append(item);
      }
    }else panel.packages.append(node('li',{},'Сохранённых комплектов нет в списке.'));
  }catch{
    panel.summary.textContent='Не удалось проверить сохранённые страницы и карты.';
    panel.summary.dataset.state='unknown';
    panel.resources.append(node('li',{},'Не удалось прочитать список страниц и карт.'));
    panel.packages.append(node('li',{},'Список сохранённых комплектов неизвестен.'));
  }
}

export async function initEngagement({workshop,base,catalog}={}){
  const root=document.querySelector('[data-engagement-page]');
  if(!root||!workshop||!catalog)return null;
  const context=readContext(root);
  if(!context?.node)return null;
  const live=root.querySelector('[data-engagement-live]'),offlineSummary=root.querySelector('[data-engagement-offline]');
  const status=root.querySelector('[data-engagement-status]'),factSummary=root.querySelector('[data-engagement-summary]');
  const path=validPath(context.node.path||root.dataset.nodePath)||location.pathname;
  const storageKey=`godune-engagement:v1:${path}`;
  const kind=String(context.node.kind||root.dataset.kind||'').toLowerCase();

  if(nonTripKind(kind)){
    const link=node('a',{'data-engagement-investment-link':'',href:investmentHref(context,base)},'Открыть инструмент условий недвижимости →');
    safeStyle(link,{display:'inline-flex',alignItems:'center',minHeight:'44px',padding:'0 12px'});
    const callout=node('p',{'data-engagement-investment-callout':''},'Эта страница помогает проверить проект и условия; её нельзя добавить в прогулку как остановку. ');
    callout.append(link);root.append(callout);
    const offline=offlineDetails(offlineSummary,base);
    await renderOfflinePanel(offline,{context,catalog,selectedPaths:[],base});
    const refreshOffline=()=>void renderOfflinePanel(offline,{context,catalog,selectedPaths:[],base});
    window.addEventListener('godune:offline-change',refreshOffline);
    window.addEventListener('godune:memory-cleared',refreshOffline);
    const solarCleanup=await initLiveStatus({live,offlineSummary:null,context,base,catalog,selected:()=>[]});
    return {refresh:async()=>{await Promise.all([solarCleanup.refresh(),renderOfflinePanel(offline,{context,catalog,selectedPaths:[],base})]);},getSelection:()=>[],destroy:()=>{solarCleanup.destroy();window.removeEventListener('godune:offline-change',refreshOffline);window.removeEventListener('godune:memory-cleared',refreshOffline);callout.remove();offline?.detail.remove();}};
  }

  const transportOnPage=transportPlanner(context,[path]);
  if(transportOnPage){
    const link=node('a',{'data-engagement-planner-link':'',href:plannerHref(root,base,context,transportOnPage)},transportOnPage.label);
    safeStyle(link,{display:'inline-flex',alignItems:'center',minHeight:'48px',padding:'4px 12px',margin:'8px 0'});
    const callout=node('p',{'data-engagement-transport-callout':''},'Для этой поездки используйте отдельный транспортный план: он учитывает автобус или паром и возвращение. ');
    callout.append(link);root.append(callout);
    const offline=offlineDetails(offlineSummary,base);
    await renderOfflinePanel(offline,{context,catalog,selectedPaths:[],base});
    const refreshOffline=()=>void renderOfflinePanel(offline,{context,catalog,selectedPaths:[],base});
    window.addEventListener('godune:offline-change',refreshOffline);
    window.addEventListener('godune:memory-cleared',refreshOffline);
    const liveCleanup=await initLiveStatus({live,context,base,catalog});
    return {refresh:async()=>{await Promise.all([liveCleanup.refresh(),renderOfflinePanel(offline,{context,catalog,selectedPaths:[],base})]);},getSelection:()=>[],destroy:()=>{liveCleanup.destroy();window.removeEventListener('godune:offline-change',refreshOffline);window.removeEventListener('godune:memory-cleared',refreshOffline);callout.remove();offline?.detail.remove();}};
  }

  let selected=new Set();
  const selectableNeighbors=array(context.neighbors).filter(row=>!nonTripKind(row.kind)&&(array(row.poi_ids).length||array(row.recipe_ids).length));
  try{const cached=JSON.parse(localStorage.getItem(storageKey)||'[]');if(Array.isArray(cached))selected=new Set(cached.filter(value=>value===path||selectableNeighbors.some(row=>row.path===value)));}catch{}

  const controls=node('details',{'data-engagement-controls':''});
  const summary=node('summary',{},'Собрать свой день');
  safeStyle(summary,{minHeight:'44px',display:'flex',alignItems:'center',cursor:'pointer'});
  const content=node('div',{'data-engagement-control-content':''});
  const heading=node('p',{},'Выберите страницу и подтверждённые связи; дата и время останутся в вашем Trip.');
  const choices=node('fieldset',{'data-engagement-choices':''});
  choices.append(node('legend',{},'Что включить в день'));
  const currentLabel=node('label',{'data-engagement-choice':''}),current=node('input',{type:'checkbox','data-engagement-select-current':'',value:path});
  currentLabel.append(current,document.createTextNode(` ${context.node.title||'Эта страница'}`));choices.append(currentLabel);
  const relationNames={before:'До этой точки',after:'Следующий шаг',alternative:'Альтернатива',complement:'Дополнение'};
  for(const row of selectableNeighbors){
    const label=node('label',{'data-engagement-choice':''});
    const check=node('input',{type:'checkbox','data-engagement-select-neighbor':'',value:row.path, 'aria-label':`Добавить в день: ${row.title||'связанную страницу'}`});
    label.append(check,node('span',{},`${relationNames[row.relation]||'Связь'} · ${row.title||'Страница'}`));choices.append(label);
  }
  for(const label of choices.querySelectorAll('[data-engagement-choice]'))safeStyle(label,{display:'flex',alignItems:'center',gap:'10px',minHeight:'44px',padding:'4px 8px'});
  for(const check of choices.querySelectorAll('input[type="checkbox"]'))safeStyle(check,{width:'22px',height:'22px',flex:'0 0 22px'});

  const controlsRow=node('div',{'data-engagement-options':''});
  const dateLabel=node('label',{},'Дата дня');
  const date=node('input',{type:'date','data-engagement-date':'',value:localDate()});dateLabel.append(date);
  const startLabel=node('label',{},'Начало');
  const start=node('input',{type:'time','data-engagement-start':'',value:'09:00'});startLabel.append(start);
  const endLabel=node('label',{},'Окончание');
  const end=node('input',{type:'time','data-engagement-end':'',value:'18:00'});endLabel.append(end);
  for(const label of [dateLabel,startLabel,endLabel])safeStyle(label,{display:'grid',gap:'5px',minHeight:'44px',padding:'5px 0'});
  const selectionSummary=node('p',{'data-engagement-selection-summary':'','aria-live':'polite'},'Пока ничего не выбрано.');
  const save=node('button',{type:'button','data-engagement-save':'',disabled:''},'Собрать и сохранить день');
  safeStyle(save,{minHeight:'44px',padding:'0 14px'});
  controlsRow.append(dateLabel,startLabel,endLabel,selectionSummary,save);
  content.append(heading,choices,controlsRow);controls.append(summary,content);root.append(controls);

  const dock=node('aside',{'data-engagement-dock':'','aria-label':'Выбранное для поездки',hidden:''});
  safeStyle(dock,{position:'fixed',zIndex:'50',left:'50%',bottom:'max(8px, env(safe-area-inset-bottom))',transform:'translateX(-50%)',width:'min(420px, calc(100vw - 16px))',maxHeight:'30vh',overflow:'auto',padding:'6px 8px',display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:'4px 8px',fontSize:'14px',lineHeight:'1.3'});
  const dockSummary=node('p',{'data-engagement-dock-summary':'','aria-live':'polite'});
  dockSummary.style.gridColumn='1 / -1';dockSummary.style.margin='0';
  const formatLabel=node('label',{},'PDF');
  safeStyle(formatLabel,{display:'flex',alignItems:'center',gap:'6px',minHeight:'44px'});
  const format=node('select',{'data-engagement-pdf-format':'','aria-label':'Формат PDF'});
  safeStyle(format,{minHeight:'44px',maxWidth:'112px'});
  format.append(node('option',{value:'phone'},'Телефон'),node('option',{value:'a4'},'A4'));formatLabel.append(format);
  const pdf=node('button',{type:'button','data-engagement-pdf':'',disabled:''},'Скачать PDF поездки');
  safeStyle(pdf,{minHeight:'44px',padding:'0 8px',maxWidth:'170px'});
  const dockStatus=node('p',{'data-engagement-dock-status':'','aria-live':'polite'});
  dockStatus.style.gridColumn='1 / -1';dockStatus.style.margin='0';
  const pagePlan=transportOnPage;
  const planner=node('a',{href:plannerHref(root,base,context,pagePlan),'data-engagement-planner-link':''},pagePlan?.label||'Открыть планировщик транспорта →');
  planner.hidden=true;safeStyle(planner,{minHeight:'44px',alignItems:'center',padding:'0 8px',gridColumn:'1 / -1'});
  dock.append(dockSummary,formatLabel,pdf,planner,dockStatus);document.body.append(dock);

  const offline=offlineDetails(offlineSummary,base);
  const updateSelection=()=>{
    const sum=engagementSummary(context,[...selected]);
    selectionSummary.textContent=summaryText(sum);dockSummary.textContent=summaryText(sum);
    dock.hidden=sum.count===0;dock.style.display=sum.count===0?'none':'grid';save.disabled=sum.count===0;pdf.disabled=sum.count===0;
    current.checked=selected.has(path);
    for(const check of choices.querySelectorAll('[data-engagement-select-neighbor]'))check.checked=selected.has(check.value);
    try{localStorage.setItem(storageKey,JSON.stringify([...selected]));}catch{}
    if(factSummary)factSummary.textContent=`${context.node.title||'Страница'} · ${summaryText(engagementSummary(context,[path]))}`;
  };
  choices.addEventListener('change',event=>{
    const target=event.target;
    if(target.matches('[data-engagement-select-current], [data-engagement-select-neighbor]')){
      if(target.checked)selected.add(target.value);else selected.delete(target.value);
      updateSelection();void refreshOffline();
    }
  });
  updateSelection();

  const refreshOffline=()=>renderOfflinePanel(offline,{context,catalog,selectedPaths:[...selected],base});
  await refreshOffline();
  const rerenderOffline=()=>void refreshOffline();
  window.addEventListener('godune:offline-change',rerenderOffline);
  window.addEventListener('godune:memory-cleared',rerenderOffline);

  const liveCleanup=await initLiveStatus({live,context,base,catalog,selected:()=>[...selected]});
  save.addEventListener('click',async()=>{
    if(save.disabled||!selected.size)return;
    const routePlanner=transportPlanner(context,[...selected]);
    if(routePlanner){planner.href=plannerHref(root,base,context,routePlanner);planner.textContent=routePlanner.label;planner.hidden=false;planner.style.display='inline-flex';dock.hidden=false;status.textContent='Для автобуса или парома нужен отдельный план с проверкой рейсов и возвращения.';status.dataset.kind='info';return;}
    save.disabled=true;planner.hidden=true;status.textContent='Проверяем подходящий маршрут и сохраняем день…';status.dataset.kind='info';
    try{
      if(!date.value)throw Error('engagement_invalid_date');
      const snapshot=workshop.getState(),expectedRevision=workshop.getRevision();
      const options={date:date.value,start:timeMinute(start.value),end:timeMinute(end.value),transport:'auto'};
      const proposal=prepareEngagementDay(snapshot,catalog,context,[...selected],options,null);
      let result;
      const commit=await workshop.setState(current=>{
        result=saveEngagementDay(current,proposal,catalog,null);
        return result.state;
      },'Связанный день добавлен в поездку.',{expectedRevision});
      if(commit?.conflict||!commit?.saved)throw Error('engagement_stale_trip');
      if(!result?.applied)throw Error(result?.reason==='changed'?'engagement_stale_trip':'engagement_save_failed');
      const savedDay=(workshop.getState()?.itinerary?.days||[]).find(day=>day.id===result.targetId);
      status.textContent=result.reason==='already_saved'?'Этот день уже есть в поездке. Повторная сборка не создала копию.':`День «${savedDay?.name||context.node.title||'Маршрут'}» добавлен. Остальные дни поездки и блюда сохранены.`;
      status.dataset.kind='success';
    }catch(error){
      if(['wizard_bus_unavailable','wizard_rail_unavailable'].includes(error.message)){
        const target=transportPlanner(context,[...selected]);
        if(target){planner.href=plannerHref(root,base,context,target);planner.textContent=target.label;planner.hidden=false;planner.style.display='inline-flex';dock.hidden=false;}
      }
      status.textContent=error.message==='engagement_stale_trip'?'Поездка изменилась в другой вкладке. Обновите страницу и повторите сборку.':error.message==='engagement_save_failed'?'Изменения поездки помешали сохранить день. Обновите страницу и повторите.':messageFor(error);
      status.dataset.kind='error';
    }finally{save.disabled=selected.size===0;}
  });
  pdf.addEventListener('click',async()=>{
    if(pdf.disabled)return;
    pdf.disabled=true;dockStatus.textContent='Готовим PDF всей поездки…';
    const trip=structuredClone(workshop.getState()),signature=stable(trip);
    try{
      const {downloadPersonalGuide}=await import('./trip-guide-ui.mjs?v=2026101406');
      const result=await downloadPersonalGuide({trip,catalog,base,scope:'trip',format:format.value||'phone',onProgress:text=>{dockStatus.textContent=text;},stillCurrent:()=>stable(workshop.getState())===signature,title:'Моя поездка'});
      dockStatus.textContent=`Буклет готов: ${result.pages} стр. В него вошла вся поездка.`;
    }catch(error){dockStatus.textContent=error.message==='guide_trip_changed'?'Поездка изменилась во время подготовки PDF. Повторите загрузку.':'Не удалось подготовить PDF. Попробуйте ещё раз.';}
    finally{pdf.disabled=selected.size===0;}
  });

  return {refresh:async()=>{await Promise.all([refreshOffline(),liveCleanup.refresh()]);updateSelection();},getSelection:()=>[...selected],destroy:()=>{liveCleanup.destroy();window.removeEventListener('godune:offline-change',rerenderOffline);window.removeEventListener('godune:memory-cleared',rerenderOffline);controls.remove();dock.remove();}};
}

async function initLiveStatus({live,context,base,selected=()=>[]}={}){
  let timer=null;
  const updateSolar=async()=>{
    if(!live||!Number.isFinite(context?.node?.lat)||!Number.isFinite(context?.node?.lon)){
      if(live){live.textContent='Световой расчёт для этой точки неизвестен.';live.dataset.solarState='unknown';}return;
    }
    const now=new Date(),local=kaliningradNow(now);
    try{
      const {loadScheduler}=await import('./trip-scheduler.mjs?v=2026101305');
      const calculate=await loadScheduler(base);
      const begin=Math.min(local.minute,1439),leave=Math.min(1440,begin+1);
      const light=calculate.light({version:1,date:local.date,stops:[{id:'engagement-current',lat:context.node.lat,lon:context.node.lon,begins:begin,leaves:leave,outdoor:true}]});
      const value=solarStatus(light,now);
      if(value.state==='unknown')live.textContent='Световой расчёт для текущей даты пока неизвестен.';
      else live.textContent=`Калининградское время ${clock(value.currentMinute)} · ${value.remainingToSunset?`до заката ${value.remainingToSunset} мин`:`закат ${clock(value.sunset)} уже прошёл`} · сумерки до ${clock(value.dusk)} (${value.remainingToDusk} мин).`;
      live.dataset.solarState=value.state;
    }catch{live.textContent='Световой расчёт временно неизвестен.';live.dataset.solarState='unknown';}
  };
  await updateSolar();
  timer=setInterval(()=>{if(!document.hidden)void updateSolar();},60000);
  const visibility=()=>{if(!document.hidden)void updateSolar();};document.addEventListener('visibilitychange',visibility);
  return {refresh:updateSolar,destroy:()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visibility);}};
}
