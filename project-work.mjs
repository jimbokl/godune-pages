// Local planning tools. The downloaded vacancy is a draft, never a live listing.
const fields=['housing','food','transport','travel','deposit','reserve'];
export function relocationBudget(values){
 const v={};for(const key of fields){const raw=values[key];if(raw===undefined||raw===null||String(raw).trim()==='')return null;const n=Number(raw);if(!Number.isFinite(n)||n<0)return null;v[key]=n;}
 const monthly=v.housing+v.food*30+v.transport;
 return {monthly_rub:monthly,first_month_rub:monthly+v.travel+v.deposit+v.reserve,inputs:v,food_days:30};
}
export function jobDraft(values,now=new Date()){
 return {version:1,status:'draft',verified_project_hiring:false,project_id:'project:belaya-duna',captured_at:now.toISOString(),title:values.title,employer:{name:values.employer},source:{url:values.source_url,checked_at:null},location:values.location,salary:values.salary,schedule:values.schedule,housing:values.housing,transport:values.transport,skills_text:values.skills,contact:values.contact,valid_through:values.valid_through};
}
function download(name,data){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);}
const doc=globalThis.document;
if(doc){
 const feedback=doc.querySelector('[data-work-feedback]');const say=text=>{if(feedback)feedback.textContent=text};
 const budget=doc.querySelector('[data-work-budget]');
 if(budget){const button=budget.querySelector('[data-work-budget-export]');button.hidden=false;const format=n=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(n)+' ₽';const get=()=>relocationBudget(Object.fromEntries(new FormData(budget)));const show=()=>{const result=get();budget.querySelector('[data-work-monthly]').textContent=result?format(result.monthly_rub):'—';budget.querySelector('[data-work-initial]').textContent=result?format(result.first_month_rub):'—';button.disabled=!result;};budget.addEventListener('input',show);budget.addEventListener('submit',e=>e.preventDefault());button.addEventListener('click',()=>{const result=get();if(!result)return;download('belaya-duna-relocation-budget.json',{version:1,project_id:'project:belaya-duna',kind:'user_estimate',...result});say('Ваш расчёт скачан.');});show();}
 const form=doc.querySelector('[data-job-draft]');
 if(form){form.querySelector('[data-job-export]').hidden=false;form.addEventListener('submit',e=>{e.preventDefault();if(!form.reportValidity())return;download('belaya-duna-job-draft.json',jobDraft(Object.fromEntries(new FormData(form))));say('Карточка скачана. Данные остались в вашем файле.');});}
}
