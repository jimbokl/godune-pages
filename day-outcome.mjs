const clock=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
const estimates=new Set(['travel_needs_check','access_needs_check','transport_needs_check']);
export function dayOutcome(check){
 const stops=check.places.stops,issues=stops.flatMap(s=>s.issues),finish=check.places.finish;
 if(check.state==='empty')return 'В этом дне пока нет посещений.';
 if(check.state==='conflict')return 'В плане есть пересечения или ограничения.';
 if(check.state==='fits')return check.itinerary?'Остановки и дорога укладываются в выбранное время.':'По выбранному времени посещения укладываются в день.';
 if(check.issues.some(i=>i.code==='service_connections_unknown'))return 'Соедините места и посещения, чтобы рассчитать весь день.';
 if(finish!==null&&!check.issues.length&&issues.length&&issues.every(i=>estimates.has(i.code))&&check.visits.every(v=>v.context==='ready'&&v.assessment?.state==='fits'))return `По приблизительному расчёту день закончится в ${clock(finish)}.`;
 if(issues.some(i=>['unknown_travel','unknown_approach','unknown_return','transport_incomplete'].includes(i.code)))return 'Уточните неизвестные участки дороги, чтобы рассчитать возвращение.';
 return 'Часть времени или условий посещения нужно уточнить.';
}
