import {railHomeLocations,railHomeInput} from './rail-access.mjs?v=1';
import {railProblem} from './day-journey-view.mjs?v=6';
import {remainingTrip} from './day-progress.mjs?v=2';
import {validRail,railTable,rideSnapshot,resolveRail,saveRail,railContext} from './trip-rail-state.mjs?v=6';
import {planInput} from './trip-schedule-state.mjs?v=16';
import {loadScheduler} from './trip-scheduler.mjs?v=21';
import {loadTripTravelMatrix} from './travel-estimates.mjs?v=9';
import {preferredRailService,railStation} from './rail-destinations.mjs?v=1';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const clock=n=>`${n>=1440?`+${Math.floor(n/1440)} дн. `:''}${String(Math.floor(n/60)%24).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
const messages={changed_station:'Станция направления изменилась. Выберите рейсы и дорогу заново.',unpublished_year:'Расписание на этот год ещё не добавлено. Летние рейсы и «Морской экспресс» проверяем отдельно — осеннее время сюда не подставляем.',choose_date:'Выберите дату, чтобы открыть расписание.',stale_date:'Дата дня изменилась. Выберите электрички заново — прежние рейсы сохранены, но сейчас не меняют день.',missing_service:'Прежнего направления сейчас нет в каталоге. Выберите другое.',outside_validity:'Это расписание не действует на дату поездки.',unknown_timetable:'На эту дату расписание ещё не опубликовано.',cancelled:'В изменении на эту дату указана отмена рейсов.',changed_timetable:'Расписание изменилось. Выберите рейсы заново — прежнее время больше не применяется.'};
export function initTripRail({mount,read,commit,base,catalog}) {
 if(!mount)return {render(){}};
 const panel=mount.querySelector('#trip-rail') || el('section',undefined,'trip-rail');panel.id='trip-rail';panel.setAttribute('aria-labelledby','rail-title');
 panel.innerHTML=`<div class="rail-heading"><div><p class="eyebrow">Море ближе, чем кажется</p><h3 id="rail-title">К морю на электричке</h3><p>До Зеленоградска или Светлогорска — и обратно. Оставьте время на прогулку и дорогу к поезду.</p></div><button class="button button-dark" type="button" data-rail-open>Выбрать электрички</button></div><details class="rail-season"><summary>Летние рейсы и Зеленоградск-2</summary><p>Летом рейсов больше. У «Морского экспресса» своя станция — Зеленоградск-2. Выбирайте её отдельно от центрального вокзала.</p></details><div class="rail-plan"></div><p class="rail-feedback" role="status"></p>`;
 const beachWalk=el('a','От Зеленоградска-2 к пляжу и обратно →','rail-beach-walk');
 beachWalk.href=new URL('routes/zelenogradsk-2-k-moryu/',base).href;
 panel.querySelector('.rail-season p').append(' ',beachWalk);
 mount.insertBefore(panel,mount.querySelector('.trip-schedule, #trip-weather, #trip-utilities'));
 const dialog=el('dialog',undefined,'rail-dialog');dialog.id='rail-dialog';dialog.setAttribute('aria-labelledby','rail-dialog-title');
 dialog.innerHTML=`<form id="rail-form"><div class="rail-dialog-heading"><div><p class="eyebrow">День у моря</p><h3 id="rail-dialog-title">Уехать. Погулять. Вернуться.</h3></div><button type="button" data-rail-close aria-label="Закрыть выбор электричек">×</button></div><div class="rail-fields"></div><div class="rail-station rail-form-note" hidden></div><p class="rail-source"></p><p class="rail-form-note">Выбираете рейсы для своего плана. Это не покупка билета. Время дороги от станции и обратно — ваша оценка; входы и расписание перед поездкой нужно сверить.</p><p class="rail-error" role="alert"></p><div class="rail-dialog-actions"><button type="submit" class="button button-dark">Учитывать в моём дне</button><button type="button" data-rail-close class="button button-light">Вернуться к плану</button></div></form>`;
 document.body.append(dialog);
 const $=s=>dialog.querySelector(s),feedback=t=>panel.querySelector('.rail-feedback').textContent=t;
 let expected,focus,destination,accessMode=false,previousService=null,sequence=0;
 function field(caption,name,type,value){const label=el('label',caption),input=el('input');input.name=name;input.type=type;input.value=value;label.append(input);$('.rail-fields').append(label);return input;}
 function select(caption,name,options,value){const label=el('label'),text=el('span',caption),input=el('select');text.dataset.railCaption=name;label.append(text);input.name=name;for(const [id,title]of options){const o=el('option',title);o.value=id;input.append(o);}if([...input.options].some(o=>o.value===value))input.value=value;label.append(input);$('.rail-fields').append(label);return input;}
 function refreshTable() {
  const table=railTable(catalog,$('[name=service]').value,$('[name=date]').value);
  if(accessMode && previousService && previousService!==table.service?.id)for(const name of ['to_station','from_station'])$(`[name=${name}]`).value='';
  if(!accessMode && destination && destination!==table.service?.to)for(const name of ['after_arrival','before_return'])$(`[name=${name}]`).value='';
  previousService=table.service?.id;
  destination=table.service?.to;
  $('[data-rail-caption=outward]').textContent=`В ${destination||'город у моря'} · отправление → прибытие`;
  $('[data-rail-caption=inbound]').textContent=`В ${table.service?.from||'Калининград'} · отправление → прибытие`;
  const {station,route}=railStation(table.service,catalog),help=$('.rail-station');help.replaceChildren();help.hidden=!station;
  if(station){const link=el('a',`${station.name} · наша карта →`,'rail-beach-walk');link.href=new URL(`poi/${station.slug}/`,base).href;help.append(link,el('p',station.coordinate_note));
   if(route){const walk=el('a','Прогулка от вокзала к морю и обратно →','rail-beach-walk');walk.href=new URL(`routes/${route.slug}/`,base).href;help.append(walk);}}
   for(const direction of ['outward','inbound']) {
   const select=$(`[name=${direction}]`),old=select.value;select.replaceChildren();
   for(const row of table[direction] || []){const ride=rideSnapshot(row),option=el('option',`${row.departure} → ${row.arrival} · ${ride.arrival-ride.departure} мин`);option.value=row.id;select.append(option);}
   if([...select.options].some(o=>o.value===old))select.value=old;
   else if(direction==='inbound'&&select.options.length)select.selectedIndex=select.options.length-1;
   select.disabled=!select.options.length;
  }
  $('.rail-source').replaceChildren();
  if(table.source){const link=el('a',table.source.name);link.href=table.source.url;link.target='_blank';link.rel='noopener';$('.rail-source').append(link,el('span',` · проверено ${table.source.checked_at}`));}
  $('.rail-error').textContent=messages[table.reason] || (table.outward===null || table.inbound===null?messages.unknown_timetable:!table.outward?.length || !table.inbound?.length?messages.cancelled:'');
  $('[type=submit]').disabled=!!$('.rail-error').textContent;
 }
 function open(){
  const trip=read(),saved=trip.schedule?.rail;expected=railContext(trip);focus=document.activeElement;destination=null;previousService=null;accessMode=!!saved?.access;
  $('.rail-fields').replaceChildren();
  const date=field('Дата этого дня','date','date',trip.date||'');date.required=true;
  select('Вокзал Калининграда ↔ станция у моря','service',(catalog.rail_services||[]).map(s=>[s.id,`${s.from.replace(/^Калининград-/, '')} ↔ ${s.to}`]),preferredRailService(trip,catalog));
  select('В Зеленоградск · отправление → прибытие','outward',[],null);select('В Калининград · отправление → прибытие','inbound',[],null);
  let end=trip.places.at(-1);try{end=remainingTrip(trip).places.at(-1);}catch {}
  const returnChanged=trip.schedule?.progress && end!==(trip.schedule.progress.return_from || trip.places.at(-1));
  const returnCaption=trip.schedule?.progress?`Обратно до станции от «${catalog.poi.find(p=>p.slug===end)?.name || end}», мин`:'От конца дня обратно до станции, мин';
  const home=accessMode?railHomeInput(trip,catalog,trip.schedule.start,trip.schedule.end):null;
  const fields=accessMode?[['До вокзала Калининграда, мин','to_station',home?.approach],['После поезда до жилья или конца дня, мин','from_station',home?.return_minutes]]:[['От станции до начала вашего дня, мин','after_arrival',saved?.after_arrival],[returnCaption,'before_return',returnChanged?null:saved?.before_return]];
  fields.push(['Прийти до отправления за, мин','boarding',saved?.boarding??10]);
  for(const [caption,name,value]of fields){const input=field(caption,name,'number',value??'');input.min='0';input.max='1440';input.step='1';if(name==='boarding')input.required=true;}
  refreshTable();for(const direction of ['outward','inbound'])if(saved?.[direction]&&[...$(`[name=${direction}]`).options].some(o=>o.value===saved[direction].id))$(`[name=${direction}]`).value=saved[direction].id;
  dialog.showModal();date.focus();
 }
 const close=()=>{dialog.close();(focus?.isConnected?focus:panel.querySelector('[data-rail-open]')).focus({preventScroll:true});};
 dialog.addEventListener('cancel',e=>{e.preventDefault();close();});dialog.addEventListener('click',e=>{if(e.target.closest('[data-rail-close]'))close();});
 dialog.addEventListener('change',e=>{if(['date','service'].includes(e.target.name))refreshTable();});
 $('#rail-form').addEventListener('submit',async e=>{
  e.preventDefault();const f=new FormData(e.target),table=railTable(catalog,f.get('service'),f.get('date'));
  const outward=table.outward?.find(r=>r.id===f.get('outward')),inbound=table.inbound?.find(r=>r.id===f.get('inbound'));
  if(table.reason||!outward||!inbound){$('.rail-error').textContent='Выберите дату и два рейса из расписания.';return;}
  const number=name=>f.get(name)===''?null:Number(f.get(name));
  const value={service:f.get('service'),date:f.get('date'),outward:rideSnapshot(outward),inbound:rideSnapshot(inbound),after_arrival:accessMode?0:number('after_arrival'),before_return:accessMode?0:number('before_return'),boarding:number('boarding'),...(accessMode?{access:{version:1,station:table.service.arrival_poi,...railHomeLocations(read()),to_station:number('to_station'),from_station:number('from_station')}}:{})};
  if(!validRail(value)){$('.rail-error').textContent='Проверьте целые минуты дороги и запаса на посадку.';return;}
  let stale=false;const button=$('[type=submit]');button.disabled=true;
  try {const outcome=await commit(current=>{if(railContext(current)!==expected){stale=true;return current;}return saveRail({...current,date:value.date,month:Number(value.date.slice(5,7))},value);},'Электрички сохранены в вашем дне.');
   if(stale||outcome?.conflict){$('.rail-error').textContent='День изменился в другой вкладке. Закройте форму и откройте её заново.';return;}close();feedback(outcome?.saved?'Два рейса сохранены. Время прогулки пересчитано.':'Выбор рейсов остался в этой вкладке. Браузер не разрешил сохранение — скачайте файл поездки, чтобы забрать его с собой.');
  }catch{$('.rail-error').textContent='Не получилось записать выбор рейсов. Попробуйте ещё раз или скачайте файл поездки.';
  }finally{button.disabled=false;}
 });
 panel.addEventListener('click',async e=>{
  if(e.target.closest('[data-rail-open]'))return open();
  if(e.target.closest('[data-rail-remove]')){const context=railContext(read());let stale=false;const outcome=await commit(current=>{if(railContext(current)!==context){stale=true;return current;}return saveRail(current,null);},'Электрички убраны из расчёта.');feedback(stale||outcome?.conflict?'День уже изменился. Проверьте свежую версию.':outcome?.saved?'Ручное время дня снова действует без электричек.':'Электрички убраны в этой вкладке. Браузер не разрешил сохранение — скачайте файл поездки.');panel.querySelector('[data-rail-open]').focus({preventScroll:true});}
 });
 async function render(){
  const ticket=++sequence,trip=read(),resolved=resolveRail(trip,catalog),body=panel.querySelector('.rail-plan');body.replaceChildren();panel.dataset.railReady='true';
  panel.querySelector('[data-rail-open]').textContent=resolved?'Изменить электрички':'Выбрать электрички';
  if(!resolved){panel.dataset.railState='empty';body.append(el('p','Сначала выберите рейсы. Прогулку можно собрать следом.','rail-empty'));return;}
  const strip=el('div',undefined,'rail-rides');
  for(const [direction,caption]of [['outward','К морю'],['inbound','Домой']]){const ride=resolved.saved[direction],card=el('div',undefined,'rail-ride');card.append(el('span',caption,'eyebrow'),el('strong',`${clock(ride.departure)} → ${clock(ride.arrival)}`),el('span',direction==='outward'?`${resolved.service?.from||'Калининград'} → ${resolved.service?.to||'Станция у моря'}`:`${resolved.service?.to||'Станция у моря'} → ${resolved.service?.from||'Калининград'}`));strip.append(card);}body.append(strip);
  const status=el('p',undefined,'rail-result');status.setAttribute('role','status');body.append(status);
  const remove=el('button','Убрать электрички из расчёта','rail-remove');remove.type='button';remove.dataset.railRemove='true';body.append(remove);
  const evidence=el('p',undefined,'rail-evidence');if(resolved.source){const link=el('a',resolved.source.name);link.href=resolved.source.url;link.target='_blank';link.rel='noopener';evidence.append(link,el('span',` · проверено ${resolved.source.checked_at}`));}body.append(evidence);
  body.append(el('p',resolved.service?.note||'Расписание перед поездкой нужно сверить.','rail-evidence'));
  if(!resolved.input){panel.dataset.railState=resolved.reason;status.textContent=messages[resolved.reason];return;}
  panel.dataset.railReady='false';status.textContent='Сверяем рейсы с вашим днём…';
  try {const [calculate,matrix]=await Promise.all([loadScheduler(base),loadTripTravelMatrix(base,trip,catalog).catch(()=>null)]);if(ticket!==sequence)return;
   const result=calculate(planInput(trip,catalog,matrix)),rail=result.rail;panel.dataset.railState=rail.state;
   const window=el('p',undefined,'rail-window');window.textContent=`Начало прогулки не раньше ${clock(rail.earliest_start)}${rail.itinerary_start===null?' · путь от станции ещё не задан':''}. ${rail.itinerary_deadline===null?'Для возвращения задайте путь до станции.':`Закончить до ${clock(rail.itinerary_deadline)} с вашим запасом на посадку.`}`;status.before(window);
   status.textContent=rail.home?railProblem(rail):rail.state==='no_time'?'Между этими рейсами не осталось времени на день. Выберите другое отправление или возвращение.':rail.state==='missed'?`На выбранный обратный поезд не успеваете: как минимум ${rail.missed_by} мин после нужного времени. Уберите остановку, сократите паузу или выберите более поздний рейс.`:rail.state==='incomplete'?'Возвращение пока нельзя подтвердить по плану. Заполните путь от станции и обратно, затем проверьте неизвестные участки дня.':`По вашим оценкам, до посадки остаётся ${rail.wait} мин после дороги и запаса. Расписание и билеты перед выездом нужно сверить.`;
  }catch(error){if(ticket!==sequence)return;panel.dataset.railState='error';status.textContent=error.message==='arrival_after_day'?'Записанное прибытие позже конца дня. Сначала проверьте время дня.':'Расчёт пока не открылся. Рейсы сохранены; попробуйте ещё раз.';}finally{if(ticket===sequence)panel.dataset.railReady='true';}
 }
 return {render};
}
