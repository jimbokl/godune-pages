// A civil date belongs to Kaliningrad, never to the visitor's device timezone.
export const validVisitDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !value.startsWith('0000') && Number.isFinite(Date.parse(value+'T12:00:00Z'))
  && new Date(value+'T12:00:00Z').toISOString().slice(0,10) === value;
const minute = time => Number(time.slice(0,2))*60+Number(time.slice(3));
export const visitFacts = place => [place?.hours,...(place?.visit_conditions || [])].filter(fact => fact?.kind === 'hours');
export function resolveVisitCalendar(place, date, factId) {
  const facts=visitFacts(place), fact=factId ? facts.find(row=>row.id===factId) : place?.hours;
  const unknown=reason=>({fact:fact || null,windows:null,sessions:null,needsCheck:false,reason});
  if(!validVisitDate(date)) return unknown('choose_date');
  if(!fact) return unknown(factId ? 'missing_fact' : 'unknown_hours');
  const calendar=fact.calendar;
  const exception=calendar?.exceptions?.find(rule=>rule.date===date);
  if(!exception && (fact.valid_from && date < fact.valid_from || fact.valid_until && date > fact.valid_until)) return unknown('outside_validity');
  if(!calendar || calendar.version!==1 || calendar.timezone!=='Europe/Kaliningrad') return unknown(fact.scope==='park' ? 'park_scope' : 'unknown_hours');
  if(calendar.kind==='cashdesk') return unknown('cashdesk_scope');
  const day=new Date(date+'T12:00:00Z'), month=day.getUTCMonth()+1, weekday=day.getUTCDay() || 7;
  const matches=rule=>rule.months.includes(month) && rule.days.includes(weekday);
  const source=exception?.source || fact.source;
  const common={fact,source,exceptionDate:exception?.date || null,needsCheck:source.verification!=='field_checked' || source.checked_at!==date,
    reason:null,rule:null,windows:null,sessions:null};
  if(calendar.kind==='sessions') {
    const rule=calendar.session_rules?.find(matches);
    if(exception) return {...common,sessions:exception.sessions.map(row=>({start:minute(row.starts),duration:row.duration})),reason:exception.sessions.length ? 'exception' : 'closed'};
    if(rule) return {...common,rule,sessions:rule.starts.map(start=>({start:minute(start),duration:rule.duration})),reason:'sessions'};
  } else {
    const rule=fact.schedule?.find(matches);
    const rules=exception ? exception.windows : rule ? [rule] : null;
    if(rules) {
      const windows=rules.flatMap(row=>{
        // Only visiting pauses are split. Ticket-office pauses belong to cashdesk facts.
        const close=minute(row.closes), entry=row.last_entry ? minute(row.last_entry) : null;
        let open=minute(row.opens);const intervals=[];
        for(const pause of [...(row.breaks || [])].sort((a,b)=>a.starts.localeCompare(b.starts))) {
          if(open < minute(pause.starts)) intervals.push({open,close:minute(pause.starts)});
          open=minute(pause.ends);
        }
        if(open < close) intervals.push({open,close});
        return intervals.filter(window=>entry===null || window.open<=entry).map(window=>entry===null ? window : {...window,last_entry:Math.min(entry,window.close)});
      });
      return {...common,rule:exception?null:rule,windows,reason:!windows.length ? 'closed' : exception ? 'exception' : 'continuous'};
    }
  }
  if(calendar.closed?.some(matches)) return {...common,windows:[],reason:'closed'};
  return unknown('unknown_day');
}
