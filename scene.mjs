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
export function photoCrop(photo, w, h) {
  const tokens = getComputedStyle(photo).objectPosition.split(' ');
  const fraction = (v, axis) => ({left:0,top:0,center:.5,right:1,bottom:1}[v] ??
    (v?.endsWith('%') ? parseFloat(v)/100 : .5));
  return coverCrop(photo.naturalWidth,photo.naturalHeight,w,h,tokens.map(fraction));
}
export async function loadProfile(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('Не удалось загрузить профиль сцены');
  const p = normalizeProfile(await r.json());
  for (const name of LAYERS) if (p[name].mask.image) p[name].mask.image = new URL(p[name].mask.image,url).href;
  if (p.live?.src) p.live.src = new URL(p.live.src,url).href;
  return p;
}
const vertex = `attribute vec2 position; varying vec2 screen;
void main(){screen=vec2((position.x+1.0)*.5,(1.0-position.y)*.5);gl_Position=vec4(position,0.0,1.0);}`;
const fragment = `precision highp float;
uniform sampler2D photograph, regions; uniform vec4 crop, water, optics, cloud, pine, grass;
uniform vec2 direction, windDirection; uniform float time, wind, foamThreshold;
varying vec2 screen;
void main(){
 vec2 uv=crop.zw+screen*crop.xy; vec4 m=texture2D(regions,uv);
 float alpha=max(max(m.r,m.g),max(m.b,m.a));
 // Most of the photograph stays still. Do not calculate waves, tree sway or
 // lighting for those pixels, or run every layer's trigonometry everywhere.
 if(alpha==0.0){gl_FragColor=vec4(0.0);return;}
 vec2 drift=vec2(0.0); float depth=0.0; float swell=0.0; float ripple=0.0;
 if(m.r>0.0){
   float y=clamp((uv.y-optics.x)/max(.01,optics.y-optics.x),0.0,1.0);
   depth=pow(y,optics.z);
   float projectedY=log(1.0+9.0*y)/log(10.0);
   float phase=dot(vec2(uv.x,optics.x+projectedY*(optics.y-optics.x)),direction)*6.283185/water.z;
   swell=sin(phase-time*water.y*1.6);
   ripple=sin(phase*2.7+uv.x*31.0-time*water.y*2.1);
   drift+=(direction*(swell+.26*ripple)+vec2(direction.y,-direction.x)*sin(phase*.79-time*water.y)*.3)
     *water.x*depth*wind*m.r;
 }
 if(m.g>0.0)drift+=(windDirection*sin(time*cloud.y*.11)*cloud.x+vec2(0.0,cos(time*cloud.y*.09)*cloud.x*.22))*m.g;
 if(m.b>0.0)drift+=(windDirection*(sin(time*pine.y*.83+uv.y*15.0)+.32*sin(time*pine.y*1.79+uv.x*29.0))*pine.x
     +vec2(0.0,sin(time*pine.y*.68+uv.x*12.0)*pine.x*.15))*m.b;
 if(m.a>0.0)drift+=windDirection*sin(time*grass.y*2.4+uv.x*44.0)*grass.x*wind*m.a;
 vec3 color=texture2D(photograph,uv+drift).rgb;
 if(m.r>0.0){
   float shine=(swell*.65+ripple*.35)*optics.w*depth;
   float luminance=dot(color,vec3(.2126,.7152,.0722));
   float foam=smoothstep(foamThreshold,min(1.0,foamThreshold+.12),luminance)*water.w*depth*(.5+.5*swell);
   color+=m.r*(color*shine+vec3(foam));
 }
 // Explicit premultiplication keeps fully transparent pixels black on Safari
 // as well as Chromium, including when the canvas is composited with opacity.
 gl_FragColor=vec4(clamp(color,0.0,1.0)*alpha,alpha);
}`;
export async function createScene(surface, photo, input) {
  const gl=surface.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false});
  if (!gl) return null;
  let profile=normalizeProfile(input), revision=0, disposed=false;
  const shaders=[], textures=[], masks=createSceneMaskBuilder();
  const mw=Math.min(1024,photo.naturalWidth), mh=Math.round(mw*photo.naturalHeight/photo.naturalWidth);
  const prepareMask=async value=>{
    mark('scene-mask-start');
    const pixels=await masks.render(value,mw,mh);
    mark('scene-mask-ready');
    return pixels;
  };
  // The worker and GPU compiler are independent. Do not make mask preparation
  // wait for the shader or for the photograph's texture upload.
  const initialMask=prepareMask(profile);initialMask.catch(()=>{});
  mark('scene-shader-start');
  const compile=(type,source)=>{
    const s=gl.createShader(type); shaders.push(s); gl.shaderSource(s,source);gl.compileShader(s);
    return s;
  };
  const program=gl.createProgram();
  gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex)); gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));
  gl.linkProgram(program);
  const parallel=gl.getExtension('KHR_parallel_shader_compile');
  if(parallel) while(!gl.getProgramParameter(program,parallel.COMPLETION_STATUS_KHR))
    await new Promise(resolve=>setTimeout(resolve,0));
  else await new Promise(resolve=>setTimeout(resolve,0));
  if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  mark('scene-shader-ready');
  gl.useProgram(program);
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  const position=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
  const u=Object.fromEntries(['photograph','regions','crop','water','optics','cloud','pine','grass','direction','windDirection','time','wind','foamThreshold']
    .map(k=>[k,gl.getUniformLocation(program,k)]));
  for (let unit=0;unit<2;unit++) {
    const t=gl.createTexture(); textures.push(t);gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);
    for(const [key,value] of [[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE],[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR]])
      gl.texParameteri(gl.TEXTURE_2D,key,value);
  }
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,textures[0]);
  mark('scene-photo-upload-start');
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,photo);
  mark('scene-photo-upload-ready');
  gl.uniform1i(u.photograph,0);gl.uniform1i(u.regions,1);
  async function setProfile(value,prepared) {
    const next=normalizeProfile(value), ticket=++revision;
    const pixels=await (prepared || prepareMask(next));
    if(disposed || ticket!==revision) return;
    profile=next;gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,textures[1]);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,mw,mh,0,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
  }
  await setProfile(profile,initialMask);
  mark('scene-ready');
  const lost=()=>{surface.style.opacity='0';surface.dataset.engine='static-fallback';disposed=true;masks.dispose();};
  surface.addEventListener('webglcontextlost',lost);
  surface.dataset.engine='webgl-scene';surface.dataset.layers=LAYERS.filter(k=>profile[k].enabled).join(',');
  let uniformProfile;
  return {
    get profile(){return profile;},setProfile,
    setParameters(value){profile=normalizeProfile(value);},
    resize(w,h,dpr=1,crop=photoCrop(photo,w,h)){
      const sw=Math.round(w*dpr),sh=Math.round(h*dpr);
      if(surface.width!==sw || surface.height!==sh){surface.width=sw;surface.height=sh;}
      gl.viewport(0,0,sw,sh);gl.uniform4fv(u.crop,crop);
    },
    draw(t,wind=1){
      if(disposed)return;gl.useProgram(program);
      gl.uniform1f(u.time,t);gl.uniform1f(u.wind,wind);
      if(uniformProfile!==profile){
        const a=profile.water,rad=a.angle*Math.PI/180,windRad=profile.wind.angle*Math.PI/180;
        gl.uniform2f(u.direction,Math.cos(rad),Math.sin(rad));
        gl.uniform2f(u.windDirection,Math.cos(windRad),Math.sin(windRad));
        gl.uniform4f(u.water,a.enabled?a.amplitude:0,a.speed,a.wavelength,a.foam);
        gl.uniform4f(u.optics,a.horizon,a.near,a.perspective,a.light);
        gl.uniform1f(u.foamThreshold,a.foamThreshold);
        for(const [key,layer] of [['cloud',profile.clouds],['pine',profile.pines],['grass',profile.grass]])
          gl.uniform4f(u[key],layer.enabled?layer.amplitude:0,layer.speed,0,0);
        uniformProfile=profile;
      }
      // The full-screen triangles overwrite every pixel, including transparent
      // land. A preceding clear would repeat the same full-buffer write.
      gl.drawArrays(gl.TRIANGLES,0,6);
    },
    dispose(){
      disposed=true;masks.dispose();surface.removeEventListener('webglcontextlost',lost);
      textures.forEach(t=>gl.deleteTexture(t));shaders.forEach(s=>gl.deleteShader(s));
      gl.deleteBuffer(buffer);gl.deleteProgram(program);gl.clear(gl.COLOR_BUFFER_BIT);
    }
  };
}
