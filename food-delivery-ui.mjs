import {plannerDayUrl} from './trip-day-link.mjs?v=2026101707';
import {ensureJourney,selectedDay} from './trip-days-state.mjs?v=2026101707';
import {deliveryFactState,deliverySelection,addDeliveryNote,deliveryOrderLinks} from './food-delivery-state.mjs?v=2026102201';

const element=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
let orders;
// Called only beside an existing delivery note in the normal Trip editor.
export function appendDeliveryOrderLinks(mount,note,base){
 if(!note?.includes('Доставка еды — '))return;
 orders ||= fetch(new URL('data/food-delivery.json',base)).then(r=>{if(!r.ok)throw Error('delivery_data');return r.json();}).catch(error=>{orders=null;throw error;});
 orders.then(data=>{
  if(!mount.isConnected)return;
  const list=element('p');list.className='journey-note';list.dataset.deliveryOrderLinks='';
  for(const row of deliveryOrderLinks(note,data)){
   const link=element('a',`Заказать у ${row.name} ↗`);link.href=row.url;link.rel='noopener';link.dataset.deliveryProvider='';list.append(link,element('br'));
  }
  if(list.childNodes.length)mount.append(list);
 }).catch(()=>{});
}
export async function initFoodDelivery(root=document){
 const mount=root.querySelector('[data-food-delivery]');if(!mount)return;
 const base=new URL('../../',location.href),response=await fetch(new URL('data/food-delivery.json',base));
 if(!response.ok)throw Error('delivery_data');const data=await response.json();
 const updateFreshness=()=>mount.querySelectorAll('[data-delivery-fact]').forEach(node=>{
  const [kind,id,key]=JSON.parse(node.dataset.deliveryFact),row=data[kind].find(v=>v.id===id),fact=row?.facts[key];
  node.hidden=deliveryFactState(fact)==='confirmed';
 });
 const updateProviderFreshness=()=>mount.querySelectorAll('[data-delivery-provider-facts]').forEach(node=>{
  const [id,keys]=JSON.parse(node.dataset.deliveryProviderFacts),provider=data.providers.find(p=>p.id===id);
  node.hidden=keys.every(key=>deliveryFactState(provider?.facts[key])==='confirmed');
 });
 const refreshFacts=()=>{updateFreshness();updateProviderFreshness();};refreshFacts();
 let contextPromise,opened;
 async function context(){
  contextPromise ||= (async()=>{
   const [{createTripMemory},{loadTrip},r]=await Promise.all([import('./trip-memory.mjs?v=2026101902'),import('./trip-memory-bootstrap.mjs?v=2026101707'),fetch(new URL('data/catalog.json',base))]);
   if(!r.ok)throw Error('catalog_load');const catalog=await r.json();let storage;try{storage=localStorage;}catch{}
   const memory=createTripMemory(catalog,loadTrip(storage,catalog),storage);await memory.ready;return memory;
  })().catch(error=>{contextPromise=null;throw error;});return contextPromise;
 }
 for(const trigger of mount.querySelectorAll('[data-delivery-save]')){
  trigger.disabled=false;
  trigger.addEventListener('click',async()=>{
   trigger.disabled=true;const status=root.querySelector('[data-delivery-status]');
   try{
    const memory=await context();await memory.sync();opened?.remove();
    const form=element('form');form.className='delivery-save-form';form.dataset.deliveryForm='';
    const label=element('label','В какой день сохранить '),select=element('select');select.name='delivery-day';label.append(select);
    const trip=ensureJourney(memory.get());for(const [i,day]of trip.itinerary.days.entries()){
     const option=element('option',`День ${i+1} · ${day.date||'без даты'}`);option.value=day.id;select.append(option);
    }select.value=selectedDay(trip).id;
    const preview=element('p');preview.className='delivery-note-preview';
    let revision,selection;
    function refresh(){revision=memory.revision;selection=deliverySelection(data,trigger.dataset.deliverySave,trigger.dataset.deliveryOffer||null);preview.textContent=selection.text;refreshFacts();}
    refresh();select.addEventListener('change',refresh);
    const save=element('button','Сохранить в заметке дня');save.type='submit';const cancel=element('button','Закрыть');cancel.type='button';
    cancel.addEventListener('click',()=>{form.remove();trigger.focus();});
    form.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();cancel.click();}});
    const feedback=element('p');feedback.setAttribute('role','status');feedback.dataset.deliveryFeedback='';const multiple=trip.itinerary.days.length>1;
    form.append(multiple?label:element('p',`Сохранить в заметке дня: ${select.selectedOptions[0].textContent}.`),preview,save,cancel,feedback);trigger.after(form);opened=form;
    preview.tabIndex=-1;(multiple?select:preview).focus({preventScroll:true});form.scrollIntoView({block:'start'});
    select.addEventListener('change',()=>{feedback.textContent='';});
    function receipt(message,saved){
     feedback.textContent=message;if(saved){const link=element('a','Открыть заметку дня →'),url=plannerDayUrl(base,select.value);url.hash='journey-details';link.href=url;feedback.append(' ',link);}
    }
    const dayLabel=()=>select.selectedOptions[0].textContent;
    form.addEventListener('submit',async event=>{
     event.preventDefault();save.disabled=true;refreshFacts();
     try{
      const current=memory.get(),next=addDeliveryNote(current,deliverySelection(data,selection.providerId,selection.offerId),select.value);
      if(JSON.stringify(next)===JSON.stringify(current)){receipt(`Этот выбор уже есть в заметке дня: ${dayLabel()}.`,memory.saved);return;}
      const result=await memory.change(t=>addDeliveryNote(t,deliverySelection(data,selection.providerId,selection.offerId),select.value),{expectedRevision:revision});
      if(result.conflict){await memory.sync();refresh();feedback.textContent='Поездка изменилась. Проверьте день и нажмите «Сохранить» ещё раз.';return;}
      revision=memory.revision;
      receipt(result.saved?`Выбор сохранён в заметке дня: ${dayLabel()}. Заказ оформите у поставщика.`:`Выбор остался в этой вкладке: память недоступна. День: ${dayLabel()}. Откройте поездку и скачайте файл.`,result.saved);
      if(result.saved)document.dispatchEvent(new CustomEvent('godune:useful-action',{detail:'delivery_saved'}));
     }catch{feedback.textContent='Выбор не сохранён. Откройте поездку и проверьте выбранный день.';}
     finally{save.disabled=false;}
    });status.textContent='';
   }catch{status.textContent='Не удалось открыть поездку. Ссылки заказа и условия доступны выше.';}
   finally{trigger.disabled=false;}
  });
 }
 mount.dataset.deliveryReady='true';
}
if(typeof document!=='undefined'&&document.querySelector('[data-food-delivery]'))initFoodDelivery().catch(()=>{
 const status=document.querySelector('[data-delivery-status]');if(status)status.textContent='Сохранение пока не загрузилось. Условия и ссылки поставщиков доступны на странице.';
});
