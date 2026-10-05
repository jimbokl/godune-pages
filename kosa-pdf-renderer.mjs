import './assets/vendor/pdf/pdf-lib.js';
import './assets/vendor/pdf/fontkit.js';
import {kosaClock as clock} from './kosa-plan-state.mjs?v=17';
import {kosaBoardingText} from './kosa-boarding.mjs?v=1';
import {loadKosaGuideAssets} from './guide-sections.mjs?v=1';
const {PDFDocument,rgb}=globalThis.PDFLib;
const ink=rgb(.13,.24,.3),muted=rgb(.32,.43,.48),blue=rgb(.75,.85,.91),paper=rgb(.98,.98,.96);
const clean=text=>String(text).replace(/[\u2010-\u2015]/g,'-');
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
export async function renderKosaPdf({snapshot,base,format},{signal,onProgress=()=>{}}={}){
  if(snapshot.schema_version!==1 || !['phone','print'].includes(format)
    || !['vysota-efa','vysota-efa,tancuyushchiy-les'].includes(snapshot.walks?.join(',')))throw Error('План дня не прочитан. Подберите день ещё раз.');
  const fetchBytes=async path=>{
    const r=await fetch(new URL(path,base),{signal});if(!r.ok)throw Error('Не все карты загрузились. Повторите скачивание при связи.');
    return new Uint8Array(await r.arrayBuffer());
  };
  onProgress('Загружаем карты и шрифты для PDF…');
  const [assets,uiBytes,titleBytes]=await Promise.all([
    loadKosaGuideAssets({snapshot,base,format},{signal,onProgress}),fetchBytes('assets/vendor/pdf/Manrope-Regular.ttf'),fetchBytes('assets/vendor/pdf/NotoSerifDisplay-Regular.ttf')]);
  const {chapters,walkingMaps}=assets;
  signal?.throwIfAborted();
  onProgress('Собираем ваш день и возвращение…');
  const doc=await PDFDocument.create();doc.registerFontkit(globalThis.fontkit);
  // Keep the serif font complete: this fontkit subset loses composite outlines
  // in several Cyrillic glyphs even though text extraction still succeeds.
  const [ui,title]=await Promise.all([doc.embedFont(uiBytes,{subset:true}),doc.embedFont(titleBytes)]);
  const phone=format==='phone',w=phone?306.142:595.276,h=phone?544.252:841.89,margin=phone?22:44,width=w-2*margin;
  let page,y;const bodySize=phone?10.5:12;
  function start(){
    page=doc.addPage([w,h]);page.drawRectangle({x:0,y:0,width:w,height:h,color:paper});
    page.drawText('МАРШРУТЫ БАЛТИКИ',{x:margin,y:h-margin-9,font:ui,size:8,color:muted});
    y=h-margin-36;return page;
  }
  function lines(text,font,size,max=width){
    const result=[];let line='';
    for(const word of clean(text).split(/\s+/)){
      const next=line?line+' '+word:word;
      if(font.widthOfTextAtSize(next,size)<=max){line=next;continue;}
      if(line){result.push(line);line='';}
      if(font.widthOfTextAtSize(word,size)<=max){line=word;continue;}
      for(const letter of word){if(line&&font.widthOfTextAtSize(line+letter,size)>max){result.push(line);line='';}line+=letter;}
    }
    if(line)result.push(line);return result;
  }
  function paragraph(text,{font=ui,size=bodySize,color=ink,space=12,keepTogether=false}={}){
    const leading=size*(font===title?1.18:1.48);
    const wrapped=lines(text,font,size);
    if(keepTogether&&wrapped.length*leading<=h-margin-85&&y-wrapped.length*leading<49)start();
    for(const line of wrapped){if(y-leading<49)start();y-=leading;page.drawText(line,{x:margin,y,font,size,color});}
    y-=space;
  }
  function heading(text,following=''){const size=phone?23:30,height=lines(text,title,size).length*size*1.18+16,follow=lines(following,ui,bodySize).length*bodySize*1.48+12;if(y-height-Math.min(follow,h-margin-110)<49)start();paragraph(text,{font:title,size,space:16});}
  start();
  paragraph('Куршская коса',{size:11,color:muted,space:13});
  paragraph('День на волне.',{font:title,size:phone?35:49,space:28});
  paragraph(snapshot.date.split('-').reverse().join('.')+' · '+snapshot.city,{size:13,space:22});
  page.drawRectangle({x:margin,y:y-54,width,height:54,color:blue});
  page.drawText(snapshot.continuation?'Возвращение после отметки у остановки':snapshot.rail?(snapshot.origin==='station'?'Снова у вокзала':'Вернуться к жилью, по вашей оценке'):'Возвращение в Зеленоградск',{x:margin+12,y:y-18,font:ui,size:phone?9:10,color:ink});
  page.drawText(Number.isInteger(snapshot.finish)?clock(snapshot.finish):'Время уточнить',{x:margin+12,y:y-42,font:title,size:Number.isInteger(snapshot.finish)?24:phone?20:24,color:ink});y-=77;
  paragraph(snapshot.walks.length===2?'Дюны Эфа и Танцующий лес. Между тропами - автобус.':'Высота Эфа. Настил, смотровые и возвращение к началу тропы.');
  paragraph('Это ваш план по опубликованной таблице № 210. Рейсы на дату поездки и наличие мест ещё нужно подтвердить.',{size:bodySize,color:muted});
  if(snapshot.walking?.status==='too_short')paragraph('В плане есть слишком короткие переходы или прогулки. Увеличьте их время перед поездкой. Подробности отмечены в ритме дня.',{size:bodySize});
  else if(snapshot.walking&&snapshot.walking.status!=='within_estimate')paragraph('Время переходов пока не сопоставлено с картой. Уточните его перед поездкой.',{size:bodySize});
  paragraph(walkingMaps.length?'Внутри - ваш день, запасной вариант, карты переходов и троп. Всё читается без связи.':'Внутри - расписание вашего дня, запасной вариант и автономные карты троп.',{space:0});
  start();heading('Ритм вашего дня');
  paragraph(snapshot.rail?(snapshot.origin==='station'?'Начало и возвращение у вокзала. Дорога от жилья не включена; рейсы требуют проверки на дату поездки.':'Расчёт связывает жильё, электричку, автобус и возвращение. Время подходов и запас заданы вами. Рейсы требуют проверки на дату поездки.'):'Расчёт начинается у автобуса в Зеленоградске. Дорогу от жилья до пересадки выбирайте отдельно.',{color:muted});
  for(const row of snapshot.timeline){
    const boarding=row.boarding?kosaBoardingText(row.boarding):Object.hasOwn(row,'boarding')?'Названия остановок пока не загружены. Уточните их до поездки.':null;
    const height=22*1.18+5+lines(row.title,ui,phone?12:14).length*(phone?12:14)*1.48+6+lines(row.text,ui,bodySize).length*bodySize*1.48+20
      +(boarding?lines(boarding,ui,bodySize).length*bodySize*1.48+20:0);
    if(y-height<49)start();
    paragraph(Number.isInteger(row.time)?clock(row.time):'Время уточнить',{font:title,size:22,color:ink,space:5});
    paragraph(row.title,{size:phone?12:14,space:6});
    paragraph(row.text,{color:muted,space:boarding?10:20});
    if(boarding)paragraph(boarding,{space:20});
  }
  start();heading('Вернуться с косы');
  paragraph('Остановка: '+snapshot.return.stop,{size:13});
  if(snapshot.return.blocked)paragraph(`Прежний автобус по таблице - ${clock(snapshot.return.departure)}. После задержки этот путь домой не подтверждён. Время возвращения неизвестно; сначала выберите и проверьте другой вариант.`);
  else paragraph(`Будьте у остановки к ${clock(snapshot.return.board_by)}. Автобус по таблице - ${clock(snapshot.return.departure)}; в Зеленоградске - ${clock(snapshot.return.arrival)}.`);
  if(snapshot.rail){const r=snapshot.rail;paragraph(snapshot.return.blocked?`Выбран поезд № ${r.inward.id} до ${r.from}, отправление ${clock(r.inward.departure)}. После пропущенного автобуса пересадка не подтверждена. Время прибытия домой пока неизвестно.`:`Затем электричка до ${r.from}: у поезда к ${clock(r.train_by)}, отправление ${clock(r.inward.departure)}, прибытие ${clock(r.inward.arrival)}. ${snapshot.origin==='station'?'Дальнейшая дорога до жилья не включена.':`Ещё ${r.from_station} мин до жилья по вашей оценке; вернуться около ${clock(r.home_finish)}.`}`);}
  paragraph('Если автобус ушёл или полон',{font:title,size:phone?19:23,space:12});
  paragraph(snapshot.fallback);
  if(snapshot.light){heading('Свет на тропах и у остановки',snapshot.light.rows[0]?.text);for(const row of snapshot.light.rows)paragraph(row.text,{color:row.warning?ink:muted,keepTogether:true});}
  for(const text of snapshot.limits.slice(1))paragraph(text,{color:muted});
  start();heading('Перед выходом');
  for(const [i,text]of snapshot.before.entries())paragraph(String(i+1).padStart(2,'0')+'  '+text,{space:19});
  const publicationHeight=lines('Источник расписания',title,phone?23:30).length*(phone?23:30)*1.18+16+lines(snapshot.publication.note,ui,bodySize).length*bodySize*1.48+12+lines(`Таблица с ${snapshot.publication.valid_from}. Сверена ${snapshot.publication.checked_at}.`,ui,9).length*9*1.48+12+lines(snapshot.publication.source_url,ui,9).length*9*1.48+12;
  if(publicationHeight<h-margin-85&&y-publicationHeight<49)start();
  heading('Источник расписания',snapshot.publication.note);
  paragraph(snapshot.publication.note,{color:muted});
  paragraph(`Таблица с ${snapshot.publication.valid_from}. Сверена ${snapshot.publication.checked_at}.`,{size:9,color:muted});
  paragraph(snapshot.publication.source_url,{size:9,color:muted});
  if(snapshot.rail){const p=snapshot.rail.publication,total=lines('Источник электричек',title,phone?23:30).length*(phone?23:30)*1.18+16+lines(p.name,ui,10).length*10*1.48+12+lines('Сверено '+p.checked_at,ui,9).length*9*1.48+12+lines(p.url,ui,9).length*9*1.48+12;if(y-total<49)start();heading('Источник электричек',p.name);paragraph(p.name,{size:10});paragraph('Сверено '+p.checked_at,{size:9,color:muted});paragraph(p.url,{size:9,color:muted});}
  for(const check of snapshot.walking?.checks||[])if(check.trail){
    const name=check.trail.name+' — время на тропу';
    const source=check.trail.source_name+' · длина сверена '+check.trail.checked_at;
    const titleSize=phone?23:30,urlSize=phone?8:9;
    const blockHeight=lines(name,title,titleSize).length*titleSize*1.18+16
      +lines(check.text,ui,bodySize).length*bodySize*1.48+12
      +lines(source,ui,9).length*9*1.48+12
      +lines(check.trail.source_url,ui,urlSize).length*urlSize*1.48+12;
    if(y-blockHeight<49)start();
    heading(name);
    paragraph(check.text,{size:bodySize,color:muted});
    paragraph(source,{size:9,color:muted});
    paragraph(check.trail.source_url,{size:urlSize,color:muted});
  }
  const interchangePages=[];
  for(const {walk,bytes}of walkingMaps){
    start();const begins=doc.getPageCount();heading(walk.title);
    paragraph(`Около ${walk.distance_m} м · ${walk.estimated_minutes} мин по расчёту карты`,{size:10,color:muted,space:10});
    const image=await doc.embedPng(bytes),mapHeight=width*620/900;
    if(y-mapHeight<90)start();
    page.drawImage(image,{x:margin,y:y-mapHeight,width,height:mapHeight});y-=mapHeight+12;
    for(const [i,id]of [walk.from,walk.to].entries()){
      const anchor=snapshot.interchanges.anchors[id];
      paragraph(`${i+1}. ${anchor.name} · ${anchor.lat.toFixed(5)}, ${anchor.lon.toFixed(5)}`,{size:phone?8.5:10,space:6});
    }
    paragraph(walk.note,{size:phone?9:11,space:10});
    paragraph(snapshot.interchanges.verification.note,{size:phone?8.5:10,color:muted,space:6});
    paragraph(`OpenStreetMap · ${snapshot.interchanges.source.snapshot_at} · ODbL 1.0`,{size:8,color:muted,space:0});
    interchangePages.push({id:walk.id,begins,pages:doc.getPageCount()-begins+1,image_sha256:walk.images.png.sha256});
  }
  const chapterPages=[];
  for(const {source,entry}of chapters){
    const begins=doc.getPageCount()+1;
    const copies=await doc.copyPages(source,source.getPageIndices());for(const copy of copies)doc.addPage(copy);
    chapterPages.push({route:entry.route,begins,pages:entry.pages,snapshot_sha256:entry.snapshot_sha256,pdf_sha256:entry.sha256});
  }
  const fullSnapshot={...snapshot,format,interchange_pages:interchangePages,chapters:chapterPages},snapshotBytes=new TextEncoder().encode(JSON.stringify(fullSnapshot)),snapshotSha=await hash(snapshotBytes),pages=doc.getPages();
  // Every copied chapter retains its map, GPS, source dates and QR. Replace only
  // the old page footer so numbering follows this complete personal document.
  pages.forEach((p,i)=>{
    const {width:pw}=p.getSize(),pm=phone?18:42;
    p.drawRectangle({x:0,y:0,width:pw,height:35,color:paper});
    p.drawLine({start:{x:pm,y:33},end:{x:pw-pm,y:33},thickness:.6,color:blue});
    p.drawText('godune.ru · '+snapshotSha.slice(0,8),{x:pm,y:21,font:ui,size:7.5,color:muted});
    const n=`${i+1} / ${pages.length}`;p.drawText(n,{x:pw-pm-ui.widthOfTextAtSize(n,7.5),y:21,font:ui,size:7.5,color:muted});
  });
  // Sources remain a part of the artifact; personal input is never uploaded.
  await doc.attach(snapshotBytes,'plan.json',{mimeType:'application/json',description:'Снимок личного плана дня и версии встроенных карт'});
  doc.setTitle('Куршская коса · '+snapshot.date+' · ваш день у дюн');doc.setAuthor('Маршруты Балтики · godune.ru');
  doc.setSubject('Личный план по датированной таблице. '+snapshotSha);
  signal?.throwIfAborted();onProgress('Готовим файл для сохранения…');
  const bytes=await doc.save();
  return {bytes,pages:pages.length,format,snapshot_sha256:snapshotSha,chapters:chapterPages};
}
