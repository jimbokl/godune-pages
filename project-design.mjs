import {revealDossierHash} from './project-dossier.mjs?v=2';
const normal=value=>String(value??'').toLocaleLowerCase('ru').replaceAll('ё','е').replace(/\s+/g,' ').trim();
export function filterDocuments(records,{query='',kind='all',stage='all',sort='newest'}={}) {
  const terms=normal(query).split(' ').filter(Boolean);
  return records.filter(r=>terms.every(t=>normal(r.text).includes(t))&&(kind==='all'||r.kind===kind)&&(stage==='all'||r.stage===stage))
    .sort((a,b)=>(sort==='oldest'?1:-1)*a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
}
export function comparisonState(params,ids,topics) {
  const requested=params.has('compare')?params.get('compare').split(','):ids;
  const selected=ids.filter(id=>requested.includes(id));
  const topic=topics.includes(params.get('topic'))?params.get('topic'):'all';
  return {selected,topic};
}
export function comparisonUrl(input,{selected,topic}) {
  const url=new URL(input);url.searchParams.set('compare',selected.join(','));
  if(topic==='all')url.searchParams.delete('topic');else url.searchParams.set('topic',topic);
  url.hash='comparison';return url;
}
function init(root) {
  const tools=root.querySelector('[data-document-tools]');
  if(tools) {
    const records=[...root.querySelectorAll('[data-document-record]')].map(el=>({el,id:el.id,text:el.textContent,kind:el.dataset.kind,stage:el.dataset.stage,date:el.dataset.date}));
    const search=tools.querySelector('[data-document-search]'),kind=tools.querySelector('[data-document-kind]'),stage=tools.querySelector('[data-document-stage]'),sort=tools.querySelector('[data-document-sort]');
    const list=root.querySelector('[data-document-list]');
    const render=()=>{
      const result=filterDocuments(records,{query:search.value,kind:kind.value,stage:stage.value,sort:sort.value}),visible=new Set(result);
      records.forEach(r=>{r.el.hidden=!visible.has(r)});
      // Preserve unchanged nodes: a search-field blur can render between a link's pointerdown and click.
      [...result,...records.filter(r=>!visible.has(r))].forEach((r,i)=>{if(list.children[i]!==r.el)list.insertBefore(r.el,list.children[i]??null)});
      root.querySelector('[data-document-count]').textContent=`Найдено: ${result.length} из ${records.length}`;
      root.querySelector('[data-document-empty]').hidden=!!result.length;
    };
    root.querySelector('[data-document-filter-panel]').hidden=false;tools.hidden=false;tools.addEventListener('submit',e=>e.preventDefault());tools.addEventListener('input',render);tools.addEventListener('change',render);tools.addEventListener('reset',e=>{e.preventDefault();search.value='';kind.value='all';stage.value='all';sort.value='newest';render();});render();
    // Following a version link should reveal the referenced document, even after filtering.
    const reveal=()=>{
      let id;try{id=decodeURIComponent(location.hash.slice(1));}catch{return;}
      const r=records.find(r=>r.id===id);
      if(r?.el.hidden)tools.reset();
      if(r)revealDossierHash(document,location.hash);
    };
    root.addEventListener('click',e=>{const a=e.target.closest?.('a[href^="#"]');if(a&&a.hash===location.hash)reveal();});
    window.addEventListener('hashchange',reveal);reveal();
  }
  const compare=root.querySelector('[data-compare-tools]');
  if(compare) {
    const boxes=[...compare.querySelectorAll('[name=compare]')],ids=boxes.map(b=>b.value),topic=compare.querySelector('[data-compare-topic]'),topics=[...topic.options].map(o=>o.value);
    const columns=[...root.querySelectorAll('[data-concept-column]')],facets=[...root.querySelectorAll('[data-facet]')],status=compare.querySelector('[data-compare-status]');
    const read=()=>({selected:boxes.filter(b=>b.checked).map(b=>b.value),topic:topic.value});
    const render=(save=false)=>{const state=read();columns.forEach(el=>el.hidden=!state.selected.includes(el.dataset.conceptColumn));facets.forEach(el=>{el.hidden=!state.selected.length||(state.topic!=='all'&&el.dataset.facet!==state.topic);el.style.setProperty('--compare-columns',state.selected.length||1);if(!el.hidden&&state.topic!=='all')el.open=true;});root.querySelector('[data-compare-empty]').hidden=!!state.selected.length;status.textContent=`Выбрано проектов: ${state.selected.length} из ${ids.length}`;if(save)history.replaceState(null,'',comparisonUrl(location.href,state));};
    const restore=()=>{const state=comparisonState(new URL(location.href).searchParams,ids,topics);boxes.forEach(b=>b.checked=state.selected.includes(b.value));topic.value=state.topic;render();};
    const panel=root.querySelector('[data-compare-filter-panel]');panel.hidden=false;if(location.search.includes('compare=')||location.search.includes('topic='))panel.open=true;compare.hidden=false;compare.addEventListener('submit',e=>e.preventDefault());compare.addEventListener('change',()=>render(true));compare.addEventListener('reset',e=>{e.preventDefault();boxes.forEach(b=>b.checked=true);topic.value='all';render(true);});window.addEventListener('popstate',restore);restore();
    compare.querySelector('[data-compare-copy]').addEventListener('click',async()=>{const url=comparisonUrl(location.href,read());history.replaceState(null,'',url);try{await navigator.clipboard.writeText(url.href);status.textContent='Ссылка на это сравнение скопирована.';}catch{status.replaceChildren();const a=document.createElement('a');a.href=url.href;a.textContent='Ссылка на это сравнение';status.append(a);}});
  }
}
if(typeof document!=='undefined')document.querySelectorAll('[data-project-design].design-page').forEach(init);
