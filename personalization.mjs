import {createProfileMemory} from './personalization-memory.mjs?v=2026101901';
import {pageContext,eventContext} from './personalization-state.mjs?v=2026101901';

export async function initPersonalization(catalog,base){
  const memory=createProfileMemory(catalog),page=pageContext(location.pathname,catalog);
  const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('personalization.css?v=2026101901',base);document.head.append(style);
  const dialog=document.createElement('dialog');dialog.className='context-profile';dialog.setAttribute('aria-labelledby','context-profile-title');
  dialog.innerHTML=`<form><div class="context-profile-heading"><h2 id="context-profile-title">Какой у вас день?</h2><button type="button" data-profile-close aria-label="Закрыть">×</button></div>
    <p>Ответы и действия остаются в этом браузере. Они не отправляются на сервер и не меняют вашу поездку.</p>
    <details><summary>Что хранится</summary><p>Ответы на два вопроса и до 200 последних просмотров мест и сохранений за 30 дней. Просмотр страницы не означает, что вы побывали в этом месте.</p></details>
    <label>С кем вы?<select name="travel_party"><option value="unknown">Пока не знаю</option><option value="solo">Один / одна</option><option value="couple">Вдвоём</option><option value="family">С семьёй</option><option value="friends">С друзьями</option></select></label>
    <label>Сколько у вас времени?<select name="time_budget_hours"><option value="">Пока не знаю</option><option value="1">Около часа</option><option value="2">Около двух часов</option><option value="4">Полдня</option><option value="8">Целый день</option></select></label>
    <p data-profile-status role="status"></p><div class="context-profile-actions"><button class="button" type="submit">Сохранить ответы</button><button type="button" data-profile-skip>Пока пропустить</button></div>
    <button type="button" class="context-profile-reset" data-profile-reset>Сбросить профиль и журнал</button></form>`;
  document.body.append(dialog);
  const form=dialog.querySelector('form'),status=dialog.querySelector('[data-profile-status]');
  let baseline,returnFocus,busy=false;
  const control=key=>form.elements.namedItem(key);
  const statusText=result=>result.conflict?'Профиль сбросили в другой вкладке. Откройте ответы заново.':result.saved?'Ответы сохранены в этом браузере.':result.issue==='damaged'?'Прежний профиль не удалось прочитать. Он сохранён без изменений; сбросить его можно кнопкой ниже.':'Браузер не разрешил сохранение. Ответы останутся только в этой вкладке.';
  const entry=document.createElement('button');entry.type='button';entry.className='context-profile-entry';entry.dataset.profileOpen='';entry.textContent='Компания и время';
  document.querySelector('.wizard-page-intro')?.append(entry);
  function open(){
    if(dialog.open)return;
    baseline=memory.get().record;returnFocus=document.activeElement;
    control('travel_party').value=baseline.travel_party;control('time_budget_hours').value=baseline.time_budget_hours ?? '';
    status.textContent=memory.get().issue?statusText(memory.get()):'';
    dialog.showModal();
  }
  entry.addEventListener('click',open);
  dialog.addEventListener('close',()=>{if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});});
  async function act(action,{close=false}={}){
    if(busy)return;busy=true;
    for(const button of form.querySelectorAll('button'))button.disabled=true;
    try{
      const result=await memory.change(action,{generation:baseline.generation});status.textContent=statusText(result);
      if(close && (action.type==='dismiss' || result.saved && !result.conflict))dialog.close();
    }finally{busy=false;for(const button of form.querySelectorAll('button'))button.disabled=false;}
  }
  const dismiss=()=>act({type:'dismiss'},{close:true});
  dialog.querySelector('[data-profile-close]').addEventListener('click',dismiss);
  dialog.querySelector('[data-profile-skip]').addEventListener('click',dismiss);
  dialog.addEventListener('cancel',event=>{event.preventDefault();dismiss();});
  form.addEventListener('submit',event=>{
    event.preventDefault();const values={travel_party:control('travel_party').value,time_budget_hours:control('time_budget_hours').value===''?null:Number(control('time_budget_hours').value)};
    const patch=Object.fromEntries(Object.entries(values).filter(([key,value])=>value!==baseline[key]));
    act({type:'answers',patch},{close:true});
  });
  dialog.querySelector('[data-profile-reset]').addEventListener('click',()=>act({type:'reset'},{close:true}));
  memory.subscribe(result=>{
    if(dialog.open && baseline?.generation!==result.record.generation){
      // Do not silently submit answers typed before a reset in another tab.
      status.textContent='Профиль сбросили в другой вкладке. Закройте этот блок и откройте ответы заново.';
    }
  });
  await memory.ready;
  await memory.change({type:'seen'});
  if(page.kind==='place' && document.body.dataset.poi===page.id)await recordEvents([{type:'place_view',entity_id:page.id}]);
  const first=()=>{
    if(memory.get().record.onboarding!=='pending')return;
    if(document.querySelector('dialog[open]')){document.addEventListener('close',first,{once:true,capture:true});return;}
    open();
  };
  first();
  function recordEvents(events){
    const now=Date.now(),context=eventContext(page,now);
    return memory.change({type:'events',events:events.map(event=>({...event,id:crypto.randomUUID(),timestamp:new Date(now).toISOString(),context}))});
  }
  document.documentElement.dataset.profileReady='true';
  return {recordEvents};
}
