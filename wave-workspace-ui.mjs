import {journeyDays,selectedDay,chooseTripDay,addTripDay} from './trip-days-state.mjs?v=25';
import {initTransferEditor} from './trip-transfer-editor-ui.mjs?v=8';
import {hasTransportPlans} from './trip-transport-plans-contract.mjs';

const el=(tag,classes,text)=>{const node=document.createElement(tag);if(classes)node.className=classes;if(text)node.textContent=text;return node;};
const areaNames={'zelenogradsk':'Зеленоградск','svetlogorsk':'Светлогорск','kaliningrad':'Калининград','kurshskaya-kosa':'Куршская коса','baltiysk':'Балтийск','yantarnyy':'Янтарный'};
const workspacePoints=(trip,catalog)=>{
 const plan=selectedDay(trip).kosa_plan,ids=plan&&['one','two'].includes(plan.walks)?['vysota-efa',...(plan.walks==='two'?['tancuyushchiy-les']:[]),...trip.places]:trip.places;
 return [...new Set(ids)].map(id=>catalog.poi.find(p=>p.slug===id)).filter(Boolean);
};
export function waveCover(trip,catalog){
 const day=selectedDay(trip),points=workspacePoints(trip,catalog),areas=[...new Set(points.map(p=>p.area))];
 const named=day.name&&!/^День\s*\d*$/i.test(day.name.trim())?day.name:null;
 const dining=points.some(p=>p.category==='restaurant');
 const title=named||(day.kosa_plan?'День на Куршской косе':areas.length===1?(areas[0]==='zelenogradsk'&&dining?'Зеленоградск на вкус':areaNames[areas[0]]||'День на волне'):'Ваш день на волне');
 const photo=areas.length===1&&areas[0]==='zelenogradsk'?'assets/author/zelenogradsk-2026-10-03/promenade-1920.avif':points.flatMap(p=>p.photos||[]).find(path=>typeof path==='string'&&path.startsWith('assets/author/'));
 return {title,photo,subtitle:areas.length===1&&areas[0]==='zelenogradsk'&&dining?'Море, прогулка и местная кухня.':points.length?'Ваши места, дорога и время для себя.':hasTransportPlans(day)?'Дорога сохранена. Возьмите расчёт с собой или добавьте прогулку.':'Выберите прогулку — остальное соберём в ваш день.'};
}

