const key = route => `godune-walk:${route}`;

function validStops(values, stopIds) {
  const known = new Set(stopIds);
  return Array.isArray(values) ? [...new Set(values.filter(value => typeof value === 'string' && known.has(value)))] : [];
}

export function loadWalkProgress(storage, route, stopIds) {
  try {
    const raw = storage.getItem(key(route));
    if (!raw) return {completed: [], available: true};
    let record;
    try { record = JSON.parse(raw); } catch { return {completed: [], available: true}; }
    return {completed: record?.version === 1 ? validStops(record.completed, stopIds) : [], available: true};
  } catch { return {completed: [], available: false}; }
}

export function saveWalkProgress(storage, route, completed, stopIds) {
  try {
    storage.setItem(key(route), JSON.stringify({version: 1, completed: validStops(completed, stopIds)}));
    return true;
  } catch { return false; }
}

export function initWalk() {
  const route = document.body.dataset.route;
  const checks = [...document.querySelectorAll('[data-step-check]')];
  if (!route || !checks.length) return;
  const stopIds = checks.map(input => input.dataset.poi);
  let storage;
  try { storage = window.localStorage; } catch { storage = null; }
  const restored = loadWalkProgress(storage, route, stopIds);
  checks.forEach(input => { input.checked = restored.completed.includes(input.dataset.poi); });
  const notice = document.querySelector('#walk-storage');
  function storageNotice(available) {
    notice.hidden = available;
    notice.textContent = available ? '' : 'Отметки останутся только до закрытия этой страницы: браузер не разрешил сохранение.';
  }
  function refresh() {
    const count = checks.filter(input => input.checked).length;
    document.querySelector('#walk-progress').textContent = `Пройдено остановок: ${count} из ${checks.length}`;
    document.querySelector('#walk-progress-bar').value = count;
    checks.forEach(input => input.closest('li').classList.toggle('is-complete', input.checked));
    const next = checks.find(input => !input.checked);
    const nextLabel = document.querySelector('#next-stop');
    if (next) {
      const link = document.createElement('a');
      link.href = `#${next.closest('li').id}`;
      link.textContent = next.dataset.name;
      nextLabel.replaceChildren(document.createTextNode('Следующая остановка: '), link);
    } else {
      nextLabel.textContent = 'Прогулка завершена. До встречи у моря!';
    }
    document.querySelectorAll('[data-start-route]').forEach(button => {
      const arrow = document.createElement('span');
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '↓';
      button.replaceChildren(document.createTextNode(count === 0 ? 'Начать прогулку ' : next ? 'Продолжить прогулку ' : 'Посмотреть прогулку '), arrow);
    });
  }
  checks.forEach(input => input.addEventListener('change', () => {
    const completed = checks.filter(check => check.checked).map(check => check.dataset.poi);
    storageNotice(saveWalkProgress(storage, route, completed, stopIds));
    refresh();
  }));
  document.querySelectorAll('[data-start-route]').forEach(button => button.addEventListener('click', () => {
    const next = checks.find(input => !input.checked);
    const target = next?.closest('li') || document.querySelector('#route-stops');
    (next || target).focus({preventScroll: true});
    target.scrollIntoView({block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
  }));
  storageNotice(restored.available);
  function restoreProgress() {
    const progress = loadWalkProgress(storage, route, stopIds);
    checks.forEach(input => { input.checked = progress.completed.includes(input.dataset.poi); });
    storageNotice(progress.available); refresh();
  }
  window.addEventListener('storage', event => { if (event.key === key(route) || event.key === null) restoreProgress(); });
  window.addEventListener('godune:memory-cleared', restoreProgress);
  refresh();
}
