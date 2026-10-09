import {budgetInput,journeyDays} from './trip-days-state.mjs?v=25';
import {serviceExpenseDay} from './trip-service-expenses-contract.mjs?v=2';

// The same explicit ledger, supplemented by Rust's read-only visit projection.
// Nothing here writes expenses, multiplies group quotes or assumes payments.
export function serviceBudgetInput(trip){
 const {service_expenses,...budget}=budgetInput(trip);
 const days=journeyDays(trip).map(day=>serviceExpenseDay(day,{includeVisits:true})).filter(day=>day.visits.length||day.unresolved_visits||day.links.length);
 return days.length?{...budget,service_forecast:days}:budget;
}
