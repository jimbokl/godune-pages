// Progressive tools for the sourced registry. This storage never touches Trip.
const root = globalThis.document?.querySelector('.business-page');
const KEY = 'godune-business-selection-v1';
const feedback = root?.querySelector('[data-business-feedback]');
const say = text => { if (feedback) feedback.textContent = text; };
let selected = new Set();
try { const raw=JSON.parse(localStorage.getItem(KEY)||'[]'); if(Array.isArray(raw)) selected=new Set(raw.filter(v=>typeof v==='string')); } catch {}
const dataUrl = new URL('./data/project-business.json',import.meta.url);
const load = root ? fetch(dataUrl).then(r=>{if(!r.ok)throw Error('registry');return r.json()}) : Promise.resolve(null);
// A failed download leaves all server-rendered facts and contact links usable.
function download(name,mime,text){const url=URL.createObjectURL(new Blob([text],{type:mime}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);}
export function csvCell(value){let text=String(value??'');if(/^[=+\-@\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}
export function contactCsv(data,ids){const columns=['Компания','Роль','Канал','Контакт','Область обращения','Проверено','Источник'];const rows=[columns];for(const o of data.organizations.filter(o=>!ids||ids.has(o.id))){for(const c of o.contacts){rows.push([o.name,o.role_label,c.label,c.value,c.scope,c.checked_at,c.source_ids.map(id=>data.sources.find(s=>s.id===id)?.url||'').join(' ')])}}return '\ufeff'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n');}
const icsText = value=>String(value).replaceAll('\\','\\\\').replaceAll('\n','\\n').replaceAll(',','\\,').replaceAll(';','\\;');
function nextDate(date){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10).replaceAll('-','');}
function foldIcsLine(line){let out='',bytes=0;for(const c of line){const size=new TextEncoder().encode(c).length;if(bytes+size>75){out+='\r\n ';bytes=1}out+=c;bytes+=size}return out;}
const calendarLabels = {
 submission_deadline: ['deadline','Последний день подачи заявок'], result: ['result','Подведение итогов'],
 contract: ['contract','Заключение договора'], works_start: ['works_start','Начало работ'], works_end: ['works_end','Завершение работ'],
};
function validDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;}
export function calendarIcs(data,ids,generatedAt=new Date()){
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//GoDune.ru//Project business//RU','CALSCALE:GREGORIAN'];
 const stamp=generatedAt.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
 for(const t of data.procurements.filter(t=>!ids||ids.has(t.id))){
  const rules=Array.isArray(t.calendar_rules)?t.calendar_rules:[{kind:'submission_deadline',date:t.deadline,status:'planned'},{kind:'result',date:t.result_date,status:'planned'}];
  const seen=new Set();
  for(const rule of rules){
   const labels=calendarLabels[rule.kind];
   if(!labels||!validDate(rule.date)||seen.has(rule.kind))continue;
   seen.add(rule.kind);
   const [kind,label]=labels,planned=rule.status==='planned';
   lines.push('BEGIN:VEVENT',`UID:${t.id}-${kind}@godune.ru`,`DTSTAMP:${stamp}`,`DTSTART;VALUE=DATE:${rule.date.replaceAll('-','')}`,`DTEND;VALUE=DATE:${nextDate(rule.date)}`,`STATUS:${t.status==='cancelled'?'CANCELLED':planned?'TENTATIVE':'CONFIRMED'}`,`SUMMARY:${icsText(label+(planned?' · план':'')+' · '+t.title)}`,`DESCRIPTION:${icsText('Закупка №'+t.registry_number+'. Даты по карточке на '+data.checked_at+'. Проверьте перенос или отмену в ЕИС.')}`,`URL:${t.registry_url}`,'END:VEVENT');
  }
 }
 lines.push('END:VCALENDAR');return lines.map(foldIcsLine).join('\r\n')+'\r\n';
}
if(root){
 const toolbar=root.querySelector('[data-business-toolbar]');
 const records=[...root.querySelectorAll('[data-business-record]')];
 const savedButtons=[...root.querySelectorAll('[data-company-save]')];
 const redraw=()=>savedButtons.forEach(button=>{const saved=selected.has(button.dataset.companySave);button.setAttribute('aria-pressed',String(saved));button.textContent=saved?'В моём списке ✓':'В мой список +'});
 for(const button of savedButtons){button.hidden=false;button.addEventListener('click',()=>{const id=button.dataset.companySave;const next=new Set(selected);next.has(id)?next.delete(id):next.add(id);try{localStorage.setItem(KEY,JSON.stringify([...next]));selected=next;redraw();say(next.has(id)?'Компания сохранена в вашем списке.':'Компания удалена из вашего списка.')}catch{say('Не удалось сохранить список в этом браузере. Контакты можно скачать в CSV.')}})}redraw();
 if(toolbar){toolbar.hidden=false;const input=toolbar.querySelector('[data-business-search]'),role=toolbar.querySelector('[data-business-role]');const count=toolbar.querySelector('[data-business-count]');const empty=root.querySelector('[data-business-empty]');const filter=()=>{const q=input.value.trim().toLocaleLowerCase('ru');let visible=0;for(const card of records){card.hidden=!!((q&&!card.textContent.toLocaleLowerCase('ru').includes(q))||(role.value&&card.dataset.role!==role.value));if(!card.hidden)visible++}count.textContent=`Показано ${visible} из ${records.length}`;empty.hidden=visible!==0};input.addEventListener('input',filter);role.addEventListener('change',filter);filter();toolbar.querySelector('[data-export-contacts]').addEventListener('click',async()=>{try{const data=await load;const visibleIds=new Set(records.filter(c=>!c.hidden).map(c=>c.dataset.id));const savedVisible=new Set([...selected].filter(id=>visibleIds.has(id)));const ids=savedVisible.size?savedVisible:visibleIds;download('belaya-duna-contacts.csv','text/csv;charset=utf-8',contactCsv(data,ids));say(`Контакты выгружены: ${ids.size} компаний.`)}catch{say('Не удалось скачать реестр. Контакты доступны в карточках.')}})}
 for(const button of root.querySelectorAll('[data-export-dates]')){button.hidden=false;button.addEventListener('click',async()=>{try{const ics=calendarIcs(await load,button.dataset.exportDates?new Set([button.dataset.exportDates]):undefined);if(!ics.includes('BEGIN:VEVENT')){say('В реестре пока нет дат для календаря.');return}download('belaya-duna-tenders.ics','text/calendar;charset=utf-8',ics);say('Календарный файл скачан.')}catch{say('Не удалось скачать файл. Даты доступны в карточке закупки.')}})}
 const localDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kaliningrad',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 for(const badge of root.querySelectorAll('[data-tender-status]')){if(badge.dataset.status==='bidding' && validDate(badge.dataset.deadline) && localDate>badge.dataset.deadline)badge.textContent='Приём заявок завершён · проверьте протокол';}
 load.catch(()=>{});
}
