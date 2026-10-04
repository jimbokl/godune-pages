import {renderKosaPdf} from './kosa-pdf-renderer.mjs?v=5';
self.onmessage=async({data})=>{
  try{const result=await renderKosaPdf(data,{onProgress:progress=>self.postMessage({progress})});self.postMessage({result},[result.bytes.buffer]);}
  catch(error){self.postMessage({error:error.message || 'Путеводитель не собрался. Повторите попытку.'});}
};
