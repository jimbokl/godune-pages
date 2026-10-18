import {validTripDate} from './trip-days-state.mjs?v=2026101707';

const context='belaya-duna-plan-b',recipe='wave-yantarny-bereg';
export const isPlanBEntry=params=>params.get('context')===context && params.get('recipe')===recipe;
export const planBNote='Запасной план вместо Белой Дюны: пляж и променад Янтарного. Проход от Поваровки к морю или курорту не подтверждён. Если вернётесь к исходному плану, отдельно уточните обратную посадку. Дорога до Янтарного: время и транспорт неизвестны. Обратная дорога: время и транспорт неизвестны. Расчёт относится только к пешей прогулке между двумя остановками. Погоду, проходы и состояние настила нужно проверить; возможность купания не подтверждена.';

export const isPlanB=answers=>answers.context===context && answers.route===recipe && answers.area==='yantarny';

// Only this editorial handoff has meaning. URL text never becomes a Trip note.
export function wizardRecipeEntry(answers,choice,params) {
  const next={...answers,area:choice.area,route:choice.slug,wave:{...answers.wave,recipe:choice.slug}};
  if(params.get('context')!==context || choice.slug!==recipe)return next;
  return {...next,context,date:validTripDate(params.get('date'))?params.get('date'):null,
    base:null,transport:'foot',rail:undefined,bus:undefined};
}
