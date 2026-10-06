import {accessExtentLabel} from './route-access.mjs?v=1';
const node=(tag,text,className)=>{const el=document.createElement(tag);if(text)el.textContent=text;if(className)el.className=className;return el;};
export function routeAccessDetails(profile,{open=false}={}) {
  const details=node('details',null,'route-access-profile wizard-evidence');details.dataset.routeAccess='';details.open=open;
  details.append(node('summary','Лестницы и проход · '+profile.summary));
  for(const row of profile.entries) {
    const article=node('div',null,'route-access-entry');article.dataset.accessExtent=row.extent;
    article.append(node('h4',row.name),node('p',`${accessExtentLabel[row.extent]} · ${row.label}`,'route-access-scope'),node('p',row.text));
    const source=node('a',`${row.source.name} · данные ${row.source.checked_at}`);source.href=row.source.url;source.target='_blank';source.rel='noopener';
    article.append(source);details.append(article);
  }
  for(const gap of profile.gaps)details.append(node('p',gap,'route-access-unknown'));
  return details;
}
