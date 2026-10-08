// A saved menu observation is a choice, not a booking or today's stock.
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v,names)=>object(v)&&Object.keys(v).length===names.length&&names.every(k=>Object.hasOwn(v,k));
const text=v=>typeof v==='string'&&!!v.trim();
const optional=v=>v===null||typeof v==='string';
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!v.startsWith('0000')&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const money=v=>v===null||Number.isSafeInteger(v)&&v>=0;
const documents=new Set(['content/dining-menus.json','content/gastronomy.json','content/dining-directory.json','data/catalog.json']);
const sourceFields=['document','pointer','sha256'];
const safeUrl=v=>{if(v===null)return true;if(typeof v!=='string')return false;try{const u=new URL(v);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password;}catch{return false;}};
const source=v=>keys(v,sourceFields)&&documents.has(v.document)&&typeof v.pointer==='string'&&v.pointer.startsWith('/')&&typeof v.sha256==='string'&&/^[a-f0-9]{64}$/.test(v.sha256);
const timestamp=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v)&&date(v.slice(0,10))&&Number.isFinite(Date.parse(v));
export const menuChoiceRows=day=>Array.isArray(day?.menu_choices)?day.menu_choices:[];
export const hasMenuChoices=day=>menuChoiceRows(day).length>0;
export function validMenuChoice(v){
 if(!keys(v,['version','menu_item_id','dish','name','category','portion','channel','place','price','availability','source','place_source','quantity','planned_date','selected_at','note'])||v.version!==1||typeof v.menu_item_id!=='string'||!/^menu-item:[a-f0-9]{32}$/.test(v.menu_item_id)||!text(v.name)||![v.category,v.portion,v.channel].every(optional)||!Number.isSafeInteger(v.quantity)||v.quantity<1||!(v.planned_date===null||date(v.planned_date))||!timestamp(v.selected_at)||typeof v.note!=='string')return false;
 if(!keys(v.dish,['id','name'])||typeof v.dish.id!=='string'||!/^dish:[a-f0-9]{24}$/.test(v.dish.id)||!text(v.dish.name))return false;
 if(v.place!==null){
  const p=v.place;
  if(!keys(p,['id','name','poi_id','area','address','trip_mapping_status'])||!text(p.id)||!text(p.name)||![p.poi_id,p.area,p.address].every(optional)||!['mapped','directory_only'].includes(p.trip_mapping_status))return false;
  if(p.trip_mapping_status==='mapped'&&(!text(p.poi_id)||p.id!==`poi:${p.poi_id}`)||p.trip_mapping_status==='directory_only'&&(p.poi_id!==null||!p.id.startsWith('directory:')))return false;
 }
 if(!keys(v.price,['amount_kopecks','from_kopecks','label','observed_at'])||![v.price.amount_kopecks,v.price.from_kopecks].every(money)||!optional(v.price.label)||!(v.price.observed_at===null||date(v.price.observed_at)))return false;
 if(!keys(v.availability,['status','as_of'])||v.availability.status!=='unknown'||v.availability.as_of!==null)return false;
 const s=v.source;
 if(!keys(s,[...sourceFields,'name','url','observed_at','verification_status'])||!source(Object.fromEntries(sourceFields.map(k=>[k,s[k]])))||!optional(s.name)||!safeUrl(s.url)||!(s.observed_at===null||date(s.observed_at))||!optional(s.verification_status))return false;
 return v.place_source===null?v.place===null:source(v.place_source)&&v.place!==null;
}
export function validMenuChoices(day){
 if(!Object.hasOwn(day,'menu_choices'))return true;
 return Array.isArray(day.menu_choices)&&day.menu_choices.every(validMenuChoice)&&new Set(day.menu_choices.map(v=>v.menu_item_id)).size===day.menu_choices.length;
}
export function menuChoiceImportIssue(trip){
 for(const day of trip?.itinerary?.days||[]){
  if(day.menu_choices?.some?.(v=>Number.isInteger(v?.version)&&v.version>1))return 'Выбор блюд сохранён в новой версии. Ваш черновик на месте.';
  if(!validMenuChoices(day))return 'Не удалось прочитать выбранные блюда. Ваш черновик на месте.';
 }
 return null;
}
export function menuChoiceContext(choice,day){
 if(!validMenuChoice(choice))return 'unsupported';
 if(!day?.date)return 'date_missing';
 if(choice.planned_date!==day.date)return 'date_changed';
 return choice.place?.poi_id&&day.places?.includes(choice.place.poi_id)?'in_day':'separate';
}
