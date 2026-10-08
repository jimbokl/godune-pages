// Format integer kopecks without losing precision at the safe-integer limit.
// Unknown-price wording belongs to the view that knows its context.
export function formatKopecks(value){
 const cents=BigInt(value),fraction=cents%100n;
 return `${new Intl.NumberFormat('ru-RU').format(cents/100n)}${fraction?','+String(fraction).padStart(2,'0'):''} ₽`;
}
