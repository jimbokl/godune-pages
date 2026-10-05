import {flexAdvice,applyFlexAdvice,canFlexDay} from './day-flex-advice.mjs?v=1';
import {clock} from './day-stop-view.mjs?v=1';

const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text)n.textContent=text;return n;};
const finish=result=>result.finish===null?`Не раньше ${clock(result.earliest_finish)}`:clock(result.finish);
export function initFlexAdvice({mount,commit,feedback}) {
  let revision=0;
  function reset(){revision++;mount.hidden=true;mount.replaceChildren();mount.removeAttribute('aria-busy');}
  function render({trip,catalog,matrix,engine,result,stillCurrent}) {
    reset();if(!canFlexDay(trip))return;
    const ticket=revision,current=()=>ticket===revision && stillCurrent();
    mount.hidden=false;mount.dataset.flexAdvice='idle';
    const summary=el('summary','','Подстроить день'),note=el('p','','Если хочется выйти позже или гулять спокойнее. Сравните варианты — день изменится только после вашего выбора.');
    const form=el('form','day-flex-form'),label=el('label','','Что изменим'),select=el('select');select.name='flex';select.dataset.flexRequest='true';
    for(const [value,text]of [['later:15','Выйти на 15 минут позже'],['later:30','Выйти на 30 минут позже'],['later:60','Выйти на час позже'],['breathing_room:30','Оставить ещё полчаса'],['breathing_room:60','Оставить ещё час']]) {
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
        if(!advice.options.length){status.textContent=advice.state==='light_unavailable'?'Свет прогулки пока не рассчитан. Вариант не предложен.':advice.state==='incomplete'?'Сначала уточните неизвестную дорогу. Тогда сможем сравнить время.':'Такой вариант пока не складывается. Билеты, обед, посещённые места и выбранные поезда сохранили в расчёте. Можно изменить время вручную или перенести часть дня.';return;}
        status.textContent='Билеты, обед, паузы и возвращение учтены. Дорогу и доступ к местам перед выходом нужно сверить.';
        const name=id=>catalog.poi.find(p=>p.slug===id)?.name || id;
        for(const option of advice.options) {
          const card=el('article','day-advice-option');card.dataset.flexOption=option.omitted || 'whole';
          const title=el('h4','',option.omitted?`«${name(option.omitted)}» — на другой раз`:'Все остановки остаются');
          const times=el('dl','day-advice-times');
          for(const [caption,before,after]of [['Выход',clock(option.previousStart),clock(option.displayStart)],['Окончание',finish(option.before),finish(option.result)],[option.result.rail?'Запас до обратного поезда':'Запас до конца дня',option.before.slack===null?'Пока неизвестно':`${option.before.slack} мин`,`${option.result.slack} мин`]]) {
            const row=el('div'),dd=el('dd');dd.append(el('span','',before),el('span','day-advice-arrow','→'),el('strong','',after));row.append(el('dt','',caption),dd);times.append(row);
          }
          const order=el('details','day-advice-order'),caption=el('summary','','Как пойдёт день'),list=el('ol');
          for(const stop of option.result.stops)if(catalog.poi.some(p=>p.slug===stop.id))list.append(el('li','',`${clock(stop.begins)} · ${name(stop.id)}`));order.append(caption,list);
          const note=el('p','',option.omitted?'Место останется в подборке «Места, куда хочется». Расходы и записи билетов сохранятся.':'Часы посещения и время в пути пересчитаны с новым выходом.');
          const apply=el('button','save-item','Выбрать этот вариант');apply.type='button';apply.dataset.flexApply=option.omitted || 'whole';
          apply.onclick=async()=>{
            apply.disabled=true;let changed=false,error='';
            try {
              const saved=await commit(value=>{const proposed=applyFlexAdvice(value,option);changed=!proposed.error;error=proposed.error;return proposed.trip;},'');
              feedback.textContent=saved?.conflict || error || !changed?'День уже изменился. Проверьте свежий расчёт перед выбором.':saved?.saved?option.omitted?`Новый день сохранён. «${name(option.omitted)}» оставили на другой раз; расходы и билеты сохранены.`:'Поздний выход сохранён. Дорога и возвращение пересчитаны.':'Новый день показан в этой вкладке. Браузер не разрешил сохранение; скачайте файл поездки.';
            }catch {feedback.textContent='Сохранение не подтвердилось. Проверьте день и скачайте файл поездки.';}
            finally {if(apply.isConnected)apply.disabled=false;feedback.tabIndex=-1;feedback.focus({preventScroll:true});}
          };
          card.append(title,times,order,note,apply);cards.append(card);
        }
      }catch {if(isCurrent()){mount.dataset.flexAdvice='error';status.textContent='Варианты пока не рассчитались. День на месте; попробуйте ещё раз.';}}
      finally {if(isCurrent()){search.disabled=false;mount.removeAttribute('aria-busy');}}
    };
    // A request edited while a search yields must not leave an old card visible.
    select.onchange=()=>{searchRevision++;search.disabled=false;cards.replaceChildren();status.textContent='';mount.removeAttribute('aria-busy');mount.dataset.flexAdvice='idle';};
  }
  return {reset,render};
}
