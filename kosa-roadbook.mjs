import {kosaClock as clock,kosaNote,kosaRailTable} from './kosa-plan-state.mjs?v=13';
import {kosaLightSummary} from './kosa-light.mjs?v=1';
import {selectKosaInterchanges,assessKosaWalking} from './kosa-interchanges.mjs?v=3';
import {kosaBoarding} from './kosa-boarding.mjs?v=1';
import {transitTable} from './transport-day.mjs?v=1';
const cities={zelenogradsk:'Зеленоградск',kaliningrad:'Калининград',svetlogorsk:'Светлогорск'};
// A single, immutable day snapshot supplies both the screen and the document.
export function kosaRoadbook(answers,day,table,catalog,interchanges){
  table=transitTable(table,answers.date).publication;
  kosaNote(answers,day,table,catalog); // Reject a proposal without a return.
  const atForest=answers.walks==='two',returnTime=atForest?day.inward.via:day.inward.departure;
  const timeline=[
    {kind:'bus',time:day.outward.departure,title:'Из Зеленоградска - к Эфе',text:`Автобус № 210. У остановки к ${clock(day.outward.departure-answers.boarding)}. Прибытие к тропе по таблице - ${clock(day.outward.arrival)}.`},
    {kind:'visit',poi:'vysota-efa',time:day.outward.arrival,title:'Дюны и высокий горизонт',text:`${answers.first_visit} мин на подход, настил, смотровые и возвращение к автобусу. Темп, погоду и доступ проверьте на месте.`},
  ];
  if(day.transfer)timeline.push(
    {kind:'bus',time:day.transfer.departure,title:'От Эфы - к Танцующему лесу',text:`Переезд на автобусе № 210. По таблице у леса в ${clock(day.transfer.via)}. Между тропами пешком этот план не ведёт.`},
    {kind:'visit',poi:'tancuyushchiy-les',time:day.transfer.via,title:'Сосны и короткая тропа',text:`${answers.second_visit} мин вместе с возвращением к остановке. Если первый автобус задержался, второй осмотр можно пропустить.`});
  timeline.push(
    {kind:'boarding',time:day.board_by,title:'Пора к обратной остановке',text:`Автобус по таблице в ${clock(returnTime)}. Запас ${answers.boarding} мин до посадки. Наличие мест неизвестно.`},
    {kind:'return',time:day.finish,title:'Снова в Зеленоградске',text:'До жилья - отдельная часть дня. Подтвердите свою электричку или автобус и оставьте запас до посадки.'});
  const backup=day.backup?{departure:atForest?day.backup.via:day.backup.departure,arrival:day.backup.arrival}:null;
  const fallback=backup
    ?`Следующий рейс по таблице: ${clock(backup.departure)}, в Зеленоградске - ${clock(backup.arrival)}. Подтвердите, что он идёт в день поездки. Посадка не гарантирована.`
    :'После выбранного рейса в этой таблице другого нет. Запасной способ возвращения нужно договорить до поездки.';
  const railTable=kosaRailTable(answers,catalog),rail=day.rail?{...structuredClone(day.rail),from:railTable.service.from,to:railTable.service.to,publication:structuredClone(railTable.source)}:null;
  if(rail){
    timeline.unshift(
      {kind:'walk',time:rail.home_start,title:answers.origin==='station'?'Начало у вокзала':'От жилья - к вокзалу',text:answers.origin==='station'?`${rail.from}. У поезда к ${clock(rail.station_by)}; платформу уточните на месте.`:`До ${rail.from} - ${rail.to_station} мин по вашей оценке. У поезда к ${clock(rail.station_by)}. Выход и платформу уточните на месте.`},
      {kind:'rail',time:rail.outward.departure,title:'Электричка к морю',text:`Поезд № ${rail.outward.id}: ${rail.from} → ${rail.to}. По таблице прибытие в ${clock(rail.outward.arrival)}.`},
      {kind:'walk',time:rail.outward.arrival,title:'Пересадка на автобус',text:`${rail.to_bus} мин от станции до остановки по вашей оценке, ещё ${answers.boarding} мин до посадки. Оставшееся время - ожидание автобуса.`});
    timeline[timeline.length-1].text=`От остановки до поезда - ${rail.to_train} мин по вашей оценке. У поезда к ${clock(rail.train_by)}.`;
    timeline.push(
      {kind:'rail',time:rail.inward.departure,title:'Электричка обратно',text:`Поезд № ${rail.inward.id} до ${rail.from}. Прибытие по таблице в ${clock(rail.inward.arrival)}.`},
      {kind:'return',time:rail.home_finish,title:answers.origin==='station'?'Снова у вокзала':'Вернуться к жилью',text:answers.origin==='station'?`${rail.from}. Дорогу от вокзала до жилья выберите отдельно.`:`После поезда ещё ${rail.from_station} мин по вашей оценке. Это расчёт с вашим запасом, а не проверенное время от двери до двери.`});
  }
  const selected=selectKosaInterchanges(answers,interchanges);
  const boarding=kosaBoarding(table,answers);
  const walking=assessKosaWalking(answers,selected);
  for(const row of timeline){
    const legId={'Из Зеленоградска - к Эфе':'outward','От Эфы - к Танцующему лесу':'transfer','Пора к обратной остановке':'return'}[row.title];
    if(legId)row.boarding=boarding?.legs.find(leg=>leg.id===legId)||null;
    if(row.title==='Пересадка на автобус')row.map_id='station-bus';
    if(row.title==='Снова в Зеленоградске'&&rail)row.map_id='bus-station';
    if(row.title==='Дюны и высокий горизонт')row.map_id='efa-in-efa';
    if(row.title==='От Эфы - к Танцующему лесу')row.map_id='efa-efa-out';
    if(row.title==='Сосны и короткая тропа')row.map_id='forest-in-forest';
    if(row.title==='Пора к обратной остановке')row.map_id=atForest?'forest-forest-out':'efa-efa-out';
    const field={'Пересадка на автобус':'to_bus','Снова в Зеленоградске':'to_train','Дюны и высокий горизонт':'first_visit','Сосны и короткая тропа':'second_visit'}[row.title];
    const check=walking.checks.find(c=>c.field===field);
    if(check?.trail){row.trail_budget=check.trail;row.text+=' '+check.text;}
    if(check&&check.state!=='within_estimate'){row.walking_check=check;if(!check.trail)row.text+=' '+check.text;}
  }
  return {schema_version:1,date:answers.date,city:cities[answers.city],walks:atForest?['vysota-efa','tancuyushchiy-les']:['vysota-efa'],
    duration:rail?rail.home_finish-rail.home_start:day.finish-day.outward.departure,finish:rail?rail.home_finish:day.finish,timeline,...(rail?{rail,origin:answers.origin||'home'}:{}),
    walking,boarding,light:kosaLightSummary(day.light),...(selected?{interchanges:selected}:{}),return:{stop:atForest?'Танцующий лес':'Высота Эфа',board_by:day.board_by,departure:returnTime,arrival:day.finish,backup},
    fallback:fallback+(rail&&backup?(rail.backup?` Затем электричка в ${clock(rail.backup.departure)}, прибытие на ${rail.from} в ${clock(rail.backup.arrival)}.`:' После запасного автобуса подходящей электрички в этой таблице нет. Полное запасное возвращение пока не подобрано.') :''),publication:{valid_from:table.valid_from,checked_at:table.checked_at,source_url:table.source_url,image_sha256:table.image_sha256,note:table.note},
    before:[rail?'Подтвердите электрички и автобусы на выбранную дату. Проверьте путь от жилья, выход со станции и обе пересадки.':'Подтвердите оба рейса на выбранную дату и проверьте дорогу до автобуса в Зеленоградске.',
      'Оформите разрешение национального парка. Сохраните билет и его код в телефоне.',
      'Возьмите воду, одежду от ветра и заряженный телефон. Сохраните номер заранее согласованного водителя, если он будет вашим запасным вариантом.',
      'Откройте скачанный PDF без интернета до выхода. В нём должны быть план дня и карты всех выбранных троп.'],
    limits:['Рейсы на дату поездки не подтверждены. Это план по опубликованной таблице, а не билет или бронь.',
      'Если автобус ушёл или приехал полным, сначала уточните следующий рейс. Не идите между тропами по проезжей части в надежде догнать автобус.',
      'Если второго автобуса нет, уточните возвращение у перевозчика или заранее выбранного водителя. Стоимость и возможность подачи здесь неизвестны.',
      selected?'Карты переходов построены по OpenStreetMap. Площадка № 210, последние метры и проходы на местности ещё не проверены. Дорога от жилья и автобусный путь на них не показаны.':'Пешие карты относятся к отдельным тропам. Они не показывают дорогу от жилья до Зеленоградска или автобусный путь по косе.']};
}
