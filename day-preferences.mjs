import {dayBases,resolvePair,resolveAccess,resolveAccessBetween} from './travel-estimates.mjs?v=10';

// Preferences describe the traveller's intent. They never certify a path.
export const DAY_INTERESTS={sea:'Море',nature:'Лес и парки',history:'Архитектура и история',museums:'Музеи',food:'Кофе и еда'};
export const DAY_NEEDS={short_walks:'Меньше пешком',avoid_stairs:'Без лестниц',stroller:'С коляской'};
const object=value=>value && typeof value==='object' && !Array.isArray(value);
const options=(value,known)=>Array.isArray(value) && value.every(id=>typeof id==='string' && Object.hasOwn(known,id)) && new Set(value).size===value.length;
export const emptyPreferences=()=>({version:1,interests:[],needs:[]});
export function validPreferences(value) {
  return !!(object(value) && value.version===1 && options(value.interests,DAY_INTERESTS) && options(value.needs,DAY_NEEDS));
}
export const hasPreferences=value=>validPreferences(value) && !!(value.interests.length || value.needs.length);
export function preferencesLabel(value) {
  return validPreferences(value)?[...value.interests.map(id=>DAY_INTERESTS[id]),...value.needs.map(id=>DAY_NEEDS[id])].join(' · '):null;
}
const interestCategories={sea:['beach'],nature:['nature','park'],history:['landmark'],museums:['museum'],food:['restaurant']};
const themeInterests={beach:'sea',nature:'nature',architecture:'history',history:'history',museums:'museums',gastro:'food'};
const pointsFor=(choice,catalog)=>{
  const ids=choice.days?choice.days.flatMap(day=>day.places):choice.stops?.map(stop=>stop.poi) || choice.places || [];
  const known=new Map(catalog.poi.map(point=>[point.slug,point]));
  return [...new Set(ids)].map(id=>known.get(id)).filter(Boolean);
};
const evidenceValid=value=>object(value) && value.version===1 && ['present','none','unknown'].includes(value.stairs)
  && ['passable','blocked','unknown'].includes(value.stroller) && ['segment','place','route'].includes(value.extent);
