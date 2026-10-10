// Selection only; Rust owns time, tariffs, eligibility and deposits.
export function selectedInput(original,values) {
  const input=structuredClone(original),visit=input.visit.input;
  visit.date=values.date;visit.arrival=values.arrival;visit.finish_by=values.finish_by;
  if(input.visit.kind==='rental'){
    // An existing held route determines its duration. A generic duration field
    // must not replace that route or create two competing use durations.
    visit.timing.use_minutes=visit.activity?null:values.duration_minutes;
  }
  else {
    visit.timing.activity=values.duration_minutes;
    if(values.visit_timing){
      for(const key of ['change_before','change_after'])if(Object.hasOwn(values.visit_timing,key))visit.timing[key]=values.visit_timing[key];
      if(Object.hasOwn(values.visit_timing,'session_start'))visit.session_start=values.visit_timing.session_start;
      if(values.visit_timing.stages)for(const key of ['approach','collect','complete','return_walk'])if(Object.hasOwn(values.visit_timing.stages,key))visit.timing[key]=values.visit_timing.stages[key];
    }
  }
  if(input.participants.people?.length!==values.people){
    input.participants.people=null;input.participants.party_size=values.people;input.participants.party_items=null;
  }
  if(input.price){input.price.selection.people=values.people;if(input.visit.kind!=='rental')input.price.selection.duration_minutes=values.paid_minutes??values.duration_minutes;}
  if(input.visit.kind==='rental'&&visit.price)visit.price.selection.people=values.people;
  input.limits={cost:values.cost_limit,upfront:values.upfront_limit};
  const selectedPrice=input.visit.kind==='rental'?visit.price:input.price;
  if(selectedPrice&&values.units!==undefined)selectedPrice.selection.units=values.units;
  if(selectedPrice&&values.extras!==undefined){selectedPrice.selection.extras=values.extras;selectedPrice.selection.extra_units=values.extra_units||{};}
  return input;
}
