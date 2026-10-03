(() => {
  'use strict';
  const scene = document.querySelector('.atmosphere');
  if (!scene) return;
  const base = new URL('.', document.currentScript.src);
  const canvas = scene.querySelector('canvas');
  const ctx = canvas.getContext('2d', {alpha: true});
  if (!ctx) return;
  const mist = scene.querySelector('.mist-layer');
  const farMist = scene.querySelector('.mist-layer.far');
  const sand = scene.querySelector('.sand-layer');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let visible = true, raf = 0, previous = 0, elapsed = 0, frames = 0;
  let width = 0, height = 0, dpr = 1, engine, pointer, values, header = 12, ocean, profile, crop, birdPointer, birdValues, liveVideo;
  let sceneModule;
  const photo = scene.parentElement.querySelector('.hero-picture img');
  // Source-space density stays constant when a phone crops the photograph.
  const count = 390;
  const glow = document.createElement('canvas');
  glow.width = glow.height = 48;
  const g = glow.getContext('2d');
  const light = g.createRadialGradient(24,24,0,24,24,24);
  light.addColorStop(0,'rgba(246,212,157,.8)');
  light.addColorStop(.15,'rgba(235,184,105,.5)');
  light.addColorStop(.4,'rgba(211,146,64,.14)');
  light.addColorStop(1,'rgba(221,149,54,0)');
  g.fillStyle = light; g.fillRect(0,0,48,48);

  function resize() {
    const rect = scene.getBoundingClientRect();
    width = rect.width; height = rect.height;
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    if (ocean) ocean.resize(width,height,dpr);
    if (sceneModule && photo.complete && photo.naturalWidth) crop = sceneModule.photoCrop(photo,width,height);
    if (engine) paint();
  }
  function paint() {
    engine.render_frame(pointer,count,elapsed * (profile?.wind.speed ?? 1),0);
    // Recreate the view if a future engine revision grows WASM memory.
    if (values.buffer !== engine.memory.buffer) values = new Float32Array(engine.memory.buffer,pointer,engine.frame_size(count));
    const f = values;
    mist.style.transform = `translate3d(${f[0] * 100}%,0,0)`;
    mist.style.opacity = f[1] * (profile?.fog.enabled === false ? 0 : profile?.fog.strength ?? 1);
    sand.style.transform = `translate3d(${f[2] * 100}%,${f[7] * 100}%,0)`;
    sand.style.opacity = f[3] * (profile?.sand.enabled === false ? 0 : profile?.sand.strength ?? 1);
    farMist.style.transform = `translate3d(${f[4] * 100}%,0,0)`;
    farMist.style.opacity = f[5] * (profile?.fog.enabled === false ? 0 : profile?.fog.strength ?? 1);
    if (ocean) ocean.draw(f[8],f[9]);
    ctx.clearRect(0,0,width,height);
    const scale = width < 600 ? .9 : 1;
    const night = document.documentElement.dataset.theme === 'night';
    const grains = [];
    for (let i = header; i < f.length; i += 8) {
      const type = f[i+6] ? 'amber' : 'sand';
      const settings = profile?.[type];
      if (settings?.enabled === false) continue;
      const point = sceneModule?.particleSourcePoint(f[i],f[i+1],type,settings);
      if (sceneModule && !point) continue;
      const [sx,sy] = point || [f[i], type === 'amber' ? .53+f[i+1]*.4 : f[i+1]];
      const x = crop ? (sx-crop[2])/crop[0]*width : sx*width;
      const y = crop ? (sy-crop[3])/crop[1]*height : sy*height;
      if (x < 0 || x > width || y < 0 || y > height) continue;
      grains.push({i,type,settings,x,y});
    }
    // Every visible stone takes a turn. Rust limits the simultaneous flashes;
    // the shared pulse still makes inactive stones completely transparent.
    const amberCount = grains.filter(p => p.type === 'amber').length;
    let amberIndex = 0;
    for (const {i,type,settings,x,y} of grains) {
      const radius = f[i+2] * scale;
      const alpha = type === 'amber' ? engine.amber_glint(amberIndex++,amberCount,f[8]) : f[i+3];
      ctx.globalAlpha = Math.min(1,alpha * (settings?.strength ?? 1));
      if (f[i+6] === 1) {
        const strength = settings?.strength ?? 1;
        // Both the pebble and its reflection fade to zero between flashes.
        // Preserve the peak colour while the Rust pulse controls visibility.
        ctx.globalAlpha = Math.min(1,strength * (night ? .52 : .64) * Math.min(1,alpha/.9));
        ctx.fillStyle = '#a7632c';
        ctx.beginPath();ctx.ellipse(x,y,radius*.95,radius*.55,f[i+7]*2,0,Math.PI*2);ctx.fill();
        ctx.fillStyle = '#d59a4c';
        ctx.beginPath();ctx.ellipse(x-radius*.18,y-radius*.15,radius*.68,radius*.38,f[i+7]*2,0,Math.PI*2);ctx.fill();
        if (alpha > 0) {
          ctx.globalAlpha = Math.min(1,alpha * strength) * (night ? .287 : .82);
          const size = radius * 6 * (night ? .8 : 1);
          ctx.drawImage(glow,x-size/2,y-size/2,size,size);
          ctx.fillStyle = '#f5d7a0';
          ctx.fillRect(x-radius*.25,y-radius*.3,radius*.7,radius*.4);
        }
      } else {
        // Short, warm streaks follow the slope. They read as wind-blown sand.
        ctx.lineWidth = radius;
        ctx.strokeStyle = f[i+7] > .5 ? '#faefd6' : '#dfc899';
        ctx.beginPath();
        const angle=(profile?.wind.angle ?? 8)*Math.PI/180;
        ctx.moveTo(x-f[i+4]*scale*Math.cos(angle),y-f[i+4]*scale*Math.sin(angle));
        ctx.lineTo(x,y); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    if (engine && profile?.gulls.enabled && crop) {
      const n = profile.gulls.count;
      engine.render_birds(birdPointer,n,elapsed * profile.wind.speed);
      birdValues = new Float32Array(engine.memory.buffer,birdPointer,engine.frame_size(12));
      const r = profile.gulls.region;
      ctx.strokeStyle='#465760'; ctx.lineWidth=.85;
      for (let j=header;j<header+n*8;j+=8) {
        const sx=r[0]+birdValues[j]*(r[2]-r[0]), sy=r[1]+birdValues[j+1]*(r[3]-r[1]);
        const x=(sx-crop[2])/crop[0]*width, y=(sy-crop[3])/crop[1]*height;
        const span=birdValues[j+2], wing=birdValues[j+4]*span*.32;
        ctx.globalAlpha=Math.min(1,birdValues[j+3]*profile.gulls.strength);
        ctx.beginPath();ctx.moveTo(x-span,y+wing);ctx.quadraticCurveTo(x-span*.45,y-span*.22,x,y);
        ctx.quadraticCurveTo(x+span*.45,y-span*.22,x+span,y+wing);ctx.stroke();
      }
      ctx.globalAlpha=1;
    }
    frames++;
    if (frames % 30 === 1) scene.dataset.frames = String(frames);
  }
  function tick(now) {
    raf = requestAnimationFrame(tick);
    if (now - previous < 1000/30) return;
    elapsed += Math.min((now - previous)/1000,.06);
    previous = now;
    paint();
  }
  function update() {
    const running = engine && visible && !document.hidden && !reduced.matches;
    scene.classList.toggle('motion-paused', !running);
    scene.dataset.motion = reduced.matches ? 'reduced' : running ? 'running' : 'paused';
    if (liveVideo) {
      if (running) liveVideo.play().catch(()=>{}); else liveVideo.pause();
      liveVideo.style.opacity = reduced.matches ? '0' : '1';
    }
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (engine && reduced.matches) paint();
    if (running) { previous = performance.now(); raf = requestAnimationFrame(tick); }
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); }).observe(scene);
  }
  new ResizeObserver(resize).observe(scene);
  document.addEventListener('visibilitychange', update);
  addEventListener('godune:theme-change', () => { if (engine) paint(); });
  reduced.addEventListener('change', update);
  addEventListener('pagehide', () => { cancelAnimationFrame(raf); raf = 0; });
  addEventListener('pageshow', update);
  resize();
  async function start() {
    const response = await fetch(new URL('assets/atmosphere.wasm?v=6',base));
    if (!response.ok) throw new Error('Атмосферный слой недоступен');
    const {instance} = await WebAssembly.instantiate(await response.arrayBuffer(),{});
    engine = instance.exports;
    header = engine.frame_header_size();
    pointer = engine.alloc_frame(count);
    birdPointer = engine.alloc_frame(12);
    values = new Float32Array(engine.memory.buffer,pointer,engine.frame_size(count));
    scene.classList.add('wasm-atmosphere');
    scene.dataset.engine = 'rust-wasm';
    paint(); update();
    try {
      sceneModule = await import(new URL('scene.mjs?v=6',base));
      const profileURL = new URL(scene.dataset.profile || 'assets/scenes/baltic-dunes.json',base);
      profileURL.searchParams.set('v','3');
      profile = await sceneModule.loadProfile(profileURL);
      await photo.decode();
      if (profile.live?.enabled && profile.live.src && !navigator.connection?.saveData && !reduced.matches) {
        liveVideo=document.createElement('video');liveVideo.className='scene-video';
        liveVideo.muted=true;liveVideo.loop=true;liveVideo.playsInline=true;liveVideo.preload='none';
        liveVideo.setAttribute('aria-hidden','true');liveVideo.src=profile.live.src;
        liveVideo.addEventListener('error',()=>{liveVideo.style.display='none';});
        photo.parentElement.after(liveVideo);
        // Native motion is the base; avoid distorting moving trees/water again.
        for (const name of sceneModule.LAYERS) profile[name].enabled=false;
      }
      ocean = await sceneModule.createScene(scene.parentElement.querySelector('.ocean-canvas'),photo,profile);
      resize(); paint();
      update();
    } catch (error) { scene.dataset.sceneError = error.message; }

  }
  // Generated layers remain visible if WASM or canvas is unavailable.
  start().catch(() => { scene.dataset.engine = 'css-fallback'; scene.classList.remove('motion-paused'); });
})();
