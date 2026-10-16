// Display the same ordered stops and OSM legs, including a visible opening wait.
export function cityTimeline(route,{start,venue,opens,visits={}}){
 let minute=start;
 const rows=route.stops.map((stop,i)=>{
  const id=stop.poi,visit=visits[id]??stop.visit_minutes??10;
  const wait=id===venue?Math.max(0,opens-minute):0;minute+=wait;
  const row={id,minute,visit,wait,walk:route.walking_legs[i].minutes};
  minute+=visit+row.walk;return row;
 });
 return {rows,returnAt:minute};
}
