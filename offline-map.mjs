export function localMapStyle(data) {
  const polygon = kind => ['all',['==',['get','kind'],kind],['==',['geometry-type'],'Polygon']];
  const line = kind => ['all',['==',['get','kind'],kind],['==',['geometry-type'],'LineString']];
  return {version:8,sources:{local:{type:'geojson',data,attribution:'© <a href="https://www.openstreetmap.org/copyright">Участники OpenStreetMap</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/">ODbL</a>'}},layers:[
    {id:'paper',type:'background',paint:{'background-color':'#f3f0e7'}},
    ...[['green','#dbe3d3'],['sand','#e8dcc4'],['water','#adc3c8'],['building','#d4cec0']].map(([kind,color])=>({id:`local-${kind}`,type:'fill',source:'local',filter:polygon(kind),paint:{'fill-color':color,'fill-opacity':kind==='building'?.86:1}})),
    {id:'local-road-halo',type:'line',source:'local',filter:line('road'),paint:{'line-color':'#c9c3b7','line-width':['interpolate',['linear'],['zoom'],12,1,17,9]}},
    {id:'local-roads',type:'line',source:'local',filter:line('road'),paint:{'line-color':['match',['get','highway'],['footway','path','steps'],'#a2a78f','#fffdfa'],'line-width':['interpolate',['linear'],['zoom'],12,.7,17,6]}},
    {id:'local-waterlines',type:'line',source:'local',filter:line('waterline'),paint:{'line-color':'#adc3c8','line-width':3}},
    {id:'local-coast',type:'line',source:'local',filter:line('coastline'),paint:{'line-color':'#90aab2','line-width':2}},
    {id:'local-rail',type:'line',source:'local',filter:line('rail'),paint:{'line-color':'#a5a7a1','line-width':1,'line-dasharray':[2,2]}}
  ]};
}

export async function downloadedMap(base, route, point) {
  if (route) {
    const response = await fetch(new URL(`data/offline-maps/${route}.geojson`,base));
    if (!response.ok) throw new Error('Карта прогулки недоступна');
    return response.json();
  }
  if (navigator.onLine || !('caches' in window)) return null;
  const names = (await caches.keys()).filter(n=>n.startsWith('godune-walk-offline:v1:'));
  const points = Array.isArray(point) ? point : null;
  let best = null, bestScore = -1;
  for (const name of names.reverse()) {
    const cache = await caches.open(name);
    const metadata = await cache.match(new URL('__godune_package__',base));
    if (!metadata) continue;
    const record = await metadata.json();
    const stored = new Set((await cache.keys()).map(r=>r.url));
    if (!record.resources.every(r=>stored.has(new URL(r.path,base).href))) continue;
    const response = await cache.match(new URL(`data/offline-maps/${record.slug}.geojson`,base));
    if (!response) continue;
    const data = await response.json();
    const inside = p => p.lon>=data.bbox[0] && p.lon<=data.bbox[2] && p.lat>=data.bbox[1] && p.lat<=data.bbox[3];
    if (points) {
      const score = points.filter(inside).length;
      if (score > bestScore) { best = data; bestScore = score; }
    } else if (!point || inside(point)) return data;
  }
  return best;
}
