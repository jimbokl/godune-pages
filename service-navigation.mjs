// Only selection values travel in URLs. Destination paths belong to the renderer.
import {extraKey,extraBelongsTo} from './service-price-view.mjs';
const visitKeys = new Set(['date','people','units','duration_minutes','arrival','finish_by','finish_next_day','cost_limit','upfront_limit','paid_minutes','session_start','change_before','change_after','approach_minutes','entry_minutes','exit_minutes','return_minutes'].map(v=>`sr_${v}`));
const listKeys = new Set(['v','q','sort','only_fits','scope_kind','scope_point','scope_route','radius_m','spatial_strict'].map(v=>`sr_${v}`));
const nullableTimingKeys = new Set(['session_start','change_before','change_after','approach_minutes','entry_minutes','exit_minutes','return_minutes'].map(v=>`sr_${v}`));
const allowed = key => visitKeys.has(key)||listKeys.has(key)||extraKey(key)||/^sr_facet_[a-z_]+$/.test(key);

export function serviceSelectionParams(controls) {
  const params=new URLSearchParams({sr_v:'1'});
  for(const control of controls){
    if(control.disabled)continue;
    const key=`sr_${control.name}`;
    if(!allowed(key))continue;
    const value=control.type==='checkbox'?(control.checked?'1':extraKey(key)?'0':''):control.value;
    // A cleared timing field must also clear a nonempty authored default.
    if(value!==''||nullableTimingKeys.has(key))params.set(key,value);
  }
  return params;
}

function localTarget(path,current) {
  const url=new URL(path,current);
  if(url.origin!==new URL(current).origin)throw Error('Service navigation requires a local destination');
  return url;
}

export function serviceDetailURL(path,current,selection,serviceId) {
  const url=localTarget(path,current);
  url.searchParams.set('sr_v','1');
  for(const [key,value] of selection)if(visitKeys.has(key)||(serviceId&&extraBelongsTo(key,serviceId)))url.searchParams.set(key,value);
  const list=new URLSearchParams([...selection].filter(([key])=>allowed(key)));
  url.searchParams.set('sr_list',list.toString());
  return url;
}

export function serviceBackURL(path,current,selection) {
  const url=localTarget(path,current),source=new URL(current);
  const list=new URLSearchParams(source.searchParams.get('sr_list')||'');
  if(list.get('sr_v')==='1')for(const [key,value] of list)if(allowed(key))url.searchParams.set(key,value);
  for(const key of visitKeys)url.searchParams.delete(key);
  for(const [key,value] of selection)if(visitKeys.has(key)||extraKey(key))url.searchParams.set(key,value);
  url.searchParams.set('sr_v','1');
  return url;
}
