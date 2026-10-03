let engine;
// Every caller uses Rust. A failed WASM load never silently switches to different maths.
export function loadScheduler(base) {
  if (!engine) engine = fetch(new URL('assets/trip.wasm?v=12',base)).then(async response => {
    if (!response.ok) throw Error('Не удалось загрузить расчёт дня.');
    const {instance} = await WebAssembly.instantiate(await response.arrayBuffer());
    const plan = input => calculate(instance.exports,input);
    plan.light = input => calculateLight(instance.exports,input);
    plan.budget = input => calculateBudget(instance.exports,input);
    plan.offers = input => calculateOffers(instance.exports,input);
    return plan;
  }).catch(error => {engine=null;throw error;});
  return engine;
}
export const calculate = (wasm,input) => invoke(wasm,input,'trip_plan','schedule');
export const calculateLight = (wasm,input) => invoke(wasm,input,'trip_light','light');
export const calculateBudget = (wasm,input) => invoke(wasm,input,'trip_budget','budget');
export const calculateOffers = (wasm,input) => invoke(wasm,input,'trip_offers','offers');
function invoke(wasm, input, method, key) {
  const bytes = new TextEncoder().encode(JSON.stringify(input));
  const pointer = wasm.trip_alloc(bytes.length); let output, length;
  try {
    new Uint8Array(wasm.memory.buffer,pointer,bytes.length).set(bytes);
    output = wasm[method](pointer,bytes.length);
    length = new DataView(wasm.memory.buffer).getUint32(output,true);
    const result = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(new Uint8Array(wasm.memory.buffer,output+4,length)));
    if (!result.ok) throw Error(result.error);
    return result[key];
  } finally {
    wasm.trip_free(pointer,bytes.length);
    if (output !== undefined && length !== undefined) wasm.trip_free(output,length+4);
  }
}
