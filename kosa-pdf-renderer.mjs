import './assets/vendor/pdf/pdf-lib.js';
import './assets/vendor/pdf/fontkit.js';
import {kosaClock as clock} from './kosa-plan-state.mjs?v=2';
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
  const [manifestBytes,uiBytes,titleBytes]=await Promise.all([
    fetchBytes('guides/manifest.json'),fetchBytes('assets/vendor/pdf/Manrope-Regular.ttf'),fetchBytes('assets/vendor/pdf/NotoSerifDisplay-Regular.ttf')]);
  const manifest=JSON.parse(new TextDecoder().decode(manifestBytes)),chapters=[];
  for(const slug of snapshot.walks){
    const entry=manifest.guides.find(g=>g.route===slug&&g.format===format);
    if(!entry || entry.path!==`guides/${slug}-${format}.pdf` || !/^[0-9a-f]{64}$/.test(entry.sha256))throw Error('Версии карт не согласованы. Обновите страницу при связи.');
    const bytes=await fetchBytes(entry.path);
    if(bytes.length!==entry.bytes || await hash(bytes)!==entry.sha256)throw Error('Карта загрузилась не полностью или её версия изменилась. Обновите страницу при связи.');
    const source=await PDFDocument.load(bytes);
    if(source.getPageCount()!==entry.pages)throw Error('Число страниц карты не совпало. Повторите скачивание.');
    chapters.push({source,entry});
  }
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
  function paragraph(text,{font=ui,size=bodySize,color=ink,space=12}={}){
    const leading=size*(font===title?1.18:1.48);
    for(const line of lines(text,font,size)){if(y-leading<49)start();y-=leading;page.drawText(line,{x:margin,y,font,size,color});}
    y-=space;
  }
  function heading(text){if(y<140)start();paragraph(text,{font:title,size:phone?23:30,space:16});}
  start();
  paragraph('Куршская коса',{size:11,color:muted,space:13});
  paragraph('Ваш день у дюн.',{font:title,size:phone?35:49,space:28});
  paragraph(snapshot.date.split('-').reverse().join('.')+' · '+snapshot.city,{size:13,space:22});
  page.drawRectangle({x:margin,y:y-54,width,height:54,color:blue});
  page.drawText(snapshot.rail?'Вернуться к жилью, по вашей оценке':'Возвращение в Зеленоградск',{x:margin+12,y:y-18,font:ui,size:10,color:ink});
  page.drawText(clock(snapshot.finish),{x:margin+12,y:y-42,font:title,size:24,color:ink});y-=77;
  paragraph(snapshot.walks.length===2?'Дюны Эфа и Танцующий лес. Между тропами - автобус.':'Высота Эфа. Настил, смотровые и возвращение к началу тропы.');
  paragraph('Это ваш план по опубликованной таблице № 210. Рейсы на дату поездки и наличие мест ещё нужно подтвердить.',{size:bodySize,color:muted});
  paragraph('Внутри - расписание вашего дня, запасной вариант и автономные карты троп.',{space:0});
  start();heading('Ритм вашего дня');
  paragraph(snapshot.rail?'Расчёт связывает жильё, электричку, автобус и возвращение. Время подходов и запас заданы вами. Рейсы требуют проверки на дату поездки.':'Расчёт начинается у автобуса в Зеленоградске. Дорогу от жилья до пересадки выбирайте отдельно.',{color:muted});
  for(const row of snapshot.timeline){
    const height=22*1.18+5+lines(row.title,ui,phone?12:14).length*(phone?12:14)*1.48+6+lines(row.text,ui,bodySize).length*bodySize*1.48+20;
    if(y-height<49)start();
    paragraph(clock(row.time),{font:title,size:22,color:ink,space:5});
    paragraph(row.title,{size:phone?12:14,space:6});
    paragraph(row.text,{color:muted,space:20});
  }
  start();heading('Вернуться с косы');
  paragraph('Остановка: '+snapshot.return.stop,{size:13});
  paragraph(`Будьте у остановки к ${clock(snapshot.return.board_by)}. Автобус по таблице - ${clock(snapshot.return.departure)}; в Зеленоградске - ${clock(snapshot.return.arrival)}.`);
  if(snapshot.rail){const r=snapshot.rail;paragraph(`Затем электричка до ${r.from}: у поезда к ${clock(r.train_by)}, отправление ${clock(r.inward.departure)}, прибытие ${clock(r.inward.arrival)}. Ещё ${r.from_station} мин до жилья по вашей оценке; вернуться около ${clock(r.home_finish)}.`);}
  paragraph('Если автобус ушёл или полон',{font:title,size:phone?19:23,space:12});
  paragraph(snapshot.fallback);
  for(const text of snapshot.limits.slice(1))paragraph(text,{color:muted});
  start();heading('Перед выходом');
  for(const [i,text]of snapshot.before.entries())paragraph(String(i+1).padStart(2,'0')+'  '+text,{space:19});
  heading('Источник расписания');
  paragraph(snapshot.publication.note,{color:muted});
  paragraph(`Таблица с ${snapshot.publication.valid_from}. Сверена ${snapshot.publication.checked_at}.`,{size:9,color:muted});
  paragraph(snapshot.publication.source_url,{size:9,color:muted});
  if(snapshot.rail){heading('Источник электричек');paragraph(snapshot.rail.publication.name,{size:10});paragraph('Сверено '+snapshot.rail.publication.checked_at,{size:9,color:muted});paragraph(snapshot.rail.publication.url,{size:9,color:muted});}
  const chapterPages=[];
  for(const {source,entry}of chapters){
    const begins=doc.getPageCount()+1;
    const copies=await doc.copyPages(source,source.getPageIndices());for(const copy of copies)doc.addPage(copy);
    chapterPages.push({route:entry.route,begins,pages:entry.pages,snapshot_sha256:entry.snapshot_sha256,pdf_sha256:entry.sha256});
  }
  const fullSnapshot={...snapshot,format,chapters:chapterPages},snapshotBytes=new TextEncoder().encode(JSON.stringify(fullSnapshot)),snapshotSha=await hash(snapshotBytes),pages=doc.getPages();
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
