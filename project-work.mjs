import {BUDGET_KEY,DRAFT_KEY,civilDay,draftFields,draftIssues,httpUrl,jobState,makeDraft,moneyMinor,normalizeDraft,queryWork,readSaved,saveLocal} from './work-catalog.mjs?v=2026101305';
const fields=['housing','food','transport','travel','deposit','reserve'];
export function relocationBudget(values){
 const minor={};for(const key of fields){minor[key]=moneyMinor(values[key]);if(minor[key]===null)return null;}
 const monthly=minor.housing+minor.food*30+minor.transport;
 return {monthly_rub:monthly/100,first_month_rub:(monthly+minor.travel+minor.deposit+minor.reserve)/100,inputs:Object.fromEntries(fields.map(k=>[k,minor[k]/100])),food_days:30};
}
// Compatibility for previously downloaded v1 drafts. The editor writes the v3 contract.
export function jobDraft(values,now=new Date()){
 return {version:1,status:'draft',verified_project_hiring:false,project_id:'project:belaya-duna',captured_at:now.toISOString(),title:values.title,employer:{name:values.employer},source:{url:values.source_url,checked_at:null},location:values.location,salary:values.salary,schedule:values.schedule,housing:values.housing,transport:values.transport,skills_text:values.skills,contact:values.contact,valid_through:values.valid_through};
}
function download(name,data){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);}
const doc=globalThis.document;
if(doc){
 const format=n=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(n)+' ₽';
 let storage;try{storage=globalThis.localStorage;}catch{}
 const completed=name=>doc.dispatchEvent(new CustomEvent('godune:useful-action',{detail:name}));
 const values=form=>Object.fromEntries(new FormData(form));
 const loadButton=(parent,load)=>{const b=doc.createElement('button');b.type='button';b.className='work-reload';b.textContent='Открыть сохранённую версию';b.hidden=true;b.addEventListener('click',()=>{load();b.hidden=true;});parent.after(b);return b;};
 const fail=(result,status,reload)=>{status.textContent=({conflict:'В другой вкладке сохранена новая версия. Ваши поля остались на экране. Откройте сохранённую версию или скачайте текущую.',corrupt:'Сохранённый файл повреждён. Текущие поля можно скачать; сохранение не перезаписало файл.',storage:'Не удалось сохранить на устройстве. Скачайте файл, чтобы продолжить позже.'})[result.reason];reload.hidden=result.reason!=='conflict';};
 const budget=doc.querySelector('[data-work-budget]');
 if(budget){
  const exportButton=budget.querySelector('[data-work-budget-export]'),saveButton=budget.querySelector('[data-work-budget-save]'),status=budget.querySelector('[data-budget-status]');exportButton.hidden=false;saveButton.hidden=false;let revision=null;
  const get=()=>relocationBudget(values(budget));
  const show=()=>{const r=get();budget.querySelector('[data-work-monthly]').textContent=r?format(r.monthly_rub):'—';budget.querySelector('[data-work-initial]').textContent=r?format(r.first_month_rub):'—';exportButton.disabled=saveButton.disabled=!r;};
  const load=()=>{const saved=readSaved(storage,BUDGET_KEY);revision=saved?.revision??null;if(saved?.version===1&&saved.project_id==='project:belaya-duna'&&relocationBudget(saved.inputs)){for(const k of fields)budget.elements.namedItem(k).value=saved.inputs[k];status.textContent='Сохранённый расчёт открыт на этом устройстве.';}show();};const reload=loadButton(status,load);
  budget.addEventListener('input',()=>{show();status.textContent='Расчёт изменён. Сохраните, чтобы открыть его позже.';});budget.addEventListener('submit',e=>e.preventDefault());
  const payload=()=>({version:1,kind:'user_estimate',project_id:'project:belaya-duna',updated_at:new Date().toISOString(),...get()});
  saveButton.addEventListener('click',()=>{if(!get())return;const result=saveLocal(storage,BUDGET_KEY,payload(),revision);if(result.ok){revision=result.revision;status.textContent='Расчёт сохранён на этом устройстве.';reload.hidden=true;completed('work_budget_saved');}else fail(result,status,reload);});
  exportButton.addEventListener('click',()=>{if(get()){download('belaya-duna-relocation-budget.json',payload());status.textContent='Расчёт скачан.';completed('work_budget_exported');}});load();
 }
 const form=doc.querySelector('[data-job-draft]');
 if(form){
  const status=form.querySelector('[data-draft-status]'),exportButton=form.querySelector('[data-job-export]'),saveButton=form.querySelector('[data-job-save]'),importButton=form.querySelector('[data-job-import]'),file=form.querySelector('[data-job-file]');
  [exportButton,saveButton,importButton].forEach(b=>b.hidden=false);form.noValidate=true;let revision=null;
  const get=()=>makeDraft(values(form));
  const show=()=>{const draft=get(),v=draft.inputs,issues=draftIssues(draft);for(const el of doc.querySelectorAll('[data-draft-preview]')){const key=el.dataset.draftPreview;el.textContent=v[key]||({title:'Название должности',employer:'Работодатель',location:'Место работы',salary:'Оплата',schedule:'График',housing:'Проживание',transport:'Дорога',skills:'Требования',contact:'Отклик'})[key]||'Не заполнено';}const source=doc.querySelector('[data-draft-source]');if(source){source.textContent=httpUrl(v.source_url)?'Первоисточник ↗':'Добавьте ссылку на объявление';if(httpUrl(v.source_url))source.href=v.source_url;else source.removeAttribute('href');}const company=doc.querySelector('[data-draft-company-source]');if(company){company.textContent=httpUrl(v.employer_source_url)?'Реквизиты компании ↗':'Добавьте реквизиты компании';if(httpUrl(v.employer_source_url))company.href=v.employer_source_url;else company.removeAttribute('href');}const issuesNode=doc.querySelector('[data-draft-issues]');if(issuesNode)issuesNode.textContent=issues.length?'Перед согласованием: '+issues[0]:'Карточка заполнена. Можно скачать для согласования.';exportButton.disabled=false;};
  const fill=draft=>{for(const k of draftFields)form.elements.namedItem(k).value=draft.inputs[k];show();};
  const load=()=>{const saved=readSaved(storage,DRAFT_KEY);revision=saved?.revision??null;if(saved){try{fill(normalizeDraft(saved));status.textContent='Локальный черновик открыт.';}catch(e){status.textContent=e.message;}}else show();};const reload=loadButton(status,load);
  form.addEventListener('input',()=>{show();status.textContent='Есть изменения. Сохраните черновик, чтобы продолжить позже.';});
  saveButton.addEventListener('click',()=>{const result=saveLocal(storage,DRAFT_KEY,get(),revision);if(result.ok){revision=result.revision;status.textContent='Черновик сохранён на этом устройстве.';reload.hidden=true;completed('work_draft_saved');}else fail(result,status,reload);});
  form.addEventListener('submit',e=>{e.preventDefault();const draft=get(),issues=draftIssues(draft);download('belaya-duna-job-draft.json',draft);completed('work_draft_exported');status.textContent=issues.length?'Черновик скачан. Перед согласованием: '+issues[0]:'Карточка скачана для согласования.';});
  importButton.addEventListener('click',()=>file.click());file.addEventListener('change',async()=>{const f=file.files?.[0];if(!f)return;try{if(f.size>100000)throw Error('Файл слишком большой для карточки вакансии.');const draft=normalizeDraft(JSON.parse(await f.text()));fill(draft);status.textContent='Карточка открыта как черновик. Сохраните изменения на устройстве.';completed('work_draft_imported');}catch(e){status.textContent='Не удалось открыть карточку. '+e.message;}finally{file.value='';}});load();
 }
 const list=doc.querySelector('[data-work-list]');
 if(list){
  const filters=list.querySelector('[data-work-filters]'),count=list.querySelector('[data-work-list-count]'),empty=list.querySelector('[data-work-list-empty]'),button=list.querySelector('[data-work-list-export]');filters.hidden=false;
  const labels={active:'Действует',upcoming:'Скоро начнётся',expired:'Срок истёк',withdrawn:'Снята работодателем',review:'Требует новой проверки'};
  const cards=[...list.querySelectorAll('[data-work-record]')].map(el=>{try{const row=JSON.parse(el.dataset.record);row.employer_name=filters.elements.employer.querySelector('option[value="'+CSS.escape(row.employer_id)+'"]')?.textContent;return {el,row};}catch{return {el,row:null};}});
  for(const key of ['q','status','employer','skill']){const param=new URL(location.href).searchParams.get(key);if(param!==null){const input=filters.elements.namedItem(key);if(input.type!=='select-one'||[...input.options].some(o=>o.value===param))input.value=param;}}
  let shown=[];const show=()=>{const v=values(filters),day=civilDay();shown=queryWork(cards.filter(c=>c.row).map(c=>c.row),v,day);for(const {el,row} of cards){el.hidden=!shown.includes(row);if(row){el.dataset.state=jobState(row,day);el.querySelector('[data-listing-state]').textContent=labels[el.dataset.state];}}count.textContent='Найдено: '+shown.length;empty.hidden=shown.length>0;empty.querySelector('h3').textContent=cards.length?'По этим условиям предложений нет':'Подтверждённых предложений пока нет';button.disabled=shown.length===0;const url=new URL(location.href);for(const key of ['q','status','employer','skill']){if(v[key]&&(key!=='status'||v[key]!=='active'))url.searchParams.set(key,v[key]);else url.searchParams.delete(key);}history.replaceState(null,'',url);};
  list.addEventListener('click',e=>{const card=e.target.closest?.('[data-work-record]');const link=e.target.closest?.('a[href]');if(card&&link&&card.dataset.state==='active'&&new URL(link.href).origin!==location.origin)completed('work_employer_opened');});
  filters.addEventListener('input',show);filters.addEventListener('change',show);filters.addEventListener('submit',e=>e.preventDefault());filters.addEventListener('reset',()=>requestAnimationFrame(show));button.addEventListener('click',()=>{if(shown.length){download('belaya-duna-vacancies.json',{version:1,snapshot_at:civilDay(),filters:values(filters),vacancies:shown});completed('work_jobs_exported');}});show();
 }
}
