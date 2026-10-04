import {transitTable} from './transport-day.mjs?v=1';
import {loadScheduler} from './trip-scheduler.mjs?v=19';
import {kosaInput,kosaNote,isGeneratedKosaNote,kosaClock as clock,addKosaDay} from './kosa-plan-state.mjs?v=11';
import {createTripFile} from './trip-file.mjs?v=18';
import {kosaRoadbook} from './kosa-roadbook.mjs?v=10';
import {assessKosa} from './day-readiness.mjs?v=4';
const el=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
const duration=n=>`${Math.floor(n/60)?`${Math.floor(n/60)} ч `:''}${n%60?`${n%60} мин`:''}`.trim();
const cityNote={zelenogradsk:'План начинается у автобуса № 210 в Зеленоградске. Дорогу от жилья до остановки добавьте отдельно.',
  kaliningrad:'В этом плане связаны электричка, автобус и дорога обратно. Подходы к вокзалу и запас на пересадку — ваши оценки; рейсы на дату поездки ещё нужно подтвердить.',
  svetlogorsk:'Сначала доберитесь до Зеленоградска. Подходящий рейс и путь от жилья ещё нужно уточнить; в расчёте ниже — автобус от Зеленоградска.'};
const download=(body,name,type)=>{const a=el('a');a.href=URL.createObjectURL(new Blob([body],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
export async function initKosaPlanner({workshop,catalog,base}) {
  const form=document.querySelector('#kosa-form'),result=document.querySelector('#kosa-result'),status=document.querySelector('#kosa-status');
  if(!form || !result)return;
  const submit=form.querySelector('[type=submit]');let sequence=0,tablePromise,mapPromise,exportAbort,recalculateTimer,lastParams,attempt,editingDay=null;
  const begin=()=>{attempt ||= workshop.progress?.begin('kosa');};
  window.addEventListener('godune:memory-cleared',()=>{attempt=null;editingDay=null;});
  const homeFields=form.querySelector('#kosa-home-fields');
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kaliningrad',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const part=type=>today.find(p=>p.type===type).value;
  form.elements.date.value=`${part('year')}-${part('month')}-${part('day')}`;
  const initial=workshop.getState(),savedDay=initial.itinerary?.days.find(d=>d.id===initial.itinerary.active),saved=savedDay?.kosa_plan;
  if(saved?.version===1)for(const name of ['city','date','first_visit','second_visit','boarding','station','to_station','from_station','to_bus','to_train','rail_boarding'])if(typeof saved[name]==='string'||Number.isInteger(saved[name]))form.elements[name].value=saved[name];
  if(saved?.version===1)form.elements.origin.value=saved.origin==='station'?'station':'home';
  if(saved?.version===1 && Number.isInteger(saved.ready))form.elements.ready.value=clock(saved.ready);
  if(saved?.version===1 && ['one','two'].includes(saved.walks))form.elements.walks.value=saved.walks;
  if(saved?.version===1 && ['slow','gentle','brisk'].includes(saved.pace))form.elements.pace.value=saved.pace;
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
    walks:form.elements.walks.value,pace:form.elements.pace.value,first_visit:Number(form.elements.first_visit.value),second_visit:Number(form.elements.second_visit.value),boarding:Number(form.elements.boarding.value),...(form.elements.city.value==='kaliningrad'?{station:form.elements.station.value,origin:form.elements.origin.value,to_station:form.elements.origin.value==='station'?0:number('to_station'),from_station:form.elements.origin.value==='station'?0:number('from_station'),to_bus:number('to_bus'),to_train:number('to_train'),rail_boarding:number('rail_boarding')}:{})});
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
      const [rawPublication,engine,interchanges]=await Promise.all([table(),loadScheduler(base),maps()]);
      if(ticket!==sequence)return;
      const started=performance.now(),calendar=transitTable(rawPublication,answers.date),publication=calendar.publication,input=kosaInput(answers,rawPublication,catalog),day=engine.transitDay(input);
      const alternatives=day.state==='candidate'?[]:engine.transitAdvice(input);
      const elapsed=performance.now()-started;
      try{performance.mark('godune:kosa-plan-ready',{detail:{calculation_ms:elapsed,state:day.state}});}catch{}
      result.dataset.calendarException=String(calendar.exception);result.dataset.calendarSource=publication.source_url;result.dataset.calendarCheckedAt=publication.checked_at;result.dataset.calculationMs=elapsed.toFixed(3);result.dataset.kosaState=day.state;result.dataset.kosaValidity=day.validity;
      result.replaceChildren();result.hidden=false;result.classList.remove('kosa-updating');result.setAttribute('aria-busy','false');result.dataset.kosaDate=answers.date;result.dataset.kosaReadyAt=answers.ready;result.dataset.kosaWalks=answers.walks;result.dataset.kosaOrigin=answers.origin||'bus';result.dataset.kosaCity=answers.city;result.dataset.kosaStation=answers.station||'';
      const title=el('h3',day.state==='candidate'?'Ваш день у дюн складывается':'Для этого дня нужен другой план');title.id='kosa-result-title';title.tabIndex=-1;result.append(title,el('p',answers.city==='kaliningrad'&&answers.origin==='station'?'Начало и возвращение — у выбранного вокзала. Дорога от жилья в этот план не входит.':cityNote[answers.city]));
      const warning=el('p',calendar.exception?`На ${answers.date.split('-').reverse().join('.')} опубликовано отдельное изменение. Сверено ${publication.checked_at.split('-').reverse().join('.')}. Перед выездом подтвердите рейсы.`:'Часы — из опубликованной таблицы. Перед выездом подтвердите рейсы на свою дату.','kosa-plan-warning');result.append(warning);
      if(day.state!=='candidate') {
        const reason=day.validity==='unpublished_timetable'?'Расписание в одну из сторон на эту дату пока не опубликовано. Время возвращения станет известно после уточнения; прежние рейсы не подставляем. Карты троп доступны ниже.':day.validity==='unpublished_calendar'?'Расписание на этот год ещё не подтверждено. Точные часы не подставляем из прежнего сезона. Ниже можно выбрать тропу и скачать её карту.':
          day.validity==='outside_publication'?'Эта дата не входит в период опубликованной таблицы. Проверьте транспорт отдельно; карты троп доступны ниже.':
          day.state==='unknown_approach'?'Укажите время от жилья до вокзала и обратно. Неизвестную дорогу не заменяем нулём.':
          day.state==='no_outward_train'?'После выбранного времени не находится электричка к Зеленоградску. Попробуйте начать день раньше.':
          day.state==='no_return_train'?'Автобус возвращается в Зеленоградск, но после него нет подходящей электрички до вашего вокзала. Начните раньше или сократите прогулку.':
          day.state==='no_outward'?'После выбранного времени в таблице нет автобуса к Эфе. Попробуйте более раннюю пересадку или другой день.':
          'После выбранной прогулки в таблице не находится обратный рейс с вашим запасом. Попробуйте приехать раньше, сократить осмотр или выбрать только дюны.';
        result.append(el('p',reason,'kosa-plan-warning'));const actions=el('div',undefined,'kosa-result-actions');
        if(day.state==='unknown_approach')actions.append(action('Указать дорогу до вокзала',()=>{homeFields.hidden=false;form.elements.to_station.focus();}));
        if(alternatives.length){
          const proposals=el('div',undefined,'kosa-alternatives');
          proposals.append(el('h4','Вот что можно изменить'),el('p','Варианты рассчитаны по той же таблице. Время на дюны и дорогу остаётся вашим. Выберите подходящий — поездка сама не изменится.'));
          for(const option of alternatives){
            const proposed={...answers,ready:option.ready_at,walks:option.second_visit===null?'one':'two'},preview=kosaRoadbook(proposed,option.day,rawPublication,catalog,interchanges);
            const card=el('div',undefined,'kosa-alternative');card.dataset.kosaAlternative=option.kind;card.dataset.readyAt=option.ready_at;card.dataset.finish=preview.finish;
            const earlier=option.ready_at<answers.ready,dunesOnly=option.kind==='dunes_only';
            card.append(el('h4',dunesOnly?'Только дюны Эфы':answers.walks==='two'?'Начать раньше, сохранить обе прогулки':'Начать раньше, сохранить прогулку'));
            const startLabel=option.day.rail?(answers.origin==='station'?'Начало у вокзала':'Выход из дома'):'У автобуса в Зеленоградске';
            const finishLabel=option.day.rail?(answers.origin==='station'?'Снова у вокзала':'К жилью, по вашей оценке'):'Снова в Зеленоградске';
            const times=el('dl');for(const [label,value]of [[startLabel,clock(option.day.rail?.home_start??option.ready_at)],[finishLabel,clock(preview.finish)]])times.append(el('dt',label),el('dd',value));card.append(times);
            card.append(el('p',`Автобус к Эфе в ${clock(option.day.outward.departure)}.${dunesOnly?' Танцующий лес в этот вариант не входит.':''}${earlier?` Начало вместо ${clock(answers.ready)} — в ${clock(option.ready_at)}.`:' Начало остаётся прежним.'}`));
            const short=preview.walking.checks.filter(check=>check.trail&&check.state==='too_short');
            if(short.length)card.append(el('p','Рейсы складываются, но на полную тропу пока не хватает выбранного времени. После выбора увеличьте время на прогулку.','kosa-plan-warning'));
            card.append(el('p',preview.light.rows[0].text,preview.light.rows[0].warning?'kosa-plan-warning':undefined));
            card.append(action(dunesOnly?(earlier?`Только дюны, начать в ${clock(option.ready_at)}`:'Выбрать только дюны'):`Начать в ${clock(option.ready_at)}`,()=>{if(ticket!==sequence)return;form.elements.ready.value=clock(option.ready_at);form.elements.walks.value=proposed.walks;calculate({focus:true});}));
            proposals.append(card);
          }
          result.append(proposals);
        } else if(day.validity==='needs_date_check'&&day.state!=='unknown_approach')result.append(el('p','Подходящий вариант с вашим временем на прогулки не найден. Измените время осмотра или проверьте другой способ возвращения.'));
        actions.append(link('Проверить расписание',publication.source_url));result.append(actions);status.textContent='Тропы и карты доступны ниже. Время возвращения пока не подобрано.';
      } else {
        const roadbook=kosaRoadbook(answers,day,rawPublication,catalog,interchanges);
        if(!editingDay&&savedDay&&isGeneratedKosaNote(savedDay.note,answers,day,rawPublication,catalog,roadbook.interchanges)
          &&Object.entries(answers).every(([key,value])=>saved?.[key]===value))editingDay=structuredClone(savedDay);
        if(roadbook.walking.checks.some(check=>check.trail&&check.state==='too_short'))title.textContent='Для прогулки нужно больше времени';
        if(roadbook.light.state==='outside_daylight')title.textContent='Для прогулки нужно больше дневного света';
        const summary=el('div',undefined,'kosa-result-summary');
        for(const [label,value]of [[day.rail?(answers.origin==='station'?'От вокзала и обратно':'От жилья и обратно'):'От автобуса до возвращения',duration(roadbook.duration)],[day.rail?(answers.origin==='station'?'Обратно у вокзала':'У жилья, по вашей оценке'):'Обратно в Зеленоградске',clock(roadbook.finish)],['Отдельных прогулок',answers.walks==='two'?'Две':'Одна']]){const box=el('div');box.append(el('small',label),el('strong',value));summary.append(box);}result.append(summary);
        const list=el('ol',undefined,'kosa-plan-timeline');
        for(const item of roadbook.timeline){
          const copy=row(list,item.time,item.title,item.text,previous);
          if(item.boarding){
            const leg=item.boarding,card=el('div',undefined,'kosa-boarding');
            card.dataset.boarding=leg.id;
            card.append(el('strong',`№ ${leg.route} · в сторону ${leg.direction_label||leg.direction}`));
            const stops=el('dl');
            for(const [label,value]of [['Сесть',leg.from],['Выйти',leg.to]])stops.append(el('dt',label),el('dd',value));
            card.append(stops,el('p',`Спросите водителя: «${leg.question}»`),el('small',leg.note));
            copy.append(card);
          }else if(Object.hasOwn(item,'boarding'))copy.append(el('p','Названия остановок пока не загружены. Уточните их до поездки.','kosa-plan-warning'));
          if(item.walking_check){
            copy.classList.add('kosa-walking-alert');
            const field=item.walking_check.field;
            copy.append(action(['first_visit','second_visit'].includes(field)?'Изменить время прогулки':'Изменить время перехода',()=>{
              const input=form.elements[field];
              for(let parent=input.parentElement;parent&&parent!==form;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
              input.focus({preventScroll:true});input.scrollIntoView({block:'center',behavior:'instant'});input.select();
            },'kosa-walking-fix'));
            if(item.walking_check.state==='too_short'&&Number.isInteger(item.walking_check.recommended_minutes)){
              const minutes=item.walking_check.recommended_minutes;
              copy.append(action(`Оставить ${minutes} мин на прогулку`,()=>{
                const input=form.elements[field];input.value=String(minutes);
                input.dispatchEvent(new Event('input',{bubbles:true}));
              },'kosa-walking-fix'));
            }
          }
          if(item.trail_budget){const source=link('Длина тропы по данным парка',item.trail_budget.source_url);const note=el('small',`Сверено ${item.trail_budget.checked_at.split('-').reverse().join('.')}. `);note.append(source);copy.append(note);}
          const map=roadbook.interchanges?.walks.find(m=>m.id===item.map_id);
          if(map){const details=el('details',undefined,'kosa-step-map');details.append(el('summary',`Переход на карте · около ${Math.round(map.distance_m/10)*10} м`));
            const image=el('img');image.src=new URL(map.images.webp.path,base).href;image.width=900;image.height=620;image.loading='lazy';image.alt=map.title+': линия пути и два ориентира';
            const legend=el('ol');for(const id of [map.from,map.to])legend.append(el('li',roadbook.interchanges.anchors[id].name));
            details.append(image,legend,el('p',map.note),el('small',`${Number.isInteger(map.estimated_minutes)&&map.estimated_minutes>0?`Около ${map.estimated_minutes} мин пешком по карте. `:''}По OpenStreetMap, 1 октября 2026. Сторону посадки № 210 и последние метры уточните на месте.`));copy.append(details);
          }
        }
        result.append(list);
        result.append(el('p',roadbook.fallback,'kosa-plan-warning'));
        const light=el('section',undefined,'kosa-light');light.dataset.kosaLight=roadbook.light.state;
        light.append(el('h4','Свет на тропах и у остановки'));
        for(const row of roadbook.light.rows)light.append(el('p',row.text,row.warning?'kosa-plan-warning':undefined));result.append(light);
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
            const {makeKosaPdf}=await import('./kosa-pdf.mjs?v=10');abort.signal.throwIfAborted();
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
          try{const outcome=await workshop.setState(current=>addKosaDay(current,answers,day,publication,catalog,roadbook.interchanges,editingDay),'День на Куршской косе сохранён.');
            if(outcome.conflict){saveStatus.textContent='Поездка уже изменилась. Попробуйте сохранить ещё раз.';save.disabled=false;return;}
            if(outcome.saved){const state=workshop.getState();editingDay=structuredClone(state.itinerary?.days.find(d=>d.id===state.itinerary.active));}
            workshop.progress?.saved(attempt,assessKosa(day,answers,roadbook.walking),outcome.saved);
            saveStatus.textContent=outcome.saved?(roadbook.walking.status==='too_short'?'День сохранён в этом браузере. Перед поездкой увеличьте время отмеченных переходов и прогулок.':roadbook.walking.status!=='within_estimate'?'День сохранён в этом браузере. Время переходов ещё нужно уточнить.':'День сохранён в этом браузере. Карты и PDF скачайте отдельно ниже.'):'Браузер не разрешил запись. План остался в этой вкладке — скачайте файл поездки.';
            save.textContent=outcome.saved?'День сохранён ✓':'План в этой вкладке';
          }catch{saveStatus.textContent='Запись не завершилась. Ваш прежний план на месте; скачайте текст этого дня.';save.disabled=false;}
        },'kosa-save');
        const more=el('details',undefined,'kosa-more-actions');more.append(el('summary','Перенести поездку или сохранить текст'));const extra=el('div',undefined,'kosa-result-actions');
        extra.append(action('План дня — текстовый файл',()=>download(kosaNote(answers,day,publication,catalog,roadbook.interchanges),'godune-kosa-'+answers.date+'.txt','text/plain;charset=utf-8')),
          action('Файл поездки для другого устройства',()=>{const draft=addKosaDay(workshop.getState(),answers,day,publication,catalog,roadbook.interchanges,editingDay);download(createTripFile(draft,catalog),'godune-kosa-'+answers.date+'.json','application/json');}),link('Открыть мою поездку','planner/#my-trip'));more.append(extra);actions.append(save);
        const sources=el('details',undefined,'kosa-plan-sources');sources.append(el('summary','Расписание и условия расчёта'),el('p',publication.note));
        if(day.rail)sources.append(link('Источник расписания электричек',roadbook.rail.publication.url,'kosa-source-link'));
        sources.append(link('Оригинал таблицы № 210','assets/transit/kosa-bus-210-2026-05.png','kosa-source-link'));result.append(actions,saveStatus,more,sources);status.textContent=roadbook.walking.status==='too_short'?'План рассчитан, но на отмеченные переходы или прогулки оставлено слишком мало времени. Измените время в плане ниже.':'Подобран план по опубликованной таблице. Перед поездкой подтвердите рейсы на свою дату.';
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
