// Manual travel records. Status is the traveller's statement, never supplier verification.
import {validBase} from './personal-points.mjs?v=3';
export const BOOKING_KINDS={arrival:'Прибытие',lodging:'Ночёвка',activity:'Экскурсия или билет',departure:'Вылет / отъезд',return:'Возвращение'};
export const endBookingLabel=row=>row?.kind==='return'?'Возвращение':'Отъезд';
export const BOOKING_STATUSES={planned:'Планирую',booked:'Я уже забронировал',cancelled:'Отменено'};
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const text=v=>typeof v==='string';
const minute=v=>Number.isInteger(v)&&v>=0&&v<1440;
export const bookingDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!v.startsWith('0000')&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const keys=['id','kind','name','status','date','time','duration','buffer','location','target','binding','private'];
export function validBooking(v){
 return exact(v,keys)&&/^booking-[1-9]\d*$/.test(v.id)&&Object.hasOwn(BOOKING_KINDS,v.kind)&&text(v.name)&&!!v.name.trim()&&Object.hasOwn(BOOKING_STATUSES,v.status)
  &&(v.date===null||bookingDate(v.date))&&(v.time===null||minute(v.time))&&Number.isInteger(v.duration)&&v.duration>0&&v.duration<=1440
  &&Number.isInteger(v.buffer)&&v.buffer>=0&&v.buffer<=1440&&validBase(v.location)&&(v.target===null||text(v.target))
  &&['none',v.kind==='arrival'?'start':v.kind==='lodging'?'night':['departure','return'].includes(v.kind)?'end':'stop'].includes(v.binding)
  &&exact(v.private,['reference','note'])&&text(v.private.reference)&&text(v.private.note);
}
export function validBookings(rows){
 if(!Array.isArray(rows)||!rows.every(validBooking)||new Set(rows.map(r=>r.id)).size!==rows.length)return false;
 const roles=rows.filter(r=>r.binding!=='none'&&r.status!=='cancelled').map(r=>r.binding==='stop'?`stop:${r.target}`:r.binding);
 return new Set(roles).size===roles.length;
}
export const bookingDay=trip=>trip.itinerary?.days.find(d=>d.id===trip.itinerary.active);
export const bookingRows=trip=>bookingDay(trip)?.bookings||[];
export function bookingProblem(row,day){
 if(row.status==='cancelled'||row.binding==='none')return null;
 if(!row.date||!day?.date)return 'Чтобы учитывать запись в расписании, выберите дату записи и дня.';
 if(row.date!==day.date)return 'Дата записи отличается от даты дня. Время и адрес пока не меняют маршрут.';
 if(row.binding==='start'&&(!row.location||row.time===null||row.time+row.buffer>=1440))return 'Для начала дня нужны точка прибытия, время и запас до конца этой даты.';
 if(row.binding==='end'&&(!row.location||row.time===null||row.time<row.buffer))return `Для ${row.kind==='return'?'возвращения':'отъезда'} нужны точка, время и запас в пределах этой даты.`;
 if(row.binding==='night'&&!row.location)return 'Отметьте жильё на карте или выберите место из каталога.';
 if(row.binding==='stop'&&(!day.places.includes(row.target)||row.time===null||row.time+row.duration>1440))return 'Для билета нужны остановка этого дня, время и длительность в пределах даты.';
 return null;
}
export function bookingEffects(trip){
 const day=bookingDay(trip),rows=bookingRows(trip).filter(r=>r.status!=='cancelled'&&r.binding!=='none'&&!bookingProblem(r,day));
 return {start:rows.find(r=>r.binding==='start')||null,night:rows.find(r=>r.binding==='night')||null,end:rows.find(r=>r.binding==='end')||null,stops:Object.fromEntries(rows.filter(r=>r.binding==='stop').map(r=>[r.target,r]))};
}
export function saveBooking(trip,value){
 if(!bookingDay(trip)||!validBooking(value))return trip;
 const next=structuredClone(trip),day=bookingDay(next);day.bookings ||= [];
 const role=r=>r.binding==='stop'?`stop:${r.target}`:r.binding;
 if(value.binding!=='none'&&value.status!=='cancelled')for(const r of day.bookings)if(r.id!==value.id&&r.status!=='cancelled'&&role(r)===role(value))r.binding='none';
 const index=day.bookings.findIndex(r=>r.id===value.id);if(index<0)day.bookings.push(structuredClone(value));else day.bookings[index]=structuredClone(value);
 return validBookings(day.bookings)?next:trip;
}
export function deleteBooking(trip,id){
 if(!bookingRows(trip).some(r=>r.id===id))return trip;
 const next=structuredClone(trip);bookingDay(next).bookings=bookingRows(next).filter(r=>r.id!==id);return next;
}
export function nextBookingId(trip){let n=1;while(bookingRows(trip).some(r=>r.id===`booking-${n}`))n++;return `booking-${n}`;}
export const copiedBookings=rows=>rows.map(r=>({...structuredClone(r),status:'planned',date:null,binding:'none',private:{reference:'',note:''}}));
export function publicBookingTrip(trip){
 const next=structuredClone(trip);
 for(const day of next.itinerary?.days||[])for(const row of day.bookings||[])row.private={reference:'',note:''};
 return next;
}

export function effectiveBookingDay(day){
 const effect=bookingEffects({itinerary:{active:day.id,days:[day]}});
 return {...day,start_at:effect.start?.location||day.start_at,night_at:effect.night?.location||day.night_at,...(effect.end?{end_at:effect.end.location}: {})};
}
