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
  const resolutionCeiling = navigator.connection?.saveData || innerWidth < 700 ? 1 : 1.5;
  // The sharp photograph remains a separate image. Only moving overlays start
  // smaller on a wide screen; measured spare time earns their extra pixels.
  let resolutionLimit = innerWidth >= 700 && !navigator.connection?.saveData ? .75 : 1;
  let qualityRaised = false, qualityReduced = false;
  let sampleCost = 0, sampleFrames = 0, sampleLag = 0, fps = 30;
  scene.dataset.quality = String(resolutionLimit);
  let sceneModule;
  const photo = scene.parentElement.querySelector('.hero-picture img');
  // Source-space density stays constant when a phone crops the photograph.
  const count = 390;
  const glow = document.createElement('canvas');
  glow.width = glow.height = 48;
  const g = glow.getContext('2d');
  const light = g.createRadialGradient(24,24,0,24,24,24);
  light.addColorStop(0,'rgba(255,231,158,1)');
  light.addColorStop(.15,'rgba(255,188,65,.78)');
  light.addColorStop(.4,'rgba(230,142,25,.28)');
  light.addColorStop(1,'rgba(221,149,54,0)');
  g.fillStyle = light; g.fillRect(0,0,48,48);

  function amberShard(x,y,radius,depth,alpha,strength,night) {
    const stone = radius * 1.65;
    const angle = depth * 2, cosine = Math.cos(angle), sine = Math.sin(angle);
    const taper = .86 + depth * .18;
    const polygon = points => {
      ctx.beginPath();
      points.forEach(([px,py],index) => {
        const dx = px * stone, dy = py * stone * taper;
        const sx = x + dx*cosine-dy*sine, sy = y + dx*sine+dy*cosine;
        if (index) ctx.lineTo(sx,sy); else ctx.moveTo(sx,sy);
      });
      ctx.closePath();ctx.fill();
    };
    const body = Math.min(1,strength * (night ? .72 : .94) * Math.min(1,alpha/.9));
    // The lower, uneven rim gives each small shard thickness. Even this rim
    // follows the Rust pulse: no stone remains visible between reflections.
    ctx.globalAlpha = body;
    ctx.fillStyle = '#814110';
    polygon([[-1,.02],[-.76,-.48],[-.15,-.68],[.51,-.5],[.99,-.07],[.72,.47],[.01,.63],[-.73,.42]]);
    if (alpha <= 0) return;
    // The bright centre stays inside the amber. The external halo below keeps
    // its previous diameter and strength instead of spreading across the sand.
    const colour = ctx.createRadialGradient(x-stone*.22,y-stone*.2,0,x,y,stone*1.1);
    colour.addColorStop(0,'#ffe399');
    colour.addColorStop(.35,'#f4bc4f');
    colour.addColorStop(.76,'#ce7d20');
    colour.addColorStop(1,'#9d5115');
    ctx.globalAlpha = body * .78;
    ctx.fillStyle = colour;
    polygon([[-.86,-.01],[-.64,-.42],[-.14,-.56],[.42,-.42],[.84,-.09],[.6,.32],[0,.46],[-.62,.3]]);
    ctx.globalAlpha = body * .6;ctx.fillStyle = '#a65c16';
    polygon([[-.02,-.23],[.76,-.06],[.52,.31],[.06,.43]]);
    ctx.globalAlpha = body * .9;ctx.fillStyle = '#f8c75f';
    polygon([[-.65,-.34],[-.12,-.52],[.4,-.31],[-.04,-.08]]);
    ctx.globalAlpha = body * .56;ctx.fillStyle = '#e99a29';
    polygon([[-.6,-.13],[-.04,-.08],[.08,.43],[-.52,.26]]);
    ctx.globalAlpha = Math.min(1,alpha * strength * 1.55) * (night ? .72/.94 : 1);
    ctx.fillStyle = '#fff0bd';
    polygon([[-.34,-.35],[-.06,-.46],[.14,-.26],[-.13,-.08]]);
    ctx.globalAlpha = Math.min(1,alpha * strength * 1.2) * (night ? .35 : 1);
    const size = radius * 6 * (night ? .8 : 1);
    ctx.drawImage(glow,x-size/2,y-size/2,size,size);
  }

  function resize() {
    const rect = scene.getBoundingClientRect();
    const nextDpr = Math.min(devicePixelRatio || 1, resolutionLimit);
    const changed = width !== rect.width || height !== rect.height || dpr !== nextDpr;
    width = rect.width; height = rect.height; dpr = nextDpr;
    // Read photo styling before canvas writes; one crop serves GPU and particles.
    if (sceneModule && photo.complete && photo.naturalWidth && (changed || !crop))
      crop = sceneModule.photoCrop(photo,width,height);
    if (changed) {
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr,0,0,dpr,0,0);
    }
    scene.dataset.quality = String(dpr);
    if (ocean) ocean.resize(width,height,dpr,crop);
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
      if (alpha <= 0) continue;
      ctx.globalAlpha = Math.min(1,alpha * (settings?.strength ?? 1));
      if (f[i+6] === 1) {
        amberShard(x,y,radius,f[i+7],alpha,settings?.strength ?? 1,night);
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
    const interval = now - previous;
    if (interval < 1000/fps) return;
    elapsed += Math.min(interval/1000,.1);
    previous = now;
    const began = performance.now();
    paint();
    // GPU commands can return before the GPU finishes. Measure both drawing
    // time and the following frame interval, including software GPU overload.
    // Three measured frames are enough to step down under real overload. A long
    // warm-up otherwise makes a weak device pay for 24 heavy initial frames.
    if (frames > 3) {
      sampleCost += performance.now() - began;
      sampleLag += interval;
      if (++sampleFrames === (frames < 30 ? 3 : 12)) {
        const overloaded = sampleCost / sampleFrames > 12 || sampleLag / sampleFrames > 65;
        const comfortable = sampleCost / sampleFrames < 6 && sampleLag / sampleFrames < 45;
        if (overloaded && dpr > .5) {
          qualityReduced = true;
          resolutionLimit = dpr > 1 ? 1 : dpr > .75 ? .75 : .5;
          resize();
          performance.mark('godune:scene-quality', {detail:String(dpr)});
        } else if (overloaded && fps > 15) {
          qualityReduced = true;
          fps = fps === 30 ? 20 : 15;
          scene.dataset.fps = String(fps);
          performance.mark('godune:scene-fps', {detail:String(fps)});
        } else if (comfortable && frames >= 30 && !qualityRaised && !qualityReduced && resolutionCeiling > 1) {
          qualityRaised = true;
          resolutionLimit = resolutionCeiling;
          resize();
          performance.mark('godune:scene-quality', {detail:String(dpr)});
        }
        sampleCost = 0; sampleFrames = 0; sampleLag = 0;
      }
    }
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
    sampleCost = 0; sampleFrames = 0; sampleLag = 0;
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
  // Fetch and compile while the photograph is loading. Only visible work waits
  // for its first paint; a busy planner must not postpone the scene's requests.
  performance.mark('godune:atmosphere-start');
  const wasmReady = (async () => {
    performance.mark('godune:atmosphere-wasm-start');
    const response = await fetch(new URL('assets/atmosphere.wasm?v=6',base));
    if (!response.ok) throw new Error('Атмосферный слой недоступен');
    const backup = response.clone();
    let result;
    try { result = await WebAssembly.instantiateStreaming(response,{}); }
    catch { result = await WebAssembly.instantiate(await backup.arrayBuffer(),{}); }
    performance.mark('godune:atmosphere-wasm-ready');
    return result;
  })();
  const sceneReady = import(new URL('scene.mjs?v=10',base)).then(async module => {
    const profileURL = new URL(scene.dataset.profile || 'assets/scenes/baltic-dunes.json',base);
    profileURL.searchParams.set('v','3');
    return {module,profile:await module.loadProfile(profileURL)};
  });
  // A failed optional layer must not produce an unhandled rejection while the
  // photograph is still loading. start() handles each result below.
  wasmReady.catch(()=>{}); sceneReady.catch(()=>{});
  async function start() {
    const {instance} = await wasmReady;
    engine = instance.exports;
    header = engine.frame_header_size();
    pointer = engine.alloc_frame(count);
    birdPointer = engine.alloc_frame(12);
    values = new Float32Array(engine.memory.buffer,pointer,engine.frame_size(count));
    scene.classList.add('wasm-atmosphere');
    scene.dataset.engine = 'rust-wasm';
    paint(); update();
    try {
      ({module:sceneModule,profile} = await sceneReady);
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
      resize();
      update();
      performance.mark('godune:atmosphere-ready');
    } catch (error) { scene.dataset.sceneError = error.message; }

  }
  // Fetch/compile above remains parallel. Rendering starts after the document's
  // resources and fonts settle, so GPU work cannot delay the first photograph
  // or compete with a font-driven relayout. No device/benchmark detection.
  async function afterPhotoPaint() {
    await photo.decode().catch(()=>{});
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    performance.mark('godune:atmosphere-photo-painted');
    if (document.readyState !== 'complete') {
      await new Promise(resolve=>addEventListener('load',resolve,{once:true}));
    }
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    if (document.fonts) await document.fonts.ready;
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    performance.mark('godune:atmosphere-stable-paint');
    return start();
  }
  afterPhotoPaint().catch(() => { scene.dataset.engine = 'css-fallback'; scene.classList.remove('motion-paused'); });
})();
