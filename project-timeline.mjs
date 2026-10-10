import './project-dossier.mjs?v=2';
// Filters and exports only; the project chronology never writes the tourist Trip.
const kinds = {actual:'Событие', statement:'Заявление', planned:'Плановый срок'};
const audiences = {tourist:'Для туриста', worker:'Для соискателя', contractor:'Для подрядчика'};
const params = {kind:'stage',topic:'object',year:'year',audience:'audience'};
export const currentClaim = row => row.date_claims.find(c=>c.state==='current');
export function matches(row, filters={}) {
 const claim=currentClaim(row);
 return (!filters.kind||claim.kind===filters.kind)&&(!filters.topic||row.topic===filters.topic)&&(!filters.year||claim.date.slice(0,4)===filters.year)&&(!filters.audience||row.impacts.some(i=>i.audience===filters.audience));
}
export function readFilters(url, options) {
 const query=new URL(url).searchParams;
 return Object.fromEntries(Object.entries(params).map(([key,param])=>[key,options[key]?.includes(query.get(param))?query.get(param):'']));
}
export function filterUrl(url, filters) {
 const result=new URL(url);
 for(const [key,param]of Object.entries(params)){if(filters[key])result.searchParams.set(param,filters[key]);else result.searchParams.delete(param);}
 return result.pathname+result.search+result.hash;
}
export function dateText(claim) {
 const date=new Date(claim.date+'T00:00:00Z');
 const month=new Intl.DateTimeFormat('ru',{month:'long',timeZone:'UTC'}).format(date);
 const monthGenitive=new Intl.DateTimeFormat('ru',{day:'numeric',month:'long',timeZone:'UTC'}).format(date).replace(/^\d+\s+/,'');
 if(claim.precision==='year')return claim.relation==='by'?`До конца ${date.getUTCFullYear()} года`:String(date.getUTCFullYear());
 if(claim.precision==='month')return claim.relation==='by'?`До конца ${monthGenitive} ${date.getUTCFullYear()}`:`${month} ${date.getUTCFullYear()}`;
 const day=new Intl.DateTimeFormat('ru',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(date).replace(/\s*г\.$/,'');
 return (claim.relation==='by'?'До ':'')+day;
}
function cell(value) {
 let text=String(value??'');
 if(/^[\s]*[=+@-]/.test(text)||/^[\t\r\n]/.test(text))text="'"+text;
 return '"'+text.replaceAll('"','""')+'"';
}
export function timelineCsv(data, ids) {
 const sources=new Map(data.sources.map(s=>[s.id,s]));
 const lines=[['ID','Этап','Объект','Название','Дата в реестре','Точность','Отношение к дате','Понятная дата','Дата сообщения','Источники','История сроков','Что это меняет','Следующее подтверждение','Проверено']];
 const rows=data.milestones.filter(row=>!ids||ids.has(row.id)).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 for(const row of rows){
  const c=currentClaim(row),refs=c.source_ids.map(id=>sources.get(id));
  lines.push([row.id,kinds[c.kind],row.topic,row.title,c.date,c.precision,c.relation,dateText(c),refs.map(s=>s.published_at||'Дата не указана').join(' | '),refs.map(s=>s.url).join(' | '),row.date_claims.filter(c=>c.state!=='current').map(c=>`${c.state}: ${dateText(c)} · ${c.source_ids.map(id=>sources.get(id).url).join(' ')} · ${c.note||''}`).join(' | '),row.impacts.map(i=>`${audiences[i.audience]}: ${i.text}`).join(' | '),row.next_evidence,c.recorded_at]);
 }
 return '\ufeff'+lines.map(line=>line.map(cell).join(';')).join('\r\n')+'\r\n';
}
if(typeof document!=='undefined'){
 const root=document.querySelector('[data-timeline-list]');
 const toolbar=document.querySelector('[data-timeline-toolbar]');
 if(root&&toolbar){
  const controls=[...toolbar.querySelectorAll('[data-timeline-filter]')];
  const options=Object.fromEntries(controls.map(c=>[c.dataset.timelineFilter,[...c.options].map(o=>o.value)]));
  const records=[...root.querySelectorAll('[data-timeline-record]')];
  const empty=document.querySelector('[data-timeline-empty]');
  const counter=toolbar.querySelector('[data-timeline-count]');
  const exportButton=toolbar.querySelector('[data-timeline-export]');
  const drawer=toolbar.querySelector('.timeline-filter-panel');
  const yearHeadings=[...root.querySelectorAll('[data-timeline-year]')];
  let filters=readFilters(location.href,options);
  const apply=()=>{
   let visible=0;
   for(const card of records){
    const row={date_claims:[{state:'current',kind:card.dataset.kind,date:card.dataset.year+'-01-01'}],topic:card.dataset.topic,impacts:card.dataset.audiences.split(' ').map(audience=>({audience}))};
    card.hidden=!matches(row,filters);if(!card.hidden)visible++;
    for(const impact of card.querySelectorAll('[data-timeline-impact]'))impact.hidden=!!filters.audience&&impact.dataset.timelineImpact!==filters.audience;
    const meaning=card.querySelector('.timeline-meaning');if(meaning)meaning.open=!!filters.audience;
    if(filters.audience&&!card.hidden)card.querySelector('.timeline-event').open=true;
   }
   for(const heading of yearHeadings)heading.hidden=!records.some(r=>r.dataset.year===heading.dataset.timelineYear&&!r.hidden);
   for(const link of document.querySelectorAll('.timeline-years a'))link.setAttribute('aria-current',link.hash==='#timeline-year-'+filters.year?'true':'false');
   for(const control of controls)control.value=filters[control.dataset.timelineFilter];
   counter.textContent=`Показано ${visible} из ${records.length}`;empty.hidden=visible!==0;exportButton.disabled=visible===0;
  };
  const revealAnchor=()=>{let id;try{id=decodeURIComponent(location.hash.slice(1));}catch{return;}const target=document.getElementById(id);if(!target?.matches('[data-timeline-record],[data-timeline-year]'))return;if(target.hidden){filters={};apply();history.replaceState(null,'',filterUrl(location.href,filters));}const event=target.querySelector('.timeline-event');if(event)event.open=true;target.scrollIntoView({block:'start'});};
  for(const control of controls)control.addEventListener('change',()=>{filters[control.dataset.timelineFilter]=control.value;history.pushState(null,'',filterUrl(location.href,filters));apply();});
  toolbar.querySelector('[data-timeline-reset]').addEventListener('click',()=>{filters={};history.pushState(null,'',filterUrl(location.href,filters));apply();});
  window.addEventListener('popstate',()=>{filters=readFilters(location.href,options);apply();revealAnchor();});
  window.addEventListener('hashchange',revealAnchor);
  exportButton.addEventListener('click',async()=>{
   const previous=counter.textContent;exportButton.disabled=true;
   try{const response=await fetch('/data/project-business.json',{cache:'no-cache'});if(!response.ok)throw new Error('registry');const data=await response.json();const ids=new Set(records.filter(c=>!c.hidden).map(c=>c.dataset.id));if(!ids.size)return;
    const url=URL.createObjectURL(new Blob([timelineCsv(data,ids)],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='belaya-duna-timeline.csv';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);counter.textContent=`Скачано этапов: ${ids.size}`;
   }catch{counter.textContent='Не удалось скачать CSV. Все этапы доступны на странице.';}
   finally{exportButton.disabled=records.every(c=>c.hidden);setTimeout(()=>{counter.textContent=previous;},3000);}
  });
  toolbar.hidden=false;if(Object.values(filters).some(Boolean))drawer.open=true;apply();revealAnchor();
 }
}
