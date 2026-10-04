// A reusable, source-coordinate scene renderer. Rust supplies the clock and wind;
// the GPU displaces only the explicitly masked regions of the photograph.
import {createSceneMaskBuilder, SCENE_MASK_LAYERS} from './scene-mask.mjs';
export const LAYERS = SCENE_MASK_LAYERS;
const mark = name => globalThis.performance?.mark?.(`godune:${name}`);
const number = (value, fallback, min, max) => Number.isFinite(Number(value))
  ? Math.max(min, Math.min(max, Number(value))) : fallback;
function normalizeMask(mask = {}) {
  return {...mask, polygons: (Array.isArray(mask.polygons) ? mask.polygons : [])
    .filter(Array.isArray).map(poly => poly.filter(point => Array.isArray(point) && point.length >= 2 && point.slice(0,2).every(Number.isFinite))
      .map(([x,y]) => [number(x,0,0,1),number(y,0,0,1)]))
    .filter(poly => poly.length >= 3)};
}
export function pointInMask(x, y, mask) {
  const polygons = mask?.polygons;
  if (!polygons?.length) return true;
  return polygons.some(poly => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi,yi] = poly[i], [xj,yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < (xj-xi)*(y-yi)/(yj-yi)+xi) inside = !inside;
    }
    return inside;
  });
}
export function particleSourcePoint(x, y, kind, settings) {
  // Amber stones use the whole region. Wind-blown grains retain their slope.
  const localY = kind === 'amber' ? y : (y-.49)/.4;
  const r = settings?.region || [0,.55,1,.9];
  const sx = r[0]+x*(r[2]-r[0]), sy = r[1]+localY*(r[3]-r[1]);
  return pointInMask(sx,sy,settings?.mask) ? [sx,sy] : null;
}
export function normalizeProfile(input = {}) {
  const p = structuredClone(input);
  p.version = 1;
  p.wind = {angle: number(p.wind?.angle, 8, -360, 360), speed: number(p.wind?.speed, 1, 0, 5)};
  for (const name of LAYERS) {
    const a = p[name] || {};
    p[name] = {...a, enabled: a.enabled !== false, mask: a.mask || {polygons: []},
      amplitude: number(a.amplitude, name === 'water' ? .0024 : .001, 0, .025),
      speed: number(a.speed, 1, 0, 5), angle: number(a.angle, name === 'water' ? 85 : 0, -360, 360),
      wavelength: number(a.wavelength, .035, .005, .5),
      horizon: number(a.horizon, .43, 0, 1), near: number(a.near, .76, 0, 1),
      perspective: number(a.perspective, 1.4, .1, 5),
      light: number(a.light, .035, 0, .3), foam: number(a.foam, .014, 0, .2),
      foamThreshold: number(a.foamThreshold, .66, 0, 1),
      feather: number(a.feather, .004, 0, .04)};
    p[name].mask = normalizeMask(p[name].mask);
  }
  for (const name of ['sand','amber','fog','gulls']) {
    p[name] = {...p[name], enabled: p[name]?.enabled !== false,
      strength: number(p[name]?.strength, 1, 0, 4)};
  }
  p.gulls.count = Math.round(number(p.gulls.count, 4, 0, 12));
  for (const name of ['sand','amber','gulls']) {
    const fallback = name === 'gulls' ? [.55,.2,1,.4] : [0,.55,1,.9];
    const r = p[name].region || fallback;
    p[name].region = fallback.map((v,i)=>number(r[i],v,0,1));
    if(p[name].region[2]<=p[name].region[0] || p[name].region[3]<=p[name].region[1]) p[name].region=fallback;
    p[name].mask = normalizeMask(p[name].mask);
  }
  return p;
}
// object-fit:cover mapping shared by GPU, particles, masks and the editor.
export function coverCrop(iw, ih, w, h, position = [.5,.5]) {
  const scale = Math.max(w / iw, h / ih);
  const x = w / (iw * scale), y = h / (ih * scale);
  return [x, y, (1-x)*position[0], (1-y)*position[1]];
}
// A responsive picture may omit source pixels hidden outside the viewport.
// Masks, wind, water perspective and particles still use the original frame.
export function photoSourceWindow(photo) {
  const identity = [1,1,0,0], data = photo.dataset;
  if (!data?.sourceWindow || !data.sourceWindowMatch ||
      !(photo.currentSrc || photo.src || '').includes(data.sourceWindowMatch)) return identity;
  const r = data.sourceWindow.trim().split(/\s+/).map(Number);
  if (r.length !== 4 || !r.every(Number.isFinite) || r[0] <= 0 || r[1] <= 0 ||
      r[2] < 0 || r[3] < 0 || r[0]+r[2] > 1 || r[1]+r[3] > 1) return identity;
  return r;
}
export function photoCrop(photo, w, h) {
  const tokens = getComputedStyle(photo).objectPosition.split(' ');
  const fraction = (v, axis) => ({left:0,top:0,center:.5,right:1,bottom:1}[v] ??
    (v?.endsWith('%') ? parseFloat(v)/100 : .5));
  const local = coverCrop(photo.naturalWidth,photo.naturalHeight,w,h,tokens.map(fraction));
  const r = photoSourceWindow(photo);
  return [local[0]*r[0],local[1]*r[1],r[2]+local[2]*r[0],r[3]+local[3]*r[1]];
}
export async function loadProfile(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('Не удалось загрузить профиль сцены');
  const p = normalizeProfile(await r.json());
  for (const name of LAYERS) if (p[name].mask.image) p[name].mask.image = new URL(p[name].mask.image,url).href;
  if (p.live?.src) p.live.src = new URL(p.live.src,url).href;
  return p;
}
// Prefer the worker on capable browsers; keep the same renderer as a fallback.
export async function createScene(surface, photo, input) {
  const {createSceneWorker} = await import('./scene-worker-client.mjs');
  return createSceneWorker(surface,photo,input,createSceneMain,{normalizeProfile,photoCrop,photoSourceWindow,LAYERS});
}
export async function createSceneMain(surface, photo, input) {
  const {createSceneRenderer} = await import('./scene-renderer.mjs');
  const yieldTask=()=>globalThis.scheduler?.yield?.()||new Promise(resolve=>setTimeout(resolve,0));
  let profile=normalizeProfile(input),revision=0,disposed=false,photoRevision=0,photoSrc='',viewport;
  const masks=createSceneMaskBuilder();
  const sourceWindow=photoSourceWindow(photo);
  const mw=Math.round(Math.min(1024,photo.naturalWidth/sourceWindow[0]));
  const mh=Math.round(mw*(photo.naturalHeight/sourceWindow[1])/(photo.naturalWidth/sourceWindow[0]));
  const prepareMask=async value=>{mark('scene-mask-start');const pixels=await masks.render(value,mw,mh);mark('scene-mask-ready');return pixels;};
  const lost=()=>{surface.style.opacity='0';surface.dataset.engine='static-fallback';disposed=true;masks.dispose();};
  const initialMask=prepareMask(profile);initialMask.catch(()=>{});
  let renderer;
  try{renderer=await createSceneRenderer(surface,lost);}catch(error){masks.dispose();throw error;}
  if(!renderer){masks.dispose();return null;}
  function resize(w,h,dpr=1,crop=photoCrop(photo,w,h)){
    viewport=[w,h,dpr,crop];renderer.resize(...viewport);
    if(photoSrc&&photoSrc!==(photo.currentSrc||photo.src))surface.style.opacity='0';
  }
  async function uploadPhoto(){
    const ticket=++photoRevision;await photo.decode();await yieldTask();
    if(disposed||ticket!==photoRevision)return;
    renderer.uploadPhoto(photo,photoSourceWindow(photo));photoSrc=photo.currentSrc||photo.src;
    if(viewport)resize(viewport[0],viewport[1],viewport[2]);
    surface.style.removeProperty('opacity');surface.dataset.photoSource=new URL(photoSrc).pathname.split('/').pop();
  }
  const photoLoaded=()=>{surface.style.opacity='0';uploadPhoto().catch(lost);};
  photo.addEventListener('load',photoLoaded);
  async function setProfile(value,prepared){
    const next=normalizeProfile(value),ticket=++revision,pixels=await(prepared||prepareMask(next));
    if(disposed||ticket!==revision)return;profile=next;renderer.setMask(pixels,mw,mh);
    surface.dataset.layers=LAYERS.filter(k=>profile[k].enabled).join(',');
  }
  try{
    await uploadPhoto();await yieldTask();await setProfile(profile,initialMask);mark('scene-ready');
    surface.dataset.engine='webgl-scene';surface.dataset.renderer='main';
  }catch(error){renderer.dispose();masks.dispose();photo.removeEventListener('load',photoLoaded);throw error;}
  return {
    get profile(){return profile;},setProfile,
    setParameters(value){profile=normalizeProfile(value);},resize,
    draw(t,wind=1){if(!disposed&&photoSrc===(photo.currentSrc||photo.src))renderer.draw(t,wind,profile);},
    dispose(){disposed=true;masks.dispose();photo.removeEventListener('load',photoLoaded);renderer.dispose();}
  };
}
