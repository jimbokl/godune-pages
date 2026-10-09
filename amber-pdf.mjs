// Loaded only on explicit export. Uses the site's existing local PDF runtime.
import './assets/vendor/pdf/pdf-lib.js';
import './assets/vendor/pdf/fontkit.js';
import {dateLabel} from './amber-state.mjs';
export async function makeAmberPdf({plan,manifest,base}){
 const {PDFDocument,PDFString,rgb}=globalThis.PDFLib;
 const response=await fetch(new URL('assets/vendor/pdf/Manrope-Regular.ttf',base));if(!response.ok)throw Error('font');
 const doc=await PDFDocument.create();doc.registerFontkit(globalThis.fontkit);const font=await doc.embedFont(await response.arrayBuffer(),{subset:true});
 doc.setTitle('После шторма: '+plan.beach.name);doc.setAuthor('Редакция GoDune.ru');doc.setSubject('Личная памятка для прогулки по берегу');
 const w=420,h=595,margin=32,width=w-2*margin,ink=rgb(.06,.14,.21),muted=rgb(.34,.43,.49),blue=rgb(.27,.46,.57);let page,y;
 const start=()=>{page=doc.addPage([w,h]);page.drawRectangle({x:0,y:0,width:w,height:h,color:rgb(.98,.97,.94)});page.drawText('БАЛТИЙСКИЕ ДЮНЫ · GODUNE.RU',{x:margin,y:h-30,size:9,font,color:blue});y=h-59;};
 const clean=value=>String(value).replace(/[\u2010-\u2015]/g,'-').replace(/\s+/g,' ').trim();
 function lines(text,size){const out=[];let line='';for(const word of clean(text).split(' ')){if(font.widthOfTextAtSize(word,size)>width){if(line){out.push(line);line='';}for(const char of word){if(line&&font.widthOfTextAtSize(line+char,size)>width){out.push(line);line='';}line+=char;}continue;}const next=line?line+' '+word:word;if(line&&font.widthOfTextAtSize(next,size)>width){out.push(line);line=word;}else line=next;}if(line)out.push(line);return out;}
 function text(value,size=10,color=ink,gap=9){const wrapped=lines(value,size);for(const line of wrapped){if(y<48)start();page.drawText(line,{x:margin,y,size,font,color});y-=size*1.55;}y-=gap;}
 function section(title,body){if(y<110)start();text(title,13,blue,5);text(body);}
 start();text('После шторма',22,ink,5);text(plan.beach.name,20,ink,12);text('Прогулка: '+dateLabel(plan.answers.visit));text('Шторм: '+dateLabel(plan.answers.storm)+' (дата указана вами)',9,muted);section(plan.title,plan.lead);
 plan.steps.forEach((step,i)=>section(`${i+1}. ${step.title}`,step.text));
 if(plan.transfer)section('Переправа','Подтвердите работу парома и обратный рейс у перевозчика до поездки на Балтийскую косу.');
 start();text('Перед выходом',20);manifest.checklist.forEach((item,i)=>text(`${i+1}. ${item}`));
 section('Неизвестную находку не трогаем','Не кладите её в карман, не нагревайте и не пробуйте на вкус. Если предмет дымит или похож на боеприпас - отойдите, предупредите других и звоните 112.');
 section('Если море ещё неспокойно','Отложите поиск. Останьтесь на разрешённой городской прогулке или посетите Музей янтаря. Вода, пирс и волнорез не входят в этот план.');
 section('Условия меняются','Памятка хранит ваши ответы, а не прогноз. Проверяйте море, открытый спуск и обратный путь в день прогулки.');
 text('Редакция GoDune.ru · источники проверены '+dateLabel(manifest.updated),9,muted);text('Полный гид и источники: godune.ru/yantar/',9,blue);
 for(const source of manifest.sources.filter(s=>['sea','properties','law'].includes(s.id))){
  if(y<65)start();
  const annotation=doc.context.obj({Type:'Annot',Subtype:'Link',Rect:[margin,y-2,margin+Math.min(width,font.widthOfTextAtSize(source.name,8)),y+10],Border:[0,0,0],A:{Type:'Action',S:'URI',URI:PDFString.of(source.url)}});
  page.node.addAnnot(doc.context.register(annotation));text(source.name,8,blue,5);
 }
 doc.getPages().forEach((p,i)=>p.drawText(`GoDune.ru/yantar/ · ${i+1} / ${doc.getPageCount()}`,{x:margin,y:22,size:8,font,color:muted}));
 return doc.save();
}
