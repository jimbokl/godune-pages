import {formatKopecks} from './trip-money.mjs';
// Descriptive source snapshots. They never decide admission, availability or price.
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v,required,optional=[])=>object(v)&&required.every(k=>Object.hasOwn(v,k))&&Object.keys(v).every(k=>required.includes(k)||optional.includes(k));
const text=v=>typeof v==='string'&&!!v.trim();
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!v.startsWith('0000')&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const kinds=new Set(['place','branch','service','offer','calendar','conditions','rental_offer']);
export function serviceSourceUrl(reference){
 if(typeof reference!=='string'||!/^https?:\/\//i.test(reference)||/[\p{Cc}\\]/u.test(reference)||reference!==reference.trim()||reference.split('://')[1].split(/[/?#]/)[0].includes('@'))return null;
 try{const url=new URL(reference);return url.hostname&&!url.username&&!url.password?reference:null;}catch{return null;}
}
function reference(v){
 if(!text(v)||v!==v.trim()||/[\p{Cc}\\]/u.test(v))return false;
 if(/^[a-z][a-z\d+.-]*:/i.test(v))return serviceSourceUrl(v)!==null;
 return !v.startsWith('/')&&!v.startsWith('~')&&!v.includes('\\')&&v.split('/').every(p=>p&&p!=='.'&&p!=='..');
}
const json=v=>v===null||typeof v==='string'||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)||Array.isArray(v)&&v.every(json)||object(v)&&Object.values(v).every(json);
export function validServiceProvenance(v,checkedBefore,identity){
 if(!keys(v,['version','facts'])||v.version!==1||!Array.isArray(v.facts)||checkedBefore!==undefined&&!date(checkedBefore))return false;
 const seen=new Set();
 for(const fact of v.facts){
  if(!keys(fact,['subject','path','source','status'],['value','note'])||!keys(fact.subject,['kind','id'])||!kinds.has(fact.subject.kind)||!text(fact.subject.id))return false;
  if(typeof fact.path!=='string'||!fact.path.startsWith('/')||/~(?![01])/.test(fact.path))return false;
  const key=JSON.stringify([fact.subject.kind,fact.subject.id,fact.path]);if(seen.has(key))return false;seen.add(key);
  const s=fact.source;
  if(!keys(s,['reference','checked_at'],['valid_from','valid_until'])||!reference(s.reference)||!date(s.checked_at)||checkedBefore!==undefined&&s.checked_at>checkedBefore)return false;
  if(Object.hasOwn(s,'valid_from')&&!date(s.valid_from)||Object.hasOwn(s,'valid_until')&&!date(s.valid_until)||s.valid_from&&s.valid_until&&s.valid_from>s.valid_until)return false;
  if(!['confirmed','unknown','conflict'].includes(fact.status)||Object.hasOwn(fact,'value')&&!json(fact.value)||Object.hasOwn(fact,'note')&&!text(fact.note))return false;
  if(fact.status==='confirmed'&&(!Object.hasOwn(fact,'value')||fact.value===null)||fact.status==='conflict'&&!text(fact.note))return false;
  if(identity&&['place','branch','service','offer'].includes(fact.subject.kind)&&identity[fact.subject.kind+'_id']!==fact.subject.id)return false;
  if(identity&&fact.subject.kind==='rental_offer'&&identity.offer_id!==fact.subject.id)return false;
 }
 return true;
}

