import {deliveryOrderLinks} from './food-delivery-state.mjs?v=2026102201';

const element=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
let orders;
export function prepareDeliveryOrderLinks(base){
 orders ||= fetch(new URL('data/food-delivery.json',base)).then(r=>{if(!r.ok)throw Error('delivery_data');return r.json();}).catch(error=>{orders=null;throw error;});
 return orders;
}
// Called only beside an existing delivery note in the normal Trip editor.
export function appendDeliveryOrderLinks(mount,note,base){
 if(!note?.includes('Доставка еды — '))return;
 const pending=element('p','Загружаем ссылку поставщика…');pending.className='journey-note';pending.setAttribute('role','status');mount.append(pending);mount.setAttribute('aria-busy','true');
 prepareDeliveryOrderLinks(base).then(data=>{
  if(!mount.isConnected)return;
  const list=element('p');list.className='journey-note';list.dataset.deliveryOrderLinks='';
  for(const row of deliveryOrderLinks(note,data)){
   const link=element('a',`Заказать у ${row.name} ↗`);link.href=row.url;link.rel='noopener';link.dataset.deliveryProvider='';list.append(link,element('br'));
  }
  pending.remove();if(list.childNodes.length)mount.append(list);
 }).catch(()=>{if(mount.isConnected)pending.textContent='Ссылка не загрузилась. Проверьте адрес поставщика в тексте заметки выше.';}).finally(()=>{mount.removeAttribute('aria-busy');});
}
