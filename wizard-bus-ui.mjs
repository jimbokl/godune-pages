import {wizardBusTargets,wizardBusChoice} from './wizard-bus.mjs?v=1';
import {transitTable} from './transport-day.mjs?v=3';

// Timetables and WASM are loaded only when a traveller asks for this journey.
export function initWizardBus({mount,catalog,base,getAnswers,chooseDate}) {
  let pending=null,loaded=null,failed=false;
  const node=(tag,text)=>{const value=document.createElement(tag);if(text!==undefined)value.textContent=text;return value;};
  async function context(){
    if(!pending)pending=(async()=>{
      const json=async path=>{const response=await fetch(new URL(path,base));if(!response.ok)throw Error('wizard_bus_unavailable');return response.json();};
      const [table,maps,{loadScheduler}]=await Promise.all([json('data/kosa-bus-210.json'),json('data/kosa-interchanges.json').catch(()=>null),import('./trip-scheduler.mjs?v=22')]);
      const calculate=await loadScheduler(base);loaded={table,maps,calculate};return loaded;
    })().catch(error=>{pending=null;failed=true;throw error;});
    return pending;
  }
  function render(){
    const answers=getAnswers();mount.replaceChildren();mount.hidden=answers.transport!=='bus';if(mount.hidden)return;
    const targets=wizardBusTargets(catalog,answers);
    answers.bus_days=targets.map(target=>wizardBusChoice(answers,target));
    if(!targets.length){mount.append(node('p','Автобусный день пока собран для дюн Эфа и Танцующего леса. Выберите Куршскую косу или поездку, в которой есть эти тропы.'));return;}
    if(!answers.date){const button=node('button','Выбрать дату →');button.type='button';button.className='wizard-secondary';button.addEventListener('click',chooseDate);mount.append(button);}
    if(answers.area==='whole-trip')mount.append(node('p','Автобус учтём в день на дюнах. В остальных днях оставим транспорт из готового плана; он подписан отдельно.'));
    for(const target of targets){
      const plan=answers.bus_days.find(row=>row.day_index===target.index).plan,card=node('fieldset');card.dataset.wizardBusDay=target.index;
      card.append(node('legend',`${answers.area==='whole-trip'?`День ${target.index+1} · `:''}${target.walks==='two'?'Эфа и Танцующий лес':'Дюны Эфа'} · ${target.date||'выберите дату'}`));
      const fields=node('div');fields.className='wizard-fields';card.append(fields);
      const label=node('label','Откуда поедем'),select=node('select');select.dataset.wizardBusField='origin';
      for(const [value,text]of [['zelenogradsk','Зеленоградск · автобус № 210'],['kaliningrad-north-zelenogradsk','Калининград · Северный вокзал'],['kaliningrad-south-zelenogradsk','Калининград · Южный вокзал']]){const option=node('option',text);option.value=value;select.append(option);}
      select.value=plan.city==='kaliningrad'?plan.station:'zelenogradsk';
      select.addEventListener('change',event=>{event.stopPropagation();plan.city=select.value==='zelenogradsk'?'zelenogradsk':'kaliningrad';plan.station=plan.city==='kaliningrad'?select.value:null;render();});label.append(select);fields.append(label);
      function minutes(caption,key,value,required=false){
        const label=node('label',caption),input=node('input');input.type='number';input.min='0';input.max='1440';input.step='1';input.inputMode='numeric';input.required=required;input.value=value??'';input.placeholder='Пока не знаю';input.dataset.wizardBusField=key;
        input.addEventListener('input',event=>{event.stopPropagation();const value=input.value===''?null:Number(input.value);if(key==='approach'||key==='return_minutes'){plan.home[key]=value;if(plan.city==='kaliningrad')plan[key==='approach'?'to_station':'from_station']=value;}else plan[key]=value;});label.append(input);fields.append(label);
      }
      if(answers.base){minutes(plan.city==='kaliningrad'?'От жилья до вокзала, мин':'От жилья до автобуса, мин','approach',plan.home.approach);minutes('После возвращения до жилья, мин','return_minutes',plan.home.return_minutes);}
      if(plan.city==='kaliningrad'){minutes('От поезда до автобуса в Зеленоградске, мин','to_bus',plan.to_bus,true);minutes('От автобуса до обратного поезда, мин','to_train',plan.to_train,true);}
      minutes('Прийти до автобуса за, мин','boarding',plan.boarding,true);
      card.append(node('p',answers.base?'Если дорогу от жилья или обратно пока не знаете, оставьте поле пустым. Покажем подходящие рейсы, а полное возвращение отметим как требующее уточнения.':`Начнём и закончим ${plan.city==='kaliningrad'?'у выбранного вокзала Калининграда':'у автобусной остановки в Зеленоградске'}. Дорога от жилья в этот расчёт не входит.`));
      if(loaded){const selected=transitTable(loaded.table,target.date),publication=selected.publication;
        card.append(node('p',selected.reason==='unpublished_year'?'Расписание на этот год ещё не добавлено. Выберите дату, для которой есть таблица.':selected.reason?'Таблица не действует на выбранную дату. Уточните расписание или выберите другую дату.':'Подберём рейсы по таблице. Перед поездкой нужно подтвердить движение и посадку: свободные места неизвестны.'));
        const source=node('p'),link=node('a','Источник расписания № 210');link.href=publication.source_url;link.target='_blank';link.rel='noopener';source.append(link,` · проверено ${publication.checked_at}.`);card.append(source);
      }else card.append(node('p',failed?'Не удалось загрузить расписание. Повторите просмотр дня — Ваши ответы здесь.':'Загружаем таблицу рейсов…'));
      mount.append(card);
    }
    if(!loaded&&!pending&&!failed)context().then(()=>{if(getAnswers().transport==='bus')render();}).catch(()=>{if(getAnswers().transport==='bus')render();});
  }
  return {render,context};
}
