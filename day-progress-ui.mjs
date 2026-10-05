import {visitedPlaces} from './day-progress.mjs?v=2';
import {previewProgress,applyProgress,clearProgress,progressMessages} from './day-progress-advice.mjs?v=2';
import {tripSignature,lightMessage} from './trip-light.mjs?v=9';
import {clock} from './day-stop-view.mjs?v=1';
import {generatedDayPoints} from './day-points.mjs?v=1';
import {kosaContinuationMessage} from './day-kosa-progress.mjs?v=1';

const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text)n.textContent=text;return n;};
function regionalNow() {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kaliningrad',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
  const p=Object.fromEntries(parts.map(p=>[p.type,p.value]));return {date:`${p.year}-${p.month}-${p.day}`,at:Number(p.hour)*60+Number(p.minute)};
}
export function initDayProgress({mount,commit,feedback}) {
  let revision=0;
  function reset(){revision++;mount.hidden=true;mount.replaceChildren();mount.removeAttribute('aria-busy');}
  function render({trip,catalog,matrix,engine,stillCurrent,kosaContext=null}) {
    const wasOpen=mount.open;reset();
    const points=generatedDayPoints(trip.itinerary?.days.find(d=>d.id===trip.itinerary.active)),kosa=points.length>0;
    const visited=visitedPlaces(trip).filter(id=>!kosa || points.includes(id)),saved=trip.schedule?.progress;
    if((!visited.length && !saved) || kosa && !kosaContext)return;
    const ticket=revision,current=()=>ticket===revision && stillCurrent(),signature=tripSignature(trip);
    const name=id=>catalog.poi.find(p=>p.slug===id)?.name || id;
    mount.hidden=false;mount.open=wasOpen;mount.dataset.progressState='idle';
    mount.append(el('summary','',kosa?'Продолжить день после тропы':'Продолжить с этого места'),el('p','',saved?`Остаток дня считался от «${name(saved.after)}», ${clock(saved.at)}. Отметки времени можно обновить.`:kosa?'Вернулись к автобусной остановке после тропы? Укажите время здесь. Проверим выбранный автобус и возвращение. Время на смотровой для этого не подходит.':'Закончили осмотр? Укажите место и время. Покажем оставшиеся остановки и возвращение; пройденные места останутся в поездке.'));
    const form=el('form','day-flex-form day-progress-form'),placeLabel=el('label','','Где закончили осмотр?'),select=el('select');select.name='progress-after';select.dataset.progressAfter='true';select.required=true;
    for(const id of visited){const option=el('option','',name(id));option.value=id;select.append(option);}
    const sameCheckpoint=saved && visited.includes(saved.after) && saved.completed.filter(id=>!kosa || points.includes(id)).length===visited.length;
    if(sameCheckpoint)select.value=saved.after;
    else if(visited.length)select.value=visited.at(-1);
    placeLabel.append(select);
    const timeLabel=el('label','',kosa?'Во сколько вернулись к остановке?':'Который час?'),time=el('input');time.type='time';time.name='progress-time';time.dataset.progressTime='true';time.required=true;
    const now=regionalNow(),checkpointAt=sameCheckpoint?saved.at:kosaContext?.times[select.value];time.value=clock(now.date===trip.date?Math.max(checkpointAt || 0,now.at):checkpointAt ?? trip.schedule?.start ?? 540);timeLabel.append(time);
    const button=el('button','save-item','Посмотреть остаток дня');button.type='submit';button.dataset.progressPreview='true';button.disabled=!visited.length;form.append(placeLabel,timeLabel,button);mount.append(form);
    mount.append(el('p','',trip.date?`Для дня ${new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(trip.date+'T12:00:00Z'))} Время Калининградской области.`:'Сначала выберите дату дня.'));
    if(!kosa && trip.schedule?.mode && trip.schedule.mode!=='foot')mount.append(el('p','','Укажите время после возвращения к машине или велосипеду у этого места. Оттуда начнётся следующий участок.'));
    const status=el('p','day-advice-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const cards=el('div','day-advice-options');mount.append(status,cards);
    let preview=null;
    const invalidate=()=>{preview=null;cards.replaceChildren();status.textContent='';mount.dataset.progressState='idle';};form.oninput=invalidate;
    form.onsubmit=event=>{
      event.preventDefault();invalidate();if(!current()){status.textContent=progressMessages.stale;return;}
      const [h,m]=time.value.split(':').map(Number);
      preview=previewProgress(trip,{after:select.value,at:h*60+m},catalog,matrix,engine,kosaContext);
      if(preview.error){mount.dataset.progressState='error';status.textContent=progressMessages[preview.error] || 'Остаток дня пока не рассчитан. Проверьте время и возвращение.';return;}
      mount.dataset.progressState='preview';
      const result=preview.result,conflict=kosa?result.continuation.state==='conflict':['conflict','overrun'].includes(result.status),unknown=result.finish===null;
      status.textContent=kosa?kosaContinuationMessage(result.continuation):conflict?'Все оставшиеся остановки не помещаются. Билеты и возвращение сохранены; ниже видно, где возникла задержка.':unknown?'Часть пути ещё неизвестна. Ниже — ориентиры; точное возвращение пока не подтверждено.':'Остаток дня рассчитан. Перед выходом сверьте дорогу, входы и обратный рейс.';
      const card=el('article','day-advice-option');card.append(el('h4','',`Дальше — с ${clock(preview.progress.at)}`));
      if(kosa){
        const next=result.continuation;
        card.append(el('p','',`Выбранный автобус — ${clock(next.next_departure)}. У остановки нужно быть к ${clock(next.next_board_by)}.`));
        if(next.remaining_visit)card.append(el('p','',`${clock(next.remaining_visit[0])}–${clock(next.remaining_visit[1])} · Танцующий лес, вместе с возвращением к остановке.`));
        if(conflict){const link=el('a','text-link','Подобрать другое возвращение →');link.href='/kurshskaya-kosa/bez-mashiny/#kosa-planner';card.append(link);}
        if(result.rail)card.append(el('p','',`Выбранная электричка — ${clock(result.rail.inward.departure)}.${conflict?' После пропущенного автобуса пересадка не подтверждена.':' Путь к станции и запас на посадку учтены по вашим настройкам.'}`));
      }else{
      const list=el('ol');
      for(const row of result.stops)if(catalog.poi.some(p=>p.slug===row.id)){
        const li=el('li','',`${row.begins===null?'Не раньше '+clock(row.earliest_begin):clock(row.begins)} · ${name(row.id)}`);li.dataset.progressStop=row.id;
        if(row.issues.some(i=>['appointment_missed','window_missed','closed','after_deadline','transport_conflict'].includes(i.code)))li.append(el('strong','',' · Не помещается по времени'));
        const light=preview.light?.stops.find(p=>p.id===row.id),note=light&&lightMessage(light);if(note)li.append(el('p','',note));list.append(li);
      }
      if(!list.children.length)card.append(el('p','','Все отмеченные места позади. Осталось возвращение.'));else card.append(list);
      card.append(el('p','',`${result.finish===null?'Окончание не раньше':'Ориентир окончания'} ${clock(result.earliest_finish)}.${result.slack===null?' Запас времени пока неизвестен.':result.slack<0?` Позже границы дня на ${-result.slack} мин.`:` Запас до границы дня — ${result.slack} мин.`}`));
      if(result.rail)card.append(el('p','',`Обратная электричка — ${clock(result.rail.inbound_departure)}.${['missed','no_time'].includes(result.rail.state)?' По этому плану на неё не успеваете.':result.rail.state==='incomplete'?' Возвращение ещё нужно уточнить.':' Путь к станции и запас до посадки учтены.'}`));
      }
      const apply=el('button','save-item','Сохранить этот расчёт');apply.type='button';apply.dataset.progressApply='true';
      apply.onclick=async()=>{
        apply.disabled=true;let changed=false,error='';
        try {
          const outcome=await commit(value=>{const proposed=applyProgress(value,preview);changed=!proposed.error;error=proposed.error;return proposed.trip;},'');
          feedback.textContent=outcome?.conflict || error || !changed?progressMessages.stale:outcome?.saved?`Время и остаток дня сохранены.${conflict?kosa?' Пропущенный автобус остаётся виден; подберите другое возвращение.':' Задержка остаётся видна; измените остановки или возвращение.':''}`:'Остаток дня показан в этой вкладке. Браузер не разрешил сохранение; скачайте файл поездки.';
        }catch {feedback.textContent='Сохранение не завершилось. Посмотрите расчёт ещё раз и скачайте файл поездки.';}finally{if(apply.isConnected)apply.disabled=false;}
      };card.append(apply);cards.append(card);
    };
    if(saved){const clear=el('button','save-item','Вернуть расчёт с начала дня');clear.type='button';clear.dataset.progressClear='true';clear.onclick=async()=>{
      clear.disabled=true;let changed=false;
      try {const outcome=await commit(value=>{const next=clearProgress(value,signature);changed=!next.error;return next.trip;},'');feedback.textContent=!changed || outcome?.conflict?progressMessages.stale:outcome?.saved?'Расчёт с начала дня сохранён. Отметки посещения остались.':'Расчёт изменён в этой вкладке. Сохранение не завершилось; скачайте файл поездки.';}
      catch {feedback.textContent='Сохранение не завершилось. Попробуйте ещё раз.';}finally{if(clear.isConnected)clear.disabled=false;}
    };mount.append(clear);}
  }
  return {render,reset};
}
