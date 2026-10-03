import {createCLSAccumulator} from './performance-metrics.mjs';
/* Local, opt-in performance diagnostics. No data leaves this tab. */
(() => {
  'use strict';
  const enabled = new URLSearchParams(location.search).get('profile') === '1';
  const storageKey = 'godune.performance.v1';
  const state = {version:1,capturedAt:new Date().toISOString(),path:location.pathname,marks:[],vitals:{},longTasks:[],resources:[]};
  const safePath = value => { try { const u=new URL(value,location.href); return u.origin===location.origin?u.pathname:u.origin+u.pathname; } catch { return ''; } };
  const category = path => /\.wasm(?:$|\/)/i.test(path)?'wasm':/maplibre|\.pbf(?:$|\/)|\.mvt(?:$|\/)/i.test(path)?'map':/\.(woff2?|ttf|otf)(?:$|\/)/i.test(path)?'fonts':/\.(png|jpe?g|webp|avif|gif|svg)(?:$|\/)/i.test(path)?'images':/\.css(?:$|\/)/i.test(path)?'css':/\.(m?js)(?:$|\/)/i.test(path)?'js':/\.json(?:$|\/)/i.test(path)?'data':'other';
  function recordMark(entry) { if(!entry.name?.startsWith('godune:'))return;const name=entry.name.slice(7);if(state.marks.some(m=>m.name===name&&m.at_ms===Math.round(entry.startTime*10)/10))return;const item={name:name.slice(0,80),at_ms:Math.round(entry.startTime*10)/10};if(entry.detail!=null)item.detail=String(entry.detail).slice(0,160);state.marks.push(item);if(state.marks.length>80)state.marks.shift(); }
  function mark(name,detail) { const safeName=String(name).slice(0,80);try{performance.mark(`godune:${safeName}`,detail==null?{}:{detail:String(detail).slice(0,160)})}catch{}const entry=performance.getEntriesByName(`godune:${safeName}`,'mark').at(-1);const item={name:safeName,at_ms:entry?Math.round(entry.startTime*10)/10:Math.round(performance.now()*10)/10};if(detail!=null)item.detail=String(detail).slice(0,160);recordMark({name:`godune:${safeName}`,startTime:item.at_ms,detail:item.detail});return item; }
  function resourceData() {
    return performance.getEntriesByType('resource').map(e=>{
      const path=safePath(e.name); if(!path)return null;
      const transfer=Number.isFinite(e.transferSize)?e.transferSize:null, encoded=Number.isFinite(e.encodedBodySize)?e.encodedBodySize:null;
      const cache=transfer===0&&encoded>0?encoded:0;
      return {path,kind:category(path),transfer_bytes:transfer&&transfer>0?transfer:null,encoded_bytes:encoded&&encoded>0?encoded:null,cache_bytes:cache||null,bytes_unknown:!(transfer>0)&&!(encoded>0),duration_ms:Math.round(e.duration),start_ms:Math.round(e.startTime),initiator:e.initiatorType||null,status:Number.isFinite(e.responseStatus)?e.responseStatus:undefined};
    }).filter(Boolean).sort((a,b)=>b.duration_ms-a.duration_ms);
  }
  function snapshot() {
    const nav=performance.getEntriesByType('navigation')[0],all=resourceData(),summary={};
    for(const r of all){const x=summary[r.kind] ||= {count:0,transfer_bytes:0,encoded_bytes:0,cache_bytes:0,unknown_bytes_count:0};x.count++;x.transfer_bytes+=r.transfer_bytes||0;x.encoded_bytes+=r.encoded_bytes||0;x.cache_bytes+=r.cache_bytes||0;if(r.bytes_unknown)x.unknown_bytes_count++;}
    return {...state,capturedAt:new Date().toISOString(),path:location.pathname,navigation:nav?{ttfb_ms:Math.round(nav.responseStart-nav.startTime),dom_content_loaded_ms:Math.round(nav.domContentLoadedEventEnd-nav.startTime),load_ms:nav.loadEventEnd?Math.round(nav.loadEventEnd-nav.startTime):null,transfer_bytes:nav.transferSize||null,encoded_bytes:nav.encodedBodySize||null}:null,resource_summary:summary,resources:all.slice(0,100),duration_ms:Math.round(performance.now())};
  }
  function save() { try { const s=snapshot();sessionStorage.setItem(storageKey,JSON.stringify({savedAt:Date.now(),path:location.pathname,summary:{navigation:s.navigation,vitals:s.vitals,marks:s.marks.slice(-40),resource_summary:s.resource_summary,duration_ms:s.duration_ms}})); } catch {} }
  function observe(type,handler,options={type,buffered:true}) { try { if(PerformanceObserver.supportedEntryTypes?.includes(type)){const o=new PerformanceObserver(list=>handler(list.getEntries()));o.observe(options);return o;} } catch {} return null; }
  const existingMarks=performance.getEntriesByType('mark');for(const e of existingMarks)recordMark(e);observe('mark',entries=>entries.forEach(recordMark),{type:'mark',buffered:true});
  observe('largest-contentful-paint',entries=>{const e=entries.at(-1);state.vitals.lcp_ms=Math.round(e.startTime);state.vitals.lcp_element=e.element?.tagName?.toLowerCase()||null;});
  // CLS uses the largest session window: entries no more than 1s apart and a 5s total span.
  const cls = createCLSAccumulator();
  observe('layout-shift',entries=>{for(const e of entries)state.vitals.cls=Number(cls(e).toFixed(4));});
  observe('event',entries=>{const relevant=entries.filter(e=>e.interactionId);if(relevant.length)state.vitals.interaction_max_ms=Math.max(state.vitals.interaction_max_ms||0,...relevant.map(e=>Math.round(e.duration)));},{type:'event',buffered:true,durationThreshold:16});
  observe('longtask',entries=>{for(const e of entries)state.longTasks.push({start_ms:Math.round(e.startTime),duration_ms:Math.round(e.duration),attribution:(e.attribution||[]).map(a=>({name:safePath(a.name),entry_type:a.entryType,container_type:a.containerType,container_name:a.containerName?String(a.containerName).slice(0,120):null,container_src:safePath(a.containerSrc)}))});if(state.longTasks.length>100)state.longTasks=state.longTasks.slice(-100);});
  window.godunePerformance={snapshot,mark,enabled};mark('performance-module-start');
  if(document.readyState==='complete')mark('window-load');else addEventListener('load',()=>mark('window-load'),{once:true});
  addEventListener('pagehide',save,{once:true});
  if(!enabled)return;
  const style=document.createElement('style');style.textContent=`#godune-profile{position:fixed;z-index:2147483000;right:12px;bottom:12px;width:min(460px,calc(100vw - 24px));max-height:min(76vh,680px);overflow:auto;background:#fff;color:#18231e;border:2px solid #394d40;border-radius:14px;box-shadow:0 8px 32px #0004;padding:14px;font:14px/1.45 system-ui,sans-serif}#godune-profile[data-night="true"]{background:#202824;color:#f1f3ee;border-color:#b4c8b6}#godune-profile h2{font-size:18px;margin:0 0 8px}#godune-profile p{margin:6px 0}#godune-profile button{min-height:44px;padding:8px 12px;border:1px solid currentColor;border-radius:8px;background:transparent;color:inherit;font:inherit;cursor:pointer}#godune-profile button:focus-visible{outline:3px solid #d5902b;outline-offset:2px}#godune-profile .actions{display:flex;gap:8px;flex-wrap:wrap}#godune-profile pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.4 ui-monospace,monospace}#godune-profile .sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}`;document.head.append(style);
  const panel=document.createElement('aside');panel.id='godune-profile';panel.setAttribute('aria-labelledby','godune-profile-title');panel.dataset.night=String(document.documentElement.dataset.theme==='night');panel.innerHTML='<h2 id="godune-profile-title">Профиль загрузки</h2><p>Измерения этой вкладки. Данные остаются на устройстве.</p><div class="actions"><button type="button" data-refresh>Обновить</button><button type="button" data-download>Скачать JSON</button><button type="button" data-hide>Скрыть</button></div><pre aria-live="polite"></pre>';document.body.append(panel);
  const output=panel.querySelector('pre'),render=()=>{panel.dataset.night=String(document.documentElement.dataset.theme==='night');output.textContent=JSON.stringify(snapshot(),null,2);};
  new MutationObserver(render).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});panel.querySelector('[data-refresh]').addEventListener('click',render);panel.querySelector('[data-hide]').addEventListener('click',()=>panel.hidden=true);panel.querySelector('[data-download]').addEventListener('click',()=>{const blob=new Blob([JSON.stringify(snapshot(),null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`godune-load-profile-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);});render();
})();
