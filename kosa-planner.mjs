import {loadScheduler} from './trip-scheduler.mjs?v=16';
import {kosaInput,kosaNote,kosaClock as clock,addKosaDay} from './kosa-plan-state.mjs?v=6';
import {createTripFile} from './trip-file.mjs?v=17';
import {kosaRoadbook} from './kosa-roadbook.mjs?v=6';
import {assessKosa} from './day-readiness.mjs?v=2';
const el=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
const duration=n=>`${Math.floor(n/60)?`${Math.floor(n/60)} ч `:''}${n%60?`${n%60} мин`:''}`.trim();
const cityNote={zelenogradsk:'План начинается у автобуса № 210 в Зеленоградске. Дорогу от жилья до остановки добавьте отдельно.',
  kaliningrad:'В этом плане связаны электричка, автобус и дорога обратно. Подходы к вокзалу и запас на пересадку — ваши оценки; рейсы на дату поездки ещё нужно подтвердить.',
  svetlogorsk:'Сначала доберитесь до Зеленоградска. Подходящий рейс и путь от жилья ещё нужно уточнить; в расчёте ниже — автобус от Зеленоградска.'};
const download=(body,name,type)=>{const a=el('a');a.href=URL.createObjectURL(new Blob([body],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
export async function initKosaPlanner({workshop,catalog,base}) {
  const form=document.querySelector('#kosa-form'),result=document.querySelector('#kosa-result'),status=document.querySelector('#kosa-status');
  if(!form || !result)return;
  const submit=form.querySelector('[type=submit]');let sequence=0,tablePromise,mapPromise,exportAbort,recalculateTimer,lastParams,attempt;
  const begin=()=>{attempt ||= workshop.progress?.begin('kosa');};
  window.addEventListener('godune:memory-cleared',()=>{attempt=null;});
  const homeFields=form.querySelector('#kosa-home-fields');
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kaliningrad',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const part=type=>today.find(p=>p.type===type).value;
  form.elements.date.value=`${part('year')}-${part('month')}-${part('day')}`;
  const saved=workshop.getState().itinerary?.days.find(d=>d.id===workshop.getState().itinerary.active)?.kosa_plan;
  if(saved?.version===1)for(const name of ['city','date','first_visit','second_visit','boarding','station','to_station','from_station','to_bus','to_train','rail_boarding'])if(typeof saved[name]==='string'||Number.isInteger(saved[name]))form.elements[name].value=saved[name];
  if(saved?.version===1)form.elements.origin.value=saved.origin==='station'?'station':'home';
  if(saved?.version===1 && Number.isInteger(saved.ready))form.elements.ready.value=clock(saved.ready);
  if(saved?.version===1 && ['one','two'].includes(saved.walks))form.elements.walks.value=saved.walks;
  const railFields=form.querySelector('#kosa-rail-fields');
  function cityFields(){
    const rail=form.elements.city.value==='kaliningrad',home=rail&&form.elements.origin.value==='home';
    railFields.hidden=!rail;railFields.disabled=!rail;homeFields.hidden=!home;homeFields.disabled=!home;
    document.querySelector('#kosa-ready-label').textContent=rail?(home?'Выйду из жилья не раньше':'Буду у вокзала не раньше'):'Начну у автобуса не раньше';
    document.querySelector('#kosa-ready-help').textContent=rail?(home?'Подберём поезд с учётом вашей дороги до вокзала.':'Начало и возвращение — у выбранного вокзала. Дорогу от жилья можно добавить.'):
      form.elements.city.value==='svetlogorsk'?'До Зеленоградска нужно добраться отдельно. Ниже — день от его автостанции.':'План начинается у автостанции Зеленоградска.';
  }
  cityFields();
  const number=name=>form.elements[name].value===''?null:Number(form.elements[name].value);
  const read=()=>({city:form.elements.city.value,date:form.elements.date.value,ready:Number(form.elements.ready.value.slice(0,2))*60+Number(form.elements.ready.value.slice(3)),
    walks:form.elements.walks.value,first_visit:Number(form.elements.first_visit.value),second_visit:Number(form.elements.second_visit.value),boarding:Number(form.elements.boarding.value),...(form.elements.city.value==='kaliningrad'?{station:form.elements.station.value,origin:form.elements.origin.value,to_station:form.elements.origin.value==='station'?0:number('to_station'),from_station:form.elements.origin.value==='station'?0:number('from_station'),to_bus:number('to_bus'),to_train:number('to_train'),rail_boarding:number('rail_boarding')}:{})});
  const table=()=>tablePromise ||= fetch(new URL('data/kosa-bus-210.json',base)).then(r=>{if(!r.ok)throw Error('Таблица пока не загрузилась.');return r.json();}).catch(e=>{tablePromise=null;throw e;});
  const maps=()=>mapPromise ||= fetch(new URL('data/kosa-interchanges.json',base)).then(r=>{if(!r.ok)throw Error('maps');return r.json();}).catch(()=>{mapPromise=null;return null;});
  function action(text,fn,className){const b=el('button',text,className);b.type='button';b.addEventListener('click',fn);return b;}
  function link(text,path,className){const a=el('a',text,className);a.href=new URL(path,base).href;return a;}
  function row(list,time,title,text,previous){const item=el('li'),timeNode=el('time',clock(time)),copy=el('div');timeNode.dateTime=clock(time);copy.append(el('h4',title),el('p',text));if(previous.has(title)&&previous.get(title)!==clock(time))timeNode.classList.add('kosa-time-changed');item.append(timeNode,copy);list.append(item);return copy;}
  function invalidate(){exportAbort?.abort();sequence++;result.setAttribute('aria-busy','true');result.classList.add('kosa-updating');result.querySelectorAll('button,select').forEach(n=>n.disabled=true);}
  function schedule(){
    cityFields();const params=JSON.stringify(read());if(params===lastParams)return;lastParams=params;
    clearTimeout(recalculateTimer);invalidate();
    status.textContent='Обновляем день по вашему выбору.';
    recalculateTimer=setTimeout(()=>calculate(),120);
  }
  async function calculate({focus=false}={}) {
    clearTimeout(recalculateTimer);
    if(!form.checkValidity()){
      result.setAttribute('aria-busy','false');status.textContent='Дополните дату и время. Предыдущий план пока не обновлён.';
      form.classList.add('kosa-needs-input');return;
    }
    form.classList.remove('kosa-needs-input');
    exportAbort?.abort();
    const ticket=++sequence,answers=read();lastParams=JSON.stringify(answers);form.classList.remove('kosa-load-failed');
    const previous=new Map([...result.querySelectorAll('.kosa-plan-timeline li')].map(n=>[n.querySelector('h4')?.textContent,n.querySelector('time')?.textContent]));
    result.setAttribute('aria-busy','true');result.classList.add('kosa-updating');result.querySelectorAll('button,select').forEach(n=>n.disabled=true);
    status.textContent='Подбираем рейсы из опубликованной таблицы…';
    try {
      const [publication,engine,interchanges]=await Promise.all([table(),loadScheduler(base),maps()]);
      if(ticket!==sequence)return;
      const started=performance.now(),day=engine.transitDay(kosaInput(answers,publication,catalog));
      const elapsed=performance.now()-started;
      try{performance.mark('godune:kosa-plan-ready',{detail:{calculation_ms:elapsed,state:day.state}});}catch{}
      result.dataset.calculationMs=elapsed.toFixed(3);result.dataset.kosaState=day.state;result.dataset.kosaValidity=day.validity;
      result.replaceChildren();result.hidden=false;result.classList.remove('kosa-updating');result.setAttribute('aria-busy','false');result.dataset.kosaDate=answers.date;result.dataset.kosaReadyAt=answers.ready;result.dataset.kosaWalks=answers.walks;result.dataset.kosaOrigin=answers.origin||'bus';
      const title=el('h3',day.state==='candidate'?'Ваш день у дюн складывается':'Для этого дня нужен другой план');title.id='kosa-result-title';title.tabIndex=-1;result.append(title,el('p',answers.city==='kaliningrad'&&answers.origin==='station'?'Начало и возвращение — у выбранного вокзала. Дорога от жилья в этот план не входит.':cityNote[answers.city]));
      const warning=el('p','Часы — из опубликованной таблицы. Перед выездом подтвердите рейсы на свою дату.','kosa-plan-warning');result.append(warning);
      if(day.state!=='candidate') {
        const reason=day.validity==='unpublished_calendar'?'Расписание на этот год ещё не подтверждено. Точные часы не подставляем из прежнего сезона. Ниже можно выбрать тропу и скачать её карту.':
          day.validity==='outside_publication'?'Эта дата не входит в период опубликованной таблицы. Проверьте транспорт отдельно; карты троп доступны ниже.':
          day.state==='unknown_approach'?'Укажите время от жилья до вокзала и обратно. Неизвестную дорогу не заменяем нулём.':
          day.state==='no_outward_train'?'После выбранного времени не находится электричка к Зеленоградску. Попробуйте начать день раньше.':
          day.state==='no_return_train'?'Автобус возвращается в Зеленоградск, но после него нет подходящей электрички до вашего вокзала. Начните раньше или сократите прогулку.':
          day.state==='no_outward'?'После выбранного времени в таблице нет автобуса к Эфе. Попробуйте более раннюю пересадку или другой день.':
          'После выбранной прогулки в таблице не находится обратный рейс с вашим запасом. Попробуйте приехать раньше, сократить осмотр или выбрать только дюны.';
        result.append(el('p',reason,'kosa-plan-warning'));const actions=el('div',undefined,'kosa-result-actions');
        if(day.state==='unknown_approach')actions.append(action('Указать дорогу до вокзала',()=>{homeFields.hidden=false;form.elements.to_station.focus();}));
        else if(day.validity==='needs_date_check')actions.append(action('Попробовать раньше',()=>{form.elements.ready.value=answers.city==='kaliningrad'?'07:30':'09:00';calculate();}));
        if(answers.walks==='two' && day.validity==='needs_date_check')actions.append(action('Оставить только дюны',()=>{form.elements.walks.value='one';calculate();}));
        actions.append(link('Проверить расписание',publication.source_url));result.append(actions);status.textContent='Тропы и карты доступны ниже. Время возвращения пока не подобрано.';
      } else {
        const roadbook=kosaRoadbook(answers,day,publication,catalog,interchanges);
        const summary=el('div',undefined,'kosa-result-summary');
        for(const [label,value]of [[day.rail?(answers.origin==='station'?'От вокзала и обратно':'От жилья и обратно'):'От автобуса до возвращения',duration(roadbook.duration)],[day.rail?(answers.origin==='station'?'Обратно у вокзала':'У жилья, по вашей оценке'):'Обратно в Зеленоградске',clock(roadbook.finish)],['Отдельных прогулок',answers.walks==='two'?'Две':'Одна']]){const box=el('div');box.append(el('small',label),el('strong',value));summary.append(box);}result.append(summary);
        const list=el('ol',undefined,'kosa-plan-timeline');
        for(const item of roadbook.timeline){
          const copy=row(list,item.time,item.title,item.text,previous);
          if(item.walking_check){
            copy.classList.add('kosa-walking-alert');
            const field=item.walking_check.field;
            copy.append(action(['first_visit','second_visit'].includes(field)?'Изменить время прогулки':'Изменить время перехода',()=>{
              const input=form.elements[field];
              for(let parent=input.parentElement;parent&&parent!==form;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
              input.focus({preventScroll:true});input.scrollIntoView({block:'center',behavior:'instant'});input.select();
            },'kosa-walking-fix'));
          }
          const map=roadbook.interchanges?.walks.find(m=>m.id===item.map_id);
          if(map){const details=el('details',undefined,'kosa-step-map');details.append(el('summary',`Переход на карте · около ${Math.round(map.distance_m/10)*10} м`));
            const image=el('img');image.src=new URL(map.images.webp.path,base).href;image.width=900;image.height=620;image.loading='lazy';image.alt=map.title+': линия пути и два ориентира';
            const legend=el('ol');for(const id of [map.from,map.to])legend.append(el('li',roadbook.interchanges.anchors[id].name));
            details.append(image,legend,el('p',map.note),el('small',`${Number.isInteger(map.estimated_minutes)&&map.estimated_minutes>0?`Около ${map.estimated_minutes} мин пешком по карте. `:''}По OpenStreetMap, 1 октября 2026. Сторону посадки № 210 и последние метры уточните на месте.`));copy.append(details);
          }
        }
        result.append(list);
        result.append(el('p',roadbook.fallback,'kosa-plan-warning'));
        const efa=catalog.poi.find(p=>p.slug==='vysota-efa');
        const light=engine.light({version:1,date:answers.date,stops:[{id:'efa',lat:efa.lat,lon:efa.lon,begins:day.outward.arrival,leaves:day.transfer?day.transfer.departure:day.inward.departure,outdoor:true}]});
        const sun=light.stops[0];if(sun?.sun?.sunset!==null && sun?.sun?.sunset!==undefined)result.append(el('p',`Закат у Эфы по астрономическому расчёту — ${clock(sun.sun.sunset)}. ${['dark','twilight'].includes(sun.state)?'Часть осмотра или ожидания приходится на сумерки. Выберите более ранний день или меньше времени на тропе.':'Расчёт света не подтверждает погоду или освещение настилов.'}`));
        const actions=el('div',undefined,'kosa-result-actions'),saveStatus=el('p','План с автобусами сохранится в записи дня. Пешие прогулки останутся раздельными.','kosa-save-status');saveStatus.setAttribute('role','status');
        const guide=el('section',undefined,'kosa-personal-guide');guide.setAttribute('aria-labelledby','kosa-pdf-title');
        const guideTitle=el('h4','Этот день - с собой');guideTitle.id='kosa-pdf-title';
        const guideCopy=el('p',roadbook.interchanges?'Один PDF: ваш день, возвращение, карты переходов и троп. Сохраните его в телефоне, чтобы открыть без связи.':'Один PDF: ваш день, возвращение и карты троп. Карты переходов сейчас не загрузились.');
        const formatLabel=el('label','Формат путеводителя'),format=el('select');format.id='kosa-pdf-format';formatLabel.htmlFor=format.id;
        for(const [value,text]of [['phone','Для телефона'],['print','Для печати - A4']]){const option=el('option',text);option.value=value;format.append(option);}
        const pdfStatus=el('p','Файл собирается по кнопке. Ваш план остаётся в браузере.','kosa-pdf-status');pdfStatus.setAttribute('role','status');
        const pdfCancel=action('Отменить сборку',()=>exportAbort?.abort());pdfCancel.hidden=true;
        const pdf=action('Скачать мой день - PDF',async()=>{
          begin();
          const abort=new AbortController();exportAbort=abort;pdf.disabled=true;pdfCancel.hidden=false;format.disabled=true;
          pdfStatus.textContent='Загружаем карты для вашего дня…';
          try{
            const {makeKosaPdf}=await import('./kosa-pdf.mjs?v=6');abort.signal.throwIfAborted();
            const output=await makeKosaPdf({snapshot:structuredClone(roadbook),base,format:format.value,signal:abort.signal,onProgress:text=>{if(!abort.signal.aborted)pdfStatus.textContent=text;}});
            abort.signal.throwIfAborted();if(ticket!==sequence)return;
            download(output.bytes,`godune-kosa-${answers.date}-${output.format}.pdf`,'application/pdf');
            pdfStatus.textContent=`PDF готов: ${output.pages} страниц. Сохраните его в «Файлы» и проверьте без интернета.`;
            try{performance.mark('godune:kosa-pdf-ready',{detail:{pages:output.pages,bytes:output.bytes.length}});}catch{}
          }catch(error){if(ticket===sequence)pdfStatus.textContent=abort.signal.aborted?'Сборка отменена. План дня на месте.':`${error.message} План дня на месте; можно повторить попытку.`;}
          finally{pdf.disabled=false;pdfCancel.hidden=true;format.disabled=false;if(exportAbort===abort)exportAbort=null;}
        },'kosa-pdf-download');
        const pdfControls=el('div',undefined,'kosa-pdf-controls');pdfControls.append(formatLabel,format,pdf,pdfCancel);
        guide.append(guideTitle,guideCopy,pdfControls,pdfStatus);result.append(guide);
        const save=action('Сохранить день и прогулки',async()=>{
          begin();
          save.disabled=true;saveStatus.textContent='Сохраняем поездку в этом браузере…';
          try{const outcome=await workshop.setState(current=>addKosaDay(current,answers,day,publication,catalog,roadbook.interchanges),'День на Куршской косе сохранён.');
            if(outcome.conflict){saveStatus.textContent='Поездка уже изменилась. Попробуйте сохранить ещё раз.';save.disabled=false;return;}
            workshop.progress?.saved(attempt,assessKosa(day,answers,roadbook.walking),outcome.saved);
            saveStatus.textContent=outcome.saved?(roadbook.walking.status==='too_short'?'День сохранён в этом браузере. Перед поездкой увеличьте время отмеченных переходов.':roadbook.walking.status!=='within_estimate'?'День сохранён в этом браузере. Время переходов ещё нужно уточнить.':'День сохранён в этом браузере. Карты и PDF скачайте отдельно ниже.'):'Браузер не разрешил запись. План остался в этой вкладке — скачайте файл поездки.';
            save.textContent=outcome.saved?'День сохранён ✓':'План в этой вкладке';
          }catch{saveStatus.textContent='Запись не завершилась. Ваш прежний план на месте; скачайте текст этого дня.';save.disabled=false;}
        },'kosa-save');
        const more=el('details',undefined,'kosa-more-actions');more.append(el('summary','Перенести поездку или сохранить текст'));const extra=el('div',undefined,'kosa-result-actions');
        extra.append(action('План дня — текстовый файл',()=>download(kosaNote(answers,day,publication,catalog,roadbook.interchanges),'godune-kosa-'+answers.date+'.txt','text/plain;charset=utf-8')),
          action('Файл поездки для другого устройства',()=>{const draft=addKosaDay(workshop.getState(),answers,day,publication,catalog,roadbook.interchanges);download(createTripFile(draft,catalog),'godune-kosa-'+answers.date+'.json','application/json');}),link('Открыть мою поездку','planner/#my-trip'));more.append(extra);actions.append(save);
        const sources=el('details',undefined,'kosa-plan-sources');sources.append(el('summary','Расписание и условия расчёта'),el('p',publication.note));
        if(day.rail)sources.append(link('Источник расписания электричек',roadbook.rail.publication.url,'kosa-source-link'));
        sources.append(link('Оригинал таблицы № 210','assets/transit/kosa-bus-210-2026-05.png','kosa-source-link'));result.append(actions,saveStatus,more,sources);status.textContent=roadbook.walking.status==='too_short'?'План рассчитан, но на отмеченные переходы оставлено слишком мало времени. Измените время в плане ниже.':'Подобран план по опубликованной таблице. Перед поездкой подтвердите рейсы на свою дату.';
      }
      if(focus){title.focus({preventScroll:true});result.scrollIntoView({block:'start',behavior:'instant'});}
    }catch(error){if(ticket!==sequence)return;status.textContent='Расчёт пока не загрузился. Прежняя поездка на месте. Ниже доступны готовый пример, карты и PDF; можно повторить попытку.';result.setAttribute('aria-busy','false');result.classList.add('kosa-updating');form.classList.add('kosa-load-failed');}
  }
  form.addEventListener('submit',event=>{event.preventDefault();begin();if(form.reportValidity())calculate({focus:true});});
  form.addEventListener('input',()=>{begin();schedule();});
  form.addEventListener('change',event=>{
    begin();
    if(event.target.name==='station'){form.elements.to_station.value='';form.elements.from_station.value='';}
    schedule();
    form.dispatchEvent(new CustomEvent('TripParamsChanged',{bubbles:true,detail:{city:form.elements.city.value}}));
  });
  form.dataset.kosaReady='true';submit.disabled=false;
  await calculate();
}
