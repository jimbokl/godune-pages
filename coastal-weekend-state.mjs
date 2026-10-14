// Compatibility entry point for the published Zelenogradsk two-day journey.
import {saveStay,stayTarget,staySettings,stayGuideTrip,stayProfile} from './planned-stay-state.mjs?v=2026101402';
export const WEEKEND_ID='zelenogradsk-two-days';
const profile={id:WEEKEND_ID,recipes:['wave-zelenogradsk-city-fish','wave-zelenogradsk-west-sea']};
export const weekendTarget=(trip,ids=null)=>stayTarget(trip,profile,ids);
export const weekendSettings=staySettings;
export const saveWeekend=(trip,catalog,settings)=>saveStay(trip,catalog,stayProfile(catalog,WEEKEND_ID),settings);
export const weekendGuideTrip=(trip,catalog,ids)=>stayGuideTrip(trip,catalog,profile,ids);
