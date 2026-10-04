const clock=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
const names={efa:'Высота Эфа',forest:'Танцующий лес'};
const period=(name,value)=>`${name} ${clock(value.begins)}–${clock(value.ends)} — ${value.daylight===true?'при дневном свете':value.daylight===false?'часть времени до восхода или после заката':'свет пока не рассчитан'}.`;
// Rust supplies the intervals and solar bounds. Screen, notes and PDF share copy.
export function kosaLightSummary(assessment){
  const state=assessment?.daylight===true?'daylight':assessment?.daylight===false?'outside_daylight':'unknown';
  const text=state==='daylight'?'Осмотр и ожидание выбранного автобуса у троп укладываются в дневной свет, по расчёту солнца.':
    state==='outside_daylight'?'Часть осмотра или ожидания автобуса — до восхода или после заката. Начните раньше или оставьте одну прогулку.':
    'Дневной свет пока не рассчитан для всего дня. Перед поездкой проверьте восход, закат и ожидание автобуса у каждой тропы.';
  const rows=[{text,warning:state!=='daylight'}];
  for(const stop of assessment?.stops||[]){
    const sun=Number.isInteger(stop.sunrise)&&Number.isInteger(stop.sunset)?`Восход ${clock(stop.sunrise)}, закат ${clock(stop.sunset)}.`:'Время восхода и заката пока неизвестно.';
    rows.push({text:`${names[stop.id]}: ${sun} ${period('Осмотр',stop.visit)} ${period('Ожидание автобуса',stop.wait)}`,
      warning:stop.visit.daylight!==true||stop.wait.daylight!==true});
    if(stop.backup_wait)rows.push({text:`Запасной автобус · ${names[stop.id]}: ${period('Ожидание после пропущенного рейса',stop.backup_wait)} Посадку и рейс на дату поездки нужно подтвердить.`,warning:stop.backup_wait.daylight!==true});
  }
  rows.push({text:'Восход и закат рассчитаны для даты и координат троп. Облака, фонари и доступ на настилы этот расчёт не подтверждает.',warning:false});
  return {state,assessment:assessment?structuredClone(assessment):null,rows};
}
