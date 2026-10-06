import {currentProgress} from './day-progress.mjs?v=2';
import {generatedDayPoints} from './day-points.mjs?v=1';
import {selectedDay} from './trip-days-state.mjs?v=21';
import {clock} from './day-stop-view.mjs?v=1';

// Continue only the verified, saved rides. Observations never choose new transport.
export function kosaProgressInput(trip,context) {
  const day=selectedDay(trip),progress=currentProgress(trip),points=generatedDayPoints(day);
  if(!context?.input || context.input.date!==trip.date || context.plan!==JSON.stringify(day.kosa_plan))throw Error('progress_kosa_changed');
  if(!progress)return structuredClone(context.input);
  const index=points.indexOf(progress.after);
  if(index<0 || points.some((id,i)=>progress.completed.includes(id)!==(i<=index)))throw Error('progress_walk_order');
  return {...structuredClone(context.input),progress:{after:index===0?'first':'second',at:progress.at}};
}

export function continueKosaRoadbook(original,result,progress) {
  const next=result.continuation;
  if(!next || !progress)throw Error('progress_unavailable');
  const book=structuredClone(original),index=book.timeline.findIndex(row=>row.poi===progress.after);
  if(index<0)throw Error('progress_unknown_walk');
  const blocked=next.state==='conflict',missedTransfer=next.issues.includes('missed_transfer');
  const warning=missedTransfer?'На выбранный автобус между тропами уже не успеваете.':'На выбранный обратный автобус уже не успеваете.';
  const timeline=book.timeline.slice(index+1).map(row=>{
    if(!blocked)return row;
    const chosen=Number.isInteger(row.time)?` В прежнем плане — ${clock(row.time)}.`:'';
    return {...row,time:null,state:['bus','boarding'].includes(row.kind)?'conflict':'unknown',
      text:row.kind==='rail'?`Выбран поезд № ${book.rail.inward.id} в ${clock(book.rail.inward.departure)}. После пропущенного автобуса пересадка не подтверждена.`:
        row.kind==='visit'?'Эта тропа ещё впереди. Сначала подберите другой автобус; время осмотра пока неизвестно.':
        row.kind==='bus'?warning+chosen:row.kind==='boarding'?`Выбранный обратный автобус — ${clock(book.return.departure)}. Подходящее возвращение теперь нужно подобрать заново.`:
        'Время возвращения неизвестно. Сначала подтвердите другой путь домой.'};
  });
  book.timeline=[{kind:'notice',time:progress.at,title:'Снова у остановки после тропы',
    text:`Осмотр закончен. Уже были: ${progress.completed.filter(id=>book.walks.includes(id)).map(id=>id==='vysota-efa'?'Высота Эфа':'Танцующий лес').join(' · ')}. Время прошлых посещений не записано.`,state:'estimate'},...timeline];
  book.continuation=structuredClone(next);
  book.finish=next.finish;
  book.duration=next.finish===null?null:next.finish-progress.at;
  book.return.blocked=blocked;
  if(blocked){book.return.arrival=null;book.fallback='Откройте сохранённый план косы и подтвердите другой автобус вместе с электричкой, если она нужна. Прежний запасной рейс ещё не подтверждает возвращение с этой остановки и в это время. Если места в автобусе нет, воспользуйтесь заранее согласованным запасным транспортом.';}
  else book.fallback='Если задержитесь дальше, обновите время у остановки. Следующий автобус нужно выбрать отдельно и проверить весь путь домой. Посадка на выбранный рейс не гарантирована.';
  // The earlier light estimate belongs to the morning plan, not to the observation.
  book.light={state:'unavailable',assessment:null,rows:[{text:'Свет для оставшегося осмотра ещё нужно проверить. Утренний расчёт не описывает задержку.',warning:true}]};
  return book;
}

export function kosaContinuationMessage(next) {
  if(next.state==='conflict')return (next.issues.includes('missed_transfer')?'На выбранный автобус между тропами уже не успеваете.':'На выбранный обратный автобус уже не успеваете.')+' Время возвращения неизвестно. Откройте план косы и подтвердите другой вариант.';
  return `До выбранного автобуса в ${clock(next.next_departure)}: ${next.slack} мин сверх запаса на посадку. Ориентир возвращения — ${clock(next.finish)}. Рейс и наличие мест подтвердите на месте.`;
}
