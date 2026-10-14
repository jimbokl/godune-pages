import './project-dossier.mjs?v=2026101406';

export function mapState(params, versions, defaultDocument) {
  const document = Object.hasOwn(versions, params.get('document')) ? params.get('document') : defaultDocument;
  const plot = versions[document].includes(params.get('plot')) ? params.get('plot') : '';
  return {document, plot, query:(params.get('q') || '').slice(0,160), view:params.get('view')==='document'?'document':'geographic'};
}
export function mapUrl(base,state) {
  const url=new URL(base);url.searchParams.set('document',state.document);
  state.view==='document'?url.searchParams.set('view','document'):url.searchParams.delete('view');
  for(const [key,value] of [['plot',state.plot],['q',state.query]]) value ? url.searchParams.set(key,value) : url.searchParams.delete(key);
  url.hash='map';return url;
}
export function matchingPlots(rows,query='') {
  const normalize=value=>value.normalize('NFKC').toLocaleLowerCase('ru').replace(/з(?=у)/gu,'3');
  const words=normalize(query).trim().split(/\s+/).filter(Boolean);
  return rows.filter(row=>words.every(word=>normalize(row.text).includes(word)));
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
  function activeSvg(el){return el.querySelector(`[data-map-svg="${state.view}"]`)}
  function mapLabels(svg){
   if(svg.dataset.mapSvg!=='geographic')return;
   const matrix=svg.getScreenCTM(),scale=matrix&&Math.hypot(matrix.a,matrix.b);if(!(scale>0))return;
   const place=svg.querySelector('.map-place-label'),marker=place.querySelector('circle'),text=place.querySelector('text');
   marker.setAttribute('r',3/scale);text.style.fontSize=`${13/scale}px`;text.style.strokeWidth=`${3/scale}px`;
   const x=Number(marker.getAttribute('cx')),view=svg.viewBox.baseVal,end=view.x+view.width-x<text.getComputedTextLength()+8/scale;
   text.setAttribute('text-anchor',end?'end':'start');text.setAttribute('x',x+(end?-8:8)/scale);text.setAttribute('y',Number(marker.getAttribute('cy'))+4/scale);
   const sea=svg.querySelector('.map-sea-label');sea.style.fontSize=`${11/scale}px`;sea.style.letterSpacing=`${.3/scale}px`;
  }
  function setView(svg,view){svg.setAttribute('viewBox',boundedView(view,svg.dataset.fullView.split(' ').map(Number)).join(' '));mapLabels(svg)}
  function resetView(el){const svg=activeSvg(el);svg.setAttribute('viewBox',svg.dataset.fullView);mapLabels(svg)}
  function fit(el,id) {
   const svg=activeSvg(el),path=svg.querySelector(`[data-plot-link="${id}"] path`);if(!path)return;
   const box=path.getBBox(),full=svg.dataset.fullView.split(' ').map(Number);
   const width=Math.max(box.width*1.8,box.height*1.8*full[2]/full[3],full[2]/64);
   setView(svg,[box.x+box.width/2-width/2,box.y+box.height/2-width*full[3]/full[2]/2,width,width*full[3]/full[2]]);
  }
  function draw({focus=false,fitPlot=false}={}) {
   selector.value=state.document;search.value=state.query;
   for(const el of editions)el.hidden=el.dataset.mapEdition!==state.document;
   const el=edition();
   for(const node of el.querySelectorAll('[data-map-panel]'))node.hidden=node.dataset.mapPanel!==state.view;
   for(const node of el.querySelectorAll('[data-map-view]'))node.setAttribute('aria-pressed',String(node.dataset.mapView===state.view));
   if(state.query.trim())el.querySelector('[data-map-catalog]').open=true;
   const rows=[...el.querySelectorAll('[data-map-record]')];
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
  selector.addEventListener('change',()=>{state={...state,document:selector.value,plot:'',query:''};resetView(edition());edition().querySelector('[data-map-catalog]').open=false;save(true);draw();});
  search.addEventListener('input',()=>{state={...state,query:search.value.slice(0,160)};save();draw();});
  root.querySelector('[data-map-reset]').addEventListener('click',()=>{state={...state,plot:'',query:''};resetView(edition());edition().querySelector('[data-map-catalog]').open=false;save();draw();});
  for(const el of editions) {
   el.querySelector('[data-map-catalog]').open=false;
   for(const button of el.querySelectorAll('[data-map-view]'))button.addEventListener('click',()=>{if(state.view===button.dataset.mapView)return;state={...state,view:button.dataset.mapView};save(true);draw({fitPlot:true});});
   for(const record of el.querySelectorAll('[data-map-record]')) {
    const link=record.querySelector('[data-select-plot]');
    const title=record.querySelector('h3').textContent;
    const summary=document.createElement('small');summary.textContent=record.querySelector('dd').textContent+' · '+record.querySelectorAll('dd')[1].textContent;
    link.textContent=title;link.append(summary);
    link.addEventListener('click',event=>{event.preventDefault();select(record.dataset.mapRecord)});
   }
   for(const link of el.querySelectorAll('[data-plot-link]'))link.addEventListener('click',event=>{event.preventDefault();if(link.closest('svg').dataset.mapDragging!=='true')select(link.dataset.plotLink)});
   for(const button of el.querySelectorAll('[data-zoom]'))button.addEventListener('click',()=>{
    const svg=activeSvg(el);
    if(button.dataset.zoom==='reset'){resetView(el);return;}
    const view=svg.getAttribute('viewBox').split(/\s+/).map(Number),factor=button.dataset.zoom==='in'?0.5:2;
    const width=view[2]*factor,height=view[3]*factor;
    setView(svg,[view[0]+(view[2]-width)/2,view[1]+(view[3]-height)/2,width,height]);
   });
   for(const input of el.querySelectorAll('[data-layer]'))input.addEventListener('change',()=>el.classList.toggle(`hide-${input.dataset.layer}`,!input.checked));
   for(const svg of el.querySelectorAll('[data-map-svg]')) {
   let drag=null;
   svg.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    const view=svg.getAttribute('viewBox').split(/\s+/).map(Number),full=svg.dataset.fullView.split(' ').map(Number);
    if(view[2]>=full[2])return;
    const inverse=svg.getScreenCTM().inverse(),pt=new DOMPoint(event.clientX,event.clientY).matrixTransform(inverse);
    drag={id:event.pointerId,x:pt.x,y:pt.y,clientX:event.clientX,clientY:event.clientY,view,inverse,active:false};
   });
   svg.addEventListener('pointermove',event=>{
    if(!drag||drag.id!==event.pointerId)return;
    if(!drag.active&&Math.hypot(event.clientX-drag.clientX,event.clientY-drag.clientY)<6)return;
    drag.active=true;svg.dataset.mapDragging='true';svg.setPointerCapture(event.pointerId);
    const pt=new DOMPoint(event.clientX,event.clientY).matrixTransform(drag.inverse),v=drag.view;
    setView(svg,[v[0]+drag.x-pt.x,v[1]+drag.y-pt.y,v[2],v[3]]);
   });
   for(const type of ['pointerup','pointercancel','lostpointercapture'])svg.addEventListener(type,()=>{drag=null;setTimeout(()=>delete svg.dataset.mapDragging,0)});
   }
   el.querySelector('[data-map-share]').addEventListener('click',async event=>{
    const button=event.currentTarget;
    const url=mapUrl(location.href,state).href;
    try{await navigator.clipboard.writeText(url);button.textContent='Ссылка скопирована ✓';}
    catch{let field=el.querySelector('[data-share-fallback]');if(!field){field=document.createElement('input');field.dataset.shareFallback='';field.readOnly=true;field.setAttribute('aria-label','Ссылка на выбранную редакцию и участок');el.querySelector('.map-results-heading').after(field);}field.value=url;field.focus();field.select();}
   });
  }
  addEventListener('popstate',()=>{state=mapState(new URL(location.href).searchParams,versions,root.dataset.defaultDocument);draw({fitPlot:true});});
  root.classList.add('map-enhanced');
  const labelObserver=new ResizeObserver(entries=>{for(const {target} of entries)mapLabels(target)});
  for(const svg of root.querySelectorAll('[data-map-svg=geographic]'))labelObserver.observe(svg);
  for(const node of root.querySelectorAll('[data-map-tools],[data-map-zoom],[data-map-layers],[data-map-share],[data-map-view-switch]'))node.hidden=false;
  draw({fitPlot:true});
 }
}
