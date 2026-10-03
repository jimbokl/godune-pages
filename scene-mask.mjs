// The same rasterizer runs in a worker and in the cooperative browser fallback.
// Masks remain in photo coordinates; editor profiles need no prebuilt assets.
export const SCENE_MASK_LAYERS = ['water', 'clouds', 'pines', 'grass'];
const yieldTask = () => globalThis.scheduler?.yield
  ? globalThis.scheduler.yield() : new Promise(resolve => setTimeout(resolve, 0));
function canvasOf(width, height) {
  const canvas = typeof document === 'undefined'
    ? new OffscreenCanvas(width, height) : document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  return canvas;
}
async function maskImage(url) {
  if (typeof Image !== 'undefined') {
    const image = new Image(); image.crossOrigin = 'anonymous'; image.src = url;
    await image.decode(); return image;
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error('Не удалось загрузить маску сцены');
  return createImageBitmap(await response.blob());
}
export async function rasterizeSceneMasks(profile, width, height, pause = yieldTask) {
  const packed = new Uint8Array(width * height * 4);
  for (const [channel, name] of SCENE_MASK_LAYERS.entries()) {
    const layer = profile[name];
    if (!layer.enabled) continue;
    await pause();
    const canvas = canvasOf(width, height);
    const ctx = canvas.getContext('2d', {willReadFrequently: true});
    if (!ctx) throw new Error('Недоступна подготовка масок');
    ctx.fillStyle = 'black'; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = 'white';
    for (const poly of layer.mask.polygons) {
      ctx.beginPath();
      poly.forEach(([x, y], i) => i ? ctx.lineTo(x * width, y * height) : ctx.moveTo(x * width, y * height));
      ctx.closePath(); ctx.fill();
    }
    if (layer.mask.image) {
      const image = await maskImage(layer.mask.image);
      try { ctx.drawImage(image, 0, 0, width, height); } finally { image.close?.(); }
    }
    if (layer.feather) {
      await pause();
      const soft = canvasOf(width, height), c = soft.getContext('2d');
      if (!c || !('filter' in c)) throw new Error('Недоступно сглаживание маски');
      c.filter = `blur(${layer.feather * width}px)`; c.drawImage(canvas, 0, 0);
      ctx.drawImage(soft, 0, 0);
    }
    await pause();
    const pixels = ctx.getImageData(0, 0, width, height).data;
    // Preserve the original edge erosion. Chunking keeps the fallback responsive.
    for (let start = 0; start < width * height; start += 32768) {
      if (start) await pause();
      const end = Math.min(start + 32768, width * height);
      for (let i = start; i < end; i++) packed[i * 4 + channel] = Math.max(0, (pixels[i * 4] - 100) * 255 / 155);
    }
  }
  return packed;
}
export function createSceneMaskBuilder() {
  let worker, failed = false, closed = false, sequence = 0;
  const pending = new Map();
  function stop(error) {
    worker?.terminate(); worker = null;
    for (const job of pending.values()) job.reject(error);
    pending.clear();
  }
  return {
    async render(profile, width, height) {
      if (closed) throw new Error('Сцена закрыта');
      if (!failed && typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined') {
        try {
          if (!worker) {
            worker = new Worker(new URL('./scene-mask-worker.mjs', import.meta.url), {type: 'module'});
            worker.onmessage = ({data}) => {
              const job = pending.get(data.id);
              if (!job) return;
              pending.delete(data.id);
              if (data.error) job.reject(new Error(data.error)); else job.resolve(new Uint8Array(data.buffer));
            };
            worker.onerror = event => { event.preventDefault(); failed = true; stop(new Error('Рабочий поток сцены недоступен')); };
            worker.onmessageerror = () => { failed = true; stop(new Error('Не удалось получить маску')); };
          }
          const id = ++sequence;
          return await new Promise((resolve, reject) => {
            pending.set(id, {resolve, reject});
            try { worker.postMessage({id, profile, width, height}); }
            catch (error) { pending.delete(id); reject(error); }
          });
        } catch (error) {
          if (closed) throw error;
          failed = true; stop(error);
        }
      }
      return rasterizeSceneMasks(profile, width, height);
    },
    dispose() { closed = true; stop(new Error('Сцена закрыта')); }
  };
}
