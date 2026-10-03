import {loadScheduler} from './trip-scheduler.mjs?v=14';
import {kosaInput,kosaNote,kosaClock as clock,addKosaDay} from './kosa-plan-state.mjs?v=1';
import {createTripFile} from './trip-file.mjs?v=16';
const el=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
const duration=n=>`${Math.floor(n/60)?`${Math.floor(n/60)} ч `:''}${n%60?`${n%60} мин`:''}`.trim();
const cityNote={zelenogradsk:'План начинается у автобуса № 210 в Зеленоградске. Дорогу от жилья до остановки добавьте отдельно.',
  kaliningrad:'До Зеленоградска — электричка с Северного или Южного вокзала. Поезд и путь от жилья выбирайте отдельно: они пока не входят в расчёт.',
  svetlogorsk:'Сначала доберитесь до Зеленоградска. Подходящий рейс и путь от жилья ещё нужно уточнить; в расчёте ниже — автобус от Зеленоградска.'};
const download=(body,name,type)=>{const a=el('a');a.href=URL.createObjectURL(new Blob([body],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
export async function initKosaPlanner({workshop,catalog,base}) {
  const form=document.querySelector('#kosa-form'),result=document.querySelector('#kosa-result'),status=document.querySelector('#kosa-status');
  if(!form || !result)return;
  const submit=form.querySelector('[type=submit]');let sequence=0,tablePromise;
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kaliningrad',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const part=type=>today.find(p=>p.type===type).value;
  form.elements.date.value=`${part('year')}-${part('month')}-${part('day')}`;
  const saved=workshop.getState().itinerary?.days.find(d=>d.id===workshop.getState().itinerary.active)?.kosa_plan;
  if(saved?.version===1)for(const name of ['city','date','first_visit','second_visit','boarding'])if(typeof saved[name]==='string'||Number.isInteger(saved[name]))form.elements[name].value=saved[name];
  if(saved?.version===1 && Number.isInteger(saved.ready))form.elements.ready.value=clock(saved.ready);
  if(saved?.version===1 && ['one','two'].includes(saved.walks))form.elements.walks.value=saved.walks;
  const read=()=>({city:form.elements.city.value,date:form.elements.date.value,ready:Number(form.elements.ready.value.slice(0,2))*60+Number(form.elements.ready.value.slice(3)),
    walks:form.elements.walks.value,first_visit:Number(form.elements.first_visit.value),second_visit:Number(form.elements.second_visit.value),boarding:Number(form.elements.boarding.value)});
  const table=()=>tablePromise ||= fetch(new URL('data/kosa-bus-210.json',base)).then(r=>{if(!r.ok)throw Error('Таблица пока не загрузилась.');return r.json();}).catch(e=>{tablePromise=null;throw e;});
  function action(text,fn,className){const b=el('button',text,className);b.type='button';b.addEventListener('click',fn);return b;}
  function link(text,path,className){const a=el('a',text,className);a.href=new URL(path,base).href;return a;}
  function row(list,time,title,text){const item=el('li'),timeNode=el('time',clock(time)),copy=el('div');timeNode.dateTime=clock(time);copy.append(el('h4',title),el('p',text));item.append(timeNode,copy);list.append(item);}
  async function calculate({focus=false}={}) {
    if(!form.reportValidity())return;
    const ticket=++sequence,answers=read();result.hidden=true;
    status.textContent='Подбираем рейсы из опубликованной таблицы…';
    try {
      const [publication,engine]=await Promise.all([table(),loadScheduler(base)]);
      if(ticket!==sequence)return;
      const started=performance.now(),day=engine.transitDay(kosaInput(answers,publication));
      const elapsed=performance.now()-started;
      try{performance.mark('godune:kosa-plan-ready',{detail:{calculation_ms:elapsed,state:day.state}});}catch{}
      result.dataset.calculationMs=elapsed.toFixed(3);result.dataset.kosaState=day.state;result.dataset.kosaValidity=day.validity;
      result.replaceChildren();result.hidden=false;
      const title=el('h3',day.state==='candidate'?'Ваш день у дюн складывается':'Для этого дня нужен другой план');title.id='kosa-result-title';title.tabIndex=-1;result.append(title,el('p',cityNote[answers.city]));
      const warning=el('p',publication.note,'kosa-plan-warning');result.append(warning);
      if(day.state!=='candidate') {
        const reason=day.validity==='unpublished_calendar'?'Расписание на этот год ещё не подтверждено. Точные часы не подставляем из прежнего сезона. Ниже можно выбрать тропу и скачать её карту.':
          day.validity==='outside_publication'?'Эта дата не входит в период опубликованной таблицы. Проверьте транспорт отдельно; карты троп доступны ниже.':
          day.state==='no_outward'?'После выбранного времени в таблице нет автобуса к Эфе. Попробуйте более раннюю пересадку или другой день.':
          'После выбранной прогулки в таблице не находится обратный рейс с вашим запасом. Попробуйте приехать раньше, сократить осмотр или выбрать только дюны.';
        result.append(el('p',reason));const actions=el('div',undefined,'kosa-result-actions');
        if(day.validity==='needs_date_check')actions.append(action('Попробовать раньше',()=>{form.elements.ready.value='09:00';calculate();}));
        if(answers.walks==='two' && day.validity==='needs_date_check')actions.append(action('Оставить только дюны',()=>{form.elements.walks.value='one';calculate();}));
        actions.append(link('Проверить расписание',publication.source_url));result.append(actions);status.textContent='Тропы и карты доступны ниже. Время возвращения пока не подобрано.';
      } else {
        const summary=el('div',undefined,'kosa-result-summary');
        for(const [label,value]of [['От автобуса до возвращения',duration(day.finish-day.outward.departure)],['Обратно в Зеленоградске',clock(day.finish)],['Отдельных прогулок',answers.walks==='two'?'Две':'Одна']]){const box=el('div');box.append(el('small',label),el('strong',value));summary.append(box);}result.append(summary);
        const list=el('ol',undefined,'kosa-plan-timeline');
        row(list,day.outward.departure,'Из Зеленоградска — к Эфе',`Автобус № 210. У остановки к ${clock(day.outward.departure-answers.boarding)}. Прибытие к тропе по таблице — ${clock(day.outward.arrival)}.`);
        row(list,day.outward.arrival,'Дюны и высокий горизонт',`${answers.first_visit} мин на подход, настил, смотровые и возвращение к автобусу. Это ваш запас; темп, погоду и доступ проверьте на месте.`);
        if(day.transfer){row(list,day.transfer.departure,'От Эфы — к Танцующему лесу',`Переезд на автобусе № 210. По таблице — у леса в ${clock(day.transfer.via)}. Между тропами пешком этот план не ведёт.`);row(list,day.transfer.via,'Сосны и короткая тропа',`${answers.second_visit} мин вместе с возвращением к остановке. Если первый автобус задержался, второй осмотр можно пропустить.`);}
        row(list,day.board_by,'Пора к обратной остановке',`По таблице автобус в ${clock(answers.walks==='two'?day.inward.via:day.inward.departure)}. Запас ${answers.boarding} мин до посадки. Свободные места неизвестны — это нужно проверить заранее.`);
        row(list,day.finish,'Снова в Зеленоградске','Электричка или автобус до вашего жилья — отдельная часть дня. Оставьте запас до последнего подходящего рейса.');
        result.append(list);
        if(day.backup)result.append(el('p',`Следующий обратный рейс в таблице — ${clock(answers.walks==='two'?day.backup.via:day.backup.departure)}, в Зеленоградске — ${clock(day.backup.arrival)}. Это ещё один вариант для проверки, а не гарантия посадки.`,'kosa-plan-warning'));
        const efa=catalog.poi.find(p=>p.slug==='vysota-efa');
        const light=engine.light({version:1,date:answers.date,stops:[{id:'efa',lat:efa.lat,lon:efa.lon,begins:day.outward.arrival,leaves:day.transfer?day.transfer.departure:day.inward.departure,outdoor:true}]});
        const sun=light.stops[0];if(sun?.sun?.sunset!==null && sun?.sun?.sunset!==undefined)result.append(el('p',`Закат у Эфы по астрономическому расчёту — ${clock(sun.sun.sunset)}. ${['dark','twilight'].includes(sun.state)?'Часть осмотра или ожидания приходится на сумерки. Выберите более ранний день или меньше времени на тропе.':'Расчёт света не подтверждает погоду или освещение настилов.'}`));
        const actions=el('div',undefined,'kosa-result-actions'),saveStatus=el('p','План с автобусами сохранится в записи дня. Пешие прогулки останутся раздельными.','kosa-save-status');saveStatus.setAttribute('role','status');
        const save=action('Сохранить день и прогулки',async()=>{
          save.disabled=true;saveStatus.textContent='Сохраняем поездку в этом браузере…';
          try{const outcome=await workshop.setState(current=>addKosaDay(current,answers,day,publication,catalog),'День на Куршской косе сохранён.');
            if(outcome.conflict){saveStatus.textContent='Поездка уже изменилась. Попробуйте сохранить ещё раз.';save.disabled=false;return;}
            saveStatus.textContent=outcome.saved?'День сохранён в этом браузере. Карты и PDF скачайте отдельно ниже.':'Браузер не разрешил запись. План остался в этой вкладке — скачайте файл поездки.';
            save.textContent=outcome.saved?'День сохранён ✓':'План в этой вкладке';
          }catch{saveStatus.textContent='Запись не завершилась. Ваш прежний план на месте; скачайте текст этого дня.';save.disabled=false;}
        },'kosa-save');
        actions.append(save,action('План дня — текстовый файл',()=>download(kosaNote(answers,day,publication),'godune-kosa-'+answers.date+'.txt','text/plain;charset=utf-8')),
          action('Файл поездки для другого устройства',()=>{const draft=addKosaDay(workshop.getState(),answers,day,publication,catalog);download(createTripFile(draft,catalog),'godune-kosa-'+answers.date+'.json','application/json');}),link('Открыть мою поездку','planner/#my-trip'));
        result.append(actions,saveStatus,link('Оригинал таблицы № 210','assets/transit/kosa-bus-210-2026-05.png','kosa-source-link'));status.textContent='Подобран план по опубликованной таблице. Перед поездкой подтвердите рейсы на свою дату.';
      }
      if(focus){title.focus({preventScroll:true});result.scrollIntoView({block:'start',behavior:'instant'});}
    }catch(error){if(ticket!==sequence)return;status.textContent='Расчёт пока не загрузился. Прежняя поездка на месте. Ниже доступны готовый пример, карты и PDF; можно повторить попытку.';result.hidden=true;}
  }
  form.addEventListener('submit',event=>{event.preventDefault();calculate({focus:true});});
  form.addEventListener('change',()=>{sequence++;result.hidden=true;status.textContent='Настройки изменились. Нажмите «Подобрать мой день», чтобы обновить рейсы.';});
  form.dataset.kosaReady='true';submit.disabled=false;status.textContent='Расчёт начнётся по кнопке. Дорогу до Зеленоградска выбирайте отдельно.';
}
