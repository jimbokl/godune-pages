// Native disclosures work without JavaScript. Deep links reveal the referenced fact.
export function revealDossierHash(doc = globalThis.document, hash = globalThis.location?.hash) {
  if (!doc || !hash || hash === '#') return false;
  let id; try { id = decodeURIComponent(hash.slice(1)); } catch { return false; }
  const target = doc.getElementById(id);
  if (!target || !target.closest('.dossier-page')) return false;
  let detail = target.matches('details') ? target : target.querySelector('.dossier-record');
  if (detail) detail.open = true;
  for (let parent = target.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true;
  target.scrollIntoView({block: 'start'});
  return true;
}
if (globalThis.document) {
  const nav = document.querySelector('.dossier-page .business-nav');
  const current = nav?.querySelector('[aria-current="page"]');
  if (current && nav.scrollWidth > nav.clientWidth) {
    nav.scrollLeft += current.getBoundingClientRect().left - nav.getBoundingClientRect().left - (nav.clientWidth - current.offsetWidth) / 2;
  }
  revealDossierHash();
  globalThis.addEventListener('hashchange', () => revealDossierHash());
  // Clicking the current anchor again should also reveal a manually closed record.
  document.addEventListener('click', event => {
    const a = event.target.closest?.('a[href*="#"]');
    if (!a) return;
    const url = new URL(a.href, location.href);
    if (url.pathname === location.pathname && url.search === location.search && url.hash === location.hash) revealDossierHash(document, url.hash);
  });
}
