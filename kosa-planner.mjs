import {loadScheduler} from './trip-scheduler.mjs?v=15';
import {kosaInput,kosaNote,kosaClock as clock,addKosaDay} from './kosa-plan-state.mjs?v=1';
import {createTripFile} from './trip-file.mjs?v=16';
import {kosaRoadbook} from './kosa-roadbook.mjs?v=1';
const el=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
const duration=n=>`${Math.floor(n/60)?`${Math.floor(n/60)} ч `:''}${n%60?`${n%60} мин`:''}`.trim();
const cityNote={zelenogradsk:'План начинается у автобуса № 210 в Зеленоградске. Дорогу от жилья до остановки добавьте отдельно.',
  kaliningrad:'До Зеленоградска — электричка с Северного или Южного вокзала. Поезд и путь от жилья выбирайте отдельно: они пока не входят в расчёт.',
  svetlogorsk:'Сначала доберитесь до Зеленоградска. Подходящий рейс и путь от жилья ещё нужно уточнить; в расчёте ниже — автобус от Зеленоградска.'};
const download=(body,name,type)=>{const a=el('a');a.href=URL.createObjectURL(new Blob([body],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
export async function initKosaPlanner({workshop,catalog,base}) {
  const form=document.querySelector('#kosa-form'),result=document.querySelector('#kosa-result'),status=document.querySelector('#kosa-status');
  if(!form || !result)return;
  const submit=form.querySelector('[type=submit]');let sequence=0,tablePromise,exportAbort;
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
    exportAbort?.abort();
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
        const roadbook=kosaRoadbook(answers,day,publication);
        const summary=el('div',undefined,'kosa-result-summary');
        for(const [label,value]of [['От автобуса до возвращения',duration(day.finish-day.outward.departure)],['Обратно в Зеленоградске',clock(day.finish)],['Отдельных прогулок',answers.walks==='two'?'Две':'Одна']]){const box=el('div');box.append(el('small',label),el('strong',value));summary.append(box);}result.append(summary);
        const list=el('ol',undefined,'kosa-plan-timeline');
        for(const item of roadbook.timeline)row(list,item.time,item.title,item.text);
        result.append(list);
        result.append(el('p',roadbook.fallback,'kosa-plan-warning'));
        const efa=catalog.poi.find(p=>p.slug==='vysota-efa');
        const light=engine.light({version:1,date:answers.date,stops:[{id:'efa',lat:efa.lat,lon:efa.lon,begins:day.outward.arrival,leaves:day.transfer?day.transfer.departure:day.inward.departure,outdoor:true}]});
        const sun=light.stops[0];if(sun?.sun?.sunset!==null && sun?.sun?.sunset!==undefined)result.append(el('p',`Закат у Эфы по астрономическому расчёту — ${clock(sun.sun.sunset)}. ${['dark','twilight'].includes(sun.state)?'Часть осмотра или ожидания приходится на сумерки. Выберите более ранний день или меньше времени на тропе.':'Расчёт света не подтверждает погоду или освещение настилов.'}`));
        const actions=el('div',undefined,'kosa-result-actions'),saveStatus=el('p','План с автобусами сохранится в записи дня. Пешие прогулки останутся раздельными.','kosa-save-status');saveStatus.setAttribute('role','status');
        const guide=el('section',undefined,'kosa-personal-guide');guide.setAttribute('aria-labelledby','kosa-pdf-title');
        const guideTitle=el('h4','Этот день - с собой');guideTitle.id='kosa-pdf-title';
        const guideCopy=el('p','Один PDF: ваш план, возвращение и карты выбранных троп. Сохраните его в телефоне, чтобы открыть без связи.');
        const formatLabel=el('label','Формат путеводителя'),format=el('select');format.id='kosa-pdf-format';formatLabel.htmlFor=format.id;
        for(const [value,text]of [['phone','Для телефона'],['print','Для печати - A4']]){const option=el('option',text);option.value=value;format.append(option);}
        const pdfStatus=el('p','Файл собирается по кнопке. Ваш план остаётся в браузере.','kosa-pdf-status');pdfStatus.setAttribute('role','status');
        const pdfCancel=action('Отменить сборку',()=>exportAbort?.abort());pdfCancel.hidden=true;
        const pdf=action('Скачать мой день - PDF',async()=>{
          const abort=new AbortController();exportAbort=abort;pdf.disabled=true;pdfCancel.hidden=false;format.disabled=true;
          pdfStatus.textContent='Загружаем карты для вашего дня…';
          try{
            const {makeKosaPdf}=await import('./kosa-pdf.mjs?v=1');abort.signal.throwIfAborted();
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
  form.addEventListener('change',()=>{exportAbort?.abort();sequence++;result.hidden=true;status.textContent='Настройки изменились. Нажмите «Подобрать мой день», чтобы обновить рейсы.';});
  form.dataset.kosaReady='true';submit.disabled=false;status.textContent='Расчёт начнётся по кнопке. Дорогу до Зеленоградска выбирайте отдельно.';
}
