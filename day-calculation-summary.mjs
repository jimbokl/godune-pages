// Read-only scope and wording for the existing result, shared by screen/PDF.
import {dayFinish,dayEarliestFinish} from './rail-access.mjs?v=2026101305';
import {dayBases} from './travel-estimates.mjs?v=2026101305';
import {selectedDay} from './trip-days-state.mjs?v=2026101707';
import {hasTransportPlans} from './trip-transport-plans-contract.mjs?v=2026101305';
import {clock} from './day-stop-view.mjs?v=2026101305';

export function walkingCalculationOnly(trip,result) {
  const bases=dayBases(trip),schedule=trip.schedule;
  // Null bounds mean the calculation begins/ends at the walking stops. They
  // do not prove a zero-minute journey from home or back. Never infer this
  // scope from a URL, recipe, or editable personal note.
  return (schedule?.mode || 'foot')==='foot' && !bases.start_at && !bases.night_at && !bases.end_at
    && !schedule?.rail && !schedule?.base_transport && !result.rail
    && !hasTransportPlans(selectedDay(trip))
    && !result.stops.some(row=>row.excursion);
}

export function dayCalculationSummary(trip,result) {
  const walking=walkingCalculationOnly(trip,result) && result.stops.length>0;
  const intro={empty:'Сначала добавьте точки в свой маршрут.',fits:'По вашим оценкам, день складывается.',needs_check:'День складывается по оценкам. Сверьте дорогу и вход в выбранные места.',
    incomplete:'Для точного плана нужно время дороги, пеших участков или переправы.',overrun:'Этот день не вмещает все остановки.',conflict:'Есть остановки или рейсы, которые не помещаются в этот день.'}[result.status];
  const walkingIntro={fits:'По вашим оценкам, прогулка складывается.',needs_check:'Прогулка складывается по оценкам. Сверьте дорогу и вход в выбранные места.',overrun:'Эта прогулка не вмещает все остановки.',conflict:'Есть остановки, которые не помещаются в эту прогулку.'}[result.status];
  const noReturn=result.stops.some(row=>row.excursion?.conflict);
  return (walking?'Пешая часть. ':'')
    +(trip.schedule?.progress?`Остаток ${walking?'пешей части':'дня'} с ${clock(trip.schedule.progress.at)}. `:'')
    +(walking?walkingIntro || intro:intro)
    +(result.stops.length && !noReturn ? ` ${dayFinish(result)===null?'Закончите не раньше':'Ориентир окончания:'} ${clock(dayEarliestFinish(result))}.`:'')
    +(!walking && result.slack!==null && result.slack>=0 && result.stops.length ? ` До ${result.rail?'границы дня с обратным поездом':'конца дня'} остаётся ${result.slack} мин.`:'')
    +(result.rail?' Выбранные электрички учитывают путь от станции, возвращение и запас на посадку.':'')
    +(walking?' Дорога до начала прогулки: время и транспорт неизвестны. Обратная дорога: время и транспорт неизвестны. Время этих поездок не включено в расчёт.':'');
}
