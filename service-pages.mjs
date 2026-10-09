import {loadScheduler} from './trip-scheduler.mjs?v=42';
import {formatKopecks} from './trip-money.mjs';
import {rentalFactsElement} from './trip-rental-view.mjs';
import {bindServiceContext,showSpatialDistance,spatialMarkers} from './service-context.mjs?v=15';
import {bindServiceComparison} from './service-comparison.mjs?v=3';
import {bindServiceFavorites} from './service-favorites.mjs?v=1';

const labels={age:'Возраст',group:'Ваша компания',audience:'Вход для гостей',equipment:'Что взять',booking:'Запись'};
const statuses={pass:'Подходит',fail:'Условие не выполнено',conflict:'Источники расходятся',stale:'Нужны свежие сведения',unknown:'Уточните перед посещением'};
const states={fits:'По времени и условиям подходит',does_not_fit:'Нужно изменить план',needs_info:'Есть что уточнить'};
function conditionText(c) {
  const range=(a,b,unit)=>a===null&&b===null?'Без ограничений':a!==null&&b!==null?`От ${a} до ${b} ${unit}`:a!==null?`От ${a} ${unit}`:`До ${b} ${unit}`;
  if(c.kind==='age')return range(c.minimum,c.maximum,'лет');
  if(c.kind==='group')return range(c.minimum,c.maximum,'человек');
  if(c.kind==='audience')return c.allowed.map(v=>({guest:'Гости',resident:'Проживающие',member:'Владельцы абонемента'})[v]).join(', ');
  if(c.kind==='equipment')return c.required.length?c.required.map(v=>v.label).join(', '):'Ничего дополнительно не требуется';
  return !c.required?'Без предварительной записи':c.notice_minutes===null?'Нужна запись':`Запись минимум за ${c.notice_minutes} мин`;
}
const planTexts={time:['Посещение не укладывается в выбранные часы.','Для проверки времени не хватает сведений.'],approach:['Путь до входа недоступен.','Время от остановки до входа нужно уточнить.'],return:['Путь обратно недоступен.','Время возвращения к остановке нужно уточнить.'],cost:['Расходы превышают ваш бюджет.','Полная стоимость пока неизвестна.'],upfront:['При входе потребуется больше выбранной суммы.','Сумму при входе нужно уточнить.']};
const money=value=>value===null?'Нужно уточнить':formatKopecks(value);
const clock=value=>value===null?'Пока неизвестно':`${String(Math.floor(value/60)%24).padStart(2,'0')}:${String(value%60).padStart(2,'0')}${value>=1440?' следующего дня':''}`;
const integer=(value,name)=>{if(!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value))||Number(value)>4294967295)throw Error(`Проверьте поле «${name}».`);return Number(value);};
const minutes=(value,name)=>{if(!/^\d{2}:\d{2}$/.test(value))throw Error(`Укажите время в поле «${name}».`);const [h,m]=value.split(':').map(Number);if(h>23||m>59)throw Error(`Проверьте поле «${name}».`);return h*60+m;};
const amount=(value,name)=>{if(value==='')return null;if(!/^\d+(?:[.,]\d{1,2})?$/.test(value))throw Error(`Укажите сумму в поле «${name}».`);const [whole,frac='']=value.replace(',','.').split('.');const n=BigInt(whole)*100n+BigInt(frac.padEnd(2,'0'));if(n>9007199254740991n)throw Error(`Проверьте сумму в поле «${name}».`);return Number(n);};

import {selectedInput} from './service-selection-state.mjs';
export {selectedInput} from './service-selection-state.mjs';

function apply(card,result,input) {
  const rental=card.querySelector('[data-rental-facts]');
  if(rental){const facts=rentalFactsElement({selection:input},result);rental.replaceChildren(...(facts?[facts]:[]));}

  const put=(selector,value)=>{card.querySelector(selector).textContent=value;};
  card.dataset.state=result.state;put('[data-result-state]',states[result.state]);
  put('[data-total-time]',result.summary.total_minutes===null?'Время не полностью известно':`${result.summary.total_minutes} мин`);
  put('[data-cost]',money(result.summary.cost_total));put('[data-departure]',clock(result.summary.departure));put('[data-upfront]',money(result.summary.upfront_total));
  for(const stage of ['approach','activity','return_walk']){
    const value=result.visit.duration.segments.find(v=>v.stage===stage).minutes;
    put(`[data-stage="${stage}"]`,value===null?'Уточнить':`${value} мин`);
  }
  const rows=result.eligibility.checks.map(check=>{
    const row=document.createElement('li'),title=document.createElement('strong'),text=document.createElement('span');
    const facts=check.observations.filter(v=>v.status==='current').map(v=>`${conditionText(v.rule.condition)} · проверено ${v.rule.source.checked_at}`).join('; ');
    title.textContent=labels[check.kind];text.textContent=(statuses[check.status]||statuses.unknown)+(facts?'. '+facts:'');row.append(title,text);return row;
  });
  card.querySelector('[data-conditions]').replaceChildren(...rows);
  card.querySelector('[data-plan-checks]').replaceChildren(...result.checks.filter(v=>v.kind!=='conditions'&&v.status!=='pass').map(v=>{const li=document.createElement('li');li.textContent=planTexts[v.kind][v.status==='fail'?0:1];return li;}));
}

