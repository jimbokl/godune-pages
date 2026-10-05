export function initShowcase() {
  const section=document.querySelector('[data-home-showcase]');
  if(!section)return;
  const buttons=[...section.querySelectorAll('[data-wave-filter]')];
  const cards=[...section.querySelectorAll('[data-wave]')];
  section.querySelector('.showcase-filters').hidden=false;
  for(const button of buttons)button.addEventListener('click',()=>{
    const wave=button.dataset.waveFilter;
    for(const card of cards)card.hidden=wave!=='all' && card.dataset.wave!==wave;
    for(const control of buttons)control.setAttribute('aria-pressed',String(control===button));
    section.querySelector('[data-showcase-count]').textContent=`Прогулок: ${cards.filter(card=>!card.hidden).length}`;
  });
}
