import {validCosts,expenseCostInput,unpaidCopy} from './trip-expenses-state.mjs?v=4';
import {cleanSchedule, defaultSchedule, validSchedule} from './trip-schedule-state.mjs?v=6';
import {validBase,isPersonalPoint} from './personal-points.mjs?v=1';
export const validTripDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !value.startsWith('0000') && Number.isFinite(Date.parse(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
export const COST_KINDS={lodging:'Ночёвка',food:'Еда',travel:'Дорога',tickets:'Билеты',other:'Другое'};
const object=v=>v && typeof v==='object' && !Array.isArray(v);
export function validJourney(journey) {
  if(!object(journey) || journey.version!==1 || !Array.isArray(journey.days) || !journey.days.length || !Number.isSafeInteger(journey.people) || journey.people<1 || journey.people>4294967295) return false;
  const ids=new Set();
  return journey.days.every(day=>{
    if(!object(day) || typeof day.id!=='string' || !/^day-[1-9]\d*$/.test(day.id) || ids.has(day.id) || !(day.date===null || validTripDate(day.date)) || !Array.isArray(day.places) || !day.places.every(id=>typeof id==='string') || new Set(day.places).size!==day.places.length || Object.hasOwn(day,'schedule') && !validSchedule(day.schedule) || ![day.start_at,day.night_at].every(validBase) || typeof day.note!=='string' || !object(day.costs))return false;
    ids.add(day.id);
    return validCosts(day.costs,COST_KINDS);
  }) && ids.has(journey.active);
}
export function validJourneyProjection(trip) {
  if(!validJourney(trip.itinerary))return false;
  const day=trip.itinerary.days.find(d=>d.id===trip.itinerary.active);
  const canonical=value=>{
    const schedule=cleanSchedule(value,day.places);
    if(schedule)schedule.stops=Object.fromEntries(Object.entries(schedule.stops).sort(([a],[b])=>a.localeCompare(b)));
    return JSON.stringify(schedule);
  };
  return day.date===trip.date && JSON.stringify(day.places)===JSON.stringify(trip.places) && canonical(day.schedule)===canonical(trip.schedule);
}
const snapshot=(trip,id='day-1')=>({id,date:trip.date,places:[...trip.places],...(trip.schedule?{schedule:structuredClone(trip.schedule)}:{}),start_at:null,night_at:null,note:'',costs:{}});
export function cleanJourney(value,trip,catalog) {
  if(!validJourney(value))return null;
  const known=new Set(catalog.poi.map(p=>p.slug));
  const days=value.days.map(day=>{
    const places=day.places.filter(id=>known.has(id)), schedule=cleanSchedule(day.schedule,places);
    return {...day,places,...(schedule?{schedule}:{}),start_at:isPersonalPoint(day.start_at)?structuredClone(day.start_at):known.has(day.start_at)?day.start_at:null,night_at:isPersonalPoint(day.night_at)?structuredClone(day.night_at):known.has(day.night_at)?day.night_at:null,costs:structuredClone(day.costs)};
  });
  const selected=days.find(day=>day.id===value.active);
  selected.date=trip.date;selected.places=[...trip.places];delete selected.schedule;
  if(trip.schedule)selected.schedule=structuredClone(trip.schedule);
  return {version:1,active:value.active,people:value.people,days};
}
export const journeyDays=trip=>trip.itinerary?.days || [snapshot(trip)];
export const selectedDay=trip=>trip.itinerary?.days.find(day=>day.id===trip.itinerary.active) || snapshot(trip);
export const tripHasPlaces=trip=>journeyDays(trip).some(day=>day.places.length) || !!trip.routes.length;
export const tripHasExpenses=trip=>journeyDays(trip).some(day=>Object.values(day.costs).some(row=>row.items?.length || row.amount!==null && row.amount!==undefined || row.paid!==null && row.paid!==undefined));
export const tripHasDraft=trip=>tripHasPlaces(trip) || tripHasExpenses(trip);
export const tripPlaceIds=trip=>[...new Set(journeyDays(trip).flatMap(day=>[...day.places,day.start_at,day.night_at]).filter(id=>typeof id==='string'))];
export function ensureJourney(trip) {
  if(trip.itinerary)return structuredClone(trip);
  return {...structuredClone(trip),itinerary:{version:1,active:'day-1',people:1,days:[snapshot(trip)]}};
}
const project=(trip,day)=>{
  const next={...trip,date:day.date,month:day.date?Number(day.date.slice(5,7)):trip.month,places:[...day.places],itinerary:{...trip.itinerary,active:day.id}};
  delete next.schedule;if(day.schedule)next.schedule=structuredClone(day.schedule);
  return next;
};
export function chooseTripDay(trip,id) {
  const next=ensureJourney(trip), day=next.itinerary.days.find(day=>day.id===id);
  return day?project(next,day):trip;
}
const nextId=days=>{let n=1;while(days.some(d=>d.id===`day-${n}`))n++;return `day-${n}`;};
export function nextDate(value) {
  if(!validTripDate(value))return null;
  const date=new Date(value+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+1);
  const next=date.toISOString().slice(0,10);return validTripDate(next)?next:null;
}
export function addTripDay(trip,copy=false) {
  const next=ensureJourney(trip), current=selectedDay(next), day=copy?structuredClone(current):snapshot({...trip,places:[],schedule:trip.schedule?{...trip.schedule,stops:{}}:defaultSchedule()});
  if(copy)day.costs=unpaidCopy(day.costs);
  day.id=nextId(next.itinerary.days);day.date=nextDate(next.itinerary.days.at(-1).date);
  if(!copy){day.start_at=current.night_at;day.night_at=current.night_at;}
  next.itinerary.days.push(day);return project(next,day);
}
export function removeTripDay(trip,id) {
  if(!trip.itinerary || trip.itinerary.days.length===1 || !trip.itinerary.days.some(d=>d.id===id))return trip;
  const next=structuredClone(trip), index=next.itinerary.days.findIndex(d=>d.id===id);
  next.itinerary.days.splice(index,1);
  return next.itinerary.active===id?project(next,next.itinerary.days[Math.min(index,next.itinerary.days.length-1)]):next;
}
export function movePlaceToDay(trip,id,target,copy=false) {
  if(!trip.itinerary || target===trip.itinerary.active || !trip.places.includes(id))return trip;
  const next=structuredClone(trip), destination=next.itinerary.days.find(d=>d.id===target);if(!destination)return trip;
  if(!destination.places.includes(id)) {
    destination.places.push(id);
    const setting=trip.schedule?.stops[id];
    if(setting){destination.schedule ||= defaultSchedule();destination.schedule.stops[id]=structuredClone(setting);}
  }
  if(!copy)next.places=next.places.filter(value=>value!==id);
  return next;
}
export function changeDayDetails(trip,changes) {
  const next=ensureJourney(trip), day=next.itinerary.days.find(d=>d.id===next.itinerary.active);
  for(const field of ['start_at','night_at','note','costs'])if(Object.hasOwn(changes,field))day[field]=structuredClone(changes[field]);
  if(Object.hasOwn(changes,'people'))next.itinerary.people=changes.people;
  return validJourney(next.itinerary)?next:trip;
}
export function budgetInput(trip) {
  return {version:1,people:trip.itinerary?.people || 1,days:journeyDays(trip).map(day=>({id:day.id,costs:Object.keys(COST_KINDS).map(kind=>expenseCostInput(kind,day.costs[kind]))}))};
}
export function mergeJourney(before,incoming,merged) {
  const days=structuredClone(journeyDays(before));
  let active;
  for(const day of journeyDays(incoming)) {const copy=structuredClone(day);copy.id=nextId(days);days.push(copy);if(day.id===selectedDay(incoming).id)active=copy.id;}
  const trip={...merged,itinerary:{version:1,active,people:before.itinerary?.people || incoming.itinerary?.people || 1,days}};
  return project(trip,days.find(day=>day.id===active));
}