const subjects={place:'Место',branch:'Адрес',service:'Услуга',offer:'Тариф',calendar:'Часы посещения',conditions:'Условия',rental_offer:'Условия проката'};
const fields={name:'Название',address:'Адрес',area:'Город',location:'Положение',references:'Связи с местами',tariff:'Тариф',calendar:'Расписание',action:'Назначение расписания',policy:'Условия посещения',bike_types:'Велосипеды',helmets:'Шлемы',child_seats:'Детские кресла',return_branches:'Пункты возврата',steam:'Парная',capacity:'Вместимость',private:'Отдельное посещение',length_m:'Длина бассейна, м',lanes:'Дорожки',indoor:'В помещении',swim_cap:'Шапочка',medical_document:'Медицинская справка',single_visit:'Разовое посещение',personal_trainer:'Тренер',minimum_age:'Минимальный возраст',market_kind:'Вид рынка',products:'Товары',seasonal:'Сезонность',topic:'Тема',duration_minutes:'Длительность, мин',venue_id:'Заведение',activities:'Занятия на воде',format:'Формат',briefing_minutes:'Инструктаж, мин',changing_minutes:'Переодевание, мин',requires_swimming:'Нужно уметь плавать',experience_required:'Нужен опыт',instructor_included:'Инструктор включён',equipment_included:'Снаряжение включено',weather_dependent:'Зависит от погоды'};
const terms={sup:'Сап',kayak:'Байдарка',rowing:'Гребля',boat:'Лодка',sailing:'Парусный спорт',diving:'Дайвинг',kitesurf:'Кайтсёрфинг',windsurf:'Виндсёрфинг',equipment_rental:'Прокат снаряжения',guided_trip:'Прогулка с гидом',lesson:'Занятие',passenger_cruise:'Пассажирский круиз',self_guided:'Самостоятельно',guided:'С сопровождением',excursion:'Прогулка',city:'Городской',electric:'Электрический',mountain:'Горный',road:'Шоссейный',child:'Детский',tandem:'Тандем'};
Object.assign(fields,{rules:'Расписание',returns:'Возврат',billing_start:'Начало оплаты',billing_end:'Конец оплаты',amount:'Сумма тарифа',deposit:'Залог',billing:'Расчёт тарифа'});
function valueText(value){
 if(value===null)return 'неизвестно';
 if(typeof value==='boolean')return value?'да':'нет';
 if(Array.isArray(value))return value.length?value.filter(v=>!object(v)&&!Array.isArray(v)).map(valueText).join(', '):'нет';
 return object(value)?(value.kind==='none'?'нет':''):typeof value==='string'?terms[value]||value:String(value);
}
export function provenanceSources(snapshot,visitDate){
 if(!validServiceProvenance(snapshot)||visitDate!=null&&!date(visitDate))return [];
 return snapshot.facts.map(fact=>{
  const s=fact.source,key=fact.path.split('/').at(-1).replaceAll('~1','/').replaceAll('~0','~');
  const label=fields[key]||'Сведения',money=fact.path.startsWith('/tariff/')&&key==='amount'&&Number.isSafeInteger(fact.value)&&fact.value>=0,value=money?formatKopecks(fact.value):Object.hasOwn(fact,'value')?valueText(fact.value):'';
  let state={confirmed:'подтверждено на дату проверки',unknown:'нужно уточнить',conflict:'источники расходятся'}[fact.status];
  if(fact.status==='confirmed'&&visitDate&&s.valid_from&&visitDate<s.valid_from)state='действует с '+s.valid_from;
  if(fact.status==='confirmed'&&visitDate&&s.valid_until&&visitDate>s.valid_until)state='срок сведений закончился '+s.valid_until;
  const range=[s.valid_from?'с '+s.valid_from:'',s.valid_until?'до '+s.valid_until:''].filter(Boolean).join(' ');
  return {name:`${subjects[fact.subject.kind]} · ${label}${value?': '+value:''} · ${state}${range?' · '+range:''}${fact.note?' · '+fact.note:''} · ${s.reference}`,url:serviceSourceUrl(s.reference),checked_at:s.checked_at,date_label:fact.status==='confirmed'?'проверено':'источник от',status:fact.status};
 });
}
export const serviceSourceCaption=s=>`${s.name||'Источник'} · ${s.date_label||'проверено'} ${s.checked_at||'дата не указана'}`;
