// All records and sources are server-rendered; filters are progressive enhancement.
export function matchesInfrastructure(record, query = '', stage = '') {
 const normalize = value => String(value).toLocaleLowerCase('ru').replaceAll('ё', 'е');
 const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
 return (!stage || record.stage === stage) && terms.every(term => normalize(record.text).includes(term));
}
const root = globalThis.document?.querySelector('[data-infrastructure-tools]');
if (root) {
 const input = root.querySelector('input'), select = root.querySelector('select');
 const records = [...document.querySelectorAll('[data-infrastructure-record]')];
 const groups = [...document.querySelectorAll('[data-infrastructure-system]')];
 const count = root.querySelector('[data-infrastructure-count]');
 const empty = document.querySelector('[data-infrastructure-empty]');
 const filter = () => {
  for (const record of records) record.hidden = !matchesInfrastructure({text: record.dataset.search, stage: record.dataset.stage}, input.value, select.value);
  for (const group of groups) group.hidden = ![...group.querySelectorAll('[data-infrastructure-record]')].some(record => !record.hidden);
  const visible = records.filter(record => !record.hidden).length;
  count.textContent = `Показано ${visible} из ${records.length}`;
  empty.hidden = visible !== 0;
 };
 input.addEventListener('input', filter); select.addEventListener('change', filter);
 root.addEventListener('submit', event => event.preventDefault());
 root.addEventListener('reset', () => { input.value = ''; select.value = ''; filter(); });
 const revealHash = () => {
  let id; try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
  const target = id && document.getElementById(id);
  if (!target || !target.matches('[data-infrastructure-record], [data-infrastructure-system]')) return;
  input.value = ''; select.value = ''; filter();
  if (target.matches('details')) target.open = true;
  target.scrollIntoView({block: 'start'});
 };
 root.hidden = false; filter(); revealHash();
 globalThis.addEventListener('hashchange', revealHash);
}
