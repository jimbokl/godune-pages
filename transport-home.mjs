// Shared bounds around a dated train/bus day. Null never means zero minutes.
export function transitHomeInput(preferences){
  const home=preferences.home;
  if(home==null)return null;
  const minutes=n=>Number.isInteger(n)&&n>=0&&n<=1440;
  if(typeof home!=='object'||Array.isArray(home)||Object.keys(home).some(k=>!['ready_at','end_by','approach','return_minutes'].includes(k))
    ||home.ready_at!==preferences.ready||!minutes(home.ready_at)||!minutes(home.end_by)||home.ready_at>=home.end_by
    ||![home.approach,home.return_minutes].every(n=>n===null||minutes(n)))throw Error('transport_home_changed');
  return structuredClone(home);
}
export const transitDayFinish=day=>day?.home?day.home.finish:day?.rail?.home_finish??day?.finish??null;
export const transitDayEarliestFinish=day=>day?.home?day.home.earliest_finish:transitDayFinish(day);
const clock=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
export function transitHomeCopy(home,homeKnown=true,road=null){
  if(!home)return '';
  if(!homeKnown){
    if(home.state==='late_home')return `Возвращение не раньше ${clock(home.earliest_finish)} — на ${home.late_by} мин позже выбранного времени ${clock(home.end_by)}. Начните раньше или сократите прогулку.`;
    if(home.state==='fits')return `Возвращение около ${clock(home.finish)}. До выбранного времени ${clock(home.end_by)} — ${home.return_slack} мин. Дорога от жилья не включена.`;
    return 'Полное возвращение пока неизвестно. Уточните время дороги и пересадки.';
  }
  if(home.state==='late_home')return `К жилью не раньше ${clock(home.earliest_finish)} — на ${home.late_by} мин позже выбранного времени ${clock(home.end_by)}. Начните раньше или сократите прогулку.`;
  if(home.state==='missed_outward')return `До первой посадки не хватает ${home.missed_outward_by} мин. Уточните дорогу от жилья и выберите другой рейс.`;
  if(home.state!=='fits')return 'Дорога от жилья или обратно ещё неизвестна. Рейсы показаны как вариант; время полного возвращения пока не рассчитано.';
  return `К жилью около ${clock(home.finish)}. До выбранного времени ${clock(home.end_by)} — ${home.return_slack} мин. ${road?.to&&road?.back?'Дорога от жилья и обратно — оценка по карте.':road?.to||road?.back?'Часть дороги оценена по карте, остальные минуты указаны вами.':'Время дороги от жилья и обратно — ваша оценка.'}`;
}
export function transitBackupCopy(day,homeKnown=true){
  if(!day?.home||!day.backup)return '';
  const backup=day.backup_home;
  if(backup?.state==='fits')return `После запасного рейса ${homeKnown?'к жилью':'вернётесь'} около ${clock(backup.finish)}. До выбранного времени возвращения — ${backup.return_slack} мин. Наличие мест неизвестно.`;
  if(backup?.state==='late_home')return `После запасного рейса ${homeKnown?'к жилью':'вернётесь'} не раньше ${clock(backup.earliest_finish)} — на ${backup.late_by} мин позже выбранного времени. Для возвращения вовремя он не подходит.`;
  return 'Следующий автобус ещё не даёт полного запасного возвращения. Дорогу к жилью и пересадки после него нужно уточнить.';
}
