export function initShowcase() {
  const section=document.querySelector('[data-home-showcase]');
  if(!section)return;
  const buttons=[...section.querySelectorAll('[data-wave-filter]')];
  section.querySelector('.showcase-filters').hidden=false;
  for(const button of buttons)button.addEventListener('click',()=>{
    const wave=button.dataset.waveFilter;
    const cards=[...section.querySelector('.showcase-grid').children];
    for(const card of cards){
      card.hidden=wave!=='all' && card.dataset.wave!==wave;
      const link=card.querySelector('.showcase-card');if(link)link.hidden=card.hidden;
    }
    for(const control of buttons)control.setAttribute('aria-pressed',String(control===button));
    section.querySelector('[data-showcase-count]').textContent=`Прогулок: ${cards.filter(card=>!card.hidden).length}`;
  });
}
