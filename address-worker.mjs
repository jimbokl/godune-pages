import {loadAddressEngine} from './address-search.mjs?v=2026101305';
let engine;
self.onmessage=async({data})=>{try{if(!engine)engine=loadAddressEngine(data.base).catch(e=>{engine=null;throw e;});const ready=await engine;postMessage({id:data.id,...ready.search(data.query,data.near)});}catch{postMessage({id:data.id,error:'Адреса не загрузились. Попробуйте ещё раз или выберите точку на карте.'});}};
