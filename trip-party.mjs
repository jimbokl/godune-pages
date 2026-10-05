// Composition belongs to a day. Older trips retain their journey-wide count.
const count=value=>Number.isSafeInteger(value) && value>=0 && value<=4294967295;
export function validParty(value) {
  return !!value && typeof value==='object' && !Array.isArray(value) && value.version===1
    && count(value.adults) && count(value.children) && value.adults+value.children>=1
    && value.adults+value.children<=4294967295;
}
export const partyCount=party=>validParty(party)?party.adults+party.children:null;
export const dayPeople=(day,journeyPeople=1)=>partyCount(day?.party) ?? journeyPeople;
export function partyWithCount(party,total) {
  if(!validParty(party) || !count(total) || total<1)throw Error('party_invalid_count');
  const children=Math.min(party.children,total);
  return {...structuredClone(party),adults:total-children,children};
}
const plural=(n,forms)=>forms[n%100>=11&&n%100<=14?2:n%10===1?0:n%10>=2&&n%10<=4?1:2];
export function partyLabel(party) {
  if(!validParty(party))return null;
  return [party.adults?`${party.adults} ${plural(party.adults,['взрослый','взрослых','взрослых'])}`:null,
    party.children?`${party.children} ${plural(party.children,['ребёнок','ребёнка','детей'])}`:null].filter(Boolean).join(' · ');
}
