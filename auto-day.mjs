import {DEFAULT_AUTO_CONFIG,validAutoConfig,applyAutoDay} from './auto-day-state.mjs?v=2026101903';
import {validRankingConfig} from './personalization-ranking-state.mjs?v=2026101902';
import {assembleAutoDay} from './auto-day-service.mjs?v=2026101903';
import {emptyProfile} from './personalization-state.mjs?v=2026101901';
import {loadScheduler} from './trip-scheduler.mjs?v=2026101707';
import {loadTripTravelMatrix,loadTravelMatrix} from './travel-estimates.mjs?v=2026101305';
import {planTravel} from './trip-schedule-state.mjs?v=2026101305';
import {assessSchedule} from './day-readiness.mjs?v=2026101305';
import {assessPreferenceChoice,DAY_INTERESTS} from './day-preferences.mjs?v=2026101305';
import {placePath} from './place-path.mjs?v=2026101406';
const bounded=(promise,ms,fallback)=>{let timer;return Promise.race([promise,new Promise(resolve=>{timer=setTimeout(()=>resolve(fallback),ms);})]).finally(()=>clearTimeout(timer));};
const clock=value=>value===null || value===undefined?'Время уточняется':`${String(Math.floor(value/60)%24).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;
export function initAutoDay({mount,workshop,catalog,base,profileReady}){
  if(!mount)return;
  const node=(tag,text,className)=>{const result=document.createElement(tag);if(text!==undefined)result.textContent=text;if(className)result.className=className;return result;};
  const status=mount.querySelector('[data-auto-status]'),output=mount.querySelector('[data-auto-output]'),generate=mount.querySelector('[data-auto-generate]');
  const style=node('link');style.rel='stylesheet';style.href=new URL('auto-day.css?v=2026101903',base);document.head.append(style);
  let proposal=null,sequence=0,busy=false,revision,attempt,config=DEFAULT_AUTO_CONFIG,weather=null,ranking=null,engine;
  const json=async path=>{try{const response=await fetch(new URL(path,base),{signal:AbortSignal.timeout(1000)});return response.ok?await response.json():null;}catch{return null;}};
  const assets=Promise.all([json('data/auto-day-config.json').then(value=>{if(validAutoConfig(value))config=value;}),json('data/live-weather.json').then(value=>{weather=value;}),json('data/ranking-weights.json').then(value=>{if(validRankingConfig(value))ranking=value;}),loadTravelMatrix(base).catch(()=>null)]);
  const ready=loadScheduler(base).then(value=>{engine=value;generate.disabled=false;mount.dataset.autoReady='true';}).catch(()=>{status.textContent='Расчёт пока не загрузился. Попробуйте обновить страницу или выберите готовый день ниже.';mount.dataset.autoReady='error';});
  function invalidate(){
    if(!proposal || revision===workshop.getRevision())return;
    mount.querySelector('[data-auto-save]')?.setAttribute('disabled','');status.textContent='Поездка изменилась. Соберите предложение заново.';
  }
  function clear(){sequence++;proposal=null;output.replaceChildren();status.textContent='Предложение закрыто. Ваша поездка сохранена как была.';workshop.progress?.action(attempt,'refused',{reason:'cancelled'});generate.focus();}
  function render(){
    const {schedule,trip}=proposal,route=proposal.route,backup=catalog.poi.find(row=>row.slug===proposal.autoPlan.backup),list=node('ol',undefined,'auto-day-timeline');
    const heading=node('h3',`Часть прогулки «${route.name}»`);heading.tabIndex=-1;
    for(const id of trip.places){
      const point=catalog.poi.find(row=>row.slug===id),row=schedule.stops.find(row=>row.id===id),li=node('li'),copy=node('div');li.dataset.autoStop=id;
      const link=node('a',point.name);link.href=new URL(placePath(catalog,id),base);copy.append(link);
      const travel=planTravel(trip,id,catalog,proposal.matrix).travel;
      copy.append(node('p',travel.minutes===null?'Переход: время неизвестно.':['same_place','start'].includes(travel.origin)?'Начало у этой остановки.':`Переход: около ${travel.minutes} мин, оценка по карте.`));
      copy.append(node('p',`${clock(row?.begins)} — ${clock(row?.leaves)}${row?.begins===null?' · время зависит от неизвестной дороги':''}`));
      li.append(node('span',clock(row?.begins),'auto-day-time'),copy);list.append(li);
    }
    const matched=assessPreferenceChoice({places:trip.places},catalog,{version:1,interests:proposal.context.profile.interests,needs:[]}).matched;
    const why=matched.length?`В прогулке есть ${matched.map(id=>DAY_INTERESTS[id].toLocaleLowerCase('ru')).join(', ')} из интересов выбранного дня.`:proposal.context.profile.travel_party==='family'?'Для семьи оставили время на паузы и точки одной прогулки.':'Выбрали точки одной прогулки в заданном окне дня.';
    const reason=node('p',`Почему так: ${why}`);reason.dataset.autoReason='';
    const weatherText=proposal.weatherStatus==='fresh'?'Учтён свежий прогноз для этого города и сегодняшней даты.':proposal.weatherStatus==='stale'?'Прогноз для этого города устарел; дождь пока не учитываем.':'Свежего прогноза для места и даты нет; погода неизвестна.';
    const limits=node('p',`${weatherText} Это расчёт прогулки: часы входа и проход нужно сверить. Дорога от жилья и обратно не рассчитана.`);
    const date=node('p',`${new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(proposal.context.date+'T12:00:00Z'))} · ${clock(proposal.context.start)}–${clock(proposal.context.end)} · пешком`);date.dataset.autoDate='';
    mount.dataset.autoSource=proposal.source;mount.dataset.autoLlm=proposal.llm;
    const backupNote=node('p',`Запасной вариант: ${backup.name}. Можно рассмотреть, если основной путь не подойдёт; укрытие от дождя не подтверждено. Вход, часы и дорогу нужно проверить.`);backupNote.dataset.autoBackup=backup.slug;
    const backupLink=node('a','Открыть запасное место →');backupLink.href=new URL(placePath(catalog,backup.slug),base);backupNote.append(' ',backupLink);
    const controls=node('div',undefined,'auto-day-actions'),save=node('button',proposal.placement==='separate'?'Добавить отдельный день':'Сохранить день в поездке','wizard-primary'),rebuild=node('button','Перестроить','wizard-secondary'),cancel=node('button','Закрыть предложение','wizard-secondary');
    save.type=rebuild.type=cancel.type='button';save.dataset.autoSave='';rebuild.dataset.autoRain='';cancel.dataset.autoCancel='';
    save.addEventListener('click',saveDay);rebuild.addEventListener('click',()=>run(true));cancel.addEventListener('click',clear);
    const rain=node('div');rain.append(node('p','Что если дождь'),rebuild);controls.append(save,cancel);
    output.replaceChildren(heading,date,reason,list,backupNote,rain,limits,controls);heading.focus({preventScroll:true});invalidate();
  }
  async function run(rain=false){
    if(busy)return;const rainTarget=rain?proposal?.autoPlan.backup:null;busy=true;generate.disabled=true;const ticket=++sequence;proposal=null;output.replaceChildren();mount.setAttribute('aria-busy','true');status.textContent='Собираем остановки и проверяем время…';const started=performance.now();
    attempt ||= workshop.progress?.begin('wizard');workshop.progress?.action(attempt,'selected');
    try{
      await ready;await bounded(assets,1000,null);
      if(!engine)throw Error('auto_engine');
      const current=workshop.getState();revision=workshop.getRevision();
      const profile=await bounded(profileReady,250,null),record=profile?.get().record || emptyProfile();
      const result=await assembleAutoDay({current,record,catalog,base,calculate:engine,loadMatrix:trip=>loadTripTravelMatrix(base,trip,catalog),config,weather,rain,rainTarget,ranking,deadline:Math.max(100,4200-(performance.now()-started))});
      if(ticket!==sequence)return;proposal=result;render();mount.dataset.autoElapsed=String(Math.round(performance.now()-started));mount.dataset.autoState='preview';status.textContent=rain?'Включили запасное место в прогулку из двух остановок. Вход и часы проверьте перед выходом.':'Предложение готово. До сохранения поездка остаётся как была.';invalidate();
      workshop.progress?.action(attempt,'calculated');
    }catch{if(ticket===sequence){mount.dataset.autoState='unavailable';status.textContent='Не удалось подобрать день в этом окне. Измените время или выберите прогулку ниже.';workshop.progress?.action(attempt,'failed',{reason:'calculation'});}}
    finally{busy=false;generate.disabled=!engine;mount.removeAttribute('aria-busy');if(ticket===sequence && mount.dataset.autoState==='unavailable')generate.focus();}
  }
  async function saveDay(){
    if(busy || !proposal)return;busy=true;const save=mount.querySelector('[data-auto-save]');save.disabled=true;let intent;
    try{
      const result=await workshop.setState(current=>{intent=applyAutoDay(current,proposal,catalog);return intent.state;},'Предложенный день сохранён в поездке.',{expectedRevision:revision});
      if(result.conflict || !intent?.applied){status.textContent='Поездка изменилась. Соберите предложение заново.';workshop.progress?.action(attempt,'refused',{reason:'stale'});return;}
      status.textContent=result.saved?'День сохранён в поездке. Его можно изменить и скачать вместе с остальными днями.':'День остался в этой вкладке. Скачайте файл поездки, чтобы не потерять его.';
      const readiness=assessSchedule(proposal.schedule);
      output.replaceChildren();const link=node('a','Открыть день и скачать поездку →');link.href=new URL('travel/',base);output.append(link);proposal=null;
      document.dispatchEvent(new CustomEvent('godune:day-ready',{detail:{saved:result.saved}}));link.focus();mount.dataset.autoState='saved';
      if(result.saved)document.dispatchEvent(new CustomEvent('godune:useful-action',{detail:'plan_saved'}));
      await workshop.progress?.saved(attempt,readiness,result.saved,{trip:workshop.getState()});attempt=null;
    }catch{status.textContent='Не удалось сохранить день. Предложение осталось здесь — попробуйте ещё раз.';save.disabled=false;}
    finally{busy=false;}
  }
  generate.addEventListener('click',()=>run());window.addEventListener('godune:trip-change',invalidate);window.addEventListener('godune:memory-cleared',invalidate);
}
