// The generator labels whole sections, including their overflow pages.
// Select by purpose; page numbers alone never decide what a traveller loses.
export function personalGuideSections(entry) {
  const roles = new Set(['cover','overview','wayfinding','place','preparation','sources']);
  if (!Number.isInteger(entry?.pages) || entry.pages < 1 || !Array.isArray(entry.sections)) throw Error('guide_sections_invalid');
  const seen = new Set(), places = new Set(), counts = new Map();
  let nextPage = 0;
  for (const section of entry.sections) {
    if (!section || !roles.has(section.role) || !Array.isArray(section.pages) || !section.pages.length
      || (section.role === 'place' && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(section.id))) throw Error('guide_sections_invalid');
    if (section.role === 'place') {
      if (places.has(section.id)) throw Error('guide_sections_invalid');
      places.add(section.id);
    }
    counts.set(section.role, (counts.get(section.role) || 0) + 1);
    for (const page of section.pages) {
      if (!Number.isInteger(page) || page !== nextPage++ || page >= entry.pages || seen.has(page)) throw Error('guide_sections_invalid');
      seen.add(page);
    }
  }
  if (seen.size !== entry.pages || !counts.get('place')
    || ['cover','overview','wayfinding','preparation','sources'].some(role => counts.get(role) !== 1)) throw Error('guide_sections_invalid');
  const order = entry.sections.map(section => section.role).join(',');
  if (!/^cover,overview,wayfinding,(?:place,)+preparation,sources$/.test(order)) throw Error('guide_sections_invalid');
  return entry.sections.filter(section => ['overview','wayfinding','place','sources'].includes(section.role));
}

const hash = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2,'0')).join('');
export async function loadKosaGuideAssets({snapshot,base,format},{signal,onProgress=()=>{}}={}) {
  if (snapshot?.schema_version !== 1 || !['phone','print'].includes(format)
    || !['vysota-efa','vysota-efa,tancuyushchiy-les'].includes(snapshot.walks?.join(','))) throw Error('guide_invalid_snapshot');
  const read = async path => {
    signal?.throwIfAborted();
    const response = await fetch(new URL(path,base), {signal});
    if (!response.ok) throw Error('guide_maps_unavailable');
    return new Uint8Array(await response.arrayBuffer());
  };
  onProgress('Проверяем карты троп и пересадок…');
  const manifestBytes = await read('guides/manifest.json');
  const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)), chapters = [], walkingMaps = [];
  for (const slug of snapshot.walks) {
    const entry = manifest.guides?.find(row => row.route === slug && row.format === format);
    if (!entry || entry.path !== `guides/${slug}-${format}.pdf` || !/^[0-9a-f]{64}$/.test(entry.sha256)) throw Error('guide_sections_invalid');
    const sections = personalGuideSections(entry), bytes = await read(entry.path);
    if (bytes.length !== entry.bytes || await hash(bytes) !== entry.sha256) throw Error('guide_maps_unavailable');
    const source = await globalThis.PDFLib.PDFDocument.load(bytes);
    if (source.getPageCount() !== entry.pages) throw Error('guide_sections_invalid');
    chapters.push({source,entry,sections});
  }
  for (const walk of snapshot.interchanges?.walks || []) {
    const image = walk.images?.png;
    if (!image || image.path !== `assets/transit/interchanges/${walk.id}.png` || !/^[0-9a-f]{64}$/.test(image.sha256)) throw Error('guide_maps_unavailable');
    const bytes = await read(image.path);
    if (bytes.length !== image.bytes || await hash(bytes) !== image.sha256) throw Error('guide_maps_unavailable');
    walkingMaps.push({walk,bytes});
  }
  return {chapters,walkingMaps,manifest_sha256:await hash(manifestBytes)};
}
