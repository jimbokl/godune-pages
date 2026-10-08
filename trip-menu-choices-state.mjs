import {ensureJourney,selectedDay,validJourneyProjection} from './trip-days-state.mjs';
import {cleanTrip} from './trip-state.mjs';
import {validMenuChoice,menuChoiceRows,menuChoiceImportIssue} from './trip-menu-choices-contract.mjs';

function editable(trip){
 const issue=menuChoiceImportIssue(trip);if(issue)throw Error(issue);
 if(trip.itinerary&&!validJourneyProjection(trip))throw Error('invalid_trip');
}

export function selectMenuChoice(trip,choice,catalog){
 if(!validMenuChoice(choice))throw Error('invalid_menu_choice');
 editable(trip);
 const next=ensureJourney(cleanTrip(trip,catalog)),day=selectedDay(next);
 if(choice.planned_date!==day.date)throw Error('menu_choice_date_mismatch');
 if(choice.place?.poi_id){
  const point=catalog.poi.find(p=>p.slug===choice.place.poi_id);
  if(!point||point.name!==choice.place.name||point.area!==choice.place.area)throw Error('menu_choice_place_mismatch');
  if(!next.places.includes(point.slug))next.places.push(point.slug);
  day.places=[...next.places];
 }
 const rows=menuChoiceRows(day),at=rows.findIndex(v=>v.menu_item_id===choice.menu_item_id);
 day.menu_choices=structuredClone(rows);
 if(at<0)day.menu_choices.push(structuredClone(choice));else day.menu_choices[at]=structuredClone(choice);
 return cleanTrip(next,catalog);
}
export function removeMenuChoice(trip,id,catalog){
 editable(trip);
 const next=ensureJourney(cleanTrip(trip,catalog)),day=selectedDay(next);
 day.menu_choices=menuChoiceRows(day).filter(v=>v.menu_item_id!==id);
 if(!day.menu_choices.length)delete day.menu_choices;
 return cleanTrip(next,catalog);
}
