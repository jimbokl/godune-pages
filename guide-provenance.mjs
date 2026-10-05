// Narrative evidence is independent of map coordinates and opening conditions.
export const PROVENANCE_VERSION=1;
const text=value=>typeof value==='string'?value.trim():'';
export function guideDate(value) {
  if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))return '';
  const time=Date.parse(value+'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0,10)===value?value:'';
}
export function guideSourceUrl(value) {
  if(typeof value!=='string' || !/^https?:\/\//.test(value))return '';
  try{const url=new URL(value);return !url.username&&!url.password?url.href:'';}catch{return '';}
}
function sourceRecord(id,row) {
  if(!row || typeof row!=='object')return null;
  const url=guideSourceUrl(row.url),title=text(row.title),publisher=text(row.publisher),capturedAt=guideDate(row.captured_at);
  const validRights=row.kind==='institution'&&row.rights==='reference_only' || row.kind==='author_photo'&&row.rights==='user_supplied';
  return url&&title&&publisher&&capturedAt&&validRights?{id,url,title,publisher,capturedAt,kind:row.kind,rights:row.rights}:null;
}
export function guideProvenance(registry,chapter) {
  const empty={author:'',reviewedAt:'',rights:'',observations:[],facts:[]};
  if(registry?.provenance_version!==PROVENANCE_VERSION || !chapter?.attribution)return empty;
  const author=text(chapter.attribution.author),reviewedAt=guideDate(chapter.attribution.reviewed_at);
  if(!author || !reviewedAt || chapter.attribution.rights!=='original_text')return empty;
  const resolve=ids=>Array.isArray(ids)&&ids.length && ids.every(id=>typeof id==='string')?
    [...new Set(ids)].map(id=>sourceRecord(id,Object.hasOwn(registry.sources || {},id)?registry.sources[id]:null)):[];
  const complete=rows=>rows.length>0&&rows.every(row=>row&&row.capturedAt<=reviewedAt);
  const observations=resolve(chapter.observation_sources);
  const facts=(Array.isArray(chapter.facts)?chapter.facts:[]).flatMap(row=>{
    if(!row || !['fact','legend'].includes(row.kind) || !text(row.text))return [];
    const sources=resolve(row.sources);
    return complete(sources)?[{text:text(row.text),kind:row.kind,sources}]:[];
  });
  return {author,reviewedAt,rights:'original_text',observations:complete(observations)?observations:[],facts};
}
export function guideNarration(stop) {
  return [stop.name,...stop.story,...(stop.provenance?.facts || []).map(row=>(row.kind==='legend'?'Городская легенда. ':'')+row.text),stop.focus?'Посмотрите вокруг. '+stop.focus:''].filter(Boolean).join(' ');
}
export function guideProvenanceTranscript(stop) {
  const p=stop.provenance,lines=[];
  if(!p?.author)return lines;
  lines.push(`Текст: ${p.author}. Редакционная проверка: ${p.reviewedAt}. Авторский текст.`);
  for(const row of p.facts){
    lines.push((row.kind==='legend'?'Городская легенда: ':'О месте: ')+row.text);
    for(const source of row.sources)lines.push(`${source.publisher} · ${source.title}\n${source.url}\nСтраница загружена: ${source.capturedAt}. Дата загрузки не подтверждает сегодняшние условия посещения.`);
  }
  for(const source of p.observations)lines.push(`Фото: ${source.title} · ${source.publisher}\n${source.url}\nДата снимка: ${source.capturedAt}. Сегодняшнее меню и обстановку уточняйте отдельно.`);
  return lines;
}
