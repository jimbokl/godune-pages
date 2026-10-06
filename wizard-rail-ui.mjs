import {wizardRailTargets,wizardRailChoice,wizardRailActive} from './wizard-rail.mjs?v=6';
import {wizardAccessUI,wizardTravelDate} from './wizard-access-ui.mjs?v=1';
import {rideSnapshot} from './trip-rail-state.mjs?v=6';
import {stationRoadDraft,stationRoadKey} from './station-road.mjs?v=2';
import {applyStationRoad,forgetStationRoad,stationRoadOrigin} from './station-road-proof.mjs?v=1';
const messages={choose_date:'Выберите дату: по ней подберём поезда.',unpublished_year:'Расписание на этот год ещё не добавлено. Прежние рейсы сюда не переносим.',outside_validity:'Добавленная таблица не действует на эту дату.'};
export function initWizardRail({mount,catalog,base,getAnswers,chooseDate}) {
  const access=wizardAccessUI(),rides=new Map();
  const roads=stationRoadDraft({base,catalog,changed(){if(!wizardRailActive(catalog,getAnswers()))return;const active=document.activeElement,key=active?.dataset.wizardRailField,day=active?.closest('[data-wizard-rail-day]')?.dataset.wizardRailDay;render();if(key&&day!==undefined)mount.querySelector(`[data-wizard-rail-day="${day}"] [data-wizard-rail-field="${key}"]`)?.focus({preventScroll:true});}});
  const node=(tag,text)=>{const value=document.createElement(tag);if(text!==undefined)value.textContent=text;return value;};
  function render() {
    const answers=getAnswers();access.remember(mount);mount.replaceChildren();mount.hidden=!wizardRailActive(catalog,answers);if(mount.hidden)return;
    const targets=wizardRailTargets(catalog,answers),selections=targets.map(target=>wizardRailChoice(catalog,answers,target));
    answers.rail_days=selections.map(({target,rail})=>({day_index:target.index,rail}));
    if(!targets.length){mount.append(node('p','Для этой прогулки пока нет связанного железнодорожного направления. Выберите прогулку в Зеленоградске, Светлогорске или Балтийске.'));return;}
    if(!answers.date){const button=node('button','Выбрать дату →');button.type='button';button.className='wizard-secondary';button.addEventListener('click',chooseDate);mount.append(button);}
    if(answers.area==='whole-trip')mount.append(node('p','Поезда учтём в выбранные дни у моря. Дату и возвращение покажем отдельно для каждого дня.'));
    for(const {target,table,rail,available} of selections) {
      const card=node('fieldset');card.dataset.wizardRailDay=target.index;
      card.append(node('legend',`${answers.area==='whole-trip'?`День ${target.index+1} · `:''}${table.service.to} · ${wizardTravelDate(target.date)}`));
      const fields=node('div');fields.className='wizard-fields';card.append(fields);
      function select(caption,key,options,value) {
        const label=node('label',caption),input=node('select');label.className='wizard-rail-select';input.dataset.wizardRailField=key;
        for(const [id,text] of options){const option=node('option',text);option.value=id;input.append(option);}
        input.value=value || '';input.disabled=!options.length;
        input.addEventListener('change',event=>{event.stopPropagation();const current=getAnswers().rail_days.find(row=>row.day_index===target.index).rail;
          if(key==='service'){if(current.service!==input.value){current.service=input.value;current.access.to_station=null;current.access.from_station=null;delete current.access.road;}render();}
          else {current[key]=rideSnapshot(table[key].find(row=>row.id===input.value));const binding=stationRoadKey(target.index,getAnswers().base,current.service);if(!rides.has(binding))rides.set(binding,new Set());rides.get(binding).add(key);}
        });label.append(input);fields.append(label);
      }
      select('Откуда поедем','service',target.services.map(row=>[row.id,row.from]),rail.service);
      for(const [direction,title]of [['outward','К морю · отправление → прибытие'],['inbound','Обратно · отправление → прибытие']])select(title,direction,(table[direction] || []).map(row=>[row.id,`${row.departure} → ${row.arrival}`]),rail[direction]?.id);
      const current=()=>getAnswers().rail_days.find(row=>row.day_index===target.index).rail;
      const binding=stationRoadKey(target.index,answers.base,rail.service);
      roads.request({key:binding,location:answers.base,hub:rail.service,apply(road,blocked){
        const now=getAnswers(),draft=now.rail_days?.find(row=>row.day_index===target.index)?.rail;
        if(!draft||stationRoadKey(target.index,now.base,draft.service)!==binding)return false;
        const changes=applyStationRoad(draft.access,road,{to:'to_station',back:'from_station'},blocked);
        if(changes.includes('to')&&!rides.get(binding)?.has('outward'))draft.outward=null;
        if(changes.includes('back')&&!rides.get(binding)?.has('inbound'))draft.inbound=null;
        return changes.length>0;
      }});
      const roadFields=[['to_station','До вокзала Калининграда, мин'],['from_station','После поезда до жилья или конца дня, мин'],['boarding','Прийти до отправления за, мин']].map(([key,caption])=>({
        key,caption,value:key==='boarding'?rail.boarding:rail.access[key],disabled:!available,
        change(value){if(key==='boarding')current().boarding=value;else {const direction=key==='to_station'?'to':'back';roads.touch(binding,direction);forgetStationRoad(current().access,direction);current().access[key]=value;}}
      }));
      card.append(access.create({id:`rail-${target.index}`,kind:'rail',fields:roadFields,
        note:'Дорогу от жилья до транспортной точки и обратно оценим по карте. Здесь можно поправить минуты. Вход и платформу сверьте перед поездкой.',
        status:()=>roads.state(binding)==='loading'?'Считаем дорогу от жилья…':!available?'Сначала выберите дату с расписанием':current().access.to_station===null||current().access.from_station===null?'Дорога до вокзала и обратно требует уточнения':`${current().access.to_station} мин до вокзала ${stationRoadOrigin(current().access.road,'to')} · ${current().access.from_station} мин обратно ${stationRoadOrigin(current().access.road,'back')}`}));
      if(rail.access.road){const proof=node('p'),link=node('a',rail.access.road.anchor.name+' · OpenStreetMap');link.href=rail.access.road.anchor.url;link.target='_blank';link.rel='noopener';proof.dataset.stationRoadSource='true';proof.append(link,` · карта от ${rail.access.road.source.snapshot_at.slice(0,10)}. До транспортной точки; платформа и ожидание — отдельно.`);card.append(proof);}
      const noDayPair=available && table.outward.every(out=>table.inbound.every(back=>rideSnapshot(out).arrival>=rideSnapshot(back).departure));
      const note=node('p',noDayPair?'На эту дату поезд прибывает после отправления обратного. Для поездки одним днём выберите другую дату или транспорт.':available?'Пеший путь от станции к остановкам и обратно посчитаем по карте.':messages[table.reason] || (!table.outward?.length || !table.inbound?.length?'На эту дату двух рейсов в таблице нет. Выберите другое направление или дату.':'Расписание пока неизвестно.'));
      note.className='wizard-stop-note';card.append(note);
      if(table.service.note){const detail=node('details'),summary=node('summary','О рейсах на этом направлении');detail.append(summary,node('p',table.service.note));card.append(detail);}
      if(table.source){const source=node('p'),link=node('a',table.source.name);link.href=table.source.url;link.target='_blank';link.rel='noopener';source.append(link,` · проверено ${table.source.checked_at}. Билеты и платформу сверьте перед выходом.`);card.append(source);}
      mount.append(card);
    }
  }
  return {render,prepare:()=>roads.prepare()};
}
