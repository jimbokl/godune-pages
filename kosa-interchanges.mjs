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

// Compare personal allowances with directed approaches, never with the whole trail.
// Passing this comparison does not verify a platform, access, pace or a service.
export function assessKosaWalking(answers,selected){
  if(!selected)return {version:1,status:'unavailable',field_checked:false,checks:[]};
  const groups=[
    ...(answers.city==='kaliningrad'?[
      ['to_bus','От станции до автобуса',['station-bus']],
      ['to_train','От автобуса до поезда',['bus-station']]]:[]),
    ['first_visit','Подход к Эфе и возвращение',['efa-in-efa','efa-efa-out']],
    ...(answers.walks==='two'?[['second_visit','Подход к лесу и возвращение',['forest-in-forest','forest-forest-out']]]:[])];
  const checks=groups.map(([field,label,walk_ids])=>{
    const walks=walk_ids.map(id=>selected.walks.find(w=>w.id===id));
    const valid=walks.every(w=>w&&Number.isInteger(w.estimated_minutes)&&w.estimated_minutes>0&&Number.isFinite(w.distance_m)&&w.distance_m>0);
    const estimated_minutes=valid?walks.reduce((sum,w)=>sum+w.estimated_minutes,0):null;
    const distance_m=valid?Math.round(walks.reduce((sum,w)=>sum+w.distance_m,0)):null;
    const allowed_minutes=Number.isInteger(answers[field])&&answers[field]>=0&&answers[field]<=1440?answers[field]:null;
    const state=estimated_minutes===null||allowed_minutes===null?'unknown':allowed_minutes<estimated_minutes?'too_short':'within_estimate';
    const trail=['first_visit','second_visit'].includes(field);
    const text=state==='unknown'?`${label}: время перехода пока не удалось сопоставить с картой. Уточните его перед поездкой.`:
      `${label}: вы оставили ${allowed_minutes} мин. По карте — около ${distance_m} м, примерно ${estimated_minutes} мин пешком.${trail?' Это только путь от остановки и обратно; настил, осмотр и обед сюда не входят.':' Выход с платформы, ожидание и очередь сюда не входят.'}${state==='too_short'?' Времени меньше этой оценки. Увеличьте его под свой темп.':''}`;
    return {field,label,walk_ids,allowed_minutes,estimated_minutes,distance_m,state,text};
  });
  return {version:1,status:checks.some(c=>c.state==='too_short')?'too_short':checks.some(c=>c.state==='unknown')?'unknown':'within_estimate',
    field_checked:selected.verification.field_checked,source_sha256:selected.source.sha256,checks};
}