/** The same Trip and controls in a smaller, mobile-first frame. */
export function initWaveWorkspace({mount,journey,read,commit,base,catalog,work,tabs,header,name,extras,more}){
 const intro=document.querySelector('.wizard-page-intro'),title=intro?.querySelector('h1'),subtitle=intro?.querySelector('h1 + p');
 const back=el('a','wave-back','← Прогулки');back.href=new URL('routes/',base);intro?.prepend(back);
 const cover=el('img','wave-cover');cover.width=1440;cover.height=450;cover.alt='';cover.decoding='async';cover.hidden=true;intro?.append(cover);
 const dayLabel=el('label','wave-day-label'),daySelect=el('select','wave-day-select');daySelect.id='wave-day-select';daySelect.setAttribute('aria-label','Выбрать день');dayLabel.append(daySelect);
 const add=el('button','wave-add-day','+ День');add.type='button';add.setAttribute('aria-label','Добавить день');
 const dateTools=mount.querySelector('.trip-dates');
 const toolbar=header.querySelector('.day-main-actions');
 const options=el('dialog','wave-more-dialog');options.setAttribute('aria-labelledby','wave-more-title');
 const top=el('div','wave-more-heading'),heading=el('h2','','Ещё для поездки');heading.id='wave-more-title';
 const close=el('button','wave-more-close','Закрыть');close.type='button';top.append(heading,close);options.append(top);
 if(toolbar)options.append(toolbar);if(dateTools)options.append(dateTools);
 const ready=el('button','wave-tools-link','Добавить готовую прогулку');ready.type='button';ready.addEventListener('click',()=>{const wizard=document.querySelector('#planner-new-day');options.close();if(wizard.querySelector('[data-wizard-form]')?.hidden)wizard.querySelector('[data-wizard-again]')?.click();wizard.hidden=false;wizard.open=true;wizard.scrollIntoView({block:'start'});});options.append(ready);
 options.append(extras,more);const explore=mount.querySelector('.day-explore');if(explore)options.append(explore);
 const dishes=mount.querySelector('.trip-menu-choices');if(dishes){const details=el('details','day-disclosure');details.append(el('summary','','Выбранные блюда'),dishes);options.append(details);}
 const preferences=journey.querySelector('#journey-preferences');if(preferences)options.append(preferences);
 const footerNote=mount.parentElement?.querySelector('.tool-footnote');if(footerNote)options.append(footerNote);
 journey.append(options);header.replaceChildren(dayLabel,add,name);
 // View comes first; the day selector belongs directly beneath it.
 tabs.before(header);header.before(tabs);
 const saved=el('p','wave-day-saved');saved.setAttribute('role','status');header.after(saved);
 document.addEventListener('godune:day-ready',event=>{const wizard=document.querySelector('#planner-new-day');if(wizard){wizard.open=false;wizard.hidden=true;}saved.textContent=event.detail?.saved?'День сохранён в поездке.':'День открыт в этой вкладке. Скачайте файл поездки через «Ещё», чтобы сохранить его отдельно.';tabs.querySelector('button')?.focus({preventScroll:true});tabs.scrollIntoView({block:'start'});});
 const moreButton=el('button','wave-more-button','Ещё');moreButton.type='button';moreButton.setAttribute('aria-haspopup','dialog');
 const openMore=()=>options.showModal();moreButton.addEventListener('click',openMore);close.addEventListener('click',()=>options.close());
 options.addEventListener('click',event=>{if(event.target===options){const rect=options.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)options.close();}});
 const bottom=el('nav','wave-bottom-nav');bottom.setAttribute('aria-label','Основные разделы');
 const walks=el('a','','Прогулки');walks.href=new URL('routes/',base);
 const mine=el('button','','Мой день');mine.type='button';mine.setAttribute('aria-current','page');mine.addEventListener('click',()=>{work.dataset.view='list';tabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.dayView==='list')));tabs.scrollIntoView({block:'start'});});
 const icons=['walk','clock','menu-2'];[walks,mine,moreButton].forEach((control,i)=>{const icon=el('img');icon.src=new URL(`assets/icons/${icons[i]}.svg`,base);icon.width=24;icon.height=24;icon.alt='';control.prepend(icon);bottom.append(control);});
 mount.append(bottom);
 const secondary=el('div','wave-after-stops'),addPlace=el('a','wave-add-place','+ Добавить место');addPlace.href=new URL('map/',base);const moreTop=el('button','wave-tools-link','Настройки дня');moreTop.type='button';moreTop.addEventListener('click',openMore);secondary.append(addPlace,moreTop);work.after(secondary);
 const roadEditor=initTransferEditor({host:secondary,read,commit,catalog,base});
 const download=el('section','wave-download'),button=el('button','wave-download-button','Скачать буклет ↓'),status=el('p','wave-download-status');button.type='button';status.setAttribute('role','status');download.append(button,status);secondary.after(download);
 let downloading=false;
 button.addEventListener('click',async()=>{
  if(downloading)return;downloading=true;button.disabled=true;button.textContent='Собираем буклет…';const trip=read(),signature=JSON.stringify(trip);
  try{const {downloadPersonalGuide}=await import('./trip-guide-ui.mjs?v=32');const result=await downloadPersonalGuide({trip,catalog,base,scope:'day',format:'phone',onProgress:text=>{status.textContent=text;},stillCurrent:()=>JSON.stringify(read())===signature});status.textContent=`Буклет готов: ${result.pages} стр. Сохраните PDF в телефоне.`;}
  catch(error){console.error('wave_guide_export',error);status.textContent=error.message==='guide_trip_changed'?'День изменился. Скачайте свежий буклет.':'Буклет пока не собрался. Попробуйте ещё раз; ваш день на месте.';}
  finally{downloading=false;button.textContent='Скачать буклет ↓';const day=selectedDay(read());button.disabled=workspacePoints(read(),catalog).length===0&&!day.service_visits?.length&&!hasTransportPlans(day);}
 });
 daySelect.addEventListener('change',async()=>{daySelect.disabled=true;try{await commit(current=>chooseTripDay(current,daySelect.value),'День открыт.');}finally{daySelect.disabled=false;}});
 add.addEventListener('click',async()=>{add.disabled=true;try{await commit(current=>addTripDay(current),'Новый день сохранён.');}finally{add.disabled=false;}});
 let coverKey='',daysKey='',savedDay='';
 return {render(){
  roadEditor.render();
  const trip=read(),day=selectedDay(trip),days=journeyDays(trip),view=waveCover(trip,catalog),key=JSON.stringify(view);
  if(day.id!==savedDay){saved.textContent='';savedDay=day.id;}
  if(key!==coverKey){if(title)title.textContent=view.title;if(subtitle)subtitle.textContent=view.subtitle;cover.hidden=!view.photo;if(view.photo)cover.src=new URL(view.photo,base);coverKey=key;}
  const nextKey=JSON.stringify(days.map(d=>[d.id,d.date,d.name]));if(nextKey!==daysKey){daySelect.replaceChildren(...days.map((d,i)=>{const opt=el('option','',`День ${i+1}${d.date?' · '+new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(d.date+'T12:00:00Z')):''}`);opt.value=d.id;return opt;}));daysKey=nextKey;}daySelect.value=day.id;
  if(!downloading)button.disabled=workspacePoints(trip,catalog).length===0&&!day.service_visits?.length&&!hasTransportPlans(day);
  download.hidden=button.disabled&&!downloading;
  const wizard=document.querySelector('#planner-new-day');if(wizard)wizard.hidden=!wizard.open&&(trip.places.length>0||days.length>1);
 }};
}
