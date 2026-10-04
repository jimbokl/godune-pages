import './assets/vendor/pdf/pdf-lib.js';
import './assets/vendor/pdf/fontkit.js';
import {clock} from './day-stop-view.mjs?v=1';
import {journeyKinds} from './day-journey-view.mjs?v=1';
const {PDFDocument,rgb}=globalThis.PDFLib;
const ink=rgb(.13,.24,.3),muted=rgb(.32,.43,.48),blue=rgb(.75,.85,.91),paper=rgb(.98,.98,.96);
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
const date=value=>value?new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z')):'Дата ещё не выбрана';
const plural=(n,forms)=>`${n} ${forms[n%100>=11&&n%100<=14?2:n%10===1?0:n%10>=2&&n%10<=4?1:2]}`;
export async function renderTripGuide({snapshot,media,base,format='phone'},{signal,onProgress=()=>{}}={}) {
  if(snapshot.version!==1 || !snapshot.days?.length || !['phone','print'].includes(format))throw Error('guide_invalid_snapshot');
  const bytes=async path=>{const r=await fetch(new URL(path,base),{signal});if(!r.ok)throw Error('guide_fonts_unavailable');return new Uint8Array(await r.arrayBuffer());};
  onProgress('Собираем страницы путеводителя…');
  const [uiBytes,titleBytes]=await Promise.all([bytes('assets/vendor/pdf/Manrope-Regular.ttf'),bytes('assets/vendor/pdf/NotoSerifDisplay-Regular.ttf')]);
  signal?.throwIfAborted();const doc=await PDFDocument.create();doc.registerFontkit(globalThis.fontkit);
  const [ui,title]=await Promise.all([doc.embedFont(uiBytes,{subset:true}),doc.embedFont(titleBytes)]);
  const phone=format==='phone',w=phone?306.142:595.276,h=phone?544.252:841.89,m=phone?22:44,width=w-2*m,body=phone?10.5:12;
  let page,y,chapter='ВАША БАЛТИКА';const embedded=new Map();
  const sets=new Map([[ui,new Set(ui.getCharacterSet())],[title,new Set(title.getCharacterSet())]]);
  const clean=(text,font)=>Array.from(String(text).replace(/[\u2010-\u2015]/g,'-').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'')).map(c=>/\s/.test(c)?' ':sets.get(font).has(c.codePointAt(0))?c:'?').join('');
  function start(){page=doc.addPage([w,h]);page.drawRectangle({x:0,y:0,width:w,height:h,color:paper});page.drawText(clean(chapter,ui).slice(0,60),{x:m,y:h-m-9,font:ui,size:8,color:muted});y=h-m-38;}
  const need=n=>{if(y-n<51)start();};
  function lines(text,font,size,max=width){const out=[];let line='';for(const word of clean(text,font).split(/\s+/)){const next=line?line+' '+word:word;if(font.widthOfTextAtSize(next,size)<=max){line=next;continue;}if(line){out.push(line);line='';}for(const letter of word){if(line&&font.widthOfTextAtSize(line+letter,size)>max){out.push(line);line='';}line+=letter;}}if(line)out.push(line);return out;}
  function text(value,{font=ui,size=body,color=ink,space=10,max=width,x=m}={}){const leading=size*(font===title?1.2:1.48),wrapped=lines(value,font,size,max);if(wrapped.length*leading+space<h-2*m-90)need(wrapped.length*leading+space);for(const line of wrapped){need(leading);y-=leading;page.drawText(line,{x,y,font,size,color});}y-=space;}
  const textHeight=(value,font=ui,size=body,space=10)=>lines(value,font,size).length*size*(font===title?1.2:1.48)+space;
  function heading(value,large=false,following='',extra=0){const size=large?(phone?32:43):(phone?24:30),head=textHeight(value,title,size,16),follow=textHeight(following)+extra;need(head+(head+follow<h-2*m-90?follow:body*3));text(value,{font:title,size,space:16});}
  async function image(value,maxHeight){if(!value)return;let img=embedded.get(value);if(!img){img=await (value.kind==='jpeg'?doc.embedJpg(value.bytes):doc.embedPng(value.bytes));embedded.set(value,img);}const iw=Math.min(width,maxHeight*value.width/value.height),ih=iw*value.height/value.width;need(ih+15);page.drawImage(img,{x:m+(width-iw)/2,y:y-ih,width:iw,height:ih});y-=ih+14;}
  async function qrCard(value,caption){if(!value)return;const size=phone?52:68,img=await doc.embedPng(value.bytes),wrapped=lines(caption,ui,phone?9:11,width-size-12),leading=phone?13:16,height=Math.max(size,wrapped.length*leading);need(height+18);page.drawImage(img,{x:m,y:y-size,width:size,height:size});wrapped.forEach((line,i)=>page.drawText(line,{x:m+size+12,y:y-leading*(i+1),font:ui,size:phone?9:11,color:muted}));y-=height+18;}
  const gps=p=>`${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}`;
  const sourceHeight=s=>s?textHeight(`${s.name || 'Источник'} · проверено ${s.checked_at || 'дата не указана'}`,ui,phone?8.5:10,3)+(s.url?textHeight(s.url,ui,phone?8:9,8):0):0;
  const source=(s)=>{if(!s)return;need(sourceHeight(s));text(`${s.name || 'Источник'} · проверено ${s.checked_at || 'дата не указана'}`,{size:phone?8.5:10,color:muted,space:3});if(s.url)text(s.url,{size:phone?8:9,color:muted,space:8});};
  start();text('GODUNE · МАРШРУТЫ БАЛТИКИ',{size:9,color:muted,space:20});heading(snapshot.title,true);
  text(snapshot.days.length===1?date(snapshot.days[0].date):`${plural(snapshot.days.length,['день','дня','дней'])} в одном путеводителе`,{size:phone?13:16,space:18});
  const first=snapshot.days.flatMap(d=>d.stops).find(p=>media.photos[p.id]);
  const coverHeight=Math.max(65,Math.min(phone?180:300,y-51-(phone?155:180)));
  if(first){await image(media.photos[first.id],coverHeight);text('Авторский снимок · '+first.name,{size:8,color:muted,space:8});}
  else if(media.overview[snapshot.days[0].id])await image(media.overview[snapshot.days[0].id],coverHeight);
  text('Ваш день и возвращение. Карты, координаты и заметки остаются в этом файле без сети.');
  await qrCard(media.qrs?.planner,'godune.ru/planner/\nЗдесь можно продолжить поездку при появлении связи.');
  const chapters=[];
  for(const [index,day]of snapshot.days.entries()){
    signal?.throwIfAborted();chapter=`ДЕНЬ ${index+1} · ${date(day.date)}`;start();const begins=doc.getPageCount();heading(day.name,true);
    text(date(day.date),{size:phone?12:15,color:muted});text(day.summary);
    text(`${plural(day.stops.length,['место','места','мест'])}${day.finish!==null?` · окончание по плану ${clock(day.finish)}`:day.earliest_finish!==null?` · не раньше ${clock(day.earliest_finish)}`:''}${day.slack!==null?` · запас ${day.slack} мин`:''}`,{color:muted});
    await image(media.overview[day.id],phone?180:265);
    if(media.overview[day.id]){text('Общий вид. Подробные карты - у остановок. Линия показана только там, где путь рассчитан по дорогам; между остальными местами её нет.',{size:phone?8.5:10,color:muted});text(`© OpenStreetMap contributors · ODbL 1.0 · ${media.source.snapshot_at}`,{size:8,color:muted});}
    for(const [i,p]of day.stops.entries())text(`${String(i+1).padStart(2,'0')} · ${p.name} · GPS ${gps(p)}`,{size:phone?9.5:11,space:8});
    heading('По шагам');
    if(!day.rows.length)text('Точное время ещё не рассчитано. Сверьте прежний план на сайте перед выходом.');
    for(const row of day.rows){need(60);text(`${row.time===null?'Время нужно уточнить':clock(row.time)} · ${journeyKinds[row.kind] || 'Остановка'}`,{size:phone?9:11,color:muted,space:5});text(row.title,{size:phone?12:14,space:6});text(row.text);if(row.source)source(row.source);}
    heading('Если день пошёл иначе',false,day.planB);text(day.planB);
    if(day.record.note){heading('Ваши заметки',false,day.record.note);text(day.record.note);}
    if(day.bookings.length){heading('Билеты и ночёвки');for(const b of day.bookings){need(65);text(`${b.kindLabel} · ${b.name}`,{size:phone?12:14,space:5});text(`${b.statusLabel} · ${date(b.date)}${Number.isInteger(b.time)?' · '+clock(b.time):''}${b.location?' · '+b.locationLabel:''}`);if(b.problem)text('Время этой записи сейчас не закрепляет день. Проверьте дату и привязку.',{color:muted});if(b.private?.reference)text('Номер брони: '+b.private.reference);if(b.private?.note)text(b.private.note);}}
    for(const [i,p]of day.stops.entries()){
      start();text(`${String(i+1).padStart(2,'0')} · ${p.area}`,{size:9,color:muted,space:16});heading(p.name,true);
      text('GPS '+gps(p),{size:phone?12:14,space:16});if(media.photos[p.id]){await image(media.photos[p.id],phone?165:270);text('Авторский снимок',{size:8,color:muted});}
      await image(media.maps[p.id],phone?180:260);
      text(`© OpenStreetMap contributors · ODbL 1.0 · ${media.source.snapshot_at}. Ромб - ваше место.`,{size:8,color:muted});
      heading('На месте',false,p.story[0]);for(const paragraph of p.story)text(paragraph);if(p.focus)text(p.focus);if(p.practical)text(p.practical);
      const placeSource={name:p.name,url:p.source,checked_at:p.checkedAt},tail=sourceHeight(placeSource)+(phone?70:86);
      if(p.conditions.length){const first=p.conditions[0];heading('Перед входом',false,first.text,sourceHeight(first.source)+(p.conditions.length===1?tail:0));for(const [ci,c]of p.conditions.entries()){const block=textHeight(c.text)+sourceHeight(c.source)+(ci===p.conditions.length-1?tail:0);if(block<h-2*m-90)need(block);text(c.text);source(c.source);}}
      need(tail);source(placeSource);
      await qrCard(media.qrs?.[p.id],`godune.ru/poi/${p.id}/\nСтраница места при появлении связи.`);
    }
    if(day.kosa){onProgress('Добавляем карты троп и пересадок косы…');const {renderKosaPdf}=await import('./kosa-pdf-renderer.mjs?v=12');const result=await renderKosaPdf({snapshot:day.kosa,base,format},{signal,onProgress});const part=await PDFDocument.load(result.bytes);for(const copy of await doc.copyPages(part,part.getPageIndices()))doc.addPage(copy);}
    chapters.push({id:day.id,begins,pages:doc.getPageCount()-begins+1});
  }
  chapter='ПЕРЕД ВЫХОДОМ';start();heading('Всё с собой');text('Карты, фото и координаты встроены в документ. Ваш план и источники также вложены в plan.json: часть PDF-приложений показывает вложения только на компьютере.');
  text(`Подготовлено ${date(snapshot.created_at.slice(0,10))}. Это снимок плана: он сам не обновляет рейсы, цены или погоду.`);
  text('Сохраните PDF в телефоне и откройте его в авиарежиме до выхода. Ссылки и QR откроют сайт, когда появится связь.');
  text('В этом файле могут быть ваши адреса, номера брони и личные заметки. Передавайте его тем, кому доверяете.');
  text('Расписание - по таблице, дорога - по карте или вашей оценке. Посадка, доступ и погода могут измениться. Если пропустили рейс, не считайте прежний план подтверждённым.');
  for(const warning of media.warnings)text(warning,{color:muted});source({name:'Картографические данные OpenStreetMap',url:media.source.source,checked_at:media.source.snapshot_at});
  text('Печатная версия: A4, RGB, для обычного принтера. Шрифты Manrope и Noto Serif Display - SIL Open Font License.',{size:9,color:muted});
  const assets=group=>Object.fromEntries(Object.entries(group).map(([id,m])=>[id,{path:m.path,sha256:m.sha256}]));
  const full={...snapshot,format,chapters,map_source:media.source,maps:assets(media.maps),photos:assets(media.photos),warnings:media.warnings},snapshotBytes=new TextEncoder().encode(JSON.stringify(full)),sha=await hash(snapshotBytes),pages=doc.getPages();
  pages.forEach((p,i)=>{const {width:pw}=p.getSize();p.drawRectangle({x:0,y:0,width:pw,height:35,color:paper});p.drawLine({start:{x:m,y:33},end:{x:pw-m,y:33},thickness:.6,color:blue});p.drawText('godune.ru · '+sha.slice(0,8),{x:m,y:21,font:ui,size:7.5,color:muted});const n=`${i+1} / ${pages.length}`;p.drawText(n,{x:pw-m-ui.widthOfTextAtSize(n,7.5),y:21,font:ui,size:7.5,color:muted});});
  await doc.attach(snapshotBytes,'plan.json',{mimeType:'application/json',description:'Личный план и версии встроенных карт'});doc.setTitle(snapshot.title);doc.setAuthor('Маршруты Балтики · godune.ru');doc.setSubject('Личный путеводитель · '+sha);signal?.throwIfAborted();onProgress('Готовим файл для сохранения…');
  return {bytes:await doc.save(),pages:pages.length,format,snapshot_sha256:sha,chapters,map_count:Object.keys(media.maps).length,photo_count:Object.keys(media.photos).length,warnings:media.warnings};
}
