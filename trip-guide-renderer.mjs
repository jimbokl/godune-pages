import './assets/vendor/pdf/pdf-lib.js?v=2026101305';
import './assets/vendor/pdf/fontkit.js?v=2026101305';
import {clock} from './day-stop-view.mjs?v=2026101305';
import {journeyKinds} from './day-journey-view.mjs?v=2026101305';
import {kosaBoardingText} from './kosa-boarding.mjs?v=2026101305';
import {loadKosaGuideAssets} from './guide-sections.mjs?v=2026101305';
import {formatKopecks as money} from './trip-money.mjs?v=2026101305';
import {transferClock} from './trip-service-transfer-view.mjs?v=2026101305';
import {serviceSourceCaption,groupServiceSources} from './service-provenance.mjs?v=2026101305';
import {transportBooklet} from './transport-booklet-view.mjs?v=2026101305';
import {walkingBooklet} from './walking-booklet-view.mjs?v=2026101601';
const {PDFDocument,PDFString,rgb}=globalThis.PDFLib;
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
  function start(){page=doc.addPage([w,h]);page.drawRectangle({x:0,y:0,width:w,height:h,color:paper});page.drawText(clean(chapter,ui).slice(0,60),{x:m,y:h-m-9,font:ui,size:8,color:muted});y=h-m-(phone?28:38);}
  const need=n=>{if(y-n<51)start();};
  function lines(text,font,size,max=width){const out=[];let line='';for(const word of clean(text,font).split(/\s+/)){const next=line?line+' '+word:word;if(font.widthOfTextAtSize(next,size)<=max){line=next;continue;}if(line){out.push(line);line='';}for(const letter of word){if(line&&font.widthOfTextAtSize(line+letter,size)>max){out.push(line);line='';}line+=letter;}}if(line)out.push(line);return out;}
  const leadingFor=font=>font===title?1.2:phone?1.4:1.48;
  function text(value,{font=ui,size=body,color=ink,space=phone?7:10,max=width,x=m,link}={}){const leading=size*leadingFor(font),wrapped=lines(value,font,size,max);if(wrapped.length*leading+space<h-2*m-90)need(wrapped.length*leading+space);for(const line of wrapped){need(leading);y-=leading;page.drawText(line,{x,y,font,size,color});if(link)page.node.addAnnot(doc.context.register(doc.context.obj({Type:'Annot',Subtype:'Link',Rect:[x,y-2,x+font.widthOfTextAtSize(line,size),y+size],Border:[0,0,0],A:{Type:'Action',S:'URI',URI:PDFString.of(new URL(link,base).href)}})));}y-=space;}
  const textHeight=(value,font=ui,size=body,space=phone?7:10)=>lines(value,font,size).length*size*leadingFor(font)+space;
  function heading(value,large=false,following='',extra=0){const size=large?(phone?26:43):(phone?18:30),space=phone?10:16,head=textHeight(value,title,size,space),follow=textHeight(following)+extra;need(head+(head+follow<h-2*m-90?follow:body*3));text(value,{font:title,size,space});}
  async function embeddedImage(value){let img=embedded.get(value);if(!img){img=await (value.kind==='jpeg'?doc.embedJpg(value.bytes):doc.embedPng(value.bytes));embedded.set(value,img);}return img;}
  async function imageBox(value,x,top,bw,bh){const img=await embeddedImage(value),scale=Math.max(bw/value.width,bh/value.height),dw=value.width*scale,dh=value.height*scale;page.pushOperators(globalThis.PDFLib.pushGraphicsState(),globalThis.PDFLib.rectangle(x,top-bh,bw,bh),globalThis.PDFLib.clip(),globalThis.PDFLib.endPath());page.drawImage(img,{x:x+(bw-dw)/2,y:top-bh+(bh-dh)/2,width:dw,height:dh});page.pushOperators(globalThis.PDFLib.popGraphicsState());}
  async function image(value,maxHeight){if(!value)return;const img=await embeddedImage(value),iw=Math.min(width,maxHeight*value.width/value.height),ih=iw*value.height/value.width;need(ih+15);page.drawImage(img,{x:m+(width-iw)/2,y:y-ih,width:iw,height:ih});y-=ih+14;}

  function qrLayout(caption){const size=phone?52:68,wrapped=lines(caption,ui,phone?9:11,width-size-12),leading=phone?13:16;return {size,wrapped,leading,height:Math.max(size,wrapped.length*leading)+18};}
  async function qrCard(value,caption){if(!value)return;const img=await doc.embedPng(value.bytes),{size,wrapped,leading,height}=qrLayout(caption);need(height);page.drawImage(img,{x:m,y:y-size,width:size,height:size});wrapped.forEach((line,i)=>page.drawText(line,{x:m+size+12,y:y-leading*(i+1),font:ui,size:phone?9:11,color:muted}));y-=height;}
  const gps=p=>`${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}`;
  const sourceCaption=s=>serviceSourceCaption(s.name===s.url?{...s,name:'Источник'}:s);
  const sourceHeight=s=>s?textHeight(sourceCaption(s),ui,phone?8.5:10,3)+(s.url?textHeight(s.url,ui,phone?8:9,8):0):0;
  const source=(s)=>{if(!s)return;need(sourceHeight(s));text(sourceCaption(s),{size:phone?8.5:10,color:muted,space:3});if(s.url)text(s.url,{size:phone?8:9,color:muted,space:8,link:s.url});};
  function notes(day){if(!day.record.note||day.generated_note===true)return;const prior=Boolean(day.record.kosa_plan);heading(prior?'Прежняя запись дня':'Ваши заметки',false,day.record.note);if(prior)text('Это прежняя запись дня. Текущий план и возвращение показаны выше; прежний час после изменения дня или опоздания не подтверждён.',{color:muted});text(day.record.note);}
  const amount=(total,known)=>total!=null?money(total):known>0?`Известно ${money(known)}. Полная сумма неизвестна.`:'Сумма пока неизвестна.';
  const expenseContext={date_missing:'Дата дня не выбрана. Выбранный тариф нужно проверить.',date_changed:'Дата дня изменилась. Выбранный тариф нужно проверить.',party_changed:'Состав компании изменился. Выбранный тариф нужно проверить.',selection_changed:'Посещение изменилось. Записанная сумма сохранена.',visit_removed:'Посещение убрано из дня. Запись расходов сохранена.',unsupported:'Выбор посещения нужно проверить. Записанные суммы сохранены.'};
  async function serviceChapter(s,number){
    start();text(`${String(number).padStart(2,'0')} · ${s.category}`,{size:9,color:muted,space:16});heading(s.name,true);
    text(s.summary);if(s.address)text('Адрес: '+s.address);
    for(const row of s.selection_facts||[])text(`${row.label}: ${row.value}`,{size:phone?10.5:12,space:5});
    if(s.rental_points?.length){
      await image(media.maps[s.key+':rental'],phone?175:260);
      for(const [i,p]of s.rental_points.entries()){text(`${i+1}. ${p.label}: ${p.name} · GPS ${gps(p)}`,{size:phone?10:12});source(p.source?{name:p.source.reference,checked_at:p.source.checked_at}:null);}
      text(`© OpenStreetMap contributors · ODbL 1.0 · ${media.source.snapshot_at}`,{size:8,color:muted});
    }
    else if(s.point){text('GPS '+gps(s.point),{size:phone?12:14});await image(media.maps[s.key],phone?175:260);text('Ориентир из сохранённого посещения. Вход и подход уточните.',{size:phone?9:11,color:muted});source({name:s.point.source_id,checked_at:s.point.checked_at});text(`© OpenStreetMap contributors · ODbL 1.0 · ${media.source.snapshot_at}`,{size:8,color:muted});}
    else text('Координаты не записаны. Сохраните адрес и уточните вход до выхода.',{color:muted});
    const a=s.assessment;
    if(a){
      const sources=groupServiceSources(s.sources);
      const groupHeight=g=>g.details.reduce((sum,d)=>sum+textHeight(d,ui,phone?8.5:10,4),0)+sourceHeight({...g,name:'Источник'});
      const sourcesHeight=sources.reduce((sum,g)=>sum+groupHeight(g),0);
      heading('Выбранное посещение',false,date(s.date));text(date(s.date));
      if(s.rental?.length){for(const row of s.rental)text(`${row.label}: ${row.value}`,{size:phone?10.5:12,space:5});}
      else for(const [label,value]of [['Прибытие к ориентиру',a.visit.timeline.arrival],['Вход',a.visit.timeline.entry],['Начало посещения',a.visit.timeline.activity_start],['Конец посещения',a.visit.timeline.activity_end],['Возвращение к ориентиру',a.summary.departure]])text(`${label}: ${value==null?'время ещё неизвестно':clock(value)}`,{size:phone?10.5:12,space:5});
      if(a.visit.timeline.wait>0)text(`Ожидание сеанса: ${a.visit.timeline.wait} мин.`,{size:phone?10.5:12});
      text(`Всего: ${a.summary.total_minutes==null?`известно ${a.visit.duration.known_minutes} мин; полное время нужно уточнить`:`${a.summary.total_minutes} мин`}.`);
      heading('Время на подготовку',false,s.stages[0]?.label);
      for(const stage of s.stages)text(`${stage.label}: ${stage.minutes==null?'нужно уточнить':stage.minutes+' мин'}`,{size:phone?10:12,space:5});
      const priceLines=(s.price_rows||[]).map(row=>`${row.name}: ${row.total==null?'Нужно уточнить':money(row.total)}${row.detail?' · '+row.detail:''}`);
      const totals=['Стоимость: '+s.cost,...(s.cost_split?[s.cost_split]:[]),...(a.quote?['Возвратный залог: '+s.deposit,'Потребуется при входе: '+s.upfront]:[])];
      // Keep an ordinary receipt with its total on one page; long receipts still flow.
      const receiptHeight=priceLines.reduce((sum,line)=>sum+textHeight(line,ui,phone?10.5:12,5),0)+totals.reduce((sum,line)=>sum+textHeight(line),0);
      heading('На вашу компанию',false,'',receiptHeight);
      for(const line of priceLines)text(line,{size:phone?10.5:12,space:5});
      for(const line of totals)text(line);
      text(a.quote?'Это выбранный тариф. Записанные оплаты и возвраты показаны отдельно в расходах дня.':'Тариф ещё не выбран. Уточните стоимость у заведения перед посещением.',{size:phone?9:11,color:muted});
      if(s.conditions.length){
        const label=c=>`${c.label} · ${c.status}`,observationText=o=>o.text+(o.status==='current'?'':' · сведения нужно сверить');
        const blockHeight=c=>textHeight(label(c),ui,phone?11:13)+c.observations.reduce((sum,o)=>sum+textHeight(observationText(o),ui,phone?10:12)+sourceHeight(o.source),0);
        heading('Перед посещением',false,label(s.conditions[0]),Math.max(0,blockHeight(s.conditions[0])-textHeight(label(s.conditions[0]))));
        for(const [i,condition]of s.conditions.entries()){
          const tail=i===s.conditions.length-1?sourcesHeight+(s.note?textHeight('Ваша заметка',title,phone?24:30,16)+textHeight(s.note):0):0;
          const block=blockHeight(condition);need(block+tail<h-2*m-90?block+tail:Math.min(block,body*6));
          text(label(condition),{size:phone?11:13});
          for(const observation of condition.observations){const size=phone?10:12,block=textHeight(observationText(observation),ui,size)+sourceHeight(observation.source);if(block<h-2*m-90)need(block);text(observationText(observation),{size});source(observation.source);}
        }
      }
      const tail=sourcesHeight+(s.note?textHeight('Ваша заметка',title,phone?24:30,16)+textHeight(s.note):0);
      if(tail<h-2*m-90)need(tail);
      if(sources.length)heading('Сведения и источники',false,sources[0].details[0]||'Источник');
      for(const group of sources){
        if(groupHeight(group)<h-2*m-90)need(groupHeight(group));
        for(const detail of group.details)text(detail,{size:phone?8.5:10,color:muted,space:4});
        source({...group,name:'Источник'});
      }
    }
    if(s.note){heading('Ваша заметка',false,s.note);text(s.note);}
  }
  // Choose each day's presentation independently: one booking or ferry must not
  // expand all other walking days into the complete service guide.
  const books=snapshot.days.map(day=>{
    const one={...snapshot,days:[day]},transport=transportBooklet(one);
    if(transport)return {kind:'transport',value:transport};
    const walking=walkingBooklet(one);
    return walking?{kind:'walking',value:walking}:null;
  });
  const allWalking=books.every(b=>b?.kind==='walking');
  const allTransport=books.every(b=>b?.kind==='transport');
  const hasFull=books.some(b=>!b);
  const hasWalking=books.some(b=>b?.kind==='walking');
  const dayFootnotes=day=>[...new Set([...(day.preferences?.notes||[]),...(day.access?.gaps||[])])];
  const commonFootnotes=allWalking&&snapshot.days.length>1?dayFootnotes(snapshot.days[0]).filter(value=>snapshot.days.every(day=>dayFootnotes(day).includes(value))):[];
  const commonPlanB=allWalking&&snapshot.days.length>1&&snapshot.days.every(day=>day.planB===snapshot.days[0].planB)?snapshot.days[0].planB:null;
  // A one-day phone booklet opens with the actual plan, without a second cover.
  if(hasFull&&(!phone || snapshot.days.length>1)){
  start();text('GODUNE · БАЛТИЙСКИЕ ДЮНЫ',{size:9,color:muted,space:20});heading(snapshot.title,true);
  text(snapshot.days.length===1?date(snapshot.days[0].date):`${plural(snapshot.days.length,['день','дня','дней'])} в одном путеводителе`,{size:phone?13:16,space:18});
  const first=snapshot.days.flatMap(d=>d.stops).find(p=>media.photos[p.id]);
  const coverHeight=Math.max(65,Math.min(phone?180:300,y-51-(phone?155:180)));
  if(first){await image(media.photos[first.id],coverHeight);text('Авторский снимок · '+first.name,{size:8,color:muted,space:8});}
  else if(media.overview[snapshot.days[0].id])await image(media.overview[snapshot.days[0].id],coverHeight);
  text(snapshot.transport_receipt||snapshot.days.some(d=>d.transport_plans?.length)?'Ваш транспортный план, суммы и источники остаются в этом файле без сети.':'Ваш день и возвращение. Карты, координаты и заметки остаются в этом файле без сети.');
  await qrCard(media.qrs?.planner,'godune.ru/planner/\nЗдесь можно продолжить поездку при появлении связи.');
  }
  const chapters=[],trailSections=[],interchangePages=[],preparation=new Set();
  async function renderTransportBook(b){
    const day=b.day,begins=doc.getPageCount()+1;
    chapter=`ДЕНЬ ${day.number||1} · ${date(b.receipt.date)}`;start();
    heading(b.title,true);text(b.subtitle,{size:phone?12:16,color:muted,space:phone?14:20});
    for(const value of b.context)text(value,{size:phone?9:11,color:muted});
    const cardWidth=width-30,cardText=(value,font,size,space)=>lines(value,font,size,cardWidth).length*size*leadingFor(font)+space;
    for(const [i,step]of b.overview.entries()){
      const size=phone?15:22,space=phone?5:8;
      need(cardText(step.title,title,size,space)+cardText(step.text,ui,body,phone?14:20));
      const cy=y-12;page.drawCircle({x:m+10,y:cy,size:10,color:i===1?rgb(.75,.46,.12):rgb(.34,.53,.65)});
      page.drawText(String(i+1),{x:m+10-ui.widthOfTextAtSize(String(i+1),10)/2,y:cy-3.5,font:ui,size:10,color:paper});
      text(step.title,{font:title,size,space,x:m+30,max:cardWidth});text(step.text,{x:m+30,max:cardWidth,space:phone?14:20});
    }
    text(`${b.receipt.answers.people} чел. · ${b.budget}`,{size:phone?10:12,space:8});
    if(b.backupWarning)text(b.backupWarning,{size:phone?9:11,color:muted,space:6});
    if(b.receipt.rail_connection?.state!=='connected'&&b.receipt.rail_connection)text(b.status,{size:phone?9:11,color:muted});
    chapter='ДОРОГА И ПРОГУЛКА';if(phone)start();else y-=14;heading('По шагам',false,b.details[0]?.title);
    for(const row of b.details){
      const label=row.kind==='cost'?'Стоимость на компанию':row.time===null?row.timeLabel||'Время уточняется':`${row.timeLabel?row.timeLabel+' · ':''}${transferClock(row.time)}`;
      const size=phone?11:12,caption=`${label} · ${row.title}${row.references.length?' ['+row.references.join(', ')+']':''}`,lead=textHeight(caption,ui,size,5),content=textHeight(row.text,ui,phone?10:11,10);
      need(lead+(lead+content<h-2*m-90?content:body*3));
      text(caption,{size,space:5});text(row.text,{size:phone?10:11,space:10});
    }
    heading('Если задержались',false,day.planB);text(day.planB,{size:phone?10:12});notes(day);
    for(const gap of day.access?.gaps||[])text(gap,{size:phone?9:11,color:muted});
    const sourceBlock=s=>({value:`[${s.number}] ${sourceCaption(s)}`,host:new URL(s.url).hostname.replace(/^www\./,'')});
    const sourceBlockHeight=s=>{const {value,host}=sourceBlock(s);return textHeight(value,ui,phone?8.5:10,3)+textHeight(host,ui,phone?8.5:10,8);};
    heading('Источники',false,'',b.sources[0]?sourceBlockHeight(b.sources[0]):0);
    for(const s of b.sources){
      const {value,host}=sourceBlock(s);
      need(sourceBlockHeight(s));
      text(value,{size:phone?8.5:10,color:muted,space:3});text(host,{size:phone?8.5:10,color:muted,space:8,link:s.url});
    }
    text(`Подготовлено ${date(snapshot.created_at.slice(0,10))}. План и источники сохранены в PDF и вложении plan.json. Рейсы и цены в файле не обновляются.`,{size:phone?8.5:10,color:muted});
    chapters.push({id:day.id,begins,pages:doc.getPageCount()-begins+1});
  }
  async function renderWalkingBook(b){
    const day=b.day,small=phone?9.5:11,space=phone?5:7,begins=doc.getPageCount()+1;
    chapter=`ДЕНЬ ${day.number||1} · ${date(day.date)}`;start();
    if(snapshot.days.length>1&&b.day===snapshot.days[0]&&!hasFull)text(snapshot.title,{font:title,size:phone?17:24,space:14});
    heading(day.name,true);text(date(day.date),{size:phone?12:15,color:muted,space});
    const schedule=day.record.schedule;
    text(`Начало ${clock(schedule.start)} · до ${clock(schedule.end)}${day.finish!==null?' · окончание около '+clock(day.finish):day.earliest_finish!==null?' · не раньше '+clock(day.earliest_finish):''}`,{size:small,space});
    text(`${plural(b.cards.length,['остановка','остановки','остановок'])}${day.slack!==null?' · запас '+day.slack+' мин':''}${day.party_label?' · '+day.party_label:''}`,{size:small,color:muted,space});
    if(b.summary)text(b.summary,{size:small,space});
    for(const [label,point]of [['Начало',day.record.start_at],['Возвращение',day.record.night_at]])if(point?.kind==='personal')text(`${label}: ${point.name} · GPS ${gps(point)}`,{size:small,space});
    if(day.preferences?.label)text('Вам важно: '+day.preferences.label,{size:small,space});
    await image(media.overview[day.id],phone?125:220);
    if(media.overview[day.id])text('Общий вид. Линия - только по рассчитанным дорогам. © OpenStreetMap contributors · ODbL 1.0 · '+media.source.snapshot_at,{size:8,color:muted,space});
    const rowCaption=row=>`${row.time===null?row.timeLabel||'Время уточняется':(row.timeLabel?row.timeLabel+' · ':'')+transferClock(row.time)} · ${row.title}${row.references.length?' '+row.references.join(' '):''}`;
    const rowHeight=row=>textHeight(rowCaption(row),ui,small,3)+textHeight(row.plan_text,ui,small,space)+(row.anchors||[]).filter(anchor=>anchor.location?.kind==='point').reduce((sum,anchor)=>sum+textHeight(`${anchor.name} · GPS ${gps(anchor.location)}`,ui,small,space),0);
    // A short first stop belongs with its heading; reserve the same complete
    // row used below rather than only the stop's title.
    heading('Ваш план',false,'',b.rows[0]?rowHeight(b.rows[0]):textHeight('Точное время ещё не рассчитано. Сверьте план перед выходом.',ui,small));
    if(!b.rows.length)text('Точное время ещё не рассчитано. Сверьте план перед выходом.',{size:small});
    for(const row of b.rows){
      const caption=rowCaption(row),height=rowHeight(row);
      need(height<h-2*m-90?height:textHeight(caption,ui,small,3)+small*4);
      text(caption,{size:small,space:3});text(row.plan_text,{size:small,color:muted,space});
      for(const anchor of row.anchors||[])if(anchor.location?.kind==='point')text(`${anchor.name} · GPS ${gps(anchor.location)}`,{size:small,color:muted,space});
    }
    if(b.calculation_notes.length){
      const noteText=note=>(note.code==='travel_needs_check'?'':note.places.join('; ')+': ')+note.text;
      heading('Расчёт времени',false,noteText(b.calculation_notes[0]));
      for(const note of b.calculation_notes)text(noteText(note),{size:small,color:muted,space});
    }
    if(b.meals.length||day.menu_quote){
      const quote=day.menu_quote?.text||day.menu_quote?.error||'';
      const mealHeight=meal=>textHeight(meal.name,title,phone?14:17,space)+[meal.place+(meal.address?' · '+meal.address:''),meal.text,meal.price,meal.note].filter(Boolean).reduce((n,v)=>n+textHeight(v,ui,small,space),0);
      heading('Что попробовать',false,quote,b.meals[0]?Math.min(mealHeight(b.meals[0]),small*8):0);
      if(quote)text(quote,{size:small,space});
      for(const meal of b.meals){
        need(Math.min(mealHeight(meal),h-2*m-90));
        text(meal.name,{font:title,size:phone?14:17,space});
        text(meal.place+(meal.address?' · '+meal.address:''),{size:small,color:muted,space});
        if(meal.text)text(meal.text,{size:small,space});
        text(meal.price+(meal.reference?' '+meal.reference:''),{size:small,space});
        if(meal.note)text(meal.note,{size:small,color:muted,space});
      }
    }
    for(const {place:p,number,conditions,reference}of b.cards){
      const size=phone?20:28,map=media.maps[p.id],photo=media.photos[p.id];
      need(textHeight(`${number}. ${p.name}`,title,size,8)+textHeight('GPS '+gps(p),ui,small,space)+(map?phone?126:192:0)+small*4);
      text(`${number}. ${p.name}`,{font:title,size,space:8});
      text(`GPS ${gps(p)} ${reference}`,{size:small,color:muted,space,link:p.path});
      if(map){
        const mapHeight=phone?105:170;
        if(photo){const photoWidth=phone?78:125,gap=10;await imageBox(map,m,y,width-photoWidth-gap,mapHeight);await imageBox(photo,m+width-photoWidth,y,photoWidth,mapHeight);y-=mapHeight+8;}
        else await image(map,mapHeight);
        text('Ромб - место. © OpenStreetMap contributors · ODbL 1.0'+(photo?' · Фото автора':''),{size:8,color:muted,space});
      }else if(photo){await image(photo,phone?105:170);text('Фото автора',{size:8,color:muted,space});}
      if(p.completed)text('Уже были. Время осмотра не записывали.',{size:small,color:muted,space});
      for(const paragraph of p.story)text(paragraph,{size:small,space});
      if(p.focus)text(p.focus,{size:small,space});
      if(p.practical)text(p.practical,{size:small,color:muted,space});
      for(const c of conditions)text(c.text+(c.references.length?' '+c.references.join(' '):''),{size:small,space});
      y-=phone?12:18;
    }
    if(!commonPlanB){heading('Если день пошёл иначе',false,day.planB);text(day.planB,{size:small,space});}
    for(const row of b.access)text(`${row.name} · ${row.label}: ${row.text} ${row.reference}`,{size:small,space});
    for(const value of dayFootnotes(day).filter(value=>!commonFootnotes.includes(value)))text(value,{size:small,color:muted,space});
    notes(day);
    if(b.sources.length){
      const size=phone?8.5:10,values=b.sources.map(s=>`[${s.number}] ${sourceCaption(s)}`),heights=values.map(value=>textHeight(value,ui,size,space));
      const head=textHeight('Источники',title,phone?18:30,phone?10:16),total=head+heights.reduce((sum,value)=>sum+value,0);
      // Keep a short evidence list together. In longer lists keep the final two
      // references together so a single citation never becomes its own page.
      need(total<h-2*m-90?total:head+heights.slice(0,2).reduce((sum,value)=>sum+value,0));
      heading('Источники',false,values[0]);
      for(const [i,s]of b.sources.entries()){
        if(i===b.sources.length-2)need(heights[i]+heights[i+1]);
        text(values[i],{size,color:muted,space,link:s.url});
      }
    }
    chapters.push({id:day.id,begins,pages:doc.getPageCount()-begins+1});
  }
  for(const [index,day]of snapshot.days.entries()){
    if(books[index]?.kind==='transport'){await renderTransportBook(books[index].value);continue;}
    if(books[index]?.kind==='walking'){await renderWalkingBook(books[index].value);continue;}
    const kosaAssets=day.kosa?await loadKosaGuideAssets({snapshot:day.kosa,base,format},{signal,onProgress}):null;
    signal?.throwIfAborted();chapter=`ДЕНЬ ${Number.isInteger(day.number)&&day.number>0?day.number:index+1} · ${date(day.date)}`;start();const begins=doc.getPageCount();heading(day.name,true);
    text(date(day.date),{size:phone?12:15,color:muted});if(day.party_label)text(day.party_label,{size:phone?12:15,color:muted});
    const home=day.record.start_at,night=day.record.night_at;
    if(home?.kind==='personal')text(`Начало: ${home.name} · GPS ${gps(home)}`,{size:phone?9.5:11});
    if(night?.kind==='personal')text(`Возвращение: ${night.name} · GPS ${gps(night)}`,{size:phone?9.5:11});
    text(day.summary);
    if(day.preferences?.label){text('Вам важно: '+day.preferences.label,{size:phone?12:15});for(const note of day.preferences.notes.filter(note=>!day.access || !day.access.entries.some(row=>note.startsWith(row.name+':')) && !note.startsWith('Проход без лестниц')))text(note,{size:phone?10:12});}
    const entries=day.entries||day.stops.map((p,i)=>({...p,kind:'place',number:i+1}));
    text(`${(snapshot.transport_receipt||day.transport_plans?.length)&&!entries.length?'Сохранённый транспортный расчёт':plural(entries.length,['остановка','остановки','остановок'])}${day.finish!==null?` · окончание по плану ${clock(day.finish)}`:day.earliest_finish!==null?` · не раньше ${clock(day.earliest_finish)}`:''}${day.slack!==null?` · запас ${day.slack} мин`:''}`,{color:muted});
    await image(media.overview[day.id],phone?115:265);
    if(media.overview[day.id]){text('Общий вид. Подробные карты - у остановок. Линия показана только там, где путь рассчитан по дорогам; между остальными местами её нет.',{size:phone?8.5:10,color:muted});text(`© OpenStreetMap contributors · ODbL 1.0 · ${media.source.snapshot_at}`,{size:8,color:muted});}
    for(const p of entries)text(`${String(p.number).padStart(2,'0')} · ${p.name}${p.completed?' · уже были, время осмотра не записано':''}${!phone&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)?' · GPS '+gps(p):!Number.isFinite(p.lat)||!Number.isFinite(p.lon)?' · координаты пока не записаны':''}`,{size:phone?9.5:11,space:8});
    heading('По шагам',false,day.rows[0]?.title||'Точное время ещё не рассчитано.',40);
    if(!day.rows.length)text('Точное время ещё не рассчитано. Сверьте прежний план на сайте перед выходом.');
    for(const row of day.rows){
      const label=row.kind==='cost'?'Стоимость на компанию':`${row.time===null?(row.timeLabel||'Время нужно уточнить'):`${row.timeLabel?row.timeLabel+' · ':''}${transferClock(row.time)}`} · ${row.kind==='service'?'Посещение':journeyKinds[row.kind] || 'Остановка'}`;
      const leadHeight=textHeight(label,ui,phone?9:11,5)+textHeight(row.title,ui,phone?12:14,6),bodyHeight=textHeight(row.text);
      // Keep a short event together; a long event starts with at least two body lines.
      const evidenceHeight=(row.source&&!day.kosa?sourceHeight(row.source):0)+(row.sources||[]).reduce((sum,s)=>sum+sourceHeight(s),0);
      need(leadHeight+(leadHeight+bodyHeight+evidenceHeight<h-2*m-90?bodyHeight+evidenceHeight:body*1.48*2));
      text(label,{size:phone?9:11,color:muted,space:5});text(row.title,{size:phone?12:14,space:6});text(row.text);
      for(const anchor of row.anchors||[])if(anchor.location?.kind==='point')text(`${anchor.name} · GPS ${gps(anchor.location)}`,{size:phone?9:11,color:muted});
      const detail=day.kosa?.timeline.find(item=>item.title===row.title&&item.kind===row.kind&&item.time===row.time) || row;
      if(Object.hasOwn(detail,'boarding'))text(detail.boarding?kosaBoardingText(detail.boarding):'Названия остановок пока не загружены. Уточните их до поездки.');
      if(row.source&&!day.kosa)source(row.source);
      for(const s of row.sources||[])source(s);
    }
    if(day.menu_choices?.length){
      const mealHeight=meal=>textHeight(meal.name,ui,phone?14:17,6)+textHeight(meal.place+(meal.address?' · '+meal.address:''),ui,phone?10.5:12)+(meal.text?textHeight(meal.text):0)+textHeight(meal.price)+(meal.note?textHeight(meal.note,ui,phone?9:11):0)+sourceHeight(meal.source);
      const quote=day.menu_quote?.text||day.menu_quote?.error||'';
      heading('Что попробовать',false,quote,mealHeight(day.menu_choices[0]));
      if(quote)text(quote);
      for(const meal of day.menu_choices){
        need(mealHeight(meal));text(meal.name,{size:phone?14:17,space:6});text(meal.place+(meal.address?' · '+meal.address:''),{size:phone?10.5:12});
        if(meal.text)text(meal.text);text(meal.price);if(meal.note)text(meal.note,{size:phone?9:11,color:muted});source(meal.source);
      }
    }
    heading('Если день пошёл иначе',false,day.planB);text(day.planB);
    if(day.access){
      const first=day.access.entries[0];
      // Keep the chapter title with the first evidence label and its opening lines.
      heading('Лестницы и проход',false,'',first?textHeight(first.name+' · '+first.label,ui,phone?11:13)+body*3:textHeight(day.access.gaps[0]));
      for(const row of day.access.entries){const label=row.name+' · '+row.label;need(textHeight(label,ui,phone?11:13)+body*3);text(label,{size:phone?11:13});text(({route:'Линия прогулки',segment:'Отдельный участок',place:'На месте'}[row.extent] || 'На месте')+' · '+row.text,{size:phone?10:12});source(row.source);}for(const gap of day.access.gaps)text(gap,{size:phone?10:12,color:muted});
    }
    if(day.kosa){
      const k=day.kosa;
      if(k.outing){const o=k.outing;heading('С детьми и на случай непогоды',false,o.rows[0]||o.rain);
        for(const value of o.rows)text(value);if(o.access_source)source(o.access_source);
        text('Дождь · '+o.rain);
        if(o.shorter_return){const r=o.shorter_return;text(`Вариант без Танцующего леса: у остановки Эфа к ${clock(r.board_by)}, автобус ${clock(r.departure)} → Зеленоградск ${clock(r.arrival)}. Автобус туда и время на Эфе те же. После изменения прогулки пересчитайте ужин и дальнейшую дорогу.`);}
        text('Сильный ветер · '+o.wind);source(o.source);
      }
      if(k.light){heading('Свет на тропах и у остановки',false,k.light.rows[0]?.text);for(const row of k.light.rows)text(row.text,{color:row.warning?ink:muted});}
      for(const value of k.limits)text(value,{color:muted});
      heading('Источник расписания',false,k.publication.note);text(k.publication.note,{color:muted});
      source({name:'Таблица автобуса № 210 с '+k.publication.valid_from,url:k.publication.source_url,checked_at:k.publication.checked_at});
      if(k.rail)source(k.rail.publication);
      for(const value of k.before)preparation.add(value);
    }
    if(!kosaAssets)notes(day);
    if(day.expenses && (!phone || day.expenses.error || day.expenses.categories.some(category=>category.items?.length))){
      heading('Записанные расходы',false,day.expenses.error||'Суммы на вашу компанию');
      if(day.expenses.error)text(day.expenses.error);
      else{
        const b=day.expenses.summary;text('План: '+amount(b.total,b.known));text('Оплачено: '+amount(b.paid_total,b.paid_known));text('Вернулось: '+money(b.refunded));text('После возвратов: '+amount(b.net_total,b.net_known));
        for(const category of day.expenses.categories){const summary=b.categories.find(v=>v.kind===category.kind);if(!category.items?.length&&summary.total==null&&summary.paid_total==null)continue;text(`${category.label} · ${amount(summary.total,summary.known)}`,{size:phone?11:13});for(const item of category.items||[]){text(`${item.label}${item.cancelled?' · отменено':''}${item.note?' · '+item.note:''}`,{size:phone?10:12});const context=day.expenses.links.find(v=>v.item_id===item.id)?.context;if(expenseContext[context])text(expenseContext[context],{size:phone?9:11,color:muted});for(const refund of item.refunds||[])text(`Возврат: ${money(refund.amount)}${refund.date?' · '+date(refund.date):''}${refund.note?' · '+refund.note:''}`,{size:phone?9:11,color:muted});}}
        text('Выбранные тарифы посещений и возвратные залоги не прибавляются к этому журналу повторно.',{size:phone?9:11,color:muted});
      }
    }
    if(day.bookings.length){heading('Билеты и ночёвки');for(const b of day.bookings){need(65);text(`${b.kindLabel} · ${b.name}`,{size:phone?12:14,space:5});text(`${b.statusLabel} · ${date(b.date)}${Number.isInteger(b.time)?' · '+clock(b.time):''}${b.location?' · '+b.locationLabel:''}`);if(b.problem)text('Время этой записи сейчас не закрепляет день. Проверьте дату и привязку.',{color:muted});if(b.private?.reference)text('Номер брони: '+b.private.reference);if(b.private?.note)text(b.private.note);}}
    for(const entry of entries){
      if(entry.kind==='service'){const service=day.services.find(v=>v.key===entry.key);await serviceChapter(service,entry.number);continue;}
      const p=day.stops.find(v=>v.id===entry.id),i=entry.number-1;
      if(kosaAssets?.chapters.some(c=>c.entry.route===p.id))continue;
      start();text(`${String(i+1).padStart(2,'0')} · ${p.area}`,{size:9,color:muted,space:phone?8:16});
      if(phone){
        const photo=media.photos[p.id],top=y;
        text(p.name,{font:title,size:22,max:photo?width-82:width,space:10});
        if(photo){await imageBox(photo,m+width-70,top,70,70);y=Math.min(y,top-78);}
        text('GPS '+gps(p)+(photo?' · Фото автора':''),{size:9.5,space:8});
      }else{
        heading(p.name,true);text('GPS '+gps(p),{size:14,space:16});
        if(media.photos[p.id]){await image(media.photos[p.id],270);text('Авторский снимок',{size:8,color:muted,space:10});}
      }
      if(p.completed)text('Уже были. Время осмотра не записывали.',{size:phone?10:12,color:muted,space:10});
      const placeSource={name:p.name,url:p.source,checked_at:p.checkedAt},qrCaption=`godune.ru/${p.path}\nСтраница места при появлении связи.`,tail=sourceHeight(placeSource)+(!phone&&media.qrs?.[p.id]?qrLayout(qrCaption).height:0);
      const mapCaption=`© OpenStreetMap contributors · ODbL 1.0 · ${media.source.snapshot_at}. Ромб - ваше место.`;
      const sectionHeight=value=>textHeight(value,title,phone?18:30,phone?10:16);
      const afterMap=textHeight(mapCaption,ui,8)+sectionHeight('На месте')+p.story.reduce((sum,paragraph)=>sum+textHeight(paragraph),0)+(p.focus?textHeight(p.focus):0)+(p.practical?textHeight(p.practical):0)+(p.conditions.length?sectionHeight('Перед входом'):0)+p.conditions.reduce((sum,c)=>sum+textHeight(c.text)+sourceHeight(c.source),0)+tail;
      // Keep a readable map while fitting the complete short place card on one page.
      const mapHeight=Math.max(phone?105:180,Math.min(phone?145:260,y-51-afterMap-14));
      await image(media.maps[p.id],mapHeight);
      text(mapCaption,{size:8,color:muted});
      heading('На месте',false,p.story[0]);for(const paragraph of p.story)text(paragraph);if(p.focus)text(p.focus);if(p.practical)text(p.practical);
      if(p.conditions.length){const first=p.conditions[0];heading('Перед входом',false,first.text,sourceHeight(first.source)+(p.conditions.length===1?tail:0));for(const [ci,c]of p.conditions.entries()){const block=textHeight(c.text)+sourceHeight(c.source)+(ci===p.conditions.length-1?tail:0);if(block<h-2*m-90)need(block);text(c.text);source(c.source);}}
      need(tail);source(placeSource);
      if(!phone)await qrCard(media.qrs?.[p.id],qrCaption);
    }
    if(kosaAssets){
      for(const {walk,bytes}of kosaAssets.walkingMaps){
        start();const begins=doc.getPageCount();
        text(walk.title,{font:title,size:phone?22:43,space:phone?8:16});
        text(`Около ${walk.distance_m} м · ${walk.estimated_minutes} мин по расчёту карты`,{size:phone?9.5:body,color:muted});
        const anchors=[walk.from,walk.to].map((id,i)=>{const a=day.kosa.interchanges.anchors[id];return `${i+1}. ${a.name} · GPS ${gps(a)}`;});
        const mapSource={name:'OpenStreetMap · ODbL 1.0',url:day.kosa.interchanges.source.url,checked_at:day.kosa.interchanges.source.snapshot_at};
        // Reserve the complete directions and provenance before sizing the map.
        // A three-line title must not push its only source onto a blank page.
        const tail=anchors.reduce((sum,value)=>sum+textHeight(value,ui,phone?9.5:11),0)+textHeight(walk.note,ui,phone?9.5:body)+textHeight(day.kosa.interchanges.verification.note,ui,phone?8.5:body)+sourceHeight(mapSource);
        const mapHeight=Math.max(phone?105:180,Math.min(phone?180:300,y-51-tail-14));
        await image({bytes,kind:'png',width:900,height:620},mapHeight);
        for(const value of anchors)text(value,{size:phone?9.5:11});
        text(walk.note,{size:phone?9.5:body});text(day.kosa.interchanges.verification.note,{size:phone?8.5:body,color:muted});
        source(mapSource);
        interchangePages.push({day:day.id,id:walk.id,begins,pages:doc.getPageCount()-begins+1,image_sha256:walk.images.png.sha256});
      }
      for(const c of kosaAssets.chapters){
        for(const section of c.sections){
          const begins=doc.getPageCount()+1;
          for(const copy of await doc.copyPages(c.source,section.pages))doc.addPage(copy);
          trailSections.push({day:day.id,route:c.entry.route,role:section.role,...(section.id?{id:section.id}:{}),begins,pages:section.pages.length,source_pages:section.pages,pdf_sha256:c.entry.sha256,snapshot_sha256:c.entry.snapshot_sha256,manifest_sha256:kosaAssets.manifest_sha256});
        }
      }
      if(day.record.note&&day.generated_note!==true){start();notes(day);}
    }
    chapters.push({id:day.id,begins,pages:doc.getPageCount()-begins+1});
  }
  if(hasFull){
  chapter='ПЕРЕД ВЫХОДОМ';start();heading('Всё с собой');const packingText=(value,options={})=>text(value,{...(phone?{size:9.5,space:6}:{}),...options});packingText((Object.keys(media.maps).length||Object.keys(media.photos).length?'Карты и фото из вашего дня встроены в PDF. ':'')+'План и источники вложены в plan.json; некоторые приложения показывают вложения только на компьютере.');
  for(const value of preparation)packingText(value);
  packingText(`Подготовлено ${date(snapshot.created_at.slice(0,10)).replace(/\.$/,'')}. Рейсы, цены и погода в этом файле не обновляются.`);
  packingText(snapshot.transport_receipt?'Сохраните PDF в телефоне и откройте его в авиарежиме до выхода. Источники доступны по ссылкам при появлении связи.':'Сохраните PDF в телефоне и откройте его в авиарежиме до выхода. Ссылки и QR откроют сайт, когда появится связь.');
  if(phone)await qrCard(media.qrs?.planner,'godune.ru/planner/\nПродолжить поездку при появлении связи.');
  if(!snapshot.transport_receipt){
    packingText('В этом файле могут быть ваши адреса, номера брони и личные заметки. Передавайте его тем, кому доверяете.');
    packingText('Расписание взято из таблицы, дорога - из карты или вашей оценки. Посадка, доступ и погода могут измениться. После пропущенного рейса пересчитайте день.');
  }
  for(const warning of media.warnings)packingText(warning,{color:muted});if(Object.keys(media.maps).length)source({name:'Картографические данные OpenStreetMap',url:media.source.source,checked_at:media.source.snapshot_at});
  packingText((phone?'Версия для телефона: вертикальный PDF.':'Печатная версия: A4, RGB, для обычного принтера.')+' Шрифты Manrope и Noto Serif Display - SIL Open Font License.',{size:9,color:muted});
  }else if(hasWalking){
    // Shared once per trip, after the last day's sources.
    const small=phone?8.5:10,space=phone?5:7;
    if(commonPlanB){heading('Если день пошёл иначе',false,commonPlanB);text(commonPlanB,{size:small,color:muted,space});}
    if(commonFootnotes.length){heading('Условия пути',false,commonFootnotes[0]);for(const value of commonFootnotes)text(value,{size:small,color:muted,space});}
    const fileText=`Подготовлено ${date(snapshot.created_at.slice(0,10)).replace(/\.$/,'')}. Карты, остановки, блюда и заметки доступны без сети. Полный план и источники вложены в plan.json.`,license='Manrope и Noto Serif Display · SIL Open Font License';
    const mapText=Object.keys(media.maps).length?'Картографические данные: OpenStreetMap · '+media.source.snapshot_at:'';
    const tail=textHeight(fileText,ui,small,space)+textHeight(license,ui,8,space)+(media.qrs?.planner?qrLayout('godune.ru/planner/\nПродолжить поездку при появлении связи.').height:0)+(mapText?textHeight(mapText,ui,8,space):0)+media.warnings.reduce((sum,value)=>sum+textHeight(value,ui,small,space),0);
    need(Math.min(tail,h-2*m-90));
    if(Object.keys(media.maps).length)text('Картографические данные: OpenStreetMap · '+media.source.snapshot_at,{size:8,color:muted,space,link:media.source.source});
    for(const warning of media.warnings)text(warning,{size:small,color:muted,space});
    text(fileText,{size:small,color:muted,space});
    await qrCard(media.qrs?.planner,'godune.ru/planner/\nПродолжить поездку при появлении связи.');
    text(license,{size:8,color:muted,space});
  }
  const assets=group=>Object.fromEntries(Object.entries(group).map(([id,m])=>[id,{path:m.path,sha256:m.sha256}]));
  const full={...snapshot,format,...(allWalking?{layout:'walking-compact-v1'}:books.some(Boolean)?{layout:allTransport?'transport-compact-v1':'mixed-compact-v1'}:{}),...(hasWalking?{reading_view:'walking-notes-v2'}:{}),day_layouts:books.map((b,i)=>({id:snapshot.days[i].id,layout:b?.kind||'full'})),chapters,trail_sections:trailSections,interchange_pages:interchangePages,map_source:media.source,maps:assets(media.maps),photos:assets(media.photos),warnings:media.warnings},snapshotBytes=new TextEncoder().encode(JSON.stringify(full)),sha=await hash(snapshotBytes),pages=doc.getPages();
  pages.forEach((p,i)=>{const {width:pw}=p.getSize();p.drawRectangle({x:0,y:0,width:pw,height:35,color:paper});p.drawLine({start:{x:m,y:33},end:{x:pw-m,y:33},thickness:.6,color:blue});p.drawText('godune.ru · '+sha.slice(0,8),{x:m,y:21,font:ui,size:7.5,color:muted});const n=`${i+1} / ${pages.length}`;p.drawText(n,{x:pw-m-ui.widthOfTextAtSize(n,7.5),y:21,font:ui,size:7.5,color:muted});});
  await doc.attach(snapshotBytes,'plan.json',{mimeType:'application/json',description:'Личный план и версии встроенных карт'});doc.setTitle(snapshot.title);doc.setAuthor('Балтийские дюны · godune.ru');doc.setSubject('Личный путеводитель · '+sha);signal?.throwIfAborted();onProgress('Готовим файл для сохранения…');
  return {bytes:await doc.save(),pages:pages.length,format,snapshot_sha256:sha,chapters,map_count:Object.keys(media.maps).length,photo_count:Object.keys(media.photos).length,warnings:media.warnings};
}
