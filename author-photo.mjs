// Reviewed public metadata only; camera provenance never enters a guide.
export function guidePhotoMetadata(point){
  const photos=Array.isArray(point?.photo_metadata)?point.photo_metadata:[];
  const selected=photos.find(p=>p.placements?.some(v=>v.slot==='pdf'))||photos[0];
  if(!selected||typeof selected.src!=='string'||!/^assets\/author\/[a-zA-Z0-9_./-]+\.jpg$/.test(selected.src)||selected.src.includes('..'))return null;
  const placement=selected.placements?.find(v=>v.slot==='pdf')||selected.placements?.find(v=>v.slot==='cover');
  return {id:selected.id,src:selected.src,alt:selected.alt,caption:selected.caption,credit:selected.credit,date:selected.date,profile:selected.profile,grade:selected.grade,crop:placement?.desktop||null};
}
export function photoCrop(width,height,crop){
  const ratio=String(crop?.ratio||'').split('/').map(Number),pos=crop?.position;
  if(ratio.length!==2||ratio.some(v=>!Number.isFinite(v)||v<=0)||!Array.isArray(pos)||pos.length!==2||pos.some(v=>!Number.isFinite(v)||v<0||v>100))return {x:0,y:0,width,height};
  const r=ratio[0]/ratio[1],w=Math.min(width,height*r),h=w/r;
  return {x:(width-w)*pos[0]/100,y:(height-h)*pos[1]/100,width:w,height:h};
}
