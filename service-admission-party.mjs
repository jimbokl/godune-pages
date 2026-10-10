// Participant selection only. Tariff classification and arithmetic stay in Rust.
export function bindAdmissionParty(form, inputs) {
  const target=form.querySelector('[data-admission-party]');
  if(!target)return {restore(){},read(){return undefined;}};
  const hidden=form.elements.namedItem('participant_details'),count=form.elements.namedItem('people');
  const concessions=new Map();
  const ageOnly=target.hasAttribute('data-age-only'),items=new Map();
  if(ageOnly)for(const input of inputs)for(const rule of input.policy?.rules||[])if(rule.condition.kind==='equipment')for(const item of rule.condition.required||[])if(item.scope==='everyone')items.set(item.id,item.label);
  for(const input of inputs)for(const band of input.price?.tariff.base.rate.tariff?.bands||[]){
    if(band.required_concession)concessions.set(band.required_concession,band.label);
  }
  let people=[],offset=0;
  const size=12; // Page the editor, without limiting the travelling group.
  const total=()=>Number(count.value);
  let knownCount=total();
  const save=()=>{hidden.value=JSON.stringify(people);};
  function render(){
    target.replaceChildren();
    const end=Math.min(total(),offset+size);
    for(let i=offset;i<end;i++){
      let person=people[i];
      if(!person){person={id:`guest-${i+1}`,age:null,audience:ageOnly?'guest':null,items:null,concessions:null};people.push(person);}
      const row=document.createElement('div');row.className='service-party-person';
      const label=document.createElement('label'),caption=document.createElement('span'),age=document.createElement('input');
      caption.textContent=`Гость ${i+1} · возраст`;age.type='number';age.min='0';age.max='65535';age.step='1';age.inputMode='numeric';age.placeholder='Лет';age.value=person.age??'';
      age.addEventListener('input',()=>{person.age=age.value===''?null:Number(age.value);save();});label.append(caption,age);
      const ticketLabel=document.createElement('label'),ticketCaption=document.createElement('span'),ticket=document.createElement('select');ticketCaption.textContent='Билет';
      for(const [value,text]of [['unknown','Уточню'],['none','Без льготы'],...concessions]){const option=new Option(text,value);ticket.add(option);}
      ticket.value=person.concessions===null?'unknown':person.concessions[0]||'none';
      ticket.addEventListener('change',()=>{person.concessions=ticket.value==='unknown'?null:ticket.value==='none'?[]:[ticket.value];save();});
      ticketLabel.append(ticketCaption,ticket);row.append(label);if(!ageOnly)row.append(ticketLabel);
      if(ageOnly&&items.size){
        const gearLabel=document.createElement('label'),gearCaption=document.createElement('span'),gear=document.createElement('select');
        gearCaption.textContent=[...items.values()].join(', ');gear.dataset.partyEquipment='';
        for(const [value,text]of [['unknown','Уточню'],['yes','Возьму с собой'],['no','Не будет']])gear.add(new Option(text,value));
        gear.value=person.items==null?'unknown':[...items.keys()].every(id=>person.items.includes(id))?'yes':'no';
        gear.addEventListener('change',()=>{person.items=gear.value==='unknown'?null:gear.value==='yes'?[...new Set([...(person.items||[]),...items.keys()])]:(person.items||[]).filter(id=>!items.has(id));save();});
        gearLabel.append(gearCaption,gear);row.append(gearLabel);
      }
      target.append(row);
    }
    if(total()>size){
      const nav=document.createElement('div');nav.className='service-party-pagination';
      for(const [label,next]of [['← Предыдущие',offset-size],['Следующие →',offset+size]]){
        const button=document.createElement('button');button.type='button';button.textContent=label;button.disabled=next<0||next>=total();button.addEventListener('click',()=>{offset=next;render();});nav.append(button);
      }
      target.append(nav);
    }
    save();
  }
  function restore(){
    try{people=hidden.value?JSON.parse(hidden.value):[];}catch{throw Error('Проверьте возраст гостей в ссылке.');}
    if(!Array.isArray(people)||people.some(p=>!p||typeof p.id!=='string'||!p.id.trim()||!Object.hasOwn(p,'age')||p.age!==null&&(!Number.isInteger(p.age)||p.age<0||p.age>65535)||p.concessions!=null&&(!Array.isArray(p.concessions)||p.concessions.length>1||p.concessions.some(id=>!concessions.has(id))))||new Set(people.map(p=>p.id)).size!==people.length){throw Error('Проверьте возраст и льготные билеты в ссылке.');}
    for(const person of people){person.concessions??=null;person.items??=null;}
    knownCount=total();offset=0;render();
  }
  function resize(){
    if(total()===knownCount)return;
    knownCount=total();people=[];offset=0;render();
  }
  count.addEventListener('input',resize);
  count.addEventListener('change',resize);
  return {restore,read(){
    if(people.length!==total())return null;
    return structuredClone(people);
  }};
}
