import {serviceDay,validServiceDate} from './service-calendar.mjs';
export function parkTotal(people,exempt,amount=40000){
 if(!Number.isInteger(people)||people<1||people>50||!Number.isInteger(exempt)||exempt<0||exempt>people)return null;
 return (people-exempt)*amount;
}
export function airportDepartures(rows,ready){
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(ready))return null;
 return rows.filter(time=>time>=ready).slice(0,3);
}
const money=n=>new Intl.NumberFormat('ru-RU').format(n/100)+' ₽';
const el=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n};
const localDate=()=>{const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kaliningrad',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(k=>p.find(v=>v.type===k).value).join('-')};
const json=async name=>{const r=await fetch(new URL(`data/${name}.json`,import.meta.url));if(!r.ok)throw Error(`HTTP ${r.status}`);return r.json()};
async function boot(){
 const fees=document.querySelector('[data-park-fee]'),airport=document.querySelector('[data-airport-guide]'),rail=document.querySelector('[data-rail-guide]');
 if(!fees&&!airport&&!rail)return;
 const data=await json('intent-transit');
 if(fees){const f=fees.querySelector('form'),result=fees.querySelector('[data-park-fee-result]');
  const mode=new URL(location.href).searchParams.get('fee-mode');if(['bus','foot','car'].includes(mode))f.elements.mode.value=mode;
  const update=()=>{const v=new FormData(f),total=parkTotal(Number(v.get('people')),Number(v.get('exempt')),data.park.amount_kopecks);result.replaceChildren();
   if(!f.checkValidity()||total==null){result.append(el('p','Укажите число участников. Человек с льготой не может быть больше, чем всего в компании.'));return}
   const n=el('strong',money(total));n.className='intent-number';result.append(n,el('p',`${v.get('people')} чел., из них ${v.get('exempt')} с подтверждённой льготой. Дорога и еда в эту сумму не входят.`));
   result.append(el('p',v.get('mode')==='car'?'За легковой автомобиль отдельная плата не начисляется. В сумме — посещение парка пассажирами.':v.get('mode')==='bus'?'На kkosa.ru для рейсового автобуса выбирайте «пешком». Билет на автобус оплачивается отдельно.':'Это билет на посещение парка. Сохраните его для открытия без сети.'));
  };f.addEventListener('input',update);f.addEventListener('submit',e=>e.preventDefault());update();
 }
 if(airport){const f=airport.querySelector('form'),result=airport.querySelector('[data-airport-result]');
  const update=()=>{const ready=new FormData(f).get('ready'),rows=airportDepartures(data.airport.departures,ready);result.replaceChildren();if(!rows){result.append(el('p','Укажите время выхода с багажом.'));return}
   if(!rows.length){result.append(el('strong','После этого времени 244Э в опубликованной таблице нет.'),el('p','Для поездки в Зеленоградск нужен подтверждённый трансфер до адреса. Последний автобус — 22:00.'));return}
   result.append(el('strong',`Ближайший по таблице: ${rows[0]}`));const list=el('ul','');for(const t of rows)list.append(el('li',`244Э из Храброво · ${t}`));result.append(list,el('p','Это первый участок пути в Калининград. Пересадка до Зеленоградска подбирается отдельно; таблица не подтверждает стыковку.'));
  };f.addEventListener('input',update);f.addEventListener('submit',e=>e.preventDefault());update();
 }
 if(rail){const services=await json('rail-services'),f=rail.querySelector('form'),date=f.elements.date,result=rail.querySelector('[data-rail-guide-result]');date.value=localDate();
  const update=()=>{const v=new FormData(f),id=`kaliningrad-${v.get('origin')}-${v.get('destination')}`,service=services.services.find(r=>r.id===id),day=v.get('date');result.replaceChildren();
   if(!validServiceDate(day)){result.append(el('p','Выберите дату поездки.'));return}
   const timetable=serviceDay(service,day);
   if(timetable.reason||timetable.outward==null||timetable.inbound==null){result.append(el('strong','Таблица для этой станции и даты не опубликована в нашем снимке.'),el('p','Для центра Зеленоградска выберите Зеленоградск-Новый. Не переносите его рейсы на Зеленоградск-2.'));const a=el('a','Открыть расписание КППК ↗');a.href='https://kppk39.ru/raspisanie/kaliningrad-zelenogradsk-svetlogorsk/';a.className='intent-action';result.append(a);return}
   const {outward,inbound}=timetable;result.append(el('strong',`${service.from} → ${service.to} · ${day.split('-').reverse().join('.')}`));
   if(!outward.length||!inbound.length){result.append(el('p','По календарю на эту дату нет пары рейсов туда и обратно.'));return}
   result.append(el('p',`Первый поезд: ${outward[0].departure} → ${outward[0].arrival}. Последний обратно: ${inbound.at(-1).departure} → ${inbound.at(-1).arrival}.`));
   const details=el('details','');details.append(el('summary',`Все рейсы на дату · туда ${outward.length}, обратно ${inbound.length}`));for(const [title,rows]of [['Туда',outward],['Обратно',inbound]]){details.append(el('h3',title));const list=el('ul','');for(const t of rows)list.append(el('li',`${t.departure} → ${t.arrival} · поезд ${t.id}`));details.append(list)}result.append(details);
   const source=el('a',`КППК · сверено ${timetable.source.checked_at} ↗`);source.href=timetable.source.url;source.className='intent-action';result.append(source);
  };f.addEventListener('input',update);f.addEventListener('change',update);f.addEventListener('submit',e=>e.preventDefault());update();
 }
}
if(typeof document!=='undefined')boot().catch(error=>{console.error('Travel tools:',error);for(const n of document.querySelectorAll('[data-airport-result],[data-park-fee-result],[data-rail-guide-result]')){n.append(el('p','Интерактивный расчёт не загрузился. Опубликованные данные и ссылки на источники доступны на странице.'))}});
