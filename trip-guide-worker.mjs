import {renderTripGuide} from './trip-guide-renderer.mjs?v=11';
self.onmessage=async({data})=>{try{const result=await renderTripGuide(data,{onProgress:progress=>self.postMessage({progress})});self.postMessage({result},[result.bytes.buffer]);}catch(error){self.postMessage({error:error.message});}};
