// A suggestion for the form, never a change to the saved day.
export function preferredRailService(trip, catalog) {
 const services=catalog.rail_services||[];
 if(services.some(s=>s.id===trip.schedule?.rail?.service))return trip.schedule.rail.service;
 const day=trip.itinerary?.days?.find(d=>d.id===trip.itinerary.active);
 const ids=[...(trip.places||[]),day?.start_at,day?.night_at].filter(Boolean);
 const places=ids.map(id=>catalog.poi.find(p=>p.slug===id)).filter(Boolean);
 const areas=new Set(places.map(p=>p.area));
 if(areas.size===1){
  const area=[...areas][0];
  const service=services.find(s=>s.arrival_poi&&catalog.poi.some(p=>p.slug===s.arrival_poi&&p.area===area)&&Array.isArray(s.outward)&&Array.isArray(s.inbound));
  if(service)return service.id;
 }
 return services[0]?.id;
}

export function railStation(service, catalog) {
 const station=catalog.poi.find(p=>p.slug===service?.arrival_poi&&p.category==='transport');
 const route=catalog.routes.find(r=>r.slug===service?.arrival_route&&r.return_to===station?.slug&&r.stops[0]?.poi===station?.slug);
 return {station,route};
}
