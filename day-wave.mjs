// Themes select editorial stops; pace changes estimates. The scheduler remains shared.
export const WAVE_THEMES={mixed:'День на волне',beach:'День на пляжной волне',gastro:'День на гастрономической волне',history:'День на исторической волне'};
export const WAVE_PACES={calm:{name:'Без спешки',reserve:15,factor:1.25},full:{name:'Обычный темп',reserve:10,factor:1}};
const object=value=>value && typeof value==='object' && !Array.isArray(value);
const duration=(value,min=0)=>Number.isInteger(value) && value>=min && value<=1440;
export function validDayWave(value) {
  return object(value) && value.version===1 && Object.hasOwn(WAVE_THEMES,value.theme)
    && Object.hasOwn(WAVE_PACES,value.pace) && (value.recipe===null || typeof value.recipe==='string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.recipe));
}
export function waveVisit(visit,pace) {
  if(!Number.isInteger(visit) || visit<0 || visit>1440 || !Object.hasOwn(WAVE_PACES,pace))throw Error('wave_invalid_visit');
  return pace==='full'?visit:Math.min(1440,Math.ceil(visit*WAVE_PACES[pace].factor/5)*5);
}
export function waveSchedule(schedule,wave) {
  if(!validDayWave(wave))throw Error('wave_invalid_settings');
  const next=structuredClone(schedule);next.reserve=WAVE_PACES[wave.pace].reserve;
  for(const row of Object.values(next.stops))row.visit=waveVisit(row.visit,wave.pace);
  return next;
}
// Editorial time estimates are independent of opening hours, tickets and road data.
export function waveStopSettings(route,catalog) {
  return Object.fromEntries(route.stops.map(stop=>{
    const point=catalog.poi.find(row=>row.slug===stop.poi);
    const visit=duration(stop.visit_minutes,1)?stop.visit_minutes:duration(point?.visit_minutes,1)?point.visit_minutes:
      route.stops.length===1 && duration(route.minutes,1)?route.minutes:30;
    return [stop.poi,{visit,pause:stop.pause_minutes ?? 0,leg:null,window:null,
      ...(stop.visit_scope==='outside'?{visit_scope:'outside'}:{})}];
  }));
}
export function waveChoices(catalog,routes,theme='mixed') {
  const registry=catalog?.day_waves;if(!Object.hasOwn(WAVE_THEMES,theme))return [];
  const known=new Map((catalog?.poi || []).map(point=>[point.slug,point]));
  const recipes=registry?.version===1 ? (registry.recipes || []).filter(row=>object(row) && row.slug && row.name
    && row.area && row.mode==='walking' && Object.hasOwn(WAVE_THEMES,row.theme) && Array.isArray(row.stops) && row.stops.length
    && row.stops.every(object) && new Set(row.stops.map(stop=>stop.poi)).size===row.stops.length
    && (row.return_to===undefined || known.get(row.return_to)?.area===row.area)
    && row.stops.every(stop=>object(stop) && known.get(stop.poi)?.area===row.area
      && (stop.visit_minutes===undefined || duration(stop.visit_minutes,1))
      && (stop.visit_scope===undefined || stop.visit_scope==='outside')
      && (stop.pause_minutes===undefined || duration(stop.pause_minutes)))) : [];
  const seen=new Set(routes.map(row=>row.slug));
  const routeTheme=row=>registry?.version===1 && Object.hasOwn(WAVE_THEMES,registry.route_themes?.[row.slug])?registry.route_themes[row.slug]:'mixed';
  const choices=[...routes.map(row=>({...row,wave_theme:routeTheme(row)})),
    ...recipes.filter(row=>{if(seen.has(row.slug))return false;seen.add(row.slug);return true;}).map(row=>({...row,wave_recipe:true,wave_theme:row.theme}))];
  return choices.filter(row=>theme==='mixed' || row.wave_theme===theme);
}
export function waveLabel(wave) {
  return validDayWave(wave)?`${WAVE_THEMES[wave.theme]} · ${WAVE_PACES[wave.pace].name.toLocaleLowerCase('ru')}`:null;
}
export function waveEvidence(wave) {
  if(!validDayWave(wave))return 'Запас между остановками — 10 минут.';
  return wave.pace==='calm'?'Без спешки: к оценке посещения добавлена четверть времени с округлением до 5 минут. Запас между остановками — 15 минут.':'Обычный темп: время посещения — оценка для выбранной прогулки; запас между остановками — 10 минут.';
}
