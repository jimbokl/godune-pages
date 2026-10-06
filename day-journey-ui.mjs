import {clock} from './day-stop-view.mjs?v=1';
import {journeyKinds} from './day-journey-view.mjs?v=7';
export function journeyRow(row) {
  const li=document.createElement('li');li.className='day-journey-step';li.dataset.journeyStep=row.id;li.dataset.journeyKind=row.kind;li.dataset.journeyState=row.state;
  if(row.poi)li.dataset.journeyPoi=row.poi;
  const heading=document.createElement('div');heading.className='day-journey-heading';
  const kind=document.createElement('span');kind.className='day-journey-kind';kind.textContent=journeyKinds[row.kind] || 'В пути';
  const time=document.createElement('time');time.textContent=row.time===null?'Время уточнить':`${row.timeLabel?row.timeLabel+' · ':''}${clock(row.time)}`;
  if(row.time!==null && row.time<1440)time.dateTime=clock(row.time);
  heading.append(kind,time);
  const title=document.createElement('h4');title.textContent=row.title;
  const note=document.createElement('p');note.textContent=row.text;
  li.append(heading,title,note);
  if(row.source) {
    const evidence=document.createElement('details'),caption=document.createElement('summary');caption.textContent='Расписание и дата проверки';
    const source=document.createElement('p'),link=document.createElement('a');
    try {const url=new URL(row.source.url);if(!['http:','https:'].includes(url.protocol))throw Error('source_url');link.href=url.href;link.target='_blank';link.rel='noopener';link.textContent=row.source.name;source.append(link,` · проверено ${row.source.checked_at}`);}catch {source.textContent='Источник расписания нужно уточнить.';}
    evidence.append(caption,source);li.append(evidence);
  }
  return li;
}
