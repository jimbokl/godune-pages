// One WebGL renderer for the worker and the browser fallback. No DOM reads.
const mark = name => globalThis.performance?.mark?.(`godune:${name}`);
const yieldTask = () => globalThis.scheduler?.yield?.() || new Promise(resolve => setTimeout(resolve, 0));
const vertex = `attribute vec2 position; varying vec2 screen;
void main(){screen=vec2((position.x+1.0)*.5,(1.0-position.y)*.5);gl_Position=vec4(position,0.0,1.0);}`;
const fragment = `precision highp float;
uniform sampler2D photograph, regions; uniform vec4 crop, sourceWindow, water, optics, cloud, pine, grass;
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
 vec3 color=texture2D(photograph,(uv+drift-sourceWindow.zw)/sourceWindow.xy).rgb;
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

export async function createSceneRenderer(surface, onLost = () => {}) {
  await yieldTask();
  mark('scene-context-start');
  const gl = surface.getContext('webgl', {alpha:true,premultipliedAlpha:true,antialias:false,depth:false});
  mark('scene-context-ready');
  if (!gl) return null;
  const shaders=[], textures=[];
  let disposed=false, uniformProfile;
  const program=gl.createProgram(), buffer=gl.createBuffer();
  const lost=()=>{disposed=true;onLost();};
  surface.addEventListener('webglcontextlost',lost);
  const dispose=()=>{
    disposed=true;surface.removeEventListener('webglcontextlost',lost);
    textures.forEach(t=>gl.deleteTexture(t));shaders.forEach(s=>gl.deleteShader(s));
    gl.deleteBuffer(buffer);gl.deleteProgram(program);
  };
  try {
    await yieldTask();
    mark('scene-shader-start');
    const compile=(type,source)=>{
      const shader=gl.createShader(type);shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);return shader;
    };
    gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));
    gl.linkProgram(program);
    const parallel=gl.getExtension('KHR_parallel_shader_compile');
    if(parallel)while(!gl.getProgramParameter(program,parallel.COMPLETION_STATUS_KHR))await yieldTask();
    else await yieldTask();
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
    mark('scene-shader-ready');await yieldTask();
    gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    const position=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
    const u=Object.fromEntries(['photograph','regions','crop','sourceWindow','water','optics','cloud','pine','grass','direction','windDirection','time','wind','foamThreshold']
      .map(k=>[k,gl.getUniformLocation(program,k)]));
    for(let unit=0;unit<2;unit++){
      const texture=gl.createTexture();textures.push(texture);gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);
      for(const [key,value] of [[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE],[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR]])gl.texParameteri(gl.TEXTURE_2D,key,value);
    }
    gl.uniform1i(u.photograph,0);gl.uniform1i(u.regions,1);
    return {
      resize(w,h,dpr,crop){
        const sw=Math.round(w*dpr),sh=Math.round(h*dpr);
        if(surface.width!==sw||surface.height!==sh){surface.width=sw;surface.height=sh;}
        gl.useProgram(program);gl.viewport(0,0,sw,sh);gl.uniform4fv(u.crop,crop);
      },
      uploadPhoto(image,sourceWindow){
        gl.useProgram(program);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,textures[0]);
        mark('scene-photo-upload-start');
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);gl.uniform4fv(u.sourceWindow,sourceWindow);
        mark('scene-photo-upload-ready');
      },
      setMask(pixels,width,height){
        gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,textures[1]);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      },
      draw(time,wind,profile){
        if(disposed)return;gl.useProgram(program);gl.uniform1f(u.time,time);gl.uniform1f(u.wind,wind);
        if(uniformProfile!==profile){
          const a=profile.water,rad=a.angle*Math.PI/180,windRad=profile.wind.angle*Math.PI/180;
          gl.uniform2f(u.direction,Math.cos(rad),Math.sin(rad));gl.uniform2f(u.windDirection,Math.cos(windRad),Math.sin(windRad));
          gl.uniform4f(u.water,a.enabled?a.amplitude:0,a.speed,a.wavelength,a.foam);
          gl.uniform4f(u.optics,a.horizon,a.near,a.perspective,a.light);gl.uniform1f(u.foamThreshold,a.foamThreshold);
          for(const [key,layer] of [['cloud',profile.clouds],['pine',profile.pines],['grass',profile.grass]])gl.uniform4f(u[key],layer.enabled?layer.amplitude:0,layer.speed,0,0);
          uniformProfile=profile;
        }
        gl.drawArrays(gl.TRIANGLES,0,6);
      },dispose,
    };
  }catch(error){dispose();throw error;}
}
