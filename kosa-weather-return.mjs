import {kosaInput} from './kosa-plan-state.mjs?v=2026101707';
import {kosaOuting} from './kosa-outing.mjs?v=2026101402';
// Preview a shorter day using the same engine, without changing the saved trip.
export function kosaWeatherReturn(answers,original,table,catalog,engine) {
  if(original.state!=='candidate'||answers.walks!=='two')return null;
  const {fixed_transport,source_sha256,bus_snapshot,rail_snapshot,...fields}=answers;
  const plan={...fields,walks:'one',outing:{...kosaOuting(answers.outing),version:1,weather:'rain'}};
  const result=engine.transitDay(kosaInput(plan,table,catalog));
  if(result.state!=='candidate'||JSON.stringify(result.outward)!==JSON.stringify(original.outward)
    ||JSON.stringify(result.rail?.outward)!==JSON.stringify(original.rail?.outward)
    ||result.inward.arrival>=original.inward.arrival||result.home?.state==='late_home')return null;
  return {plan,result,summary:{stop:'Высота Эфа',board_by:result.board_by,departure:result.inward.departure,
    arrival:result.finish,saved_minutes:original.finish-result.finish,
    ...(result.rail?{train_departure:result.rail.inward.departure,train_arrival:result.rail.inward.arrival}:{}),
    ...(result.home?{home_finish:result.home.state==='fits'?result.home.earliest_finish:null}:{})}};
}
