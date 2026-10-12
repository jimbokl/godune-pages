// Published times belong to Baltiysk, never to an invented return timetable.
// The shore and finish times below are planning estimates, kept out of finish.
export function circularFerryDay(calendar, answers) {
  const policy=calendar.service?.circular;
  if(!policy||calendar.exception)return null;
  const {one_way_estimate:oneWay,round_trip_estimate:roundTrip,minimum_boarding:minimum}=policy;
  if(!Number.isInteger(oneWay)||oneWay<1||oneWay>120||!Number.isInteger(roundTrip)||roundTrip<oneWay||roundTrip>120||!Number.isInteger(minimum)||minimum<5||minimum>120)throw Error('ferry_circular_invalid');
  const departures=calendar.outward?.departures;
  if(!Array.isArray(departures))return null;
  const minutes=departures.map(t=>Number(t.slice(0,2))*60+Number(t.slice(3)));
  const boarding=Math.max(answers.boarding,minimum);
  const out=minutes.find(t=>t>=answers.ready+boarding)??null;
  const shoreStart=out===null?null:out+oneWay;
  const shoreUntil=shoreStart===null?null:shoreStart+answers.shore;
  const back=shoreUntil===null?null:minutes.find(t=>t>=shoreUntil+boarding)??null;
  const backup=back===null?null:minutes.find(t=>t>back)??null;
  return {outward:{departure:out,arrival:null},inbound:{departure:null},finish:null,circular:{version:1,outbound_cycle:out,return_cycle:back,board_by:back===null?null:back-boarding,shore_start_estimate:shoreStart,shore_until:shoreUntil,finish_estimate:back===null?null:back+roundTrip,backup_cycle:backup,boarding,one_way_estimate:oneWay,round_trip_estimate:roundTrip}};
}
