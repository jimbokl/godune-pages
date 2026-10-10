// Selection only; Rust owns time, tariffs, eligibility and deposits.
export function selectedInput(original,values) {
  const input=structuredClone(original),visit=input.visit.input;
  visit.date=values.date;visit.arrival=values.arrival;visit.finish_by=values.finish_by;
  if(input.visit.kind==='rental'){
    // An existing held route determines its duration. A generic duration field
    // must not replace that route or create two competing use durations.
    visit.timing.use_minutes=visit.activity?null:values.duration_minutes;
  }
  else visit.timing.activity=values.duration_minutes;
  if(input.participants.people?.length!==values.people){
    input.participants.people=null;input.participants.party_size=values.people;input.participants.party_items=null;
  }
  if(input.price){input.price.selection.people=values.people;if(input.visit.kind!=='rental'&&values.paid_minutes!==null)input.price.selection.duration_minutes=values.paid_minutes;}
  if(input.visit.kind==='rental'&&visit.price)visit.price.selection.people=values.people;
  input.limits={cost:values.cost_limit,upfront:values.upfront_limit};
  const selectedPrice=input.visit.kind==='rental'?visit.price:input.price;
  if(selectedPrice&&values.units!==undefined)selectedPrice.selection.units=values.units;
  return input;
}
