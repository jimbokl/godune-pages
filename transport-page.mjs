import {validateTransportProfile,calculateTransport,transportReceipt,transportGuide,transportClock} from './transport-page-state.mjs?v=1';
import {loadScheduler} from './trip-scheduler.mjs?v=40';
import {formatKopecks as money} from './trip-money.mjs';

const mount=document.querySelector('[data-transport-profile]'),form=document.querySelector('#transport-form');
const base=new URL('./',import.meta.url),node=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
const stateText={candidate:'Отправление и обратный автобус подобраны по таблице.',no_return:'Для такой прогулки обратный автобус не подошёл.',no_outward:'Подходящий автобус к Эфе уже не найден.',conflict:'Поездка не складывается: отправление или возврат не помещаются.',incomplete:'Отправление можно выбрать. Точное возвращение нужно уточнить.',needs_check:'Рейсы складываются по опубликованной таблице.',car_price:'Вход в парк на вашу компанию.',unpublished_year:'Расписание на этот год пока не добавлено.',outside_validity:'На выбранную дату опубликованная таблица не действует.',missing_service:'Расписание пока не добавлено.',unavailable:'Подходящая поездка по таблице не найдена.'};
const download=(bytes,name,type)=>{const a=node('a');a.href=URL.createObjectURL(new Blob([bytes],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};

async function init(){
  if(!mount||!form)return;
  const status=document.querySelector('#transport-status'),result=document.querySelector('#transport-result'),submit=form.querySelector('[type=submit]');
  const json=async path=>{const response=await fetch(new URL(path,base));if(!response.ok)throw Error('transport_data_unavailable');return response.json();};
  let profile,tables,receipt=null,generation=0,pdfAbort;
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kaliningrad',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  form.elements.date.value=['year','month','day'].map(key=>parts.find(p=>p.type===key).value).join('-');
  try{
    const [manifest,bus,services]=await Promise.all([json('data/transport-pages.json'),json('data/kosa-bus-210.json'),json('data/transport-services.json')]);
    if(manifest.version!==1||services.version!==1||bus.version!==1)throw Error('transport_data_invalid');
    profile=validateTransportProfile(manifest.profiles.find(p=>p.id===mount.dataset.transportProfile));tables={bus,services};
    submit.disabled=false;status.textContent='Начало — у остановки или причала. Дорога от жилья сюда в расчёт не входит.';
    document.documentElement.dataset.transportReady='true';
  }catch{status.textContent='Расчёт не загрузился. Расписание и ссылки доступны ниже.';document.documentElement.dataset.transportReady='error';return;}
  const controls=()=>{
    const bus=profile.adapter==='bus210'&&form.elements.mode.value==='foot';
    form.querySelectorAll('[data-bus-fields]').forEach(n=>n.hidden=!bus);
    form.querySelectorAll('[data-forest-fields]').forEach(n=>n.hidden=!bus||form.elements.walks.value!=='two');
    form.querySelectorAll('[data-bike-fields]').forEach(n=>n.hidden=form.elements.mode.value!=='bike');
    form.elements.exempt.max=form.elements.people.value;
  };
  controls();
  form.addEventListener('input',()=>{
    controls();generation++;pdfAbort?.abort();receipt=null;result.replaceChildren(node('h2','Отправление и возвращение'),node('p','Настройки изменились. Рассчитайте поездку заново.'));
    status.textContent='Новые настройки ещё не рассчитаны.';submit.disabled=false;
  });
  const read=()=>{const v=name=>Number(form.elements[name].value),time=form.elements.ready.value;return {date:form.elements.date.value,ready:Number(time.slice(0,2))*60+Number(time.slice(3)),boarding:v('boarding'),shore:v('shore'),people:v('people'),exempt:v('exempt'),bikes:v('bikes'),mode:form.elements.mode.value,walks:form.elements.walks.value,forest:v('forest')};};
  form.addEventListener('submit',async event=>{
    event.preventDefault();const ticket=++generation;receipt=null;pdfAbort?.abort();submit.disabled=true;status.textContent='Считаем отправление и возвращение…';
    try{
      const answers=read(),engine=await loadScheduler(base),calculation=calculateTransport(profile,answers,tables,engine);
      if(ticket!==generation)return;
      receipt=transportReceipt(profile,answers,calculation);
      result.replaceChildren(node('h2','Ваш транспортный план'));
      const heading=node('p',stateText[calculation.state]||'Проверьте выбранные рейсы по таблице.','transport-result-heading');heading.dataset.state=calculation.state;result.append(heading);
      const timeline=node('ol',undefined,'transport-timeline');
      for(const row of receipt.rows.filter(row=>row.kind==='transport')){
        const li=node('li');li.append(node('span',transportClock(row.time),'transport-time'),node('h3',row.title),node('p',row.text));timeline.append(li);
      }
      result.append(timeline);
      const budget=node('section',undefined,'transport-budget'),list=node('dl');budget.append(node('h3','Стоимость на компанию'));
      for(const row of calculation.price.rows){const line=node('div');line.append(node('dt',row.label),node('dd',row.cost===null?'Уточняется':money(row.cost)));list.append(line);}
      budget.append(list,node('p',calculation.price.total!==null?`Итого: ${money(calculation.price.total)}`:calculation.price.known>0?`Известная часть: ${money(calculation.price.known)}`:'Подтверждённые тарифы пока не добавлены.','transport-budget-total'));
      if(calculation.price.total===null&&calculation.price.known>0)budget.append(node('p','Полная сумма появится после уточнения остальных тарифов.'));
      result.append(budget);
      const actions=node('div',undefined,'transport-result-actions'),pdf=node('button','Скачать памятку PDF ↓','transport-primary');pdf.type='button';
      pdf.addEventListener('click',async()=>{
        if(ticket!==generation||!receipt)return;const frozen=structuredClone(receipt);pdfAbort?.abort();pdfAbort=new AbortController();const signal=pdfAbort.signal;pdf.disabled=true;
        try{
          const {makeTripGuidePdf}=await import('./trip-guide-pdf.mjs?v=20');signal.throwIfAborted();
          const file=await makeTripGuidePdf({snapshot:transportGuide(frozen),media:{maps:{},photos:{},overview:{},qrs:{},source:{snapshot_at:null},warnings:[]},base:base.href,format:'print'},{signal,onProgress:text=>{if(ticket===generation)status.textContent=text;}});
          if(ticket!==generation)return;download(file.bytes,`${profile.id}-${frozen.date}.pdf`,'application/pdf');status.textContent='PDF готов: транспортный план, суммы и источники в одном файле.';
        }catch(error){if(error.name!=='AbortError'&&ticket===generation)status.textContent='PDF не собрался. Расчёт остаётся на странице; попробуйте ещё раз.';}finally{if(ticket===generation)pdf.disabled=false;}
      });
      actions.append(pdf);
      const next=node('a',profile.adapter==='bus210'?'Собрать полный день →':'Выбрать прогулку на косе →');next.href=new URL(profile.adapter==='bus210'?'kurshskaya-kosa/bez-mashiny/':'dunes/baltic-spit/routes/',base).href;actions.append(next);result.append(actions);
      const source=node('p',undefined,'transport-source'),link=node('a','Источник расписания');link.href=calculation.calendar.source.url;source.append(link,document.createTextNode(` · проверен ${calculation.calendar.source.checked_at}`));result.append(source);
      status.textContent='Расчёт готов. Измените время или длительность, чтобы проверить другой вариант.';
      result.dataset.state=calculation.state;
    }catch{if(ticket===generation){result.replaceChildren(node('h2','Расчёт нужно повторить'),node('p','Проверьте дату, состав компании и время. Исходные таблицы доступны ниже.'));status.textContent='Поездка пока не рассчитана.';}}
    finally{if(ticket===generation)submit.disabled=false;}
  });
}
init();
