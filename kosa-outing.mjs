// Traveller preferences, not a weather forecast or an accessibility guarantee.
export function kosaFamilyPlan(answers) {
  return {...answers,walks:'one',pace:'slow',first_visit:Math.max(180,answers.first_visit),
    boarding:Math.max(20,answers.boarding),
    ...(answers.city==='kaliningrad'?{to_bus:Math.max(15,answers.to_bus??0),to_train:Math.max(15,answers.to_train??0),rail_boarding:Math.max(15,answers.rail_boarding??0)}:{})};
}
export function kosaOuting(value) {
  if(!value)return null;
  return {version:1,children:value.children===true,stroller:value.stroller===true,weather:value.weather==='rain'?'rain':'fair'};
}
export function kosaOutingCopy(value) {
  const outing=kosaOuting(value);if(!outing)return [];
  return [
    ...(outing.children?['С детьми: время на перекус, паузы и возвращение к остановке входит в выбранную длительность прогулки. Число детей и льготников задаётся отдельно.']:[]),
    ...(outing.stroller?['С коляской: парк сообщает о пандусах на Эфе от парковки до первых смотровых. Весь маршрут, подход от автобуса и место для коляски в № 210 не подтверждены; уточните их до выезда.']:[]),
    ...(outing.weather==='rain'?['Выбран дождливый вариант: одна прогулка на Эфе, затем автобус обратно без Танцующего леса.']:[])
  ];
}
export const kosaWeatherCopy={
  rain:'При небольшом дожде можно оставить одну тропу, если она открыта и настил не скользкий. При ухудшении погоды прогулку отмените; рассчитанный рейс не заменяет оценку условий на месте.',
  wind:'При штормовом предупреждении или ухудшении погоды парк рекомендует воздержаться от поездки. Перенесите косу на другую дату. Лес не является укрытием от сильного ветра.',
  source:{name:'Национальный парк «Куршская коса» · безопасность посещения',url:'https://www.park-kosa.ru/bezopasnost-poseshheniya',checked_at:'2026-10-14'},
  access_source:{name:'Национальный парк «Куршская коса» · Высота Эфа',url:'https://park-kosa.ru/vysota-efa-28ekologicheskaya-tropa29',checked_at:'2026-10-14'}
};
