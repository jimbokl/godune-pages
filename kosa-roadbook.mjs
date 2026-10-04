import {kosaClock as clock,kosaNote} from './kosa-plan-state.mjs?v=1';
const cities={zelenogradsk:'Зеленоградск',kaliningrad:'Калининград',svetlogorsk:'Светлогорск'};
// A single, immutable day snapshot supplies both the screen and the document.
export function kosaRoadbook(answers,day,table){
  kosaNote(answers,day,table); // Reject a proposal without a return.
  const atForest=answers.walks==='two',returnTime=atForest?day.inward.via:day.inward.departure;
  const timeline=[
    {time:day.outward.departure,title:'Из Зеленоградска - к Эфе',text:`Автобус № 210. У остановки к ${clock(day.outward.departure-answers.boarding)}. Прибытие к тропе по таблице - ${clock(day.outward.arrival)}.`},
    {time:day.outward.arrival,title:'Дюны и высокий горизонт',text:`${answers.first_visit} мин на подход, настил, смотровые и возвращение к автобусу. Темп, погоду и доступ проверьте на месте.`},
  ];
  if(day.transfer)timeline.push(
    {time:day.transfer.departure,title:'От Эфы - к Танцующему лесу',text:`Переезд на автобусе № 210. По таблице у леса в ${clock(day.transfer.via)}. Между тропами пешком этот план не ведёт.`},
    {time:day.transfer.via,title:'Сосны и короткая тропа',text:`${answers.second_visit} мин вместе с возвращением к остановке. Если первый автобус задержался, второй осмотр можно пропустить.`});
  timeline.push(
    {time:day.board_by,title:'Пора к обратной остановке',text:`Автобус по таблице в ${clock(returnTime)}. Запас ${answers.boarding} мин до посадки. Наличие мест неизвестно.`},
    {time:day.finish,title:'Снова в Зеленоградске',text:'До жилья - отдельная часть дня. Подтвердите свою электричку или автобус и оставьте запас до посадки.'});
  const backup=day.backup?{departure:atForest?day.backup.via:day.backup.departure,arrival:day.backup.arrival}:null;
  const fallback=backup
    ?`Следующий рейс по таблице: ${clock(backup.departure)}, в Зеленоградске - ${clock(backup.arrival)}. Подтвердите, что он идёт в день поездки. Посадка не гарантирована.`
    :'После выбранного рейса в этой таблице другого нет. Запасной способ возвращения нужно договорить до поездки.';
  return {schema_version:1,date:answers.date,city:cities[answers.city],walks:atForest?['vysota-efa','tancuyushchiy-les']:['vysota-efa'],
    duration:day.finish-day.outward.departure,finish:day.finish,timeline,
    return:{stop:atForest?'Танцующий лес':'Высота Эфа',board_by:day.board_by,departure:returnTime,arrival:day.finish,backup},
    fallback,publication:{valid_from:table.valid_from,checked_at:table.checked_at,source_url:table.source_url,image_sha256:table.image_sha256,note:table.note},
    before:['Подтвердите оба рейса на выбранную дату и проверьте дорогу до автобуса в Зеленоградске.',
      'Оформите разрешение национального парка. Сохраните билет и его код в телефоне.',
      'Возьмите воду, одежду от ветра и заряженный телефон. Сохраните номер заранее согласованного водителя, если он будет вашим запасным вариантом.',
      'Откройте скачанный PDF без интернета до выхода. В нём должны быть план дня и карты всех выбранных троп.'],
    limits:['Рейсы на дату поездки не подтверждены. Это план по опубликованной таблице, а не билет или бронь.',
      'Если автобус ушёл или приехал полным, сначала уточните следующий рейс. Не идите между тропами по проезжей части в надежде догнать автобус.',
      'Если второго автобуса нет, уточните возвращение у перевозчика или заранее выбранного водителя. Стоимость и возможность подачи здесь неизвестны.',
      'Пешие карты относятся к отдельным тропам. Они не показывают дорогу от жилья до Зеленоградска или автобусный путь по косе.']};
}