function mobilityFacts(choice,catalog) {
  if(choice.days)return choice.days.flatMap(day=>mobilityFacts({...(day.recipe || {}),places:day.places,stops:day.recipe?.stops || day.places.map(poi=>({poi,visit_scope:day.schedule?.stops?.[poi]?.visit_scope}))},catalog));
  const points=pointsFor(choice,catalog),facts=[];
  if(evidenceValid(choice.mobility))facts.push({name:choice.name,...choice.mobility,text:choice.mobility.text || choice.access_note,source:choice.mobility.source});
  for(const point of points)for(const condition of point.visit_conditions || []) {
    // Looking at a building outside does not imply climbing its viewing tower.
    const outside=choice.stops?.find(stop=>stop.poi===point.slug)?.visit_scope==='outside';
    if(outside && condition.scope==='service')continue;
    if(condition.kind==='access' && evidenceValid(condition.mobility))facts.push({name:point.name,...condition.mobility,text:condition.text,source:condition.source});
  }
  return facts;
}
const metres=value=>Number.isFinite(value) && value>=0;
const lengthLabel=value=>value<1000?`${Math.round(value)} м`:`${(value/1000).toLocaleString('ru',{maximumFractionDigits:1})} км`;
function choiceDistance(choice,catalog,matrix) {
  if(choice.mode==='walking' && metres(choice.distance_m))return choice.distance_m;
  const days=choice.days || [{places:choice.stops?.map(stop=>stop.poi) || choice.places || [],mode:'foot',night_at:choice.return_to}];
  let total=0,walks=0;
  for(const day of days) {
    if(day.mode!=='foot' && day.mode!=='walking')return null; // Driving days still contain unmeasured walking approaches.
    walks++;
    const ids=[day.start_at,...day.places,day.night_at].filter(Boolean),trip={schedule:{mode:'foot'}};
    if(ids.length<2)return null; // One stop can contain a long trail, not zero walking.
    for(let index=1;index<ids.length;index++) {
      const leg=resolvePair(trip,ids[index-1],ids[index],catalog,matrix);
      if(leg.origin==='same_place')continue;
      if(leg.origin!=='estimate' || !metres(leg.distance_m))return null;
      total+=leg.distance_m;
    }
  }
  return walks?total:null;
}
export function assessPreferenceChoice(choice,catalog,value,{matrix=null}={}) {
  const preferences=validPreferences(value)?value:emptyPreferences(),points=pointsFor(choice,catalog),interests=new Set();
  for(const [id,categories]of Object.entries(interestCategories))if(points.some(point=>categories.includes(point.category)))interests.add(id);
  for(const theme of [...(choice.themes || []),choice.wave_theme,choice.theme])if(themeInterests[theme])interests.add(themeInterests[theme]);
  // A promenade is a coastal stop even when its catalogue category is a landmark.
  if(points.some(point=>point.slug.startsWith('promenad-')))interests.add('sea');
  const matched=preferences.interests.filter(id=>interests.has(id)),facts=mobilityFacts(choice,catalog);
  const accessNeeds=preferences.needs.filter(id=>id!=='short_walks');
  const barriers=facts.filter(fact=>accessNeeds.some(id=>id==='avoid_stairs'?fact.stairs==='present':fact.stroller==='blocked' || fact.stairs==='present' && fact.stroller!=='passable'));
  const partial=facts.filter(fact=>fact.extent!=='route' && (fact.stroller==='passable' || fact.stairs==='none'));
  const distance=preferences.needs.includes('short_walks')?choiceDistance(choice,catalog,matrix):null;
  const notes=[];
  if(matched.length)notes.push(`По Вашим интересам: ${matched.map(id=>DAY_INTERESTS[id].toLocaleLowerCase('ru')).join(', ')}.`);
  if(preferences.needs.includes('short_walks'))notes.push(distance===null?'Длина пешего пути ещё не рассчитана.':`Пешая линия по карте — ${lengthLabel(distance)}. Дорога от жилья и прогулки внутри мест добавляются отдельно.`);
  if(accessNeeds.length) {
    for(const fact of barriers)notes.push(`${fact.name}: ${fact.text}${fact.source?.checked_at?` Данные: ${fact.source.checked_at}.`:''}`);
    for(const fact of partial.filter(row=>!barriers.includes(row)))notes.push(`${fact.name}: ${fact.text}${fact.source?.checked_at?` Данные: ${fact.source.checked_at}.`:''}`);
    // Even a ramp at a destination does not establish a continuous accessible path.
    notes.push('Проход без лестниц и с коляской на всём пути ещё не проверен. Перед выходом уточните спуски, покрытие и входы.');
  }
  return {matched,barriers,partial,distance,notes,access:accessNeeds.length?(barriers.length?'barriers':'unknown'):'not_requested'};
}
export function rankPreferenceChoices(choices,catalog,preferences,options={}) {
  if(!hasPreferences(preferences))return [...choices];
  return choices.map((choice,index)=>({choice,index,assessment:assessPreferenceChoice(choice,catalog,preferences,options)})).sort((a,b)=>
    a.assessment.barriers.length-b.assessment.barriers.length || b.assessment.matched.length-a.assessment.matched.length
    || (preferences.needs.includes('short_walks')?(a.assessment.distance ?? Infinity)-(b.assessment.distance ?? Infinity):0)
    || a.index-b.index).map(row=>row.choice);
}
export function assessDayPreferences(trip,catalog,matrix=null) {
  const day=trip.itinerary?.days.find(row=>row.id===trip.itinerary.active),preferences=day?.preferences;
  if(!hasPreferences(preferences))return {label:null,notes:[],distance:null,unknownLegs:0};
  const route=[...(catalog.routes || []),...(catalog.day_waves?.recipes || [])].find(row=>row.slug===day.wave?.recipe);
  const places=[...new Set([...(day.kosa_plan?['vysota-efa',...(day.kosa_plan.walks==='two'?['tancuyushchiy-les']:[])]:[]),...trip.places])];
  // Route-specific evidence only applies while its exact stop order is retained.
  const sameRoute=route && JSON.stringify(route.stops.map(stop=>stop.poi))===JSON.stringify(places);
  const choice={...(sameRoute?route:{}),places,stops:places.map(id=>({poi:id,visit_scope:trip.schedule?.stops?.[id]?.visit_scope})),name:sameRoute?route.name:'Ваш день'};
  const assessed=assessPreferenceChoice(choice,catalog,preferences,{matrix}),notes=assessed.notes.filter(note=>!note.startsWith('Пешая линия') && !note.startsWith('Длина пешего'));
  let distance=null,unknownLegs=0;
  if(preferences.needs.includes('short_walks')) {
    if(sameRoute && route.mode==='walking' && assessed.distance!==null) {
      distance=assessed.distance;
      notes.push(`Линия выбранной прогулки — ${lengthLabel(distance)} по карте. Дорога от жилья и возвращение к нему считаются отдельно.`);
    } else if(!day.kosa_plan && (trip.schedule?.mode || 'foot')==='foot') {
      const bases=dayBases(trip),ids=[bases.start_at,...trip.places,bases.night_at,bases.end_at].filter(Boolean);
      let total=0,measured=0;
      for(let index=1;index<ids.length;index++) {
        const leg=resolvePair(trip,ids[index-1],ids[index],catalog,matrix);
        if(leg.origin==='same_place')continue;
        if(leg.parts) {
          for(const part of leg.parts.filter(part=>(part.leg_mode || part.mode)==='foot')) {
            if(part.origin==='same_place')continue;
            if(part.origin==='estimate' && metres(part.distance_m)){total+=part.distance_m;measured++;}else unknownLegs++;
          }
        } else if((leg.leg_mode || leg.mode)==='foot' && leg.origin==='estimate' && metres(leg.distance_m)){total+=leg.distance_m;measured++;}
        else if((leg.leg_mode || leg.mode)==='foot')unknownLegs++;
      }
      const accesses=trip.places.map(id=>resolveAccess(trip,id,catalog,matrix)).filter(Boolean).flatMap(access=>[access.approach,access.back]);
      if(bases.start_at)accesses.push(resolveAccessBetween(trip,bases.start_at,null,trip.places[0],catalog,matrix)?.back);
      if(bases.night_at){const access=resolveAccessBetween(trip,bases.night_at,trip.places.at(-1),bases.end_at,catalog,matrix);accesses.push(access?.approach,...(bases.end_at?[access?.back]:[]));}
      if(bases.end_at)accesses.push(resolveAccessBetween(trip,bases.end_at,bases.night_at || trip.places.at(-1),null,catalog,matrix)?.approach);
      for(const access of accesses.filter(Boolean)){
        if(access.origin==='shared')continue;
        if(access.origin==='estimate' && metres(access.distance_m)){total+=access.distance_m;measured++;}else unknownLegs++;
      }
      if(measured && !unknownLegs)distance=total;
      notes.push(!measured?'Длина пешего пути ещё неизвестна.':unknownLegs?`Известная часть дороги между остановками — ${lengthLabel(total)}; ${unknownLegs===1?'один участок без оценки':`${unknownLegs} участков без оценки`}.`:`Между остановками — ${lengthLabel(total)} по карте.`);
      notes.push('Прогулки внутри музеев, парков и троп в эту длину не входят. Длина пути сама по себе не подтверждает проход с коляской.');
    } else notes.push('День рассчитан на другом транспорте. Длину всех пеших подходов и прогулок внутри мест ещё нужно уточнить.');
  }
  return {label:preferencesLabel(preferences),notes,distance:unknownLegs?null:distance,unknownLegs,access:assessed.access};
}
