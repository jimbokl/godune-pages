// Maps are static, directed OSM walks, independent of transport timetables.
export function selectKosaInterchanges(answers,model){
  if(!model)return null;
  const ids=[...(answers.city==='kaliningrad'?['station-bus','bus-station']:[]),
    'efa-in-efa','efa-efa-out',...(answers.walks==='two'?['forest-in-forest','forest-forest-out']:[])];
  if(model.version!==1 || !/^[0-9a-f]{64}$/.test(model.source?.sha256||'') || typeof model.verification?.field_checked!=='boolean')throw Error('Версия переходов не прочитана.');
  const walks=ids.map(id=>model.walks.find(w=>w.id===id));
  if(walks.some(w=>!w||!model.anchors?.[w.from]||!model.anchors?.[w.to]||!/^[0-9a-f]{64}$/.test(w.images?.png?.sha256||'')||w.images?.png?.path!==`assets/transit/interchanges/${w.id}.png`||w.images?.webp?.path!==`assets/transit/interchanges/${w.id}.webp`))throw Error('Не все переходы найдены.');
  return structuredClone({version:1,source:model.source,verification:model.verification,
    anchors:model.anchors,walks,definition_sha256:model.definition_sha256});
}
