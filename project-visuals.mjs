// Progressive enhancement: every preview and source remains a normal link.
const dialog = document.querySelector('[data-document-dialog]');
if (dialog && typeof dialog.showModal === 'function') {
  const title = dialog.querySelector('h2');
  const image = dialog.querySelector('[data-document-large]');
  const pdf = dialog.querySelector('[data-document-pdf]');
  const source = dialog.querySelector('[data-document-source]');
  document.querySelectorAll('[data-document-preview]').forEach(link => {
    link.addEventListener('click', event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      title.textContent = link.dataset.title;
      image.src = link.href;
      image.alt = link.querySelector('img').alt;
      pdf.href = link.dataset.pdf;
      source.href = link.dataset.source;
      source.title = link.dataset.sourceTitle;
      dialog.showModal();
      event.preventDefault();
    });
  });
  dialog.querySelector('[data-document-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
  dialog.addEventListener('close', () => image.removeAttribute('src'));
}
function revealMap() {
  if (location.hash === '#phase-map') document.querySelector('#phase-map')?.setAttribute('open', '');
}
revealMap();
addEventListener('hashchange', revealMap);
