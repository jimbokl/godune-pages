import {previewKosaFlex,applyKosaFlex} from './day-kosa-flex.mjs?v=4';
import {clock} from './day-stop-view.mjs?v=1';
const el=(tag,cls='',text='')=>{const node=document.createElement(tag);node.className=cls;node.textContent=text;return node;};
const messages={one_walk:'В плане уже одна тропа. Более короткого проверенного пути здесь пока нет. Сохранённое возвращение показано выше.',
  completed:'Танцующий лес уже отмечен как посещённый. Укажите время у остановки в «Продолжить день после тропы».',
  booked:'В Танцующем лесу есть записанный билет или встреча. Сначала уточните эту запись; автоматически убирать её не будем.',
  observation_needed:'Отметка осмотра на месте. Укажите время у остановки в «Продолжить день после тропы», затем сравните варианты.',
  missed:'Выбранный автобус уже не подходит по времени. Откройте поездку на косу и подтвердите другое возвращение.',
  unknown_walk:'Время ходьбы пока не подтверждается данными карты. Сохранённый план на месте; сверьте переходы перед изменением.',
  unavailable:'Подходящего сокращения с возвращением пока не получилось. Сохранённый день на месте.',stale:'День изменился. Посмотрите свежий расчёт перед выбором.'};
export function initKosaFlex({mount,commit,feedback}){
  let generation=0;
  const reset=()=>{generation++;mount.hidden=true;mount.replaceChildren();};
  function render({trip,catalog,engine,context,stillCurrent=()=>true}){
    reset();if(!context)return;const ticket=generation;
    mount.hidden=false;mount.dataset.kosaFlex='idle';
    const summary=el('summary','','Подстроить день на косе');
    const form=el('form','day-flex-form'),label=el('label','','Что изменилось?'),select=el('select');select.dataset.kosaFlexReason='true';
    for(const [value,text]of [['rain','Пошёл дождь'],['fatigue','Устали — меньше ходьбы']]){const opt=el('option','',text);opt.value=value;select.append(opt);}label.append(select);
    const button=el('button','save-item','Сравнить варианты');button.type='submit';button.dataset.kosaFlexPreview='true';form.append(label,button);
    const status=el('p','trip-plan-note');status.setAttribute('role','status');const cards=el('div','day-advice-options');
    const clear=()=>{cards.replaceChildren();status.textContent='';mount.dataset.kosaFlex='idle';};select.onchange=clear;
    form.onsubmit=event=>{
      event.preventDefault();clear();if(ticket!==generation||!stillCurrent())return;
      const response=previewKosaFlex(trip,select.value,catalog,engine,context);mount.dataset.kosaFlex=response.state||response.error;
      if(!response.options.length){status.textContent=messages[response.state||response.error]||messages.unavailable;return;}
      const option=response.options[0],card=el('article','day-advice-option');card.dataset.kosaFlexOption='direct_return';
      card.append(el('h4','', 'Эфа — и обратно к морю'),el('p','','Танцующий лес оставим на другой раз. После Эфы садимся в автобус и едем до Зеленоградска.'));
      card.append(el('p','day-advice-times',`${option.walkingSaved} мин меньше ходьбы · ${option.outdoorSaved} мин меньше на открытом воздухе на косе.`));
      card.append(el('p','',`Обратный автобус от Эфы — ${clock(option.returnAfter.departure)}. В Зеленоградске: ${clock(option.returnBefore.arrival)} → ${clock(option.returnAfter.arrival)}.`));
      if(option.result.rail)card.append(el('p','',`Электричка № ${option.result.rail.inward.id} в ${clock(option.result.rail.inward.departure)} остаётся прежней. До неё после перехода — ${option.railWait} мин ожидания, было ${option.railWaitBefore} мин.`));
      card.append(el('p','trip-plan-note','Тропа и ожидание автобуса остаются под открытым небом. Укрытие на косе и у электрички здесь не подтверждено. Рейс и места в автобусе уточните перед посадкой.'));
      const details=el('details','day-disclosure');details.append(el('summary','','Расписание и условия'));
      const source=el('p','day-advice-source',`Таблица автобусов проверена ${option.source.checked_at}. `),link=el('a','','У перевозчика');link.href=option.source.source_url;link.target='_blank';link.rel='noopener noreferrer';source.append(link);details.append(source);
      details.append(el('p','','Время ходьбы — оценка по длине тропы и карте подходов. Сохранённые заметки, расходы, билеты и другие дни остаются на месте. Дополнительные места вне автобусного расчёта.'));
      const apply=el('button','save-item','Выбрать этот вариант');apply.type='button';apply.dataset.kosaFlexApply='true';
      apply.onclick=async()=>{apply.disabled=true;let changed=false,error;
        try {const saved=await commit(value=>{const next=applyKosaFlex(value,option);changed=!next.error;error=next.error;return next.trip;},'');
          feedback.textContent=error||saved?.conflict||!changed?messages.stale:saved?.saved?'Новый день сохранён. Танцующий лес оставили на другой раз; заметки, расходы и билеты на месте.':'Новый день показан в этой вкладке. Браузер не разрешил сохранение; скачайте файл поездки.';
        }catch {feedback.textContent='Сохранение не подтвердилось. Проверьте день и скачайте файл поездки.';}
        finally {if(apply.isConnected)apply.disabled=false;feedback.tabIndex=-1;feedback.focus({preventScroll:true});}
      };
      card.append(details,apply);cards.append(card);
    };
    mount.append(summary,form,status,cards);
  }
  return {render,reset};
}
