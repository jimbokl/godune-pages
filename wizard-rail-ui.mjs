import {wizardRailTargets,wizardRailChoice} from './wizard-rail.mjs?v=1';
import {rideSnapshot} from './trip-rail-state.mjs?v=6';
const messages={choose_date:'Выберите дату: по ней подберём электрички.',unpublished_year:'Расписание на этот год ещё не добавлено. Прежние рейсы сюда не переносим.',outside_validity:'Добавленная таблица не действует на эту дату.'};
export function initWizardRail({mount,catalog,getAnswers,chooseDate}) {
  const node=(tag,text)=>{const value=document.createElement(tag);if(text!==undefined)value.textContent=text;return value;};
  function render() {
    const answers=getAnswers();mount.replaceChildren();mount.hidden=answers.transport!=='rail';if(mount.hidden)return;
    const targets=wizardRailTargets(catalog,answers),selections=targets.map(target=>wizardRailChoice(catalog,answers,target));
    answers.rail_days=selections.map(({target,rail})=>({day_index:target.index,rail}));
    if(!targets.length){mount.append(node('p','Для этой прогулки пока нет связанного железнодорожного направления. Выберите прогулку в Зеленоградске или Светлогорске; дорогу на косу добавим отдельно.'));return;}
    if(!answers.date){const button=node('button','Выбрать дату →');button.type='button';button.className='wizard-secondary';button.addEventListener('click',chooseDate);mount.append(button);}
    if(answers.area==='whole-trip')mount.append(node('p','Электрички учтём в дни у моря. В остальных днях оставим транспорт из готового плана — он подписан у каждого дня.'));
    for(const {target,table,rail,available} of selections) {
      const card=node('fieldset');card.dataset.wizardRailDay=target.index;
      card.append(node('legend',`${answers.area==='whole-trip'?`День ${target.index+1} · `:''}${table.service.to} · ${target.date || 'дата не выбрана'}`));
      const fields=node('div');fields.className='wizard-fields';card.append(fields);
      function select(caption,key,options,value) {
        const label=node('label',caption),input=node('select');label.className='wizard-rail-select';input.dataset.wizardRailField=key;
        for(const [id,text] of options){const option=node('option',text);option.value=id;input.append(option);}
        input.value=value || '';input.disabled=!options.length;
        input.addEventListener('change',event=>{event.stopPropagation();const current=getAnswers().rail_days.find(row=>row.day_index===target.index).rail;
          if(key==='service'){current.service=input.value;current.access.to_station=null;current.access.from_station=null;render();}
          else current[key]=rideSnapshot(table[key].find(row=>row.id===input.value));
        });label.append(input);fields.append(label);
      }
      select('Откуда поедем','service',target.services.map(row=>[row.id,`${row.from} ↔ ${row.to}`]),rail.service);
      for(const [direction,title]of [['outward','К морю · отправление → прибытие'],['inbound','Обратно · отправление → прибытие']])select(title,direction,(table[direction] || []).map(row=>[row.id,`${row.departure} → ${row.arrival}`]),rail[direction]?.id);
      for(const [key,caption]of [['to_station','До вокзала Калининграда, мин'],['from_station','После поезда до жилья или конца дня, мин'],['boarding','Прийти до отправления за, мин']]) {
        const label=node('label',caption),input=node('input');input.type='number';input.min='0';input.max='1440';input.step='1';input.inputMode='numeric';input.dataset.wizardRailField=key;
        input.value=(key==='boarding'?rail.boarding:rail.access[key]) ?? '';input.placeholder='Пока не знаю';input.disabled=!available;
        input.addEventListener('input',event=>{event.stopPropagation();const current=getAnswers().rail_days.find(row=>row.day_index===target.index).rail,value=input.value===''?null:Number(input.value);if(key==='boarding')current.boarding=value;else current.access[key]=value;});label.append(input);fields.append(label);
      }
      const note=node('p',available?'Пеший путь от станции к остановкам и обратно посчитаем по карте. Если дорогу до вокзала или после поезда пока не знаете, оставьте поле пустым — полный день потребует уточнения.':messages[table.reason] || (!table.outward?.length || !table.inbound?.length?'На эту дату двух рейсов в таблице нет. Выберите другое направление или дату.':'Расписание пока неизвестно.'));
      note.className='wizard-stop-note';card.append(note);
      if(table.source){const source=node('p'),link=node('a',table.source.name);link.href=table.source.url;link.target='_blank';link.rel='noopener';source.append(link,` · проверено ${table.source.checked_at}. Билеты и платформу сверьте перед выходом.`);card.append(source);}
      mount.append(card);
    }
  }
  return {render};
}
