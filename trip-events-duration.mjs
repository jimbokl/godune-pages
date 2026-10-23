// Duration metadata never supplies an exact event end or native timing.
export function validEventDurationEstimate(value){
 return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>['minutes','basis','label'].includes(k))&&Number.isSafeInteger(value.minutes)&&value.minutes>0&&['planning_assumption','published_duration'].includes(value.basis)&&typeof value.label==='string'&&!!value.label.trim();
}
export function eventDurationEstimateText(event){
 if(event?.end_time!==null||!validEventDurationEstimate(event?.duration_estimate))return null;
 if(event.duration_estimate.basis==='published_duration')return `Длительность по программе: ${event.duration_estimate.label.trim().replace(/\.$/,'')}.`;
 return `Планировочная оценка: ${event.duration_estimate.label.trim()}. Это предположение, а не подтверждённое время окончания. Дорогу, ужин и возвращение нужно уточнить отдельно.`;
}
