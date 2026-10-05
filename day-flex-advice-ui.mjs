import {flexAdvice,applyFlexAdvice,canFlexDay,flexOmissions} from './day-flex-advice.mjs?v=4';
import {clock} from './day-stop-view.mjs?v=1';

const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text)n.textContent=text;return n;};
const finish=result=>result.finish===null?`Не раньше ${clock(result.earliest_finish)}`:clock(result.finish);
const placesWord=count=>({one:'место',few:'места',many:'мест',other:'места'})[new Intl.PluralRules('ru').select(count)];
export function initFlexAdvice({mount,commit,feedback}) {
  let revision=0;
  function reset(){revision++;mount.hidden=true;mount.replaceChildren();mount.removeAttribute('aria-busy');}
  function render({trip,catalog,matrix,engine,result,stillCurrent}) {
    reset();if(!canFlexDay(trip))return;
    const ticket=revision,current=()=>ticket===revision && stillCurrent();
    mount.hidden=false;mount.dataset.flexAdvice='idle';
    const summary=el('summary','','Подстроить день'),note=el('p','',trip.schedule?.progress?'Если хочется сократить оставшуюся прогулку. Уже пройденные места и время начала останутся. Сравните варианты — день изменится только после вашего выбора.':'Если хочется выйти позже или гулять спокойнее. Сравните варианты — день изменится только после вашего выбора.');
    const form=el('form','day-flex-form'),label=el('label','','Что изменим'),select=el('select');select.name='flex';select.dataset.flexRequest='true';
    for(const [value,text]of [['later:15','Выйти на 15 минут позже'],['later:30','Выйти на 30 минут позже'],['later:60','Выйти на час позже'],['breathing_room:30','Оставить ещё полчаса'],['breathing_room:60','Оставить ещё час']]) {
      if(trip.schedule?.progress && value.startsWith('later:'))continue;
      const option=el('option','',text);option.value=value;select.append(option);
    }label.append(select);
    const search=el('button','save-item','Посмотреть варианты');search.type='submit';search.dataset.flexSearch='true';form.append(label,search);
    const status=el('p','day-advice-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const cards=el('div','day-advice-options');mount.append(summary,note,form,status,cards);
    let searchRevision=0;
    form.onsubmit=async event=>{
      event.preventDefault();const searchTicket=++searchRevision,isCurrent=()=>current() && searchTicket===searchRevision;
      const [kind,minutes]=select.value.split(':');search.disabled=true;cards.replaceChildren();mount.setAttribute('aria-busy','true');status.textContent='Проверяем дорогу, билеты и возвращение…';
      try {
        const advice=await flexAdvice(trip,catalog,matrix,engine,result,{kind,minutes:Number(minutes)},isCurrent);
        if(!isCurrent())return;
        mount.dataset.flexAdvice=advice.state;
        if(!advice.options.length){status.textContent=advice.state==='rail_unavailable'?'Сначала сверим электрички на выбранную дату. Откройте «Поездка на электричке» и выберите рейсы из доступного расписания.':advice.state==='light_unavailable'?'Свет прогулки пока не рассчитан. Вариант не предложен.':advice.state==='incomplete'?'Сначала уточните неизвестную дорогу. Тогда сможем сравнить время.':'Такой вариант пока не складывается. Билеты, обед, посещённые места и возвращение остались в расчёте. Можно изменить время вручную или перенести часть дня.';return;}
        status.textContent='Билеты, обед, паузы и возвращение учтены. Дорогу и доступ к местам перед выходом нужно сверить.';
        const name=id=>catalog.poi.find(p=>p.slug===id)?.name || id;
        for(const option of advice.options) {
          const moved=flexOmissions(option),key=moved.join(',') || 'whole';
          const card=el('article','day-advice-option');card.dataset.flexOption=key;card.dataset.flexMoved=String(moved.length);
          if(option.railChange)card.dataset.flexRail=option.railChange.after.id;
          const title=el('h4','',moved.length>1?`${moved.length} ${placesWord(moved.length)} — на другой раз`:moved.length?`«${name(moved[0])}» — на другой раз`:'Все остановки остаются');
          const movedList=el('ul','day-advice-moved');
          for(const id of moved) {const row=el('li','',name(id));row.dataset.flexMovedPlace=id;movedList.append(row);}
          const times=el('dl','day-advice-times');
          const rows=[];
          if(option.railChange)rows.push(['Электричка туда',`${clock(option.railChange.before.departure)} → ${clock(option.railChange.before.arrival)}`,`${clock(option.railChange.after.departure)} → ${clock(option.railChange.after.arrival)}`]);
          rows.push([trip.schedule?.progress?'Продолжение прогулки':option.result.rail?'Начало прогулки':'Выход',clock(option.result.rail?option.before.stops[0]?.arrival:option.previousStart),clock(option.result.rail?option.result.stops[0]?.arrival:option.displayStart)],['Окончание',finish(option.before),finish(option.result)],[option.result.rail?'Запас до обратного поезда':'Запас до конца дня',option.before.slack===null?'Пока неизвестно':`${option.before.slack} мин`,`${option.result.slack} мин`]);
          for(const [caption,before,after]of rows) {
            const row=el('div'),dd=el('dd');
            if(caption==='Электричка туда'){
              row.className='day-advice-rail-times';dd.append(el('span','',`Сейчас: ${before}`),el('strong','',`Вариант: ${after}`));
            }else dd.append(el('span','',before),el('span','day-advice-arrow','→'),el('strong','',after));
            row.append(el('dt','',caption),dd);times.append(row);
          }
          if(option.railChange){const row=el('div');row.append(el('dt','','Обратная электричка'),el('dd','',`${clock(option.railChange.inbound.departure)} → ${clock(option.railChange.inbound.arrival)} · без изменений`));times.append(row);}
          const order=el('details','day-advice-order'),caption=el('summary','','Как пойдёт день'),list=el('ol');
          for(const stop of option.result.stops)if(catalog.poi.some(p=>p.slug===stop.id))list.append(el('li','',`${clock(stop.begins)} · ${name(stop.id)}`));order.append(caption,list);
          const note=el('p','',moved.length?moved.length===1?'Место останется в подборке «Места, куда хочется». Расходы и записи билетов сохранятся.':'Эти места останутся в подборке «Места, куда хочется». Расходы и записи билетов сохранятся.':option.railChange?'Время прогулки пересчитано для другой электрички. Перед поездкой сверьте расписание и условия своего билета.':'Часы посещения и время в пути пересчитаны с новым выходом.');
          if(option.railChange){const source=el('p','day-advice-source',`Расписание проверено ${new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(option.railChange.source.checked_at+'T12:00:00Z'))}. `),link=el('a','','Открыть у перевозчика');link.href=option.railChange.source.url;link.target='_blank';link.rel='noopener noreferrer';source.append(link);order.append(source);}
          const apply=el('button','save-item','Выбрать этот вариант');apply.type='button';apply.dataset.flexApply=key;
          apply.onclick=async()=>{
            apply.disabled=true;let changed=false,error='';
            try {
              const saved=await commit(value=>{const proposed=applyFlexAdvice(value,option);changed=!proposed.error;error=proposed.error;return proposed.trip;},'');
              feedback.textContent=saved?.conflict || error || !changed?'День уже изменился. Проверьте свежий расчёт перед выбором.':saved?.saved?moved.length?moved.length===1?`Новый день сохранён. «${name(moved[0])}» оставили на другой раз; расходы и билеты сохранены.`:`Новый день сохранён. На другой раз оставили ${moved.length} ${placesWord(moved.length)} — они в подборке «Места, куда хочется». Расходы и билеты сохранены.`:option.railChange?'Новая электричка и день сохранены. Обратный рейс остался прежним.':'Поздний выход сохранён. Дорога и возвращение пересчитаны.':'Новый день показан в этой вкладке. Браузер не разрешил сохранение; скачайте файл поездки.';
            }catch {feedback.textContent='Сохранение не подтвердилось. Проверьте день и скачайте файл поездки.';}
            finally {if(apply.isConnected)apply.disabled=false;feedback.tabIndex=-1;feedback.focus({preventScroll:true});}
          };
          card.append(title);if(moved.length>1)card.append(movedList);card.append(times,order,note,apply);cards.append(card);
        }
      }catch {if(isCurrent()){mount.dataset.flexAdvice='error';status.textContent='Варианты пока не рассчитались. День на месте; попробуйте ещё раз.';}}
      finally {if(isCurrent()){search.disabled=false;mount.removeAttribute('aria-busy');}}
    };
    // A request edited while a search yields must not leave an old card visible.
    select.onchange=()=>{searchRevision++;search.disabled=false;cards.replaceChildren();status.textContent='';mount.removeAttribute('aria-busy');mount.dataset.flexAdvice='idle';};
  }
  return {reset,render};
}
