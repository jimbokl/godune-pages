import {dayFinish,dayEarliestFinish} from './rail-access.mjs?v=2';
import {flexAdvice,applyFlexAdvice,canFlexDay,flexOmissions,protectedFlexStops} from './day-flex-advice.mjs?v=14';
import {clock} from './day-stop-view.mjs?v=1';

const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text)n.textContent=text;return n;};
const finish=result=>dayFinish(result)===null?`Не раньше ${clock(dayEarliestFinish(result))}`:clock(dayFinish(result));
const placesWord=count=>({one:'место',few:'места',many:'мест',other:'места'})[new Intl.PluralRules('ru').select(count)];
export function initFlexAdvice({mount,commit,feedback}) {
  let revision=0;
  function reset(){revision++;mount.hidden=true;mount.replaceChildren();mount.removeAttribute('aria-busy');}
  function render({trip,catalog,matrix,engine,result,stillCurrent}) {
    reset();if(!canFlexDay(trip))return;
    const ticket=revision,current=()=>ticket===revision && stillCurrent();
    mount.hidden=false;mount.dataset.flexAdvice='idle';
    const summary=el('summary','','План Б'),note=el('p','',trip.schedule?.progress?'Пошёл дождь, устали или место закрыто. Сравните продолжение прогулки; уже пройденные места останутся.':'Пошёл дождь, устали или место закрыто. Сравните варианты и выберите, как продолжить день.');
    const form=el('form','day-flex-form'),label=el('label','','Что изменим'),select=el('select');select.name='flex';select.dataset.flexRequest='true';
    for(const [value,text]of [['later:15','Выйти на 15 минут позже'],['later:30','Выйти на 30 минут позже'],['later:60','Выйти на час позже'],['rain:0','Пошёл дождь — под крышу или короче'],['fatigue:0','Устали — меньше ходьбы'],['closed:0','Место закрыто — найти другой вариант'],['breathing_room:30','Оставить ещё полчаса'],['breathing_room:60','Оставить ещё час']]) {
      if(trip.schedule?.progress && value.startsWith('later:'))continue;
      const option=el('option','',text);option.value=value;select.append(option);
    }label.append(select);
    const closedLabel=el('label','','Какое место закрыто?'),closedSelect=el('select');closedSelect.name='closed-stop';closedSelect.dataset.flexClosedStop='true';
    for(const id of trip.places){const option=el('option','',catalog.poi.find(p=>p.slug===id)?.name||id);option.value=id;closedSelect.append(option);}
    closedSelect.value=trip.places.find(id=>!protectedFlexStops(trip,catalog).has(id))||trip.places[0];
    const knownClosed=result.stops.find(s=>s.issues.some(i=>['closed','kitchen_closed'].includes(i.code))&&trip.places.includes(s.id));
    if(knownClosed){select.value='closed:0';closedSelect.value=knownClosed.id;}
    closedLabel.append(closedSelect);closedLabel.hidden=select.value!=='closed:0';
    const search=el('button','save-item','Посмотреть варианты');search.type='submit';search.dataset.flexSearch='true';form.append(label,closedLabel,search);
    const status=el('p','day-advice-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const cards=el('div','day-advice-options');mount.append(summary,note,form,status,cards);
    let searchRevision=0;
    form.onsubmit=async event=>{
      event.preventDefault();const searchTicket=++searchRevision,isCurrent=()=>current() && searchTicket===searchRevision;
      const [kind,minutes]=select.value.split(':');search.disabled=true;cards.replaceChildren();mount.setAttribute('aria-busy','true');status.textContent='Проверяем дорогу, билеты и возвращение…';
      try {
        const advice=await flexAdvice(trip,catalog,matrix,engine,result,{kind,minutes:Number(minutes),...(kind==='closed'?{stop:closedSelect.value}:{})},isCurrent);
        if(!isCurrent())return;
        mount.dataset.flexAdvice=advice.state;
        if(!advice.options.length){status.textContent=advice.state==='protected_closed'?'Это место уже отмечено как посещённое, связано с билетом, обедом или дорогой. Измените соответствующую запись в дне, затем повторите подбор.':advice.state==='invalid_closed_stop'?'Выберите закрытое место из этого дня.':kind==='closed'&&advice.state==='no_option'?'Другой путь с сохранением билетов и возвращения пока не складывается. Уточните дорогу или выберите другое время.':advice.state==='rail_unavailable'?'Сначала сверим электрички на выбранную дату. Откройте «Поездка на электричке» и выберите рейсы из доступного расписания.':advice.state==='light_unavailable'?'Свет прогулки пока не рассчитан. Вариант не предложен.':advice.state==='incomplete'?'Сначала уточните неизвестную дорогу. Тогда сможем сравнить время.':advice.state==='no_outdoor'?'В оставшемся расчёте нет осмотра открытых мест. Переходы и ожидание всё ещё могут проходить на улице.':advice.state==='no_walking'?'В оставшемся расчёте нет пеших переходов. Можно выбрать «Оставить ещё полчаса» и сократить осмотр.':kind==='rain'?'Сократить открытые места с сохранением билетов, обеда и возвращения пока не удалось. День остался прежним.':kind==='fatigue'?'Пеший путь не стал короче. Билеты, обед и возвращение остались в расчёте; можно оставить больше свободного времени.':'Такой вариант пока не складывается. Билеты, обед, посещённые места и возвращение остались в расчёте. Можно изменить время вручную или перенести часть дня.';return;}
        status.textContent=kind==='closed'?(advice.options.some(o=>o.replacements?.length)?'Сравните пропуск и замену закрытого места. Дорога и возвращение пересчитаны.':'Можно пропустить закрытое место. Дорога и возвращение пересчитаны.'):kind==='rain'?'Осмотр на открытом воздухе короче, пеший путь не увеличился. Переходы и ожидание могут оставаться на улице. Билеты, обед и возвращение учтены.':kind==='fatigue'?'Пешие переходы стали короче. Билеты, обед и возвращение учтены. Перед выходом сверьте дорогу и доступ к местам.':'Билеты, обед, паузы и возвращение учтены. Дорогу и доступ к местам перед выходом нужно сверить.';
        if(['rain','fatigue'].includes(kind) && result.rail)status.textContent+=' Подходы к электричкам остаются прежними.';
        const name=id=>catalog.poi.find(p=>p.slug===id)?.name || id;
        for(const option of advice.options) {
          const moved=flexOmissions(option),replacements=option.replacements || [],key=replacements.length?replacements.map(r=>`${r.from}>${r.to}`).join(','):moved.join(',') || 'whole';
          const card=el('article','day-advice-option');card.dataset.flexOption=key;card.dataset.flexMoved=String(moved.length);
          card.dataset.flexReplaced=String(replacements.length);
          if(option.railChange)card.dataset.flexRail=option.railChange.after.id;
          const title=el('h4','',replacements.length?kind==='closed'?'Зайти в другое место':'Осмотр под крышей':moved.length>1?`${moved.length} ${placesWord(moved.length)} — на другой раз`:moved.length?`«${name(moved[0])}» — на другой раз`:'Все остановки остаются');
          const movedList=el('ul','day-advice-moved');
          for(const id of moved) {const row=el('li','',name(id));row.dataset.flexMovedPlace=id;movedList.append(row);}
          for(const replacement of replacements){const row=el('li','',`${name(replacement.from)} → `),link=el('a','',name(replacement.to));link.href=`/poi/${encodeURIComponent(replacement.to)}/`;row.dataset.flexReplacement=replacement.to;row.append(link);movedList.append(row);}
          const times=el('dl','day-advice-times');
          const rows=[];
          if(option.effort){
            if(kind==='rain')rows.push(['Осмотр открытых мест',`${option.effort.before.outdoor} мин`,`${option.effort.after.outdoor} мин`]);
            rows.push(['Пешие переходы',`${option.effort.before.walking} мин`,`${option.effort.after.walking} мин`]);
          }
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
          const note=el('p','',replacements.length&&kind==='closed'?'Прежнее место останется на другой раз. Его расходы и записи сохранятся; новый билет в расчёт не добавлен.':replacements.length?'Прежние места останутся на другой раз. Расходы и билеты сохранятся у прежних мест. Для музея может понадобиться новый билет — проверьте вход перед выходом.':moved.length?moved.length===1?'Место останется в подборке «Места, куда хочется». Расходы и записи билетов сохранятся.':'Эти места останутся в подборке «Места, куда хочется». Расходы и записи билетов сохранятся.':option.railChange?'Время прогулки пересчитано для другой электрички. Перед поездкой сверьте расписание и условия своего билета.':'Часы посещения и время в пути пересчитаны с новым выходом.');
          for(const replacement of replacements){
            const block=el('div','day-advice-shelter');block.dataset.flexShelter=replacement.to;
            block.append(el('p','',name(replacement.to)));
            let facts;
            if(kind==='closed'){
              block.append(el('p','',replacement.availability.fact.text));
              facts=[['Часы',{...replacement.availability.fact,source:replacement.availability.source}]];
            }else{
              block.append(el('p','',replacement.shelter.fact.text),el('p','',replacement.shelter.hours.text));
              facts=[['Осмотр',replacement.shelter.fact],['Часы',replacement.shelter.hours]];
            }
            if(replacement.price && (!replacement.price.valid_from || trip.date>=replacement.price.valid_from) && (!replacement.price.valid_until || trip.date<=replacement.price.valid_until)){block.append(el('p','',replacement.price.text));facts.push(['Билет',replacement.price]);}
            for(const [label,fact]of facts){const source=el('p','day-advice-source',`${label} · проверено ${new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(fact.source.checked_at+'T12:00:00Z'))}. `),link=el('a','','Источник');link.href=fact.source.url;link.target='_blank';link.rel='noopener noreferrer';source.append(link);block.append(source);}
            order.append(block);
          }
          if(option.railChange){const source=el('p','day-advice-source',`Расписание проверено ${new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(option.railChange.source.checked_at+'T12:00:00Z'))}. `),link=el('a','','Открыть у перевозчика');link.href=option.railChange.source.url;link.target='_blank';link.rel='noopener noreferrer';source.append(link);order.append(source);}
          const apply=el('button','save-item','Выбрать этот вариант');apply.type='button';apply.dataset.flexApply=key;
          apply.onclick=async()=>{
            apply.disabled=true;let changed=false,error='';
            try {
              const saved=await commit(value=>{const proposed=applyFlexAdvice(value,option,catalog);changed=!proposed.error;error=proposed.error;return proposed.trip;},'');
              feedback.textContent=saved?.conflict || error || !changed?'День уже изменился. Проверьте свежий расчёт перед выбором.':saved?.saved?replacements.length&&kind==='closed'?'Новый день сохранён. Закрытое место заменили; прежние расходы и записи остались у него.':replacements.length?'Новый день сохранён. Осмотр перенесён под крышу; прежние места оставили на другой раз. Расходы и билеты сохранили у прежних мест.':moved.length?moved.length===1?`Новый день сохранён. «${name(moved[0])}» оставили на другой раз; расходы и билеты сохранены.`:`Новый день сохранён. На другой раз оставили ${moved.length} ${placesWord(moved.length)} — они в подборке «Места, куда хочется». Расходы и билеты сохранены.`:option.railChange?'Новая электричка и день сохранены. Обратный рейс остался прежним.':'Поздний выход сохранён. Дорога и возвращение пересчитаны.':'Новый день показан в этой вкладке. Браузер не разрешил сохранение; скачайте файл поездки.';
            }catch {feedback.textContent='Сохранение не подтвердилось. Проверьте день и скачайте файл поездки.';}
            finally {if(apply.isConnected)apply.disabled=false;feedback.tabIndex=-1;feedback.focus({preventScroll:true});}
          };
          card.append(title);if(moved.length>1 || replacements.length)card.append(movedList);card.append(times,order);if(option.needsCheck)card.append(el('p','day-advice-source','Часть условий посещения ещё нужно уточнить — они раскрыты в расчёте дня.'));card.append(note,apply);cards.append(card);
        }
      }catch {if(isCurrent()){mount.dataset.flexAdvice='error';status.textContent='Варианты пока не рассчитались. День на месте; попробуйте ещё раз.';}}
      finally {if(isCurrent()){search.disabled=false;mount.removeAttribute('aria-busy');}}
    };
    // A request edited while a search yields must not leave an old card visible.
    const clear=()=>{closedLabel.hidden=select.value!=='closed:0';searchRevision++;search.disabled=false;cards.replaceChildren();status.textContent='';mount.removeAttribute('aria-busy');mount.dataset.flexAdvice='idle';};
    select.onchange=clear;closedSelect.onchange=clear;
  }
  return {reset,render};
}
