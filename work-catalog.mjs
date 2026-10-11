// Shared listing lifecycle and local-only employer drafts; no network calls.
export const DRAFT_KEY='godune-work-draft-v2';
export const BUDGET_KEY='godune-work-budget-v2';
export const draftFields=['title','employer','source_url','location','salary','schedule','housing','transport','skills','contact','valid_through'];
export function validDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.valueOf())&&d.toISOString().slice(0,10)===value;
}
export function civilDay(now=new Date()){return new Date(now.valueOf()+7200000).toISOString().slice(0,10);}
export function httpUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&Boolean(u.hostname);}catch{return false;}}
export function jobState(row,day=civilDay()){
 if(row.status==='withdrawn')return 'withdrawn';
 if(validDate(row.valid_through)&&row.valid_through<day)return 'expired';
 if(validDate(row.published_at)&&row.published_at>day)return 'upcoming';
 if(row.status!=='published'||row.verified_project_hiring!==true||!validDate(row.published_at)||!validDate(row.checked_at)||row.checked_at>day||!validDate(row.review_after)||row.review_after<day||!validDate(row.valid_through))return 'review';
 return 'active';
}
export function queryWork(rows,{q='',status='active',employer='',skill='',housing=false}={},day=civilDay()){
 const normalize=s=>String(s??'').toLocaleLowerCase('ru').replaceAll('ё','е');const terms=normalize(q).trim().split(/\s+/).filter(Boolean);
 return rows.filter(r=>(status==='all'||jobState(r,day)===status)&&(!employer||r.employer_id===employer)&&(!skill||r.skill_ids?.includes(skill))&&(!housing||Boolean(r.dormitory_id))&&terms.every(t=>normalize([r.title,r.description,r.location,r.requirements,r.employer_name].join(' ')).includes(t)));
}
export function normalizeDraft(value,now=new Date()){
 if(!value||typeof value!=='object'||Array.isArray(value)||![1,2].includes(value.version)||value.project_id!=='project:belaya-duna')throw Error('Это не карточка вакансии «Белой Дюны».');
 const inputs=value.inputs??{...value,employer:value.employer?.name??value.employer,source_url:value.source?.url??value.source_url,skills:value.skills_text??value.skills};
 if(!inputs||typeof inputs!=='object'||Array.isArray(inputs))throw Error('Поля карточки должны быть объектом.');
 const fields={};for(const key of draftFields){const v=inputs[key];if(v!==undefined&&v!==null&&typeof v!=='string')throw Error('Поле «'+key+'» должно содержать текст.');fields[key]=String(v??'').slice(0,1500);}
 return {version:2,kind:'employer_job_draft',status:'draft',verified_project_hiring:false,project_id:'project:belaya-duna',updated_at:now.toISOString(),inputs:fields};
}
export function makeDraft(values,now=new Date()){return normalizeDraft({version:2,project_id:'project:belaya-duna',inputs:values},now);}
export function draftIssues(draft,day=civilDay()){
 const labels={title:'должность',employer:'юридическое имя работодателя',source_url:'первоисточник',location:'адрес площадки',salary:'оплата',schedule:'график',housing:'условия проживания',transport:'дорога',skills:'требования',contact:'способ отклика',valid_through:'срок откликов'};
 const v=draft.inputs,issues=draftFields.filter(k=>!v[k].trim()).map(k=>'Добавьте '+labels[k]+'.');
 if(v.source_url&&!httpUrl(v.source_url))issues.push('Укажите HTTPS-ссылку на объявление работодателя.');
 if(v.valid_through&&(!validDate(v.valid_through)||v.valid_through<day))issues.push('Укажите действующий срок приёма откликов.');
 return issues;
}
export function readSaved(storage,key){try{const raw=storage.getItem(key);return raw?JSON.parse(raw):null;}catch{return null;}}
export function saveLocal(storage,key,value,expectedRevision){
 try{const current=storage.getItem(key);let parsed=null;try{parsed=current?JSON.parse(current):null;}catch{ return {ok:false,reason:'corrupt'}; }
  if((parsed?.revision??null)!==expectedRevision)return {ok:false,reason:'conflict'};
  const revision=globalThis.crypto?.randomUUID?.()??String(Date.now())+'-'+Math.random();storage.setItem(key,JSON.stringify({...value,revision}));return {ok:true,revision};
 }catch{return {ok:false,reason:'storage'};}
}
export function moneyMinor(raw){
 if(raw===null||raw===undefined)return null;const value=String(raw).trim().replace(',','.');if(!/^\d+(?:\.\d{1,2})?$/.test(value))return null;
 const [a,b='']=value.split('.');const result=Number(a)*100+Number(b.padEnd(2,'0'));return Number.isSafeInteger(result)&&result<=10000000000?result:null;
}
