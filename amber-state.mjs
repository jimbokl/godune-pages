// Pure planning rules. A storm date is a user observation, never a weather feed.
export const AMBER_STORAGE_KEY='godune.amber.walk.v1';
export function localToday(now=new Date()) {
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kaliningrad',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 return ['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-');
}
export function validDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;}
export function nextDay(value){if(!validDate(value))throw Error('Укажите дату шторма.');const date=new Date(value+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+1);return date.toISOString().slice(0,10);}
export function dateLabel(value){return validDate(value)?new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z')):'';}
export function planAmberWalk(manifest,input,today=localToday()){
 if(manifest?.version!==1||!Array.isArray(manifest.beaches)||!validDate(today))throw Error('Памятка не прочитана. Обновите страницу.');
 const beach=manifest.beaches.find(b=>b.id===input?.beach);
 if(!beach)throw Error('Выберите берег из списка.');
 if(!validDate(input.storm)||!validDate(input.visit))throw Error('Укажите обе даты.');
 if(input.storm>today)throw Error('Дата прошедшего шторма не может быть в будущем.');
 if(input.visit<input.storm)throw Error('Выберите прогулку после указанного шторма.');
 if(!['unknown','calm','rough'].includes(input.sea))throw Error('Отметьте состояние моря.');
 const answers={beach:beach.id,storm:input.storm,visit:input.visit,sea:input.sea,access:input.access===true,daylight:input.daylight===true};
 let state,title,lead;
 if(input.visit<today){state='past';title='Эта дата уже прошла';lead='Памятку можно сохранить. Для нового выхода выберите день прогулки и заново проверьте море.';}
 else if(input.visit>today){state='planned';title='План на '+dateLabel(input.visit);lead='Сохраняем берег и путь обратно. Утром проверьте море и открытый спуск: если волна ещё сильная, оставьте поиск и продолжите день в городе.';}
 else if(input.sea==='rough'){state='wait';title='Берег подождёт';lead='Пока волна сильная, поиск откладываем. Не спускайтесь к воде и не выходите на пирс или волнорез. Прогулка по городу — ваш план Б.';}
 else if(input.sea==='unknown'||!answers.access||!answers.daylight){state='check';title='Сначала проверим условия';lead='Нужны спокойное море, открытый выход и возвращение при дневном свете. Отметьте их перед выходом; дата шторма сама по себе не даёт ответа.';}
 else{state='walk';title='Короткая прогулка по берегу';lead='Условия отмечены вами на сегодня. Начните с доступного сухого участка и развернитесь, если волна усиливается.';}
 const steps=(state==='walk'||state==='planned')?[
  {title:'Выход к морю',text:beach.access},
  {title:'Спокойный осмотр выбросов',text:'Осматривайте водоросли, веточки и ракушки на сухом песке. Не заходите в воду и не раскапывайте берег.'},
  {title:'Обратно тем же путём',text:beach.return}
 ]:[{title:'Проверить предупреждения и прогноз',text:'Посмотрите условия для выбранного берега в день поездки. Если море ещё неспокойно, оставайтесь выше пляжа.'},{title:'Уточнить выход и дорогу назад',text:beach.access+' '+beach.return},{title:'Оставить поиск на спокойное море',text:'Продолжите день в городе или отправляйтесь в Музей янтаря. Не нужно догонять шторм.'}];
 return {version:1,state,title,lead,answers,beach,steps,checked_at:manifest.updated,transfer:beach.transfer===true};
}
export function saveAmberWalk(storage,plan){try{storage.setItem(AMBER_STORAGE_KEY,JSON.stringify({version:1,answers:plan.answers}));return true;}catch{return false;}}
export function loadAmberWalk(storage){try{const saved=JSON.parse(storage.getItem(AMBER_STORAGE_KEY));return saved?.version===1?saved.answers:null;}catch{return null;}}
