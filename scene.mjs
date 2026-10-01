// A reusable, source-coordinate scene renderer. Rust supplies the clock and wind;
// the GPU displaces only the explicitly masked regions of the photograph.
export const LAYERS = ['water', 'clouds', 'pines', 'grass'];
const number = (value, fallback, min, max) => Number.isFinite(Number(value))
  ? Math.max(min, Math.min(max, Number(value))) : fallback;
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
    p[name].mask.polygons = (p[name].mask.polygons || []).filter(poly => Array.isArray(poly) && poly.length >= 3)
      .map(poly => poly.map(([x,y]) => [number(x,0,0,1), number(y,0,0,1)]));
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
async function maskPixels(profile, width, height) {
  const packed = new Uint8Array(width*height*4);
  for (const [channel,name] of LAYERS.entries()) {
    const layer = profile[name];
    if (!layer.enabled) continue;
    const canvas = document.createElement('canvas'); canvas.width=width; canvas.height=height;
    const ctx = canvas.getContext('2d',{willReadFrequently:true});
    ctx.fillStyle='black'; ctx.fillRect(0,0,width,height);
    ctx.fillStyle='white';
    for (const poly of layer.mask.polygons) {
      ctx.beginPath(); poly.forEach(([x,y],i)=> i ? ctx.lineTo(x*width,y*height) : ctx.moveTo(x*width,y*height));
      ctx.closePath(); ctx.fill();
    }
    if (layer.mask.image) {
      const img = new Image(); img.crossOrigin='anonymous'; img.src=layer.mask.image; await img.decode();
      ctx.drawImage(img,0,0,width,height);
    }
    if (layer.feather) {
      const soft = document.createElement('canvas'); soft.width=width; soft.height=height;
      const c = soft.getContext('2d'); c.filter=`blur(${layer.feather*width}px)`; c.drawImage(canvas,0,0);
      ctx.drawImage(soft,0,0);
    }
    const pixels=ctx.getImageData(0,0,width,height).data;
    // Erode the soft edge: a dark pixel never starts warping neighbouring land.
    for (let i=0;i<width*height;i++) packed[i*4+channel]=Math.max(0,(pixels[i*4]-100)*255/155);
  }
  return packed;
}
const vertex = `attribute vec2 position; varying vec2 screen;
void main(){screen=vec2((position.x+1.0)*.5,(1.0-position.y)*.5);gl_Position=vec4(position,0.0,1.0);}`;
const fragment = `precision highp float;
uniform sampler2D photograph, regions; uniform vec4 crop, water, optics, cloud, pine, grass;
uniform vec2 direction, windDirection; uniform float time, wind, foamThreshold;
varying vec2 screen;
void main(){
 vec2 uv=crop.zw+screen*crop.xy; vec4 m=texture2D(regions,uv);
 float depth=pow(clamp((uv.y-optics.x)/max(.01,optics.y-optics.x),0.0,1.0),optics.z);
 float projectedY=log(1.0+9.0*clamp((uv.y-optics.x)/max(.01,optics.y-optics.x),0.0,1.0))/log(10.0);
 float phase=dot(vec2(uv.x,optics.x+projectedY*(optics.y-optics.x)),direction)*6.283185/water.z;
 float swell=sin(phase-time*water.y*1.6);
 float ripple=sin(phase*2.7+uv.x*31.0-time*water.y*2.1);
 vec2 waterDrift=(direction*(swell+.26*ripple)+vec2(direction.y,-direction.x)*sin(phase*.79-time*water.y)*.3)
   *water.x*depth*wind*m.r;
 vec2 cloudDrift=(windDirection*sin(time*cloud.y*.11)*cloud.x+vec2(0.0,cos(time*cloud.y*.09)*cloud.x*.22))*m.g;
 vec2 pineDrift=(windDirection*(sin(time*pine.y*.83+uv.y*15.0)+.32*sin(time*pine.y*1.79+uv.x*29.0))*pine.x
   +vec2(0.0,sin(time*pine.y*.68+uv.x*12.0)*pine.x*.15))*m.b;
 vec2 grassDrift=windDirection*sin(time*grass.y*2.4+uv.x*44.0)*grass.x*wind*m.a;
 vec3 color=texture2D(photograph,uv+waterDrift+cloudDrift+pineDrift+grassDrift).rgb;
 float shine=(swell*.65+ripple*.35)*optics.w*depth;
 float luminance=dot(color,vec3(.2126,.7152,.0722));
 float foam=smoothstep(foamThreshold,min(1.0,foamThreshold+.12),luminance)*water.w*depth*(.5+.5*swell);
 color+=m.r*(color*shine+vec3(foam));
 gl_FragColor=vec4(color,max(max(m.r,m.g),max(m.b,m.a)));
}`;
export async function createScene(surface, photo, input) {
  const gl=surface.getContext('webgl',{alpha:true,premultipliedAlpha:false,antialias:false,depth:false});
  if (!gl) return null;
  let profile=normalizeProfile(input), revision=0, disposed=false;
  const shaders=[], textures=[];
  const compile=(type,source)=>{
    const s=gl.createShader(type); shaders.push(s); gl.shaderSource(s,source);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s;
  };
  const program=gl.createProgram();
  gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex)); gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));
  gl.linkProgram(program); if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
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
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,photo);
  gl.uniform1i(u.photograph,0);gl.uniform1i(u.regions,1);
  async function setProfile(value) {
    const next=normalizeProfile(value), ticket=++revision;
    const mw=Math.min(1024,photo.naturalWidth), mh=Math.round(mw*photo.naturalHeight/photo.naturalWidth);
    const pixels=await maskPixels(next,mw,mh);
    if(disposed || ticket!==revision) return;
    profile=next;gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,textures[1]);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,mw,mh,0,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
  }
  await setProfile(profile);
  const lost=()=>{surface.style.opacity='0';surface.dataset.engine='static-fallback';disposed=true;};
  surface.addEventListener('webglcontextlost',lost);
  surface.dataset.engine='webgl-scene';surface.dataset.layers=LAYERS.filter(k=>profile[k].enabled).join(',');
  return {
    get profile(){return profile;},setProfile,
    setParameters(value){profile=normalizeProfile(value);},
    resize(w,h,dpr=1){
      surface.width=Math.round(w*dpr);surface.height=Math.round(h*dpr);gl.viewport(0,0,surface.width,surface.height);
      gl.uniform4fv(u.crop,photoCrop(photo,w,h));
    },
    draw(t,wind=1){
      if(disposed)return;gl.useProgram(program);
      const a=profile.water,rad=a.angle*Math.PI/180,windRad=profile.wind.angle*Math.PI/180;
      gl.uniform1f(u.time,t);gl.uniform1f(u.wind,wind);gl.uniform2f(u.direction,Math.cos(rad),Math.sin(rad));
      gl.uniform2f(u.windDirection,Math.cos(windRad),Math.sin(windRad));
      gl.uniform4f(u.water,a.enabled?a.amplitude:0,a.speed,a.wavelength,a.foam);
      gl.uniform4f(u.optics,a.horizon,a.near,a.perspective,a.light);
      gl.uniform1f(u.foamThreshold,a.foamThreshold);
      for(const [key,layer] of [['cloud',profile.clouds],['pine',profile.pines],['grass',profile.grass]])
        gl.uniform4f(u[key],layer.enabled?layer.amplitude:0,layer.speed,0,0);
      gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLES,0,6);
    },
    dispose(){
      disposed=true;surface.removeEventListener('webglcontextlost',lost);
      textures.forEach(t=>gl.deleteTexture(t));shaders.forEach(s=>gl.deleteShader(s));
      gl.deleteBuffer(buffer);gl.deleteProgram(program);gl.clear(gl.COLOR_BUFFER_BIT);
    }
  };
}
