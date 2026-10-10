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
// The server renders an open native disclosure so every destination also works without JS.
export function mountDossierNavigation(doc = globalThis.document, win = globalThis) {
  const nav = doc?.querySelector('[data-section-nav]');
  if (!nav || !win.matchMedia) return;
  const compact = win.matchMedia('(max-width: 760px)');
  const sync = () => { nav.open = !compact.matches; };
  sync();
  compact.addEventListener('change', sync);
  nav.addEventListener('toggle', () => { if (!compact.matches) nav.open = true; });
  nav.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !compact.matches || !nav.open) return;
    nav.open = false;
    nav.querySelector('summary')?.focus();
    event.preventDefault();
  });
}
if (globalThis.document) {
  mountDossierNavigation();
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
