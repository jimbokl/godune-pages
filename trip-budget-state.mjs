// Parsing and display only. All totals and multiplications belong to Rust.
export function parseKopecks(text) {
  const value=String(text).trim().replace(/[ \u00a0\u202f]/g,'');
  if(value==='')return null;
  if(!/^\d+(?:[.,]\d{1,2})?$/.test(value))throw Error('Укажите сумму в рублях: например, 1500 или 1500,50.');
  const [rubles,fraction='']=value.split(/[.,]/), amount=BigInt(rubles)*100n+BigInt(fraction.padEnd(2,'0'));
  if(amount>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Эта сумма слишком велика для расчёта. Проверьте число.');
  return Number(amount);
}
export const costText=amount=>amount===null?'':`${Math.floor(amount/100)}${amount%100?','+String(amount%100).padStart(2,'0'):''}`;
export const rubles=amount=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',minimumFractionDigits:0,maximumFractionDigits:2}).format(amount/100);
