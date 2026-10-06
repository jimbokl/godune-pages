// Screen placement only: geographic coordinates and the saved itinerary never change.
export function layoutMapMarkers(points,{width,height,obstacles=[],size=44,gap=8}={}) {
  const radius=size/2,spacing=size+gap;
  const inside=p=>p.x>=0&&p.x<=width&&p.y>=0&&p.y<=height;
  const valid=points.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
  const outside=valid.filter(p=>!inside(p)).map(p=>({members:[p],x:p.x,y:p.y,anchor:{x:p.x,y:p.y},visible:false}));
  let groups=valid.filter(inside).map(p=>[p]);
  const centre=members=>({x:members.reduce((sum,p)=>sum+p.x,0)/members.length,y:members.reduce((sum,p)=>sum+p.y,0)/members.length});
  const left=radius+2,right=width-radius-2,top=radius+2,bottom=height-radius-12;
  const free=(p,placed)=>p.x>=left&&p.x<=right&&p.y>=top&&p.y<=bottom
    &&!obstacles.some(b=>p.x+radius+gap/2>b.left&&p.x-radius-gap/2<b.right&&p.y+radius+gap/2>b.top&&p.y-radius-gap/2<b.bottom)
    &&!placed.some(b=>Math.abs(p.x-b.x)<spacing&&Math.abs(p.y-b.y)<spacing);
  function position(anchor,placed) {
    if(free(anchor,placed))return anchor;
    const x=Math.max(left,Math.min(right,anchor.x)),y=Math.max(top,Math.min(bottom,anchor.y)),candidates=[];
    for(let dx=Math.ceil((left-x)/spacing);dx<=Math.floor((right-x)/spacing);dx++)
      for(let dy=Math.ceil((top-y)/spacing);dy<=Math.floor((bottom-y)/spacing);dy++)candidates.push({x:x+dx*spacing,y:y+dy*spacing});
    candidates.sort((a,b)=>(a.x-anchor.x)**2+(a.y-anchor.y)**2-((b.x-anchor.x)**2+(b.y-anchor.y)**2)||Math.abs(a.y-anchor.y)-Math.abs(b.y-anchor.y)||a.x-b.x);
    return candidates.find(p=>free(p,placed));
  }
  while(groups.length) {
    const placed=[];let failed=-1;
    for(let i=0;i<groups.length;i++) {
      const anchor=centre(groups[i]),p=position(anchor,placed);
      if(!p){failed=i;break;}
      placed.push({...p,anchor,members:groups[i],visible:true});
    }
    if(failed<0)return [...placed,...outside];
    if(groups.length===1)return [{members:groups[0],anchor:centre(groups[0]),...centre(groups[0]),visible:false,blocked:true},...outside];
    const anchor=centre(groups[failed]);let nearest=-1,distance=Infinity;
    groups.forEach((members,i)=>{if(i===failed)return;const p=centre(members),d=(p.x-anchor.x)**2+(p.y-anchor.y)**2;if(d<distance){nearest=i;distance=d;}});
    const merged=[...groups[failed],...groups[nearest]].sort((a,b)=>valid.indexOf(a)-valid.indexOf(b));
    groups=groups.filter((_,i)=>i!==failed&&i!==nearest);groups.push(merged);groups.sort((a,b)=>valid.indexOf(a[0])-valid.indexOf(b[0]));
  }
  return outside;
}
