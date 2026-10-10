import './project-dossier.mjs?v=1';
// Progressive enhancement only: every record is present in server-rendered HTML.
export function filterRecords(records, query) {
  const normalize=value=>String(value??'').trim().toLocaleLowerCase('ru').replaceAll('ё','е').replace(/\s+/g,' ');
  const q=normalize(query);
  return records.filter(record=>{
    const urls=[...(record.querySelectorAll?.('a[href]')??[])].map(link=>link.getAttribute('href'));
    return !q||normalize([record.textContent,...urls].join(' ')).includes(q);
  });
}
export function statusCsv(rows) {
  const quote=value=>{let text=String(value??'');if(/^[=+\-@\t\r]/.test(text.trimStart()))text="'"+text;return '"'+text.replaceAll('"','""')+'"'};
  return '\ufeff'+rows.map(row=>row.map(quote).join(';')).join('\r\n');
}
const root=globalThis.document?.querySelector('[data-project-research]');
if(root){
  for(const [kind,toolbarSelector,recordSelector,inputSelector,countSelector] of [
    ['source','[data-source-filter]','[data-source-record]','[data-source-search]','[data-source-count]'],
    ['status','[data-status-filter]','[data-status-record]','[data-status-search]','[data-status-count]']
  ]){
    const toolbar=root.querySelector(toolbarSelector);if(!toolbar)continue;
    const records=[...root.querySelectorAll(recordSelector)],input=toolbar.querySelector(inputSelector),count=toolbar.querySelector(countSelector);
    if(!input||!count)continue;toolbar.hidden=false;
    const reset=toolbar.querySelector(`[data-${kind}-reset]`),empty=toolbar.querySelector(`[data-${kind}-empty]`);
    const groups=[...root.querySelectorAll(`[data-${kind}-group]`)];
    const update=()=>{
      const visible=new Set(filterRecords(records,input.value));
      for(const record of records)record.hidden=!visible.has(record);
      for(const group of groups)group.hidden=![...group.querySelectorAll(recordSelector)].some(record=>visible.has(record));
      count.textContent=`Показано ${visible.size} из ${records.length}`;
      if(empty)empty.hidden=visible.size!==0;
      if(reset)reset.hidden=!input.value;
    };
    reset?.addEventListener('click',()=>{input.value='';update();input.focus();});
    input.addEventListener('input',update);update();
  }
}
