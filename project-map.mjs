export function mapState(params, versions, defaultDocument) {
  const document = Object.hasOwn(versions, params.get('document')) ? params.get('document') : defaultDocument;
  const plot = versions[document].includes(params.get('plot')) ? params.get('plot') : '';
  return {document, plot, query:(params.get('q') || '').slice(0,160)};
}
export function mapUrl(base,state) {
  const url=new URL(base);url.searchParams.set('document',state.document);
  for(const [key,value] of [['plot',state.plot],['q',state.query]]) value ? url.searchParams.set(key,value) : url.searchParams.delete(key);
  url.hash='map';return url;
}
export function matchingPlots(rows,query='') {
  const words=query.toLocaleLowerCase('ru').trim().split(/\s+/).filter(Boolean);
  return rows.filter(row=>words.every(word=>row.text.toLocaleLowerCase('ru').includes(word)));
}
export function boundedView(view, full) {
  const width=Math.min(full[2],Math.max(full[2]/64,view[2]));
  const height=width*full[3]/full[2];
  return [Math.max(full[0],Math.min(full[0]+full[2]-width,view[0])),Math.max(full[1],Math.min(full[1]+full[3]-height,view[1])),width,height];
}

if(typeof document!=='undefined') {
 const root=document.querySelector('[data-project-map][data-default-document]');
 if(root) {
  const editions=[...root.querySelectorAll('[data-map-edition]')];
  const versions=Object.fromEntries(editions.map(el=>[el.dataset.mapEdition,[...el.querySelectorAll('[data-map-record]')].map(r=>r.dataset.mapRecord)]));
  const selector=root.querySelector('[data-map-document]'),search=root.querySelector('[data-map-search]');
  const cards=new Map(editions.map(el=>[el.dataset.mapEdition,el.querySelector('[data-map-selection]').innerHTML]));
  let state=mapState(new URL(location.href).searchParams,versions,root.dataset.defaultDocument);
  function edition(){return editions.find(el=>el.dataset.mapEdition===state.document)}
  function setView(svg,view){svg.setAttribute('viewBox',boundedView(view,svg.dataset.fullView.split(' ').map(Number)).join(' '))}
  function resetView(el){const svg=el.querySelector('svg');svg.setAttribute('viewBox',svg.dataset.fullView)}
  function fit(el,id) {
   const svg=el.querySelector('svg'),path=el.querySelector(`[data-plot-link="${id}"] path`);if(!path)return;
   const box=path.getBBox(),full=svg.dataset.fullView.split(' ').map(Number);
   const width=Math.max(box.width*1.8,box.height*1.8*full[2]/full[3],full[2]/64);
   setView(svg,[box.x+box.width/2-width/2,box.y+box.height/2-width*full[3]/full[2]/2,width,width*full[3]/full[2]]);
  }
  function draw({focus=false,fitPlot=false}={}) {
   selector.value=state.document;search.value=state.query;
   for(const el of editions)el.hidden=el.dataset.mapEdition!==state.document;
   const el=edition(),rows=[...el.querySelectorAll('[data-map-record]')];
   const matching=new Set(matchingPlots(rows.map(node=>({id:node.dataset.mapRecord,text:node.dataset.search})),state.query).map(r=>r.id));
   for(const node of rows){node.hidden=!matching.has(node.dataset.mapRecord);node.classList.toggle('is-selected',node.dataset.mapRecord===state.plot);}
   for(const link of el.querySelectorAll('[data-plot-link]')) {
    const selected=link.dataset.plotLink===state.plot;
    link.classList.toggle('is-selected',selected);link.setAttribute('aria-current',selected?'true':'false');
    link.classList.toggle('is-muted',!matching.has(link.dataset.plotLink));
   }
   const selection=el.querySelector('[data-map-selection]'),record=rows.find(r=>r.dataset.mapRecord===state.plot);
   selection.innerHTML=record ? record.querySelector('[data-map-detail]').innerHTML : cards.get(state.document);
   if(fitPlot&&record)fit(el,state.plot);
   if(focus&&record){selection.tabIndex=-1;selection.focus({preventScroll:true});selection.scrollIntoView({block:'nearest',behavior:'instant'});}
   el.querySelector('[data-map-count]').textContent=`Найдено ${matching.size} из ${rows.length}`;
   el.querySelector('[data-map-empty]').hidden=matching.size!==0;
  }
  function save(push=false){history[push?'pushState':'replaceState'](null,'',mapUrl(location.href,state));}
  function select(id){state={...state,plot:id};save(true);draw({focus:true,fitPlot:true});}
  selector.addEventListener('change',()=>{state={document:selector.value,plot:'',query:''};resetView(edition());save(true);draw();});
  search.addEventListener('input',()=>{state={...state,query:search.value.slice(0,160)};save();draw();});
  root.querySelector('[data-map-reset]').addEventListener('click',()=>{state={...state,plot:'',query:''};resetView(edition());save();draw();});
  for(const el of editions) {
   for(const record of el.querySelectorAll('[data-map-record]')) {
    const link=record.querySelector('[data-select-plot]');
    const title=record.querySelector('h3').textContent;
    const summary=document.createElement('small');summary.textContent=record.querySelector('dd').textContent+' · '+record.querySelectorAll('dd')[1].textContent;
    link.textContent=title;link.append(summary);
    link.addEventListener('click',event=>{event.preventDefault();select(record.dataset.mapRecord)});
   }
   for(const link of el.querySelectorAll('[data-plot-link]'))link.addEventListener('click',event=>{event.preventDefault();select(link.dataset.plotLink)});
   for(const button of el.querySelectorAll('[data-zoom]'))button.addEventListener('click',()=>{
    const svg=el.querySelector('svg');
    if(button.dataset.zoom==='reset'){resetView(el);return;}
    const view=svg.getAttribute('viewBox').split(/\s+/).map(Number),factor=button.dataset.zoom==='in'?0.5:2;
    const width=view[2]*factor,height=view[3]*factor;
    setView(svg,[view[0]+(view[2]-width)/2,view[1]+(view[3]-height)/2,width,height]);
   });
   for(const input of el.querySelectorAll('[data-layer]'))input.addEventListener('change',()=>el.classList.toggle(`hide-${input.dataset.layer}`,!input.checked));
   const svg=el.querySelector('svg');let drag=null;
   svg.addEventListener('pointerdown',event=>{
    if(event.button!==0||event.target.closest('[data-plot-link]'))return;
    const view=svg.getAttribute('viewBox').split(/\s+/).map(Number),full=svg.dataset.fullView.split(' ').map(Number);
    if(view[2]>=full[2])return;
    const pt=new DOMPoint(event.clientX,event.clientY).matrixTransform(svg.getScreenCTM().inverse());
    drag={id:event.pointerId,x:pt.x,y:pt.y,view};svg.setPointerCapture(event.pointerId);
   });
   svg.addEventListener('pointermove',event=>{
    if(!drag||drag.id!==event.pointerId)return;
    const pt=new DOMPoint(event.clientX,event.clientY).matrixTransform(svg.getScreenCTM().inverse());
    const v=svg.getAttribute('viewBox').split(/\s+/).map(Number);
    setView(svg,[v[0]+drag.x-pt.x,v[1]+drag.y-pt.y,v[2],v[3]]);
   });
   for(const type of ['pointerup','pointercancel','lostpointercapture'])svg.addEventListener(type,()=>{drag=null});
   el.querySelector('[data-map-share]').addEventListener('click',async event=>{
    const button=event.currentTarget;
    const url=mapUrl(location.href,state).href;
    try{await navigator.clipboard.writeText(url);button.textContent='Ссылка скопирована ✓';}
    catch{let field=el.querySelector('[data-share-fallback]');if(!field){field=document.createElement('input');field.dataset.shareFallback='';field.readOnly=true;field.setAttribute('aria-label','Ссылка на выбранную редакцию и участок');el.querySelector('.map-results-heading').after(field);}field.value=url;field.focus();field.select();}
   });
  }
  addEventListener('popstate',()=>{state=mapState(new URL(location.href).searchParams,versions,root.dataset.defaultDocument);draw({fitPlot:true});});
  root.id='map';root.classList.add('map-enhanced');
  for(const node of root.querySelectorAll('[data-map-tools],[data-map-zoom],[data-map-layers],[data-map-share]'))node.hidden=false;
  draw({fitPlot:true});
 }
}
