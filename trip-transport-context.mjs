import {validTransportPlans,transportPlanContext} from './trip-transport-plans-contract.mjs?v=2026101305';

const messages={
 transport_date_changed:'Транспортный расчёт сохранён на другую дату. Откройте его и пересчитайте рейсы.',
 transport_company_changed:'Компания изменилась. Откройте транспортный расчёт и пересчитайте стоимость.',
 transport_company_unknown:'Сверьте компанию в дне и транспортном расчёте.',
 transport_return_unavailable:'В сохранённом транспортном расчёте отправление или возвращение не подошло. Откройте расчёт и измените поездку.',
 transport_timetable_unavailable:'Рейсы на дату дня или часть дороги ещё не подтверждены. Откройте транспортный расчёт и уточните данные.',
 transport_connections_unknown:'Сохранённые рейсы ещё не связаны с остановками этого дня. Возвращение для всего дня не проверено; откройте транспортный расчёт и проверьте дорогу к посадке.',
};
export const transportIssueText=code=>messages[code];

// Portable receipts retain their own timetable. The adapter supplies context,
// never an invented approach, geographic match or whole-day return deadline.
export function dayTransportPlans(day){
 if(!validTransportPlans(day))throw Error('service_day_transport_unresolved');
 return (day.transport_plans?.entries||[]).map(entry=>({
  profile:entry.receipt.profile,date:entry.receipt.date,state:entry.receipt.state,
  same_party:transportPlanContext(entry,day).sameParty,
 }));
}
