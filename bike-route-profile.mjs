// Facts describe the selected bicycle road, never an adjacent walking route.
const surfaces={missing:'не указано',paved:'твёрдое',asphalt:'асфальт',concrete:'бетон',paving_stones:'плитка',cobblestone:'брусчатка',unpaved:'без твёрдого покрытия',compacted:'уплотнённый грунт',fine_gravel:'мелкий гравий',gravel:'гравий',ground:'грунт',dirt:'земля',grass:'трава',sand:'песок',wood:'деревянный настил',other:'другое покрытие'};
const metres=n=>Number.isFinite(n)&&n>=0;
export const bikeDistance=n=>n===0?'0 м':n<1000?`${Math.max(1,Math.round(n/10)*10)} м`:`${(n/1000).toLocaleString('ru-RU',{maximumFractionDigits:1})} км`;
export function bikeProfile(travel) {
  const p=travel?.bike_profile;
  if(travel?.origin!=='estimate'||(travel.leg_mode||travel.mode)!=='bike'||!p||!p.surfaces||Array.isArray(p.surfaces)
    ||!metres(travel.distance_m)||p.elevation!==null||!['dismount_m','steps_m','unmapped_m'].every(k=>metres(p[k])&&p[k]<=travel.distance_m+1)
    ||p.steps_m>p.dismount_m+1)return null;
  const rows=Object.entries(p.surfaces);
  if(!rows.length||rows.some(([key,value])=>!Object.hasOwn(surfaces,key)||!metres(value))
    ||Math.abs(rows.reduce((sum,[,n])=>sum+n,0)-travel.distance_m)>1)return null;
  return p;
}
export function bikeRouteFacts(travel) {
  const parts=travel?.parts?.length?travel.parts:[travel];
  const bikes=parts.filter(p=>(p?.leg_mode||p?.mode)==='bike'&&p.origin!=='same_place');
  if(!bikes.length)return [];
  if(bikes.some(p=>p.origin!=='estimate'))return [];
  const profiles=bikes.map(bikeProfile);
  if(profiles.some(p=>!p))return ['Покрытие и спешивание пока не рассчитаны.'];
  const totals={};for(const p of profiles)for(const [surface,n]of Object.entries(p.surfaces))totals[surface]=(totals[surface]||0)+n;
  const entries=Object.entries(totals).filter(([,n])=>n>=1).sort((a,b)=>b[1]-a[1]);
  const facts=entries.length?[`Покрытие: ${entries.map(([key,n])=>`${surfaces[key]} — ${bikeDistance(n)}`).join('; ')}.`]:[];
  const dismount=profiles.reduce((sum,p)=>sum+p.dismount_m,0),steps=profiles.reduce((sum,p)=>sum+p.steps_m,0);
  if(dismount>=1)facts.push(`Пешком с велосипедом — около ${bikeDistance(dismount)}${steps>=1?`, в том числе лестницы — ${bikeDistance(steps)}`:''}.`);
  const unmapped=profiles.reduce((sum,p)=>sum+p.unmapped_m,0);
  if(unmapped>=1)facts.push(`Для ${bikeDistance(unmapped)} нет сведений о спешивании.`);
  if(profiles.some(p=>p.elevation===null))facts.push('Перепад высот пока неизвестен.');
  return facts;
}
export function bikeSectionLabel(section) {
  return `${bikeDistance(section.from_m)}–${bikeDistance(section.to_m)}: ${surfaces[section.surface]||'покрытие не указано'}${section.steps?' · лестницы':section.dismount?' · пешком с велосипедом':''}`;
}
