import {saveStay,stayTarget,staySettings,stayGuideTrip,stayProfile} from './planned-stay-state.mjs?v=2026101402';
import {plannerDayUrl} from './trip-day-link.mjs?v=2026101305';
import {partyLabel} from './trip-party.mjs?v=2026101305';

export function initCoastalWeekend({workshop,base,catalog}){
  const root=document.querySelector('[data-coastal-weekend]'),form=root.querySelector('[data-weekend-settings]'),save=root.querySelector('[data-weekend-save]'),pdf=root.querySelector('[data-weekend-booklet]'),status=root.querySelector('[data-weekend-status]'),context=root.querySelector('[data-weekend-context]');
  const profile=stayProfile(catalog,root.dataset.itinerary||'zelenogradsk-two-days'),count=profile.recipes.length;
  const countText=count===2?'два дня':`${count} дня`,savedText=count===2?'Два дня сохранены ✓':`${count} дня сохранены ✓`,allText=count===2?'Оба дня':'Все три дня';
  const title=root.querySelector('h1').innerText.replace(/\s+/g,' ').trim();
  const params=new URL(location.href).searchParams;
  let ids=params.has('trip-days')?params.get('trip-days').split(','):null,busy=false;
  const changed=new Set();
  const panels=[...root.querySelectorAll('.weekend-panel')],cards=panels.map(panel=>new Map([...panel.querySelectorAll('[data-weekend-poi]')].map(card=>[card.dataset.weekendPoi,card.cloneNode(true)])));
  const originalPlaces=cards.map(set=>[...set.keys()]);
  function updateDay(day,index){
    const panel=panels[index],list=panel.querySelector('ol');
    const same=JSON.stringify(day.places)===JSON.stringify(originalPlaces[index]);
    const heading=(day.name||`День ${index+1}`).replace(/^[^·]+ · /,'');
    panel.querySelector('h2').textContent=heading.charAt(0).toLocaleUpperCase('ru')+heading.slice(1);
    if(!same)panel.querySelector('.weekend-day-intro').textContent='Ваш сохранённый день. Остановки и порядок — из «Моего дня».';
    panel.querySelector('[data-weekend-duration]').textContent=`${day.places.length} ${day.places.length===1?'остановка':day.places.length<5?'остановки':'остановок'}`;
    const nodes=day.places.map((id,i)=>{
      let card=cards[index].get(id)?.cloneNode(true);
      if(!card){
        card=document.createElement('li');card.dataset.weekendPoi=id;
        card.innerHTML='<span class="fish-number" aria-hidden="true"></span><details class="weekend-stop"><summary><span class="weekend-stop-copy"><span class="weekend-role">В вашем плане</span><h3></h3><span class="weekend-stop-meta"></span></span><span class="weekend-chevron" aria-hidden="true">⌄</span></summary><div class="weekend-stop-body"><div class="weekend-stop-links"><a>О месте →</a></div></div></details>';
        card.querySelector('h3').textContent=catalog.poi.find(p=>p.slug===id)?.name||id;
        card.querySelector('a').href=new URL(`poi/${encodeURIComponent(id)}/`,base).href;
      }
      card.querySelector('.fish-number').textContent=i+1;
      const stop=day.schedule.stops[id];
      card.querySelector('.weekend-stop-meta').textContent=`◷ ${stop?.visit??30} мин${stop?.visit_scope==='outside'?' · снаружи':''}`;
      const previous=list.querySelector(`[data-weekend-poi="${id}"] details`);
      if(previous)card.querySelector('details').open=previous.open;
      return card;
    });
    list.replaceChildren(...nodes);
  }
  const dateLabel=value=>value?new Intl.DateTimeFormat('ru',{day:'numeric',month:'long'}).format(new Date(value+'T12:00:00Z')):'Дата не выбрана';
  const enabled=value=>{for(const el of [save,pdf,...form.elements])el.disabled=!value;};
  function remember(value){ids=value;changed.clear();const url=new URL(location.href);url.searchParams.set('trip-days',ids.join(','));history.replaceState(history.state,'',url);}
  function selectDay(index,{focus=false}={}){
    root.querySelectorAll('[data-weekend-tab]').forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1;if(focus&&i===index)tab.focus();});
    root.querySelectorAll('.weekend-panel').forEach((panel,i)=>panel.hidden=i!==index);
    if(ids)for(const link of root.querySelectorAll('[data-weekend-open],[data-weekend-edit]'))link.href=plannerDayUrl(base,ids[index]).href;
  }
  function sync(){
    if(busy)return;
    const target=stayTarget(workshop.getState(),profile,ids);
    if(target?.state==='missing'){
      enabled(false);save.textContent='Дни не найдены';context.textContent='Один из этих дней удалён. Откройте свою поездку или начните новый план.';
      status.replaceChildren(document.createTextNode('Ссылка больше не ведёт ко всей поездке. '));const reset=document.createElement('button');reset.type='button';reset.textContent=`Создать новые ${countText}`;reset.className='button button-outline';reset.onclick=()=>{ids=null;const url=new URL(location.href);url.searchParams.delete('trip-days');history.replaceState(history.state,'',url);status.textContent='';sync();};status.append(reset);return;
    }
    enabled(true);
    if(target){
      if(ids===null)remember(target.days.map(d=>d.id));
      const settings=staySettings(target.days);
      if(!changed.has('date'))form.elements.date.value=settings.date||'';
      if(!changed.has('time'))form.elements.time.value=settings.time;
      if(!changed.has('party')){form.elements.adults.value=settings.party.adults;form.elements.children.value=settings.party.children;}
      if(!changed.has('pace'))form.elements.pace.value=settings.pace;
      save.textContent=changed.size?'Сохранить изменения →':savedText;
      context.textContent=`${dateLabel(target.days[0].date)} — ${dateLabel(target.days.at(-1).date)} · ${partyLabel(settings.party)}. Изменения из «Моего дня» сохранены.`;
      target.days.forEach((day,index)=>{
        updateDay(day,index);
        root.querySelector(`[data-weekend-date="${index}"]`).textContent=`День ${index+1} · ${dateLabel(day.date)}`;
        const preview=root.querySelector(`[data-weekend-jump="${index}"]`);
        preview.querySelector('strong').textContent=day.name||`День ${index+1}`;
        preview.querySelector('small').textContent=`${dateLabel(day.date)} · `+day.places.map(id=>catalog.poi.find(p=>p.slug===id)?.name||id).join(' · ');
      });
    }else{
      save.textContent=`Сохранить ${countText} →`;
      if(!form.elements.date.value){const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Kaliningrad'});form.elements.date.value=today;}
    }
    selectDay(Number(root.querySelector('[role=tab][aria-selected=true]').dataset.weekendTab));
  }
  const settings=()=>({ids,date:form.elements.date.value||null,time:form.elements.time.value,party:{version:1,adults:Number(form.elements.adults.value),children:Number(form.elements.children.value)},pace:form.elements.pace.value,fields:[...changed]});
  async function persist(){
    let pair;const result=await workshop.setState(current=>{const value=saveStay(current,catalog,profile,settings());pair=value.ids;return value.trip;},`${title}: ${countText} сохранены.`);
    if(result.conflict)throw Error('weekend_conflict');remember(pair);return result;
  }
  async function submit(){if(busy||!form.reportValidity())return;busy=true;enabled(false);try{const result=await persist();status.textContent=result.saved?'Готово. Добавьте блюда, жильё и заметки в «Моём дне» или скачайте буклет.':'План открыт в этой вкладке. Скачайте PDF, чтобы взять его с собой.';}catch(error){status.textContent=error.message==='weekend_missing'?'Один из дней удалён. Создайте новый план.':'Не удалось сохранить поездку. Проверьте даты и попробуйте ещё раз.';}finally{busy=false;sync();}}
  save.onclick=event=>{event.preventDefault();submit();};form.onsubmit=event=>{event.preventDefault();submit();};form.oninput=event=>{changed.add(['adults','children'].includes(event.target.name)?'party':event.target.name);save.textContent=ids?'Сохранить изменения →':`Сохранить ${countText} →`;};
  root.querySelectorAll('[data-weekend-tab]').forEach(tab=>{tab.onclick=()=>selectDay(Number(tab.dataset.weekendTab));tab.onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();selectDay(event.key==='Home'?0:event.key==='End'?count-1:(Number(tab.dataset.weekendTab)+(event.key==='ArrowRight'?1:count-1))%count,{focus:true});}};});
  root.querySelectorAll('[data-weekend-jump]').forEach(link=>link.onclick=event=>{event.preventDefault();selectDay(Number(link.dataset.weekendJump));root.querySelector('.weekend-tabs').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});});
  pdf.onclick=async()=>{
    if(busy||!form.reportValidity())return;busy=true;enabled(false);pdf.textContent='Собираем поездку…';
    try{
      if(!ids||changed.size)await persist();
      const current=workshop.getState(),signature=JSON.stringify(current),trip=stayGuideTrip(current,catalog,profile,ids);
      const {downloadPersonalGuide}=await import('./trip-guide-ui.mjs?v=2026101402');
      const result=await downloadPersonalGuide({trip,catalog,base,scope:'trip',format:root.querySelector('[data-weekend-format]').value,title,onProgress:text=>{status.textContent=text;},stillCurrent:()=>JSON.stringify(workshop.getState())===signature});
      status.textContent=`Ваш PDF готов: ${result.pages} стр. ${allText} — в одном файле в загрузках.`;
    }catch(error){console.error('coastal-weekend/pdf',error);status.textContent=error.message==='guide_trip_changed'?'Поездка изменилась во время сборки. Скачайте свежий буклет.':error.message==='weekend_missing'?'Один из дней удалён. Создайте новый план.':'PDF пока не собрался. Попробуйте ещё раз.';}
    finally{busy=false;pdf.textContent='Скачать личный PDF ↓';sync();}
  };
  window.addEventListener('godune:trip-change',sync);sync();
}
