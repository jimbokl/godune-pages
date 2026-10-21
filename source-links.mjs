// Reconcile the same page-wide registry after an explicit dynamic panel render.
export function reconcileSourceLinks(doc) {
  const anchors=[...doc.querySelectorAll('a[href]')], ids=new Set([...doc.querySelectorAll('[id]')].map(el=>el.id)), sources=new Map(), counts=new Map();
  for(const el of doc.querySelectorAll('[id]'))counts.set(el.id,(counts.get(el.id)||0)+1);
  let serial=0;
  for(const a of anchors) {
    const original=a.dataset.sourceReference||a.getAttribute('href');
    let u;try{u=new URL(original);}catch{continue;}
    if(u.origin===doc.location?.origin||!['https:','http:'].includes(u.protocol)||['godune.ru','www.godune.ru'].includes(u.hostname)||(u.hostname==='github.com'&&u.pathname.includes('/issues/new'))||original.includes('/share?')||original.includes('/intent/'))continue;
    u.hash='';const key=u.href;
    if(sources.has(key)) {a.dataset.sourceReference=original;if(a.getAttribute('href')!=='#'+sources.get(key))a.setAttribute('href','#'+sources.get(key));a.removeAttribute('target');}
    else {if(a.getAttribute('href')!==original)a.setAttribute('href',original);delete a.dataset.sourceReference;if(!a.id||(a.id.startsWith('page-source-')&&counts.get(a.id)>1)){do{serial++;}while(ids.has('page-source-'+serial));a.id='page-source-'+serial;ids.add(a.id);}sources.set(key,a.id);}
  }
}

export function startSourceRegistry(doc) {
  reconcileSourceLinks(doc);
  const observer=new MutationObserver(records=>{
    if(records.some(r=>r.type==='attributes'||[...r.addedNodes,...r.removedNodes].some(n=>n.nodeType===1&&(n.matches?.('a[href]')||n.querySelector?.('a[href]')))))reconcileSourceLinks(doc);
  });
  observer.observe(doc.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['href']});
  return ()=>observer.disconnect();
}
if(typeof document!=='undefined')startSourceRegistry(document);
