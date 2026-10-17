import {cityDayConfig,cityRailFare,cityRainPlan} from './city-day-config.mjs?v=2026101709';
import {serviceDay} from './service-calendar.mjs?v=2026101305';
import {dayPeople} from './trip-party.mjs?v=2026101305';
import {selectedDay} from './trip-days-state.mjs?v=2026101707';
import {loadScheduler} from './trip-scheduler.mjs?v=2026101707';
import {referenceBudget} from './day-reference-budget.mjs?v=2026101702';

let resources;
export function loadCityBudget(base){
 if(!resources)resources=Promise.all([loadScheduler(base),fetch(new URL('data/gastro-menu-choices.json',base)).then(r=>{if(!r.ok)throw Error('reference_menu_unavailable');return r.json();})]).then(([calculate,menus])=>({calculate,menus})).catch(error=>{resources=null;throw error;});
 return resources;
}
const unknown=(id,name,kind='food')=>({id,name,kind,amount_kopecks:null,quantity:1,scope:'person',unit:'не уточнено',source:null,status:'unknown'});
function menuRow(choice,{scope='group'}={}){
 const byWeight=/100\s*(?:гр?|g)(?:\s|$|[,.])/i.test(`${choice.portion||''} ${choice.price?.label||''}`);
 const amount=byWeight?null:choice.price?.amount_kopecks??null;
 return {id:choice.menu_item_id,name:choice.name,kind:'food',amount_kopecks:amount,quantity:choice.quantity??1,scope,unit:byWeight?`${choice.portion||choice.price?.label||'100 г'}; вес порции не выбран`:choice.portion||'порция',source:structuredClone(choice.source||null),status:amount===null?'unknown':'observed'};
}
const selectionContext=({people=1,party=null,outward,inbound,choices=[]})=>({
 rail:{outward:outward||null,inbound:inbound||null},
 party:{adults:party?.adults??people,children:party?.children??0},
 menu:choices.map(c=>({id:c.menu_item_id,quantity:c.quantity??1,amount_kopecks:c.price?.amount_kopecks??null,portion:c.portion||'',source:c.source?.url||null}))
});
export function cityReferenceMatches(quote,day,journeyPeople=1){
 const context=quote?.context;if(!context||!day)return false;
 const people=dayPeople(day,journeyPeople),weather=day.note?.split('\n').some(line=>line.startsWith(cityDayConfig(day.source_route).rainPrefix))?'rain':'sun';
 if(context.route!==day.source_route||context.date!==day.date||context.people!==people||context.weather!==weather)return false;
 const rail=day.schedule?.rail;
 return !context.selection||JSON.stringify(context.selection)===JSON.stringify(selectionContext({people,party:day.party,outward:rail?.outward?.id,inbound:rail?.inbound?.id,choices:day.menu_choices||[]}));
}
export function cityReferenceBudget(calculate,{catalog,menus,route,date,people=1,weather='sun',outward,inbound,choices=[],party=null}){
 const config=cityDayConfig(route),service=catalog.rail_services?.find(s=>s.id===config.service),table=serviceDay(service,date);
 const rides=[['outward',outward,'Поезд туда'],['inbound',inbound,'Поезд обратно']];
 const adults=party?.adults??people,children=party?.children??0;
 const rail=rides.flatMap(([direction,id,name])=>{
  const ride=table.reason?null:table[direction]?.find(r=>r.id===id),amount=cityRailFare(service,ride,date),fare=service?.fare;
  const fast=ride&&(ride.id.match(/\d{4}/g)||[]).some(n=>Number(n)>=7101&&Number(n)<=7598);
  const row={id:`rail-${direction}`,name:ride?`${name}: ${ride.departure} → ${ride.arrival}`:name,kind:'travel',amount_kopecks:amount,quantity:adults||1,scope:'group',unit:'взрослый билет',source:fare?{...structuredClone(fare.source),...(fast?{url:fare.fast_source_url}:{}),valid_from:fare.valid_from}:null,status:amount===null?'unknown':'observed'};
  return [...(adults?[row]:[]),...(children?[{...unknown(`rail-${direction}-children`,`${name}: детские билеты`,'travel'),quantity:children,scope:'group',unit:'детский билет'}]:[])];
 });
 // Saved choices are ordered quantities for the group. A sample lunch is one
 // portion per person, and is replaced rather than added to those choices.
 const food=choices.length?choices.map(c=>menuRow(c)):config.preset.map((name,i)=>{
  const choice=menus.venues?.[config.venue]?.find(c=>c.name===name);
  return choice?menuRow(choice,{scope:'person'}):unknown(`meal-${i}`,name);
 });
 const base=[...rail,...food],full=[...base];
 const museumId=config.museum,museum=catalog.poi.find(p=>p.slug===museumId),open=cityRainPlan(config,catalog,date).open;
 if(open){
  const fact=museum?.price,amount=fact?.currency==='RUB'&&Number.isSafeInteger(fact.amount*100)?fact.amount*100:null;
  const row={...unknown(`entry-${museumId}`,museum?.name||'Музей','tickets'),amount_kopecks:amount,unit:fact?.unit||'вход',source:structuredClone(fact?.source||null),status:amount===null?'unknown':'observed'};
  const entries=[...(adults?[{...row,quantity:adults,scope:'group',unit:'взрослый билет'}]:[]),...(children?[{...unknown(`entry-${museumId}-children`,'Детские билеты в музей','tickets'),quantity:children,scope:'group',unit:'детский билет'}]:[])];
  full.push(...entries);if(weather==='rain')base.push(...entries);
 }
 if(route==='zelenogradsk-one-day'&&!choices.some(c=>c.place?.poi_id==='kofeynya-slou')){
  const coffee=menus.venues?.['kofeynya-slou']?.find(c=>c.name==='Капучино 250 мл');
  full.push(coffee?menuRow(coffee,{scope:'person'}):unknown('coffee','Кофе в «Слоу»'));
 }else if(route==='svetlogorsk-one-day')full.push(unknown('coffee','Кофе'));
 full.push(unknown('snack','Перекус'));
 return referenceBudget(calculate,{context:{route,date,people,weather,selection:selectionContext({people,party,outward,inbound,choices})},base,full});
}
export function withCityReferenceBudget(trip,catalog,{calculate,menus}){
 const day=selectedDay(trip);if(!['zelenogradsk-one-day','svetlogorsk-one-day'].includes(day.source_route))return trip;
 const copy=structuredClone(trip),target=selectedDay(copy),rail=target.schedule?.rail;
 const weather=target.note?.split('\n').some(line=>line.startsWith(cityDayConfig(target.source_route).rainPrefix))?'rain':'sun';
 target.reference_budget=cityReferenceBudget(calculate,{catalog,menus,route:target.source_route,date:target.date,people:dayPeople(target,copy.itinerary?.people||1),weather,outward:rail?.outward?.id,inbound:rail?.inbound?.id,choices:target.menu_choices||[],party:target.party||null});
 return copy;
}
