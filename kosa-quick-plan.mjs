// Presets adjust the existing planner. Dates, party, home and dinner stay personal.
export function kosaQuickPlan(answers, choice) {
  const profiles = {
    efa: {walks:'one', pace:'slow', first_visit:150, second_visit:75},
    forest: {walks:'two', pace:'gentle', first_visit:120, second_visit:90},
    afternoon: {walks:'one', pace:'gentle', first_visit:120, second_visit:75}
  };
  if (!Object.hasOwn(profiles, choice)) throw new RangeError('Unknown day choice');
  const profile=profiles[choice];
  return {...answers, ...profile,
    first_visit:Math.max(answers.first_visit,profile.first_visit),
    second_visit:Math.max(answers.second_visit,profile.second_visit),
    ready:choice==='afternoon'?Math.max(answers.ready,13*60):answers.ready};
}
