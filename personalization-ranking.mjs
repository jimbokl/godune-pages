import {contextualProfile} from './personalization-state.mjs?v=2026101904';
import {rankingCandidate,rankCandidates,validRankingConfig} from './personalization-ranking-state.mjs?v=2026101904';
import {feedbackControls} from './personalization-feedback.mjs?v=2026101904';
import {readSavedTrip} from './trip-memory.mjs?v=2026101902';
import {loadTrip} from './trip-memory-bootstrap.mjs?v=2026101707';

export async function initRanking({catalog,profile,base,getTrip=()=>null}){
  const groups=[...document.querySelectorAll('[data-home-showcase] .showcase-grid,.catalog-walks .catalog-grid')];
  if(!groups.length || !profile)return;
  const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('personalization-ranking.css?v=2026101904',base);document.head.append(style);
  const surfaces=groups.map(group=>{
    const cards=[...group.children].map(node=>{
      let binding;
      try{binding=node.dataset.rankingRoute?{route:node.dataset.rankingRoute}:JSON.parse(node.dataset.rankingCandidate);}catch{}
      const candidate=rankingCandidate(binding,catalog);
      const feedback=feedbackControls({target:{kind:'route',id:binding?.route},label:candidate?.name || node.querySelector('h3,h2')?.textContent || '',catalog,profile});
      if(feedback){
        // Home cards are links. Controls belong outside the link, in the same
        // existing grid item, so pointer and keyboard never activate navigation.
        if(node.matches('a')){
          const item=document.createElement('article');item.className='ranking-feedback-card';
          if(node.classList.contains('showcase-card-featured'))item.classList.add('ranking-feedback-card-featured');
          item.hidden=node.hidden;
          for(const name of ['rankingCandidate','wave'])if(node.dataset[name]!==undefined)item.dataset[name]=node.dataset[name];
          node.before(item);item.append(node,feedback.element);node=item;
        }else (node.querySelector('.catalog-route-copy') || node).append(feedback.element);
      }
      return {node,candidate};
    });
    const controls=document.createElement('details');controls.className='ranking-controls';
    controls.innerHTML='<summary>Порядок прогулок</summary><p data-ranking-status></p><p>Интересы выбранного дня, время, ваши оценки и отметки о посещении помогают упорядочить список. Активность на сайте — слабая подсказка. Погода на порядок не влияет. Все прогулки остаются доступны.</p><button type="button" data-profile-open>Компания и время</button>';
    group.before(controls);controls.querySelector('button').addEventListener('click',profile.open);
    return {group,cards,status:controls.querySelector('[data-ranking-status]')};
  });
  let config=null,revision=0;
  async function render(){
    const ticket=++revision;
    let trip=await readSavedTrip(catalog);
    if(!trip)trip=getTrip();
    if(!trip){let storage;try{storage=localStorage;}catch{}trip=loadTrip(storage,catalog).state;}
    if(ticket!==revision)return;
    const context=contextualProfile(profile.get().record,trip,catalog);
    for(const {group,cards,status} of surfaces){
      const ranked=rankCandidates(cards.map(row=>row.candidate),context,catalog,config);
      const meaningful=ranked.some(row=>row.score!==0 || row.reasons.length);
      status.textContent=!config?'Исходный порядок: настройки подбора не загрузились.':meaningful?'Порядок по подсказкам из этого браузера.':'Исходный порядок: пока нет подходящих подсказок.';
      const active=document.activeElement;
      for(let index=0;index<ranked.length;index++){
        const result=ranked[index],node=cards[result.index].node;
        let reason=node.querySelector('[data-ranking-reason]');
        if(result.reasons.length){
          if(!reason){reason=document.createElement('p');reason.className='ranking-reason';reason.dataset.rankingReason='';(node.querySelector('.showcase-copy,.catalog-route-copy') || node).append(reason);}
          reason.textContent=result.reasons.join(' ');
        }else reason?.remove();
        // Move the existing node only when necessary; links and filter hidden
        // states survive. Restore keyboard focus after a move on older browsers.
        if(group.children[index]!==node)group.insertBefore(node,group.children[index] || null);
      }
      if(active!==document.activeElement && active?.isConnected && group.contains(active))active.focus({preventScroll:true});
      group.dataset.rankingReady='true';group.dataset.rankingConfig=config?'1':'fallback';
    }
    document.documentElement.dataset.rankingReady='true';
  }
  const refresh=()=>render().catch(()=>{});
  profile.subscribe(refresh);
  window.addEventListener('godune:trip-change',refresh);
  window.addEventListener('godune:memory-cleared',refresh);
  window.addEventListener('storage',event=>{if(['godune-trip:v1','godune-memory-clock'].includes(event.key) || event.key===null)refresh();});
  let channel;try{channel=new BroadcastChannel('godune-trip-memory');channel.onmessage=refresh;}catch{}
  window.addEventListener('pageshow',refresh);
  await render();
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4000);
  try{
    const response=await fetch(new URL('data/ranking-weights.json',base),{cache:'no-cache',signal:controller.signal});
    if(response.ok){const value=await response.json();if(validRankingConfig(value))config=value;}
  }catch{/* Static order is already usable, including offline cache misses. */}
  finally{clearTimeout(timer);await render();}
}
