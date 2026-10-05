// Generated transport walks and personal additions share visit history.
export const generatedDayPoints=day=>day?.kosa_plan?.version===1 && ['one','two'].includes(day.kosa_plan.walks)
  ? ['vysota-efa',...(day.kosa_plan.walks==='two'?['tancuyushchiy-les']:[])]:[];
export const dayPointIds=day=>[...new Set([...generatedDayPoints(day),...(day?.places || [])])];
