// One same-origin response, with compilation off the UI thread when supported.
// A failed worker or unsupported module cloning uses the same downloaded bytes.
async function compileInWorker(bytes) {
  let worker;
  try {
    worker = new Worker(new URL('./wasm-compile-worker.mjs', import.meta.url), {type:'module'});
    return await new Promise((resolve,reject) => {
      worker.onmessage = ({data}) => {
        if (!(data.module instanceof WebAssembly.Module)) reject(new Error(data.error || 'Ответ расчётного модуля не прочитан'));
        else resolve(data);
      };
      worker.onerror = event => {event.preventDefault();reject(new Error('Рабочий поток расчёта недоступен'));};
      worker.onmessageerror = () => reject(new Error('Ответ расчётного модуля не прочитан'));
      // Keep the original for recovery, without a second network request.
      const copy = bytes.slice(0);
      worker.postMessage({bytes:copy}, [copy]);
    });
  } finally {
    worker?.terminate();
  }
}

export async function instantiateWasm(response, {name='module', imports={}}={}) {
  if (!response.ok) throw new Error('Расчётный модуль недоступен');
  const mark = (stage, options) => performance.mark(`godune:wasm-${name}-${stage}`, options);
  const bytes = await response.arrayBuffer();
  let compiled;
  if (typeof Worker !== 'undefined') {
    mark('worker-start');
    try {compiled = await compileInWorker(bytes);}
    catch (error) {mark('worker-fallback', {detail:error.message});}
  }
  if (compiled) {
    for (const [stage,at] of [['compile-start',compiled.started],['compile-ready',compiled.finished]]) {
      mark(stage, {startTime:Math.max(0,at-performance.timeOrigin),detail:'worker'});
    }
    mark('instantiate-start');
    const instance = await WebAssembly.instantiate(compiled.module, imports);
    mark('ready', {detail:'worker'});
    return {instance, module:compiled.module, compiler:'worker'};
  }
  mark('compile-start', {detail:'main'});
  const result = await WebAssembly.instantiate(bytes, imports);
  mark('ready', {detail:'main'});
  return {...result, compiler:'main'};
}
