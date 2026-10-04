// Distances are published by the park. Pace and viewing pauses are our planning
// assumptions, not measured trail durations or a promise of access on a date.
const trails={
  first_visit:{slug:'vysota-efa',name:'Высота Эфа',length_m:2400,viewing_minutes:20,
    source_url:'https://park-kosa.ru/vysota-efa-28ekologicheskaya-tropa29'},
  second_visit:{slug:'tancuyushchiy-les',name:'Танцующий лес',length_m:1500,viewing_minutes:15,
    source_url:'https://park-kosa.ru/tantsuyuschiy-les-28ekologicheskaya-tropa29'}
};
const paces={slow:2,gentle:3,brisk:4};
export function kosaTrailBudget(field,pace='gentle'){
  if(!Object.hasOwn(trails,field)||!Object.hasOwn(paces,pace))return null;
  const trail=trails[field],pace_kmh=paces[pace];
  return {version:1,...trail,pace,pace_kmh,walking_minutes:Math.ceil(trail.length_m/(pace_kmh*1000)*60),
    source_name:'Национальный парк «Куршская коса»',checked_at:'2026-10-04',field_checked:false};
}
