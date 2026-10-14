/** Resolve an existing POI identity to its canonical geography URL. */
export function placePath(catalogOrPlace, identity) {
  if (!catalogOrPlace) return null;
  let place;
  if (identity === undefined && typeof catalogOrPlace === 'object' && !Array.isArray(catalogOrPlace)) {
    place = catalogOrPlace;
  } else {
    if (identity == null) return null;
    const raw = String(identity);
    const lookup = raw.startsWith('poi:') ? raw.slice(4) : raw;
    place = Array.isArray(catalogOrPlace.poi)
      ? catalogOrPlace.poi.find(row => row.slug === lookup || row.id === raw || row.id === lookup)
      : null;
  }
  if (!place || typeof place.slug !== 'string' || typeof place.area !== 'string') return null;
  const safeSegment = value => value.length > 0 && value !== '.' && value !== '..' && !/[\\/?#%]/.test(value);
  if (!safeSegment(place.area) || !safeSegment(place.slug)) return null;
  const expected = `${place.area}/${place.slug}/`;
  const configured = typeof place.path === 'string' ? place.path.replace(/^\/+/, '') : '';
  if (!configured) return expected;
  const match = configured.match(/^([^/]+)\/([^/]+)\/$/);
  if (!match || !safeSegment(match[1]) || !safeSegment(match[2])) return null;
  // A generated canonical `path` is authoritative, but must still point to
  // this exact catalog slug and have a valid geography segment.
  return match[2] === place.slug ? configured : null;
}

export function placeHref(base, catalog, identity) {
  const path = placePath(catalog, identity);
  return path && base ? new URL(path, base).href : null;
}