import {serviceSelectionParams,serviceDetailURL,serviceBackURL} from './service-navigation.mjs?v=1';

const urlPrefix='sr_';
const checkKinds=['time','approach','return','conditions','cost','upfront'];
export function selectionFromFields(fields,query,facets) {
  const selection=structuredClone(query.selection);
  selection.text=String(fields.get('q')||'');selection.sort=String(fields.get('sort')||'relevance');
  selection.strict_checks=fields.has('only_fits')?checkKinds:[];
  selection.facets=facets.flatMap(spec=>{
    const raw=String(fields.get(`facet_${spec.key}`)||'');
    if(raw==='')return [];
    if(spec.kind==='flag'){if(!['true','false'].includes(raw))throw Error('Проверьте условия.');return [{kind:'flag',key:spec.key,value:raw==='true'}];}
    if(spec.kind==='minimum')return [{kind:'minimum',key:spec.key,value:integer(raw,spec.label)}];
    return [{kind:'one_of',key:spec.key,values:[raw]}];
  });
  return selection;
}

if(typeof document!=='undefined') {
  const theme=document.querySelector('[data-toggle-theme]');
  theme?.addEventListener('click',()=>{const root=document.documentElement;root.dataset.theme=root.dataset.theme==='night'?'day':'night';theme.textContent=root.dataset.theme==='night'?'☀':'☾';window.dispatchEvent(new CustomEvent('godune:theme-change'));});
  const form=document.querySelector('[data-service-choice]'),data=document.querySelector('#service-page-data');
  if(form&&data){
    const page=JSON.parse(data.textContent),{inputs,facets}=page;
    const button=form.querySelector('[type=submit]'),status=form.querySelector('[data-form-status]');
    const controls=[...form.elements].filter(e=>e.name);
    const defaults=controls.map(e=>({element:e,value:e.value,checked:e.checked}));
    const detailLinks=[...document.querySelectorAll('[data-service-detail]')].map(link=>({link,path:link.getAttribute('href')}));
    const back=document.querySelector('[data-service-back]'),backPath=back?.getAttribute('href');
    function updateNavigation(){
      const selection=serviceSelectionParams(controls);
      for(const {link,path} of detailLinks)link.href=serviceDetailURL(path,location.href,selection);
      if(back)back.href=serviceBackURL(backPath,location.href,selection);
    }
    const cards=new Map([...document.querySelectorAll('[data-service]')].map(e=>[e.dataset.service,e]));
    let revision=0,restoreVersion=0,appliedRevision=0,currentResults=page.results,mapView=null,mapLoading=null;
    let currentMarkers=page.markers;
    const comparison=bindServiceComparison(page,cards,addVisit);
    const favorites=bindServiceFavorites(page,cards,new URL('./',import.meta.url));
    const context=bindServiceContext(form,page,()=>{revision++;comparison.dirty();status.textContent='Места изменились. Нажмите «Подобрать посещение».';});
    let currentInputs=new Map(inputs.map(input=>[input.service_id,input]));
    function mapList(results) {
      document.querySelector('[data-map-list]').replaceChildren(...results.map_ids.map(id=>{
        const marker=currentMarkers.find(v=>v.id===id),li=document.createElement('li'),a=document.createElement('a');
        a.href=`#service-${encodeURIComponent(id)}`;a.textContent=marker.name;li.append(a);
        if(!marker.point){const note=document.createElement('span');note.textContent=' · Положение нужно уточнить';li.append(note);}
        return li;
      }));
    }
    function showResults(results,assessments) {
      const ids=new Set(results.hits.map(v=>v.id));
      for(const [id,card] of cards)card.hidden=!ids.has(id);
      const parent=document.querySelector('.service-results');
      for(const hit of results.hits)parent.append(cards.get(hit.id));
      document.querySelector('[data-result-count]').textContent=String(results.total);
      document.querySelector('[data-filter-empty]').hidden=results.total>0||inputs.length===0;
      mapList(results);currentResults=results;mapView?.update(results.map_ids,currentMarkers);
      comparison.update(results,assessments,currentInputs);
      favorites?.update();
    }
    function saveURL() {
      const url=new URL(location.href);
      const list=page.parent?url.searchParams.get('sr_list'):null;
      for(const key of [...url.searchParams.keys()])if(key.startsWith(urlPrefix))url.searchParams.delete(key);
      for(const [key,value] of serviceSelectionParams(controls))url.searchParams.set(key,value);
      if(list!==null)url.searchParams.set('sr_list',list);
      history.replaceState(null,'',url);
      updateNavigation();
    }
    async function restoreURL() {
      const generation=++restoreVersion;
      const params=new URL(location.href).searchParams;
      if(params.has('sr_v')&&params.get('sr_v')!=='1')throw Error('Условия в ссылке имеют другую версию. Последний подбор остаётся ниже.');
      if(!params.has('sr_v')){for(const {element,value,checked} of defaults){element.value=value;element.checked=checked;}context.update();updateNavigation();return false;}
      const allowed=new Set(['sr_v',...(page.parent?['sr_list']:[]),...controls.map(e=>urlPrefix+e.name)]);
      if([...params.keys()].some(k=>k.startsWith(urlPrefix)&&!allowed.has(k)))throw Error('В ссылке есть незнакомое условие. Последний подбор остаётся ниже.');
      await context.prepare(params);
      if(generation!==restoreVersion)return false;
      for(const {element,value,checked} of defaults){element.value=value;element.checked=checked;}
      for(const e of controls){const key=urlPrefix+e.name;
        if(e.type==='checkbox'){if(params.has(key)&&params.get(key)!=='1')throw Error('Проверьте условия в ссылке.');e.checked=params.get(key)==='1';}
        else if(params.has(key)){e.value=params.get(key);if(e.value!==params.get(key))throw Error('Проверьте условия в ссылке.');}
      }
      if(form.elements.namedItem('scope_kind')?.value==='all'&&form.elements.namedItem('sort').value==='distance')throw Error('Укажите место или прогулку для поиска по близости.');
      context.update();
      updateNavigation();
      return true;
    }
    async function calculate(save=true) {
      const generation=++revision;
      if(!inputs.length){status.textContent='Пока нет мест для подбора. Готовые прогулки можно выбрать ниже.';return false;}
      const restoreButtonFocus=document.activeElement===button;
      button.disabled=true;status.textContent='Считаем время, стоимость и возвращение…';
      try{
        const fields=new FormData(form),get=name=>String(fields.get(name)||'');
        await context.refresh(fields);
        if(generation!==revision)return false;
        const original=inputs[0].visit.input;
        const values={units:form.elements.namedItem('units')?integer(get('units'),'Велосипеды'):undefined,date:get('date'),people:integer(get('people'),'Сколько вас'),duration_minutes:integer(get('duration_minutes'),'На занятие'),
          arrival:fields.has('arrival')?minutes(get('arrival'),form.elements.namedItem('arrival')?.labels?.[0]?.textContent.trim()||'Начало дня'):original.arrival,
          finish_by:fields.has('finish_by')?minutes(get('finish_by'),'Вернуться не позже')+(fields.has('finish_next_day')?1440:0):original.finish_by,
          cost_limit:amount(get('cost_limit'),'Бюджет на всех'),upfront_limit:amount(get('upfront_limit'),'При входе'),
          paid_minutes:get('paid_minutes')?integer(get('paid_minutes'),'По тарифу'):null};
        const selection=selectionFromFields(fields,page.query,facets);
        const scheduler=await loadScheduler(new URL('./',import.meta.url));
        const chosenInputs=inputs.map(input=>selectedInput(input,values));
        const assessments=chosenInputs.map(input=>scheduler.serviceAssessment(input));
        const query=structuredClone(page.query);query.selection=selection;
        const spatial=context.request(fields);
        query.spatial=spatial;
        for(let n=0;n<assessments.length;n++){
          const result=assessments[n],doc=query.documents.find(v=>v.id===result.service_id);
          doc.cost_total=result.summary.cost_total;doc.total_minutes=result.summary.total_minutes;
          doc.checks=Object.fromEntries(result.checks.map(v=>[v.kind,v.status]));
        }
        const results=scheduler.serviceQuery(query);
        if(generation!==revision)return false;
        const nearby=results.spatial;
        currentMarkers=spatialMarkers(page.markers,nearby);showSpatialDistance(cards,nearby);
        assessments.forEach((result,i)=>apply(cards.get(result.service_id),result,chosenInputs[i]));
        currentInputs=new Map(chosenInputs.map(input=>[input.service_id,input]));appliedRevision=generation;
        for(const card of cards.values()){const add=card.querySelector('[data-add-service]');if(add){delete add.dataset.visitSaved;add.textContent='Добавить в день +';}}
        showResults(results,assessments);if(save)saveURL();
        status.textContent='Пересчитано. Время и условия — в карточках ниже.';
        return true;
      }catch(error){
        if(generation===revision)status.textContent=/^(Проверьте|Укажите)/.test(error.message)?error.message:'Не получилось пересчитать. Последний расчёт остаётся ниже. Попробуйте ещё раз.';
      }finally{
        button.disabled=false;
        if(restoreButtonFocus&&document.activeElement===document.body)button.focus({preventScroll:true});
      }
      return false;
    }
    async function addVisit(id,add){
        const card=cards.get(id),metadata=page.choices?.find(choice=>choice.identity.service_id===id);
        if(!card||!metadata)return;
        if(add.disabled)return;
        if(add.dataset.visitSaved){location.assign(new URL('planner/#my-trip',new URL('./',import.meta.url)));return;}
        add.disabled=true;
        try{
          if((context.usesSaved(new FormData(form))||appliedRevision!==revision)&&!await calculate())return;
          if(card.hidden)return;
          const selection=structuredClone(currentInputs.get(id)),generation=revision;
          const {pickServiceVisit}=await import('./trip-service-visits-ui.mjs?v=20');
          if(generation!==revision){status.textContent='Условия изменились. Добавьте посещение ещё раз.';return;}
          await pickServiceVisit(metadata,selection,new URL('./',import.meta.url),add);
        }catch(error){status.textContent=/[А-Яа-яЁё]/.test(error.message)?error.message:'Не получилось открыть поездку. Попробуйте ещё раз.';}
        finally{add.disabled=false;}
    }
    for(const [id,card] of cards){
      const add=card.querySelector('[data-add-service]'),metadata=page.choices?.find(choice=>choice.identity.service_id===id);
      if(!add||!metadata)continue;
      add.hidden=false;
      add.addEventListener('click',()=>addVisit(id,add));
    }
    form.addEventListener('input',()=>{revision++;restoreVersion++;comparison.dirty();updateNavigation();status.textContent='Нажмите кнопку ниже, чтобы пересчитать посещение.';});
    form.addEventListener('submit',event=>{event.preventDefault();restoreVersion++;calculate();});
    document.querySelectorAll('[data-clear-filters]').forEach(reset=>reset.addEventListener('click',()=>{
      for(const e of controls){if(e.name==='q'||e.name.startsWith('facet_'))e.value='';if(e.name==='sort')e.value='relevance';if(e.name==='only_fits')e.checked=false;}
      calculate();
    }));
    const panel=document.querySelector('#service-map-panel');
    async function openMap(){
      if(!panel.open||mapView||mapLoading)return;
      const mapStatus=document.querySelector('[data-map-status]'),retry=document.querySelector('[data-map-retry]');
      const canvas=document.querySelector('[data-service-map]');canvas.hidden=false;
      retry.hidden=true;mapStatus.textContent='Загружаем карту…';
      mapLoading=(async()=>{try{
        const {createServiceMap}=await import('./service-map.mjs');
        mapView=await createServiceMap(document.querySelector('[data-service-map]'),currentMarkers,new URL('./',import.meta.url),mapStatus);
        mapView.update(currentResults.map_ids,currentMarkers);
      }catch{canvas.hidden=true;mapStatus.textContent='Карта не загрузилась. Все места доступны в списке.';retry.hidden=false;}finally{mapLoading=null;}})();
      await mapLoading;
    }
    panel.addEventListener('toggle',()=>{if(panel.open){openMap();mapView?.resize();}});
    document.querySelector('[data-map-retry]').addEventListener('click',openMap);
    document.querySelector('a[href="#service-map-panel"]').addEventListener('click',()=>{panel.open=true;});
    showResults(page.results);
    window.addEventListener('popstate',async()=>{revision++;try{await restoreURL();calculate(false);}catch(error){status.textContent=error.message;}});
    (async()=>{try{if(await restoreURL())calculate(false);}catch(error){status.textContent=error.message;}})();
  }
}
