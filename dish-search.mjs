// Inflections help a visitor ask naturally; dish membership is curated in Rust.
const normalize=text=>String(text||'').toLocaleLowerCase('ru').replaceAll('ё','е');
const stops=new Set(['где','поесть','попробовать','хочу','найти','в','на','из','и','с','со','зелике','зеленоградске','зеленоградск']);
function stem(word){
 for(const root of ['строганин','пеламид','клопс','кенигсбергск','судак','тунц'])if(word.startsWith(root))return root;
 if(word==='тунец')return 'тунц';
 if(['уха','уху','ухи','ухе','ухой'].includes(word))return 'уха';
 return word;
}
export function dishQueryTokens(query){return normalize(query).split(/[^\p{L}\p{N}]+/u).filter(w=>w&&!stops.has(w)).map(stem);}
export function dishItemMatches(item,{query='',max='',channel=''}={}){
 const words=dishQueryTokens(item.name);
 if(!dishQueryTokens(query).every(q=>words.some(w=>w===q||w.startsWith(q))))return false;
 if(channel&&item.channel!==channel)return false;
 if(max!==''){
  const cap=Number(max);
  if(!Number.isFinite(cap)||cap<0||!Number.isSafeInteger(item.price)||item.price<0||item.price>cap*100)return false;
 }
 return true;
}
export function dishResultPrice(items){const known=items.map(i=>i.price).filter(p=>Number.isSafeInteger(p)&&p>=0);return known.length?Math.min(...known):Infinity;}
