import {dayJourneyBoundaries,boundaryForEntry,usesJourneyBoundaries} from './day-journey-boundaries.mjs?v=3';
// Read-only PDF view of the same Rust assessment used by the day screen.
import {inspectTripServiceDay} from './trip-service-day-state.mjs?v=5';
import {validServiceVisit,serviceVisitRows,hasServiceVisits,serviceVisitContext} from './trip-service-visits-contract.mjs?v=1';
import {timelineOrder,validTimeline} from './trip-service-timeline-state.mjs';
import {selectedDay,budgetInput,COST_KINDS} from './trip-days-state.mjs?v=25';
import {formatKopecks as money} from './trip-money.mjs';
import {clock} from './day-stop-view.mjs?v=1';
import {railJourney,excursionJourney} from './day-journey-view.mjs?v=8';
import {resolveRail} from './trip-rail-state.mjs?v=6';
import {resolveExcursion} from './trip-transport-state.mjs?v=3';
import {baseName} from './personal-points.mjs?v=3';
import {rentalDetails,rentalMapPoints} from './trip-rental-view.mjs';
import {selectedConnectionRows,unusedConnectionRows} from './trip-service-transfer-view.mjs';
import {provenanceSources} from './service-provenance.mjs';

const categories={bike_rental:'Велопрокат',bath:'Баня',pool:'Бассейн',gym:'Спортзал',market:'Рынок',workshop:'Мастерская',dining:'Еда',water_activity:'Водный отдых'};
const stages={approach:'До входа',collect:'Получить вещи',change_before:'Переодеться',prepare:'Подготовиться',activity:'На месте',complete:'Завершить',change_after:'Переодеться после',return_walk:'Вернуться к ориентиру',return_road:'До пункта возврата',handover:'Сдать велосипед'};
const checks={age:'Возраст',group:'Ваша компания',audience:'Вход для гостей',equipment:'Что взять',booking:'Запись'};
const states={fits:'По времени и условиям подходит.',does_not_fit:'Время или условия не подходят. Измените выбор перед выходом.',needs_info:'Часть времени или условий ещё нужно уточнить.'};
const contexts={date_changed:'Посещение выбрано на другую дату. Пересчитайте его перед выходом.',date_missing:'Дата дня не выбрана. Посещение пока не сверено с этим днём.',unsupported:'Выбор сохранён, но полный расчёт в этой версии недоступен.'};
const roads={unknown:'Время дороги пока неизвестно.',stale:'Сведения о дороге нужно обновить.',changed_point:'Точка пути изменилась. Дорогу нужно проверить.',conflict:'Источники по дороге расходятся.',blocked:'Этот переход недоступен.'};
const errors={service_day_generated_unresolved:'Посещения сохранены отдельно от поездки на косу. Её расчёт их не учитывает.',service_day_rail_unresolved:'Выбранные электрички нужно проверить заново. Посещения пока не сверены с возвращением.',service_timeline_unsupported:'Порядок сохранён в другой версии. Полный расчёт дня пока недоступен.'};
errors.service_transfer_connections_unsupported='Выбранную дорогу пока не удалось прочитать. Она остаётся в файле поездки.';
const safeText=value=>typeof value==='string'?value:'';
const price=(total,known)=>total!=null?money(total):known>0?`Не меньше ${money(known)}. Полная сумма неизвестна.`:'Полная сумма пока неизвестна.';
const source=value=>value?{name:value.reference||'Источник',url:/^https?:\/\//.test(value.reference||'')?value.reference:null,checked_at:value.checked_at}:null;
function conditionText(c){
 const range=(min,max,unit)=>min==null&&max==null?'Без ограничений':min!=null&&max!=null?`От ${min} до ${max} ${unit}`:min!=null?`От ${min} ${unit}`:`До ${max} ${unit}`;
 if(c.kind==='age')return range(c.minimum,c.maximum,'лет');
 if(c.kind==='group')return range(c.minimum,c.maximum,'человек');
 if(c.kind==='audience')return c.allowed.map(v=>({guest:'Гости',resident:'Проживающие',member:'Владельцы абонемента'})[v]||v).join(', ');
 if(c.kind==='equipment')return c.required.length?c.required.map(v=>v.label).join(', '):'Ничего дополнительно не требуется';
 if(c.kind==='booking')return !c.required?'Без предварительной записи':c.notice_minutes==null?'Нужна запись':`Запись минимум за ${c.notice_minutes} мин`;
 return 'Условие нужно уточнить';
}
function serviceCard(engine,visit,day,index){
 const card={id:safeText(visit?.id)||`unknown-${index+1}`,key:`service:${day.id}:${index}`,name:safeText(visit?.name)||'Сохранённое посещение',category:categories[visit?.category]||'Посещение',address:safeText(visit?.address),note:safeText(visit?.note),point:null,date:null,context:'unsupported',state:null,summary:contexts.unsupported,assessment:null,conditions:[],sources:[]};
 if(visit&&Object.hasOwn(visit,'provenance'))card.provenance=structuredClone(visit.provenance);
 if(!validServiceVisit(visit))return card;
 let prepared;try{prepared=engine.serviceTrip(visit);}catch{return card;}
 const a=prepared.assessment;card.context=serviceVisitContext(visit,day);card.assessment=a;card.point=prepared.visit.point;card.date=a.visit.date;card.state=a.state;card.summary=contexts[card.context]||states[a.state];
 card.cost=price(a.quote?.cost_total??null,a.quote?.cost_lower_bound??0);
 card.deposit=a.quote?.deposit?price(a.quote.deposit.total,0):'Возвратный залог пока неизвестен.';
 card.upfront=price(a.quote?.upfront_total??null,a.quote?.upfront_lower_bound??0);
 card.stages=a.visit.duration.segments.map(v=>({label:stages[v.stage]||'Часть посещения',minutes:v.minutes}));
 card.rental=rentalDetails(visit,a);
 card.rental_points=rentalMapPoints(visit,a);
 for(const check of a.eligibility.checks){
  const status={pass:'Подходит',fail:'Условие не выполнено',unknown:'Нужно уточнить',stale:'Нужны свежие сведения',conflict:'Источники расходятся'}[check.status]||'Нужно уточнить';
  card.conditions.push({label:checks[check.kind]||'Условие',status,observations:check.observations.map(v=>({text:conditionText(v.rule.condition),status:v.status,source:source(v.rule.source)}))});
 }
 const calendars=[a.visit.calendar,a.rental?.pickup.calendar,a.rental?.return_visit?.calendar].filter(Boolean);
 const roads=[a.access?.approach,a.access?.return_walk,a.rental?.approach,a.rental?.return_road,a.rental?.after_return].filter(Boolean);
 const evidence=[...calendars.flatMap(c=>[...c.windows,...c.sessions].map(v=>v.source)),...roads.flatMap(r=>r.candidates.map(v=>v.link.source)),...(a.rental?.billing.sources||[]),...card.rental_points.map(p=>p.source)];
 card.sources=[...new Map(evidence.filter(Boolean).map(s=>[JSON.stringify(s),source(s)])).values(),...provenanceSources(visit.provenance,day.date||card.date)];
 return card;
}
export function guideEntries(day,stops,services){
 const available=[...stops.map(p=>({kind:'place',id:p.id,name:p.name,lat:p.lat,lon:p.lon,completed:p.completed})),...services.map(s=>{
  const point=s.rental_points?.find(p=>p.kind==='rental_pickup')||s.point;
  return {kind:'service',id:s.id,key:s.key,name:s.name,...(point?{lat:point.lat,lon:point.lon}:{})};
 })];
 const order=validTimeline(day.timeline)?timelineOrder(day):available;
 const ranked=order.map(v=>available.find(p=>p.kind===v.kind&&p.id===v.id)).filter(Boolean);
 for(const entry of available)if(!ranked.includes(entry))ranked.push(entry);
 return ranked.map((entry,index)=>({...entry,number:index+1}));
}
export function serviceGuide(engine,trip,catalog,matrix){
 const day=selectedDay(trip);if(!hasServiceVisits(day)&&!Object.hasOwn(day,'timeline')&&!Object.hasOwn(day,'transfer_connections')&&!(usesJourneyBoundaries(day,catalog)&&typeof engine.serviceDay==='function'))return null;
 const services=serviceVisitRows(day).map((v,i)=>serviceCard(engine,v,day,i));
 let check=null,error=null;try{check=inspectTripServiceDay(engine,trip,catalog,matrix);}catch(e){error=errors[e.message]||'Полный расчёт дня пока недоступен. Выбранные посещения и записи сохранены ниже.';}
 const boundaries=dayJourneyBoundaries(day,catalog);
 const name=entry=>boundaryForEntry(boundaries,entry)?.anchor?.name||(entry?.kind==='service'?services.find(v=>v.id===entry.id)?.name||'Посещение':catalog.poi.find(p=>p.slug===entry?.id)?.name||'Остановка');
 const issues=[];
 if(error)issues.push(error);
 for(const row of check?.overlaps||[])issues.push(`«${name(row.first)}» и «${name(row.second)}» пересекаются ${row.precision==='minimum'?'как минимум ':''}на ${row.minutes} мин.`);
 for(const issue of check?.issues||[]){
  const text={outside_day_window:`«${name(issue.entry)}» выходит за время дня или выбранные рейсы.`,connection_after_day:'Выбранный рейс возвращает вас позже окончания дня.',connection_after_day_risk:'По приблизительному расчёту выбранная поездка может закончиться позже времени дня.',day_end_risk:'По приблизительному расчёту день может закончиться позже выбранного времени.',selected_connections_changed:'Порядок остановок изменился. Проверьте выбранные пересадки.',date_changed:`«${name(issue.entry)}» выбрано на другую дату.`,date_missing:'Укажите дату дня, чтобы сверить посещения.',service_time_unknown:`У «${name(issue.entry)}» неизвестна часть времени.`,service_connections_unknown:'Дорога между прогулкой и посещениями ещё не учтена.',unresolved_visits:'Часть сохранённых посещений пока не удалось проверить.'}[issue.code];
  if(text)issues.push(text);
 }
 return {services,check,error,issues:[...new Set(issues)],summary:error||({fits:check?.itinerary?'Остановки и дорога укладываются в выбранное время.':'Посещения укладываются в день по выбранному времени. Дорога между ними ещё не рассчитана.',needs_info:'Для полного расчёта дня не хватает сведений.',conflict:'В плане есть пересечения или ограничения.',empty:'В этом дне пока нет остановок.'}[check?.state]||'Полный расчёт пока недоступен.')};
}
export function mixedGuideRows(trip,catalog,guide,issueText){
 const result=guide.check;if(!result?.itinerary)return null;
 const rail=railJourney(resolveRail(trip,catalog),result.places.rail),rows=[...rail.before],day=selectedDay(trip);
 const scheduled=[...result.itinerary.order],editable=timelineOrder(day),boundaries=dayJourneyBoundaries(day,catalog);
 for(let i=0;i<editable.length;i++){
  const entry=editable[i];if(scheduled.some(v=>v.kind===entry.kind&&v.id===entry.id))continue;
  const next=editable.slice(i+1).find(v=>scheduled.some(row=>row.kind===v.kind&&row.id===v.id));
  const index=next?scheduled.findIndex(v=>v.kind===next.kind&&v.id===next.id):scheduled.findIndex(v=>v.kind==='destination');
  scheduled.splice(index<0?scheduled.length:index,0,{...entry,schedule_id:null});
 }
 for(const entry of scheduled){
  const stop=result.places.stops.find(v=>v.id===entry.schedule_id),service=guide.services.find(v=>v.id===entry.id);
  const point=catalog.poi.find(p=>p.slug===entry.id),anchor=entry.kind==='origin'?day.start_at:entry.id==='__day_night'?day.night_at:day.end_at;
  const nativeAnchor=result.itinerary.connections.flatMap(v=>v.journey?.transfers.flatMap(t=>t.anchors||t.road?.anchors||[])||v.leg?.anchors||[]).find(v=>v.id===entry.id);
  const boundary=boundaryForEntry(boundaries,entry);
  const name=service?.name||point?.name||boundary?.anchor?.name||nativeAnchor?.name||baseName(anchor,catalog)||'Начало дня';
  const connection=result.itinerary.connections.find(v=>v.to===entry.schedule_id);
  if(connection){
   const transferRows=selectedConnectionRows(connection,{id:entry.schedule_id,title:`Дорога к «${name}»`});
   if(transferRows)rows.push(...transferRows);
   else {
   const minutes=connection.leg?.minutes,origin=result.itinerary.order.some(v=>v.kind==='origin'&&v.schedule_id===connection.from);
   rows.push({id:`road:${entry.schedule_id}`,kind:'walk',time:connection.departure,title:minutes===0?(origin?'Начало здесь':'Тот же ориентир'):`Переход к «${name}»`,text:minutes!=null?(minutes===0&&origin?'Дорога от жилья до первого места считается отдельно.':`${minutes} мин по выбранному пути.`):roads[connection.status]||roads.unknown,sources:(connection.leg?.candidates||[]).map(v=>source(v.link.source)),state:minutes==null?'unknown':'estimate'});
   }
  }
  if(entry.kind==='origin'||entry.kind==='destination'||boundary){
   rows.push({id:entry.schedule_id,kind:entry.kind==='origin'?'start':'return',time:stop?.begins??null,title:`${entry.kind==='origin'?'Начало':entry.kind==='destination'&&boundaries.bookings.end?'Отъезд':'Возвращение'} · ${name}`,text:stop?.begins!=null?'Время по расчёту дня.':'Точное время неизвестно.',state:stop?.begins!=null?'estimate':'unknown'});continue;
  }
  if(entry.kind==='service'){
   rows.push(serviceRow(service,stop));continue;
  }
  if(!point)continue;
  if(stop?.wait>0)rows.push({id:`wait:${entry.id}`,kind:'wait',time:stop.arrival,title:'До входа',text:`Ожидание ${stop.wait} мин.`,state:'estimate'});
  rows.push({id:entry.id,poi:entry.id,kind:'visit',time:stop?.begins??null,title:point.name,text:`На месте ${stop?.visit_minutes??0} мин.`+(stop?.issues.length?' '+stop.issues.map(issueText).join(' '):''),state:stop?.begins!=null?'estimate':'unknown'});
  const excursion=resolveExcursion(trip,entry.id,catalog);if(excursion&&stop?.excursion)rows.push(...excursionJourney(excursion,stop.excursion,point.name));
 }
 // Future visits keep their chosen location in the list, without a fake time.
 for(const service of guide.services)if(!rows.some(v=>v.id===`service:${service.key}`))rows.push(serviceRow(service));
 rows.push(...unusedConnectionRows(result.itinerary));
 return rows;
}
export function serviceRow(service,stop){
 const a=service?.assessment,current=service?.context==='ready';
 return {id:`service:${service.key}`,kind:'service',time:current?a?.visit.timeline.arrival??null:null,timeLabel:'Выбрано',title:service.name,text:service.summary+(a?` ${current?'':'Исходный выбор: '}${service.date}. Завершение ${a.summary.departure==null?'пока неизвестно':clock(a.summary.departure)}.`:'')+(stop?.issues.some(v=>v.code==='fixed_visit_missed')?' К выбранному времени не успеваем. Переставьте остановки или измените посещение.':''),state:current&&a?'estimate':'unknown'};
}
export function guideExpenses(engine,trip){
 const day=selectedDay(trip),recorded=Object.values(day.costs||{}).some(v=>v.items?.length||v.amount!=null||v.paid!=null);if(!recorded)return null;
 const local={...trip,itinerary:{...trip.itinerary,days:[day]}};
 try{
  const result=engine.budget(budgetInput(local));
  return {summary:result.days[0],links:result.service_expenses?.[0]?.records||[],categories:Object.entries(day.costs).map(([kind,value])=>({kind,label:COST_KINDS[kind],...structuredClone(value)}))};
 }catch{return {error:'Записанные суммы сохранены в плане. Общий расчёт расходов пока недоступен.'};}
}
