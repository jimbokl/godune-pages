import {wizardBusTargets,wizardBusChoice,wizardBusActive} from './wizard-bus.mjs?v=6';
import {wizardAccessUI,wizardTravelDate} from './wizard-access-ui.mjs?v=1';
import {transitTable} from './transport-day.mjs?v=3';

import {stationRoadDraft,stationRoadKey} from './station-road.mjs?v=2';
import {applyStationRoad,forgetStationRoad,stationRoadOrigin} from './station-road-proof.mjs?v=1';

// Timetables and WASM are loaded only when a traveller asks for this journey.
export function initWizardBus({mount,catalog,base,getAnswers,chooseDate}) {
  let pending=null,loaded=null,failed=false;
  const access=wizardAccessUI();
  const roads=stationRoadDraft({base,catalog,changed(){if(!wizardBusActive(catalog,getAnswers()))return;const active=document.activeElement,key=active?.dataset.wizardBusField,day=active?.closest('[data-wizard-bus-day]')?.dataset.wizardBusDay;render();if(key&&day!==undefined)mount.querySelector(`[data-wizard-bus-day="${day}"] [data-wizard-bus-field="${key}"]`)?.focus({preventScroll:true});}});
  const node=(tag,text)=>{const value=document.createElement(tag);if(text!==undefined)value.textContent=text;return value;};
  async function context(){
    if(!pending)pending=(async()=>{
      const json=async path=>{const response=await fetch(new URL(path,base));if(!response.ok)throw Error('wizard_bus_unavailable');return response.json();};
      const [table,maps,{loadScheduler}]=await Promise.all([json('data/kosa-bus-210.json'),json('data/kosa-interchanges.json').catch(()=>null),import('./trip-scheduler.mjs?v=42')]);
      const calculate=await loadScheduler(base);loaded={table,maps,calculate};return loaded;
    })().catch(error=>{pending=null;failed=true;throw error;});
    return pending;
  }
  function render(){
    const answers=getAnswers();access.remember(mount);mount.replaceChildren();mount.hidden=!wizardBusActive(catalog,answers);if(mount.hidden)return;
    const targets=wizardBusTargets(catalog,answers);
    answers.bus_days=targets.map(target=>wizardBusChoice(answers,target));
    if(!targets.length){mount.append(node('p','Автобусный день пока собран для дюн Эфа и Танцующего леса. Выберите Куршскую косу или поездку, в которой есть эти тропы.'));return;}
    if(!answers.date){const button=node('button','Выбрать дату →');button.type='button';button.className='wizard-secondary';button.addEventListener('click',chooseDate);mount.append(button);}
    if(answers.area==='whole-trip')mount.append(node('p','Автобус учтём в день на дюнах. В остальных днях оставим транспорт из готового плана; он подписан отдельно.'));
    for(const target of targets){
      const plan=answers.bus_days.find(row=>row.day_index===target.index).plan,card=node('fieldset');card.dataset.wizardBusDay=target.index;
      card.append(node('legend',`${answers.area==='whole-trip'?`День ${target.index+1} · `:''}${target.walks==='two'?'Эфа и Танцующий лес':'Дюны Эфа'} · ${wizardTravelDate(target.date)}`));
      const fields=node('div');fields.className='wizard-fields';card.append(fields);
      const label=node('label','Откуда поедем'),select=node('select');select.dataset.wizardBusField='origin';
      for(const [value,text]of [['zelenogradsk','Зеленоградск · автобус № 210'],['kaliningrad-north-zelenogradsk','Калининград · Северный вокзал'],['kaliningrad-south-zelenogradsk','Калининград · Южный вокзал']]){const option=node('option',text);option.value=value;select.append(option);}
      select.value=plan.city==='kaliningrad'?plan.station:'zelenogradsk';
      select.addEventListener('change',event=>{event.stopPropagation();plan.city=select.value==='zelenogradsk'?'zelenogradsk':'kaliningrad';plan.station=plan.city==='kaliningrad'?select.value:null;render();});label.append(select);fields.append(label);
      const hub=plan.city==='kaliningrad'?plan.station:'zelenogradsk-bus',binding=stationRoadKey(target.index,answers.base,hub);
      roads.request({key:binding,location:answers.base,hub,apply(road,blocked){
        const now=getAnswers(),draft=now.bus_days?.find(row=>row.day_index===target.index)?.plan;
        if(!draft||stationRoadKey(target.index,now.base,draft.city==='kaliningrad'?draft.station:'zelenogradsk-bus')!==binding)return false;
        const access={...draft.home,road:draft.home_access.road},changes=applyStationRoad(access,road,{to:'approach',back:'return_minutes'},blocked);
        draft.home.approach=access.approach;draft.home.return_minutes=access.return_minutes;
        if(access.road)draft.home_access.road=access.road;else delete draft.home_access.road;
        if(draft.city==='kaliningrad'){draft.to_station=access.approach;draft.from_station=access.return_minutes;}
        return changes.length>0;
      }});
      const roadFields=[];
      function minutes(caption,key,value,required=false){
        roadFields.push({caption,key,value,required,change(value){
          if(key==='approach'||key==='return_minutes'){
            const direction=key==='approach'?'to':'back';roads.touch(binding,direction);forgetStationRoad(plan.home_access,direction);plan.home[key]=value;
            if(plan.city==='kaliningrad')plan[key==='approach'?'to_station':'from_station']=value;
          }else plan[key]=value;
        }});
      }
      if(answers.base){minutes(plan.city==='kaliningrad'?'От жилья до вокзала, мин':'От жилья до автобуса, мин','approach',plan.home.approach);minutes('После возвращения до жилья, мин','return_minutes',plan.home.return_minutes);}
      if(plan.city==='kaliningrad'){minutes('От поезда до автобуса в Зеленоградске, мин','to_bus',plan.to_bus,true);minutes('От автобуса до обратного поезда, мин','to_train',plan.to_train,true);}
      minutes('Прийти до автобуса за, мин','boarding',plan.boarding,true);
      card.append(access.create({id:`bus-${target.index}`,kind:'bus',fields:roadFields,
        note:answers.base?'Дорогу от жилья до транспортной точки и обратно оценим по карте. Здесь можно поправить минуты. Вход и посадку сверьте перед поездкой.':'Здесь можно изменить время на пересадку и запас перед посадкой.',
        status:()=>roads.state(binding)==='loading'?'Считаем дорогу от жилья…':answers.base&&(plan.home.approach===null||plan.home.return_minutes===null)?'Дорога к жилью требует уточнения':plan.boarding===null?'Укажите запас перед посадкой':answers.base?`${plan.home.approach} мин до посадки ${stationRoadOrigin(plan.home_access.road,'to')} · ${plan.home.return_minutes} мин обратно ${stationRoadOrigin(plan.home_access.road,'back')}`:`Перед автобусом — ${plan.boarding} мин`}));
      if(plan.home_access.road){const proof=node('p'),link=node('a',plan.home_access.road.anchor.name+' · OpenStreetMap');link.href=plan.home_access.road.anchor.url;link.target='_blank';link.rel='noopener';proof.dataset.stationRoadSource='true';proof.append(link,` · карта от ${plan.home_access.road.source.snapshot_at.slice(0,10)}. До транспортной точки; посадка и ожидание — отдельно.`);card.append(proof);}
      if(!answers.base)card.append(node('p',`День начинается и заканчивается ${plan.city==='kaliningrad'?'у выбранного вокзала Калининграда':'у автобусной остановки в Зеленоградске'}. Дорогу от жилья можно добавить ниже.`));
      if(loaded){const selected=transitTable(loaded.table,target.date),publication=selected.publication;
        card.append(node('p',selected.reason==='unpublished_year'?'Расписание на этот год ещё не добавлено. Выберите дату, для которой есть таблица.':selected.reason?'Таблица не действует на выбранную дату. Уточните расписание или выберите другую дату.':'Подберём рейсы по таблице. Перед поездкой нужно подтвердить движение и посадку: свободные места неизвестны.'));
        const source=node('p'),link=node('a','Источник расписания № 210');link.href=publication.source_url;link.target='_blank';link.rel='noopener';source.append(link,` · проверено ${publication.checked_at}.`);card.append(source);
      }else card.append(node('p',failed?'Не удалось загрузить расписание. Повторите просмотр дня — Ваши ответы здесь.':'Загружаем таблицу рейсов…'));
      mount.append(card);
    }
    if(!loaded&&!pending&&!failed)context().then(()=>{if(wizardBusActive(catalog,getAnswers()))render();}).catch(()=>{if(wizardBusActive(catalog,getAnswers()))render();});
  }
  return {render,context,prepare:()=>roads.prepare()};
}
