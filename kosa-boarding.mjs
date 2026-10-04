// Stop names come from the same dated publication as the bus calculation.
export function kosaBoarding(table,answers){
  const data=table?.boarding;
  if(data?.version!==1 || data.route!=='210'
    || !['zelenogradsk','efa','forest'].every(key=>typeof data.stops?.[key]==='string'&&data.stops[key].trim())
    || !data.outward_direction || !data.inward_direction)return null;
  const leg=(id,from,to,direction,question)=>({id,route:data.route,from:data.stops[from],to:data.stops[to],direction,direction_label:({Морское:'Морского',Зеленоградск:'Зеленоградска'})[direction]||direction,question,
    platform_checked:false,note:'Место посадки и сторону дороги уточните на месте.'});
  return {version:1,source_url:table.source_url,checked_at:table.checked_at,image_sha256:table.image_sha256,
    legs:[leg('outward','zelenogradsk','efa',data.outward_direction,'Этот автобус идёт до Эфы? Где ждать обратный?'),
      ...(answers.walks==='two'?[leg('transfer','efa','forest',data.inward_direction,'Этот автобус идёт до Танцующего леса?')]:[]),
      leg('return',answers.walks==='two'?'forest':'efa','zelenogradsk',data.inward_direction,'Этот автобус идёт до автостанции Зеленоградска?')]};
}
export function kosaBoardingText(leg){
  return `Автобус № ${leg.route} в сторону ${leg.direction_label||leg.direction}. Посадка: ${leg.from}. Выйти: ${leg.to}. Спросите водителя: «${leg.question}» ${leg.note}`;
}
