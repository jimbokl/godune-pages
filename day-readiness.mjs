// A completed calculation is not a booking, a field check, or a saved draft.
// Keep those facts separate so neither the UI nor local counters imply certainty.
const blockers = new Set(['unknown_travel','unknown_approach','unknown_return','unknown_opening','unknown_kitchen',
  'transport_incomplete','transport_conflict','closed','window_missed','after_deadline','kitchen_closed',
  'kitchen_window_missed','appointment_missed','appointment_needs_check','appointment_venue_conflict']);
const estimated = new Set(['travel_needs_check','access_needs_check']);
const unconfirmed = new Set(['opening_needs_check','kitchen_needs_check','transport_needs_check']);
const assessment = (calculated, reason, extra={}) => ({calculated,reason,estimated:false,user_estimated:false,conditions_pending:false,field_checked:false,...extra});

export function assessSchedule(schedule) {
  if(!schedule || !Array.isArray(schedule.stops) || !schedule.stops.length)return assessment(false,'not_calculated');
  const issues=schedule.stops.flatMap(stop=>Array.isArray(stop.issues)?stop.issues.map(issue=>issue.code):[]);
  const evidence={estimated:issues.some(code=>estimated.has(code)),conditions_pending:issues.some(code=>unconfirmed.has(code))};
  if(['overrun','conflict'].includes(schedule.status))return assessment(false,'conflict',evidence);
  if(schedule.finish===null || !Number.isFinite(schedule.finish) || schedule.unknown_legs!==0 || issues.some(code=>blockers.has(code))) {
    const reason=issues.some(code=>code.startsWith('transport_'))?'transport':
      issues.some(code=>['unknown_travel','unknown_approach','unknown_return'].includes(code)) || schedule.unknown_legs>0?'travel':
      issues.some(code=>['unknown_opening','unknown_kitchen'].includes(code))?'hours':'not_calculated';
    return assessment(false,reason,evidence);
  }
  return assessment(['fits','needs_check'].includes(schedule.status),'calculated',evidence);
}

export function assessKosa(day,answers,walking) {
  if(day?.state!=='candidate')return assessment(false,day?.state==='unknown_approach'?'travel':'transport');
  if(answers.city==='svetlogorsk')return assessment(false,'travel');
  if(walking&&walking.status!=='within_estimate')return assessment(false,walking.status==='too_short'?'walking_allowance':'walking_unknown',{estimated:true,user_estimated:answers.city==='kaliningrad',conditions_pending:true});
  return assessment(true,'calculated',{estimated:true,user_estimated:answers.city==='kaliningrad',conditions_pending:true});
}

export function readinessCopy(results,saved) {
  if(!saved)return {title:'План открыт в этой вкладке',next:'Браузер не сохранил поездку. Скачайте файл поездки, прежде чем закрывать страницу.'};
  const incomplete=results.find(result=>!result.calculated);
  if(incomplete) {
    const next={conflict:'День не помещается в выбранное время. Начните раньше или сократите прогулку.',
      transport:'Остановки сохранены. Для поездки ещё нужно уточнить рейсы туда и обратно.',
      travel:'Остановки сохранены. Время части дороги пока неизвестно — уточните его в настройках дня.',
      walking_allowance:'День сохранён. На переход или прогулку оставлено меньше времени, чем даёт оценка. Увеличьте время перед поездкой.',
      walking_unknown:'День сохранён. Время переходов пока не сопоставлено с картой — уточните его перед поездкой.',
      hours:'Остановки сохранены. Перед выходом уточните часы посещения: без них весь день ещё не рассчитан.',
      not_calculated:'Остановки сохранены. Расчёт времени пока не завершён; его можно повторить в настройках дня.'}[incomplete.reason];
    return {title:'План сохранён — осталось уточнить',next};
  }
  return {title:results.length>1?'Ваша поездка сохранена':'Ваш день сохранён',
    next:results.some(result=>result.conditions_pending)?'Время рассчитано. Перед выходом сверьте часы, билеты и рейсы на дату поездки.':
      'Время рассчитано. Дорога оценена по карте — оставьте запас и сверьте проход перед выходом.'};
}
