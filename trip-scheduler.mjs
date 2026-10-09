import {instantiateWasm} from './wasm-loader.mjs?v=1';
let engine;
// Every caller uses Rust. A failed WASM load never silently switches to different maths.
export function loadScheduler(base) {
  if (!engine) engine = fetch(new URL('assets/trip.wasm?v=42',base)).then(async response => {
    if (!response.ok) throw Error('Не удалось загрузить расчёт дня.');
    const {instance} = await instantiateWasm(response, {name:'trip'});
    const plan = input => calculate(instance.exports,input);
    plan.light = input => calculateLight(instance.exports,input);
    plan.budget = input => calculateBudget(instance.exports,input);
    plan.offers = input => calculateOffers(instance.exports,input);
    plan.serviceQuote = input => calculateServiceQuote(instance.exports,input);
    plan.rentalCycle = input => calculateRentalCycle(instance.exports,input);
    plan.serviceCalendar = input => calculateServiceCalendar(instance.exports,input);
    plan.serviceVisit = input => calculateServiceVisit(instance.exports,input);
    plan.serviceAccess = input => calculateServiceAccess(instance.exports,input);
    plan.serviceConditions = input => calculateServiceConditions(instance.exports,input);
    plan.serviceAssessment = input => calculateServiceAssessment(instance.exports,input);
    plan.serviceTrip = input => prepareServiceTrip(instance.exports,input);
    plan.serviceDay = input => inspectServiceDay(instance.exports,input);
    plan.dayChange = input => calculateDayChange(instance.exports,input);
    plan.alongRoute = input => calculateAlongRoute(instance.exports,input);
    plan.serviceTransfer = input => calculateServiceTransfer(instance.exports,input);
    plan.serviceQuery = input => calculateServiceQuery(instance.exports,input);
    plan.serviceSpatial = input => calculateServiceSpatial(instance.exports,input);
    plan.housing = input => calculateHousing(instance.exports,input);
    plan.arrival = input => calculateArrival(instance.exports,input);
    plan.transitDay = input => calculateTransitDay(instance.exports,input);
    plan.transitAdvice = input => calculateTransitAdvice(instance.exports,input);
    return plan;
  }).catch(error => {engine=null;throw error;});
  return engine;
}
export const calculate = (wasm,input) => invoke(wasm,input,'trip_plan','schedule');
export const calculateLight = (wasm,input) => invoke(wasm,input,'trip_light','light');
export const calculateBudget = (wasm,input) => {
 if(Object.hasOwn(input,'service_forecast')){
  const {service_forecast:days,service_expenses,...budget}=input;
  return invoke(wasm,{version:1,budget,days},'trip_service_budget','budget');
 }
 if(!Object.hasOwn(input,'service_expenses'))return invoke(wasm,input,'trip_budget','budget');
 const {service_expenses:days,...budget}=input;
 return invoke(wasm,{version:1,budget,days},'trip_service_expenses','budget');
};
export const calculateOffers = (wasm,input) => invoke(wasm,input,'trip_offers','offers');
export const calculateServiceQuote = (wasm,input) => invoke(wasm,input,'trip_service_quote','quote');
export const calculateRentalCycle = (wasm,input) => invoke(wasm,input,'trip_rental_cycle','cycle');
export const calculateServiceCalendar = (wasm,input) => invoke(wasm,input,'trip_service_calendar','calendar');
export const calculateServiceVisit = (wasm,input) => invoke(wasm,input,'trip_service_visit','visit');
export const calculateServiceAccess = (wasm,input) => invoke(wasm,input,'trip_service_access','access_visit');
export const calculateServiceConditions = (wasm,input) => invoke(wasm,input,'trip_service_conditions','eligibility');
export const calculateServiceAssessment = (wasm,input) => invoke(wasm,input,'trip_service_assessment','assessment');
export const prepareServiceTrip = (wasm,input) => invoke(wasm,input,'trip_service_trip','prepared');
export const inspectServiceDay = (wasm,input) => invoke(wasm,input,'trip_service_day','day_check');
export const calculateDayChange = (wasm,input) => invoke(wasm,input,'trip_day_change','change');
export const calculateAlongRoute = (wasm,input) => invoke(wasm,input,'trip_along_route','matches');
export const calculateServiceTransfer = (wasm,input) => invoke(wasm,input,'trip_service_transfer','journey');
export const calculateServiceQuery = (wasm,input) => invoke(wasm,input,'trip_service_query','results');
export const calculateServiceSpatial = (wasm,input) => invoke(wasm,input,'trip_service_spatial','nearby');
export const calculateHousing = (wasm,input) => invoke(wasm,input,'trip_housing','housing');
export const calculateArrival = (wasm,input) => invoke(wasm,input,'trip_arrival','arrival');
export const calculateTransitDay = (wasm,input) => invoke(wasm,input,'trip_transit_day','transit_day');
export const calculateTransitAdvice = (wasm,input) => invoke(wasm,input,'trip_transit_advice','alternatives');
function invoke(wasm, input, method, key) {
  const bytes = new TextEncoder().encode(JSON.stringify(input));
  const pointer = wasm.trip_alloc(bytes.length); let output, length;
  try {
    new Uint8Array(wasm.memory.buffer,pointer,bytes.length).set(bytes);
    output = wasm[method](pointer,bytes.length);
    length = new DataView(wasm.memory.buffer).getUint32(output,true);
    const result = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(new Uint8Array(wasm.memory.buffer,output+4,length)));
    if (!result.ok) throw Error(result.error);
    return result[key];
  } finally {
    wasm.trip_free(pointer,bytes.length);
    if (output !== undefined && length !== undefined) wasm.trip_free(output,length+4);
  }
}
