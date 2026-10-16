import {resolveVisitCalendar} from './visit-calendar.mjs?v=2026101603';
const zelenogradsk={service:'kaliningrad-south-zelenogradsk',outward:'08:00',inbound:'20:03',start:'09:00',lat:54.9635752,lon:20.4808171,venue:'restoran-telegraf',venueLabel:'«Телеграфе»',food:['kofeynya-slou','restoran-telegraf'],sea:['byuvet-luizy','promenad-zelenogradsk'],preset:['Балтийская уха','Скумбрия на ржаном хлебе'],rainPrefix:'План на дождь:',museum:'murarium',rainVisits:{'promenad-zelenogradsk':20},rainMuseumMinutes:80};
const svetlogorsk={service:'kaliningrad-south-svetlogorsk-2',outward:'09:58',inbound:'20:36',start:'11:15',lat:54.9440961,lon:20.1469869,venue:'restoran-local',venueLabel:'Local Baltic Food',food:['restoran-local'],sea:['promenad-svetlogorsk'],preset:['Балтийская уха из разных видов рыб с янтарной кислотой','Филе судака с цветной капустой и кремом из сельдерея'],rainPrefix:'Светлогорск в дождь:',museum:'morskoy-vystavochnyy-tsentr',rainVisits:{'ozero-tihoe':45,'promenad-svetlogorsk':20},rainMuseumMinutes:90};
export const cityDayConfig=slug=>slug==='svetlogorsk-one-day'?svetlogorsk:zelenogradsk;
export function cityRainPlan(config,catalog,date){
 const museum=catalog.poi.find(p=>p.slug===config.museum),calendar=resolveVisitCalendar(museum,date);
 const open=Array.isArray(calendar.windows)&&calendar.windows.length>0;
 const clock=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
 const hours=open?calendar.windows.map(w=>`${clock(w.open)}–${clock(w.close)}${w.last_entry==null?'':', последний вход в '+clock(w.last_entry)}`).join('; '):'';
 const price=museum?.price,entry=price?.currency==='RUB'&&Number.isSafeInteger(price.amount)?`Полный билет — ${price.amount.toLocaleString('ru-RU')} ₽.`:'Стоимость входа уточните у музея.';
 if(config.museum==='murarium')return {open,note:open?`План на дождь: в Мурариуме — 80 минут под крышей, на променаде — 20 минут. Это время, заложенное в прогулку вместо длинной паузы у моря. Для выбранной даты: ${hours}. ${entry} После музея — обед в «Телеграфе». Дорога между местами остаётся на улице.`:calendar.reason==='closed'?'План на дождь: в выбранную дату Мурариум закрыт. Башню осматриваем снаружи — 10 минут, на променаде — 20 минут. Вход в музей не включён; обед — в «Телеграфе». При сильном ветре возвращайтесь в город.':'План на дождь: режим Мурариума на выбранную дату не подтверждён. В плане — 10 минут снаружи и 20 минут у моря, без входа в музей. Перед посещением проверьте часы у музея; дорога и променад остаются на улице.'};
 return {open,note:open?'Светлогорск в дождь: сократить прогулку у Тихого озера до 45 минут и променад до 20 минут. После обеда в Local — 90 минут в Морском выставочном центре: «Люди моря» и галерея, взрослый билет 500 ₽. Центр работает 11:00–19:00; дорога между местами остаётся на улице.':calendar.reason==='closed'?'Светлогорск в дождь: в выбранную дату Морской выставочный центр закрыт (понедельник, вторник или последняя среда месяца). У Тихого озера — 45 минут, у моря — 20 минут. Обед в зале Local с 15:00; при сильном ветре оставайтесь в верхнем городе и возвращайтесь на поезд раньше.':'Светлогорск в дождь: выберите дату, чтобы учесть календарь Морского выставочного центра. У Тихого озера — 45 минут, у моря — 20 минут. Обед в зале Local с 15:00.'};
}

// Train class follows the numbered service, not the Lastochka rolling stock.
export function cityRailFare(service,ride,date){
 const fare=service?.fare;if(!fare||!ride||!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<fare.valid_from||Number(date.slice(0,4))!==fare.publication_year)return null;
 const fast=(ride.id.match(/\d{4}/g)||[]).some(n=>Number(n)>=7101&&Number(n)<=7598);
 return fare[fast?'fast_kopecks':'ordinary_kopecks'];
}
export function cityRailTotal(service,outward,inbound,date){
 const values=[outward,inbound].map(ride=>cityRailFare(service,ride,date));
 return values.some(v=>v===null)?null:values.reduce((a,b)=>a+b,0);
}
