import {timingAdvice, applyTimingAdvice, needsTimingHelp} from './day-timing-advice.mjs?v=4';
import {clock} from './day-stop-view.mjs?v=1';

const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text)n.textContent=text;return n;};
const remaining=n=>n===null?'Пока неизвестно':n<0?`Не хватает ${-n} мин`:`${n} мин`;
export function initTimingAdvice({mount,commit,feedback}) {
  let revision=0;
  function reset(){revision++;mount.hidden=true;mount.replaceChildren();mount.removeAttribute('aria-busy');}
  function render({trip,catalog,matrix,engine,result,stillCurrent}) {
    reset();if(trip.schedule?.progress || !needsTimingHelp(result))return;
    const ticket=revision,current=()=>ticket===revision && stillCurrent();
    mount.hidden=false;mount.dataset.timingAdvice='idle';
    const heading=el('h4','','Оставим дню время'),note=el('p','','Проверим, поможет ли ранний выход или другой порядок остановок. Билеты, паузы и запас останутся в расчёте.');
    heading.id='day-timing-advice-title';mount.setAttribute('aria-labelledby',heading.id);
    const button=el('button','save-item','Помочь со временем');button.type='button';button.dataset.timingSearch='true';
    const status=el('p','day-advice-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const cards=el('div','day-advice-options');mount.append(heading,note,button,status,cards);
    button.onclick=async()=>{
      button.disabled=true;mount.setAttribute('aria-busy','true');status.textContent='Проверяем дорогу, часы посещения и возвращение…';
      try {
        const advice=await timingAdvice(trip,catalog,matrix,engine,result,current);
        if(!current())return;
        mount.dataset.timingAdvice=advice.state;
        if(!advice.options.length) {
          status.textContent=advice.state==='light_unavailable'?'Свет прогулки пока не рассчитан. Попробуйте уточнить время или выбрать другое место.':
            'Эти два способа не помогли. Попробуйте заменить закрытое место или перенести часть прогулки на другой день.';
          button.hidden=true;return;
        }
        button.hidden=true;note.hidden=true;status.textContent='Выберите подходящий вариант. Дорогу и вход перед поездкой нужно сверить.';
        for(const option of advice.options) {
          const card=el('article','day-advice-option');card.dataset.timingOption=option.kind;
          const title=el('h5','',option.kind==='start'?`Начать в ${clock(option.start)}`:`«${catalog.poi.find(p=>p.slug===option.moved)?.name || option.moved}» — раньше`);
          const times=el('dl','day-advice-times');
          const rows=option.kind==='start'?[['Выход',clock(option.previousStart),clock(option.start)]]:[];
          rows.push(['Окончание',option.before.finish===null?`Не раньше ${clock(option.before.earliest_finish)}`:clock(option.before.finish),clock(option.result.finish)],
            [option.result.rail?'Запас до обратного поезда':'Запас до конца дня',remaining(option.before.slack),remaining(option.result.slack)]);
          for(const [label,before,after]of rows){const group=el('div'),dt=el('dt','',label),dd=el('dd');dd.append(el('span','',before),el('span','day-advice-arrow','→'),el('strong','',after));group.append(dt,dd);times.append(group);}
          const order=el('details','day-advice-order'),summary=el('summary','','Как пойдёт день'),list=el('ol');
          for(const stop of option.result.stops) {
            const place=catalog.poi.find(p=>p.slug===stop.id);if(!place)continue;
            list.append(el('li','',`${clock(stop.begins)} · ${place.name}`));
          }order.append(summary,list);
          const apply=el('button','save-item',option.kind==='start'?'Сохранить это начало':'Сохранить этот порядок');apply.type='button';apply.dataset.timingApply=option.kind;
          apply.onclick=async()=>{
            apply.disabled=true;let changed=false,error='';
            try {
              const saved=await commit(value=>{
                const proposed=applyTimingAdvice(value,option);error=proposed.error;changed=!error;return proposed.trip;
              },'');
              if(saved?.conflict || error || !changed)feedback.textContent='День уже изменился. Предложение оставили без изменений — проверьте свежий расчёт.';
              else feedback.textContent=saved?.saved?'Новое время сохранено. Дорога, билеты и возвращение пересчитаны.':
                'Новое время показано в этой вкладке. Браузер не разрешил сохранение; скачайте файл поездки.';
            }catch {feedback.textContent='Сохранение не подтвердилось. Проверьте день перед выходом и скачайте файл поездки.';}
            finally {if(apply.isConnected)apply.disabled=false;}
          };
          card.append(title,times,order,apply);cards.append(card);
        }
      }catch {
        if(current()){mount.dataset.timingAdvice='error';status.textContent='Предложение пока не рассчиталось. Расчёт не изменил ваш день; попробуйте ещё раз.';button.disabled=false;}
      }finally {if(current())mount.removeAttribute('aria-busy');}
    };
  }
  return {reset,render};
}
