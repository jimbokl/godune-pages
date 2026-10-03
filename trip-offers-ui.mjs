import {selectedDay,COST_KINDS} from './trip-days-state.mjs?v=8';
import {validOffers,offerInput,offerContext,offerBlocked,offerStatusText,snapshotNotice} from './trip-offers-state.mjs?v=1';
import {loadScheduler} from './trip-scheduler.mjs?v=9';
import {rubles} from './trip-budget-state.mjs?v=1';
const el=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
const money=amount=>amount===null?'Цена ещё неизвестна':rubles(amount);
const dateLabel=v=>new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(v+'T12:00:00Z'));
export function initTripOffers({panel,read,base,catalog,openOffer}) {
  const box=el('details',undefined,'trip-offers');box.id='trip-offers';box.append(el('summary','Цены по вашим остановкам'));
  box.append(el('p','Выберите блюдо или услугу для плана. Дата и источник останутся с ценой; сколько заплатили, запишете отдельно.','journey-note'));
  const list=el('div',undefined,'trip-offer-groups'),status=el('p','','journey-note');status.setAttribute('role','status');status.setAttribute('aria-live','polite');box.append(list,status);panel.querySelector('#expense-categories').before(box);
  let quotes=null,promise,epoch=0,started=false;
  function load() {
    promise ||= fetch(new URL('data/offers.json',base)).then(async r=>{if(!r.ok)throw Error('offers_unavailable');const data=await r.json();if(!validOffers(data,catalog))throw Error('offers_invalid');quotes=data.offers;return quotes;}).catch(error=>{promise=null;throw error;});return promise;
  }
  function savedNotes(trip,engine) {
    const day=selectedDay(trip),people=trip.itinerary?.people || 1;
    for(const kind of Object.keys(COST_KINDS))for(const item of day.costs[kind]?.items || []) {
      const quote=item.source?.offer;if(!quote)continue;
      const card=[...panel.querySelectorAll('.expense-card')].find(n=>n.dataset.expenseId===item.id);if(!card)continue;
      let note=card.querySelector('.expense-offer-note');if(!note){note=el('p','','expense-offer-note');card.querySelector('.expense-source').after(note);}
      let evaluation;try{evaluation=engine?.offers(offerInput([quote],day,people,item.quantity,item.scope))[0];}catch{ /* Stored sums stay usable when the evaluator fails. */ }
      note.textContent=snapshotNotice(item,kind,day,quotes,evaluation);
    }
  }
  async function render(trip) {
    const ticket=++epoch,day=selectedDay(trip),people=trip.itinerary?.people || 1;
    box.dataset.offersReady='false';list.replaceChildren();status.textContent='Открываем цены с датой…';
    let engine=null;
    try{engine=await loadScheduler(base);}catch{}
    if(ticket!==epoch)return;
    savedNotes(trip,engine);
    try{await load();}catch{
      if(ticket!==epoch)return;box.dataset.offersReady='error';status.textContent='Список цен пока не открылся. Свой расход и сохранённые источники доступны.';
      const retry=el('button','Открыть цены ещё раз','expense-button');retry.type='button';retry.addEventListener('click',()=>render(read()));list.append(retry);savedNotes(trip,engine);return;
    }
    if(ticket!==epoch)return;savedNotes(trip,engine);
    const selected=quotes.filter(q=>day.places.includes(q.poi));status.textContent='';
    if(!selected.length) {
      list.append(el('p','Добавьте кафе в этот день — здесь появятся цены, для которых у нас есть источник. Для остальных остановок можно внести свою оценку.','journey-note'));
      const link=el('a','Выбрать кафе в Зеленоградске →','text-action');link.href=new URL('food/zelenogradsk/',base);list.append(link);box.dataset.offersReady='true';return;
    }
    if(!started){box.open=true;started=true;}
    let values=[];try{values=engine?.offers(offerInput(selected,day,people)) || [];}catch{}
    for(const poi of day.places.filter(id=>selected.some(q=>q.poi===id))) {
      const rows=selected.filter(q=>q.poi===poi),place=catalog.poi.find(p=>p.slug===poi),group=el('section',undefined,'trip-offer-group'),head=el('div',undefined,'trip-offer-place');group.dataset.offerPoi=poi;
      const commonSource=rows.every(q=>JSON.stringify([q.origin,q.source_label,q.source_href,q.observed_at])===JSON.stringify([rows[0].origin,rows[0].source_label,rows[0].source_href,rows[0].observed_at]));
      const commonTerms=rows.every(q=>q.terms===rows[0].terms),commonState=rows.every(q=>values.find(v=>v.id===q.id)?.state===values.find(v=>v.id===rows[0].id)?.state);
      const sourceLink=quote=>{const source=el('a',`${quote.origin==='photo'?'Снято':'Проверено'} ${dateLabel(quote.observed_at)} ↗`,'trip-offer-source');source.href=new URL(quote.source_href,base);source.target='_blank';source.rel='noopener noreferrer';return source;};
      if(place?.gastronomy?.cover?.src){const image=el('img');image.src=new URL(place.gastronomy.cover.src,base);image.alt=`Наш снимок · ${place.name}`;image.loading='lazy';image.width=128;image.height=96;head.append(image);}
      const title=el('div');title.append(el('h5',place?.name || poi),el('small',place?.gastronomy?.address || 'Остановка вашего дня'));head.append(title);group.append(head);
      if(commonSource)group.append(sourceLink(rows[0]));
      if(commonState)group.append(el('p',offerStatusText(values.find(v=>v.id===rows[0].id)),'trip-offer-condition'));
      if(commonTerms && rows[0].terms)group.append(el('p',rows[0].terms,'trip-offer-terms'));
      const cards=el('div',undefined,'trip-offer-grid');
      for(const quote of rows) {
        const evaluated=values.find(v=>v.id===quote.id),card=el('article',undefined,'trip-offer-card');card.dataset.offerId=quote.id;
        card.append(el('span',quote.origin==='photo'?'Снимок меню':'Меню заведения','trip-offer-origin'),el('h6',quote.label),el('p',quote.unit,'trip-offer-unit'),el('strong',money(quote.amount),'trip-offer-price'));
        card.append(el('p',evaluated?.total===undefined?'Общий план пока не рассчитан':`${money(evaluated.total)} · ${quote.scope==='person'?`по одной на каждого, вас ${people}`:'одна на всех'}`,'trip-offer-total'));
        if(!commonSource)card.append(sourceLink(quote));
        if(!commonState)card.append(el('p',offerStatusText(evaluated),'trip-offer-condition'));
        if(!commonTerms && quote.terms)card.append(el('p',quote.terms,'trip-offer-terms'));
        const count=Object.values(day.costs).flatMap(c=>c.items || []).filter(i=>i.source?.offer?.id===quote.id && !i.cancelled).length;
        const action=el('button',count?'Добавить ещё в план +':'В план +','expense-button trip-offer-add');action.type='button';action.dataset.offerId=quote.id;action.disabled=offerBlocked(evaluated);
        action.addEventListener('click',async()=>{
          const context=offerContext(day,people);action.disabled=true;
          try{
            const current=read(),fresh=selectedDay(current);if(offerContext(fresh,current.itinerary?.people || 1)!==context)throw Error('День изменился. Выберите цену заново.');
            const calculation=await loadScheduler(base);
            if(offerContext(selectedDay(read()),read().itinerary?.people || 1)!==context)throw Error('День изменился. Выберите цену заново.');
            const value=calculation.offers(offerInput([quote],fresh,current.itinerary?.people || 1))[0];
            if(offerBlocked(value))throw Error(offerStatusText(value));
            action.disabled=false;action.focus({preventScroll:true});
            await openOffer(quote,value,context);
          }catch(error){status.textContent=error.message || 'Цену пока не удалось открыть. Свою оценку можно добавить вручную.';}finally{action.disabled=offerBlocked(evaluated);}
        });card.append(action);if(count)card.append(el('small',`В плане записей: ${count}`));cards.append(card);
      }
      group.append(cards);list.append(group);
    }
    box.dataset.offersReady='true';
  }
  return {render};
}
