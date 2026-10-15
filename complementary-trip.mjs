import {cleanTrip} from './trip-state.mjs?v=2026101305';
import {ensureJourney} from './trip-days-state.mjs?v=2026101305';

const directionKey = {before: 'edge_before', after: 'edge_after', storm: 'edge_storm'};

function edgeRows(place, catalog) {
  const aliases = place.complementary_edges || {};
  const node = catalog.complementary_graph?.nodes?.[place.slug];
  const slots = node?.slots || {};
  const found = ['after', 'before', 'storm'].map(direction => {
    const raw = place[directionKey[direction]] || aliases[directionKey[direction]] || aliases[direction] || slots[direction];
    if (!raw) return null;
    const targetSlug = raw.target_slug || raw.target;
    const target = catalog.poi.find(row => row.slug === targetSlug);
    if (!target || target === place || isClosed(target)) return null;
    const status = raw.status;
    if (direction === 'storm') {
      if (raw.nearby === false) return null;
      if (status !== 'linked' && status !== 'open' && !(status === 'candidate' && raw.verified_indoor === true && raw.verified_hours === true)) return null;
    } else if (status !== 'linked' && status !== 'open') return null;
    return {direction, target, edge: raw};
  }).filter(Boolean);
  const unique = new Map();
  for (const row of found) if (!unique.has(row.target.slug)) unique.set(row.target.slug, row);
  return [...unique.values()].sort((a,b) => ['before','after','storm'].indexOf(a.direction)-['before','after','storm'].indexOf(b.direction));
}

function isClosed(place) {
  const closedStatuses = new Set(['closed','permanently_closed','temporarily_closed','suspended','not_operating','ceased']);
  const status = place.operational_status?.status || place.operational_status || place.gastronomy?.operational_status?.status || place.gastronomy?.operational_status;
  return place.closed === true || place.status === 'closed' || place.availability === 'closed'
    || place.available === false || place.gastronomy?.available === false
    || closedStatuses.has(status) || place.open === false || place.is_open === false;
}

const edgeName = (edge, target) => edge.target_name || target.name;
const edgeExtra = edge => Number.isFinite(edge.extra_minutes) ? edge.extra_minutes
  : Number.isFinite(edge.pair?.extra_minutes) ? edge.pair.extra_minutes : null;

/** Add a source and its chosen neighbour to the active day without disturbing other trip data. */
export function addComplementaryPair(state, sourceSlug, targetSlug, catalog, direction = 'after') {
  const cleaned = cleanTrip(state, catalog);
  const source = catalog.poi.find(row => row.slug === sourceSlug);
  const target = catalog.poi.find(row => row.slug === targetSlug);
  if (!source || !target || sourceSlug === targetSlug || isClosed(source) || isClosed(target)) return cleaned;

  const next = ensureJourney(cleaned);
  const active = next.itinerary.days.find(day => day.id === next.itinerary.active);
  if (!active) return cleaned;
  const places = [...active.places];
  let sourceIndex = places.indexOf(sourceSlug), targetIndex = places.indexOf(targetSlug);
  const before = direction === 'before';

  if (sourceIndex < 0 && targetIndex < 0) {
    places.push(...(before ? [targetSlug, sourceSlug] : [sourceSlug, targetSlug]));
  } else if (sourceIndex >= 0 && targetIndex < 0) {
    places.splice(sourceIndex + (before ? 0 : 1), 0, targetSlug);
  } else if (sourceIndex < 0 && targetIndex >= 0) {
    places.splice(targetIndex + (before ? 1 : 0), 0, sourceSlug);
  }

  active.places = places;
  next.places = [...places];
  return cleanTrip(next, catalog);
}

/** Offer saving this place alone or one of its verified complementary chains. */
export async function chooseComplementaryPlace(place, catalog, trigger) {
  if (!place || !catalog?.poi) return null;
  const source = catalog.poi.find(row => row.slug === place.slug) || place;
  const choices = edgeRows(source, catalog);
  if (!choices.length) return {kind: 'one', source, target: null, direction: null};
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return {kind: 'one', source, target: null, direction: null};
  const dialog = document.createElement('dialog');
  dialog.className = 'graph-choice-dialog';
  dialog.setAttribute('aria-labelledby', 'graph-choice-title');
  dialog.setAttribute('aria-describedby', 'graph-choice-description');

  const heading = document.createElement('h2');
  heading.id = 'graph-choice-title';
  heading.textContent = `Добавить «${source.name}» в маршрут`;
  const description = document.createElement('p');
  description.id = 'graph-choice-description';
  description.textContent = 'Сохраните только это место или добавьте рядом связанное место.';
  const list = document.createElement('div');
  list.className = 'graph-choice-list';

  const one = document.createElement('button');
  one.type = 'button';
  one.className = 'graph-choice';
  one.textContent = `Только «${source.name}»`;
  list.append(one);
  const optionButtons = choices.map(({direction, target, edge}) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'graph-choice';
    const extra = edgeExtra(edge);
    const time = extra === null
      ? (Number.isFinite(edge.walking_minutes) ? `переход ≈${edge.walking_minutes} мин` : 'два места')
      : `+${extra} минут`;
    const label = edgeName(edge, target);
    button.textContent = direction === 'before'
      ? `Цепочка: «${label}» → «${source.name}» (${time})`
      : `Цепочка: «${source.name}» → «${label}» (${time})`;
    list.append(button);
    return {button, choice: {kind: 'pair', source, target, direction}};
  });
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'graph-choice-cancel';
  cancel.textContent = 'Отмена';
  dialog.append(heading, description, list, cancel);
  document.body.append(dialog);

  return new Promise(resolve => {
    let settled = false;
    const finish = choice => {
      if (settled) return;
      settled = true;
      if (dialog.open) dialog.close();
      dialog.remove();
      if (trigger?.isConnected && typeof trigger.focus === 'function') trigger.focus({preventScroll: true});
      resolve(choice);
    };
    one.addEventListener('click', () => finish({kind: 'one', source, target: null, direction: null}));
    optionButtons.forEach(({button, choice}) => button.addEventListener('click', () => finish(choice)));
    cancel.addEventListener('click', () => finish(null));
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish(null); });
    dialog.addEventListener('close', () => finish(null));
    try {
      dialog.showModal();
      one.focus();
    } catch {
      finish(null);
    }
  });
}
