/* Runs before styles: a saved choice must not flash a white page. */
(()=>{
  let mode='auto',sun;
  try {
    const preference=localStorage.getItem('godune-theme:v1');
    if(['day','night','auto'].includes(preference))mode=preference;
    const light=JSON.parse(localStorage.getItem('godune-light:v1') || 'null');
    const date=new Date(Date.now()+7200000).toISOString().slice(0,10);
    if(light?.date===date && ['dawn','sunrise','sunset','dusk'].every(k=>Number.isInteger(light.sun?.[k])&&light.sun[k]>=0&&light.sun[k]<=1440)
      && light.sun.dawn<=light.sun.sunrise && light.sun.sunrise<light.sun.sunset && light.sun.sunset<=light.sun.dusk)sun=light.sun;
  }catch{/* The controls still work when browser storage is unavailable. */}
  const civil=new Date(Date.now()+7200000),minute=civil.getUTCHours()*60+civil.getUTCMinutes();
  const appearance=mode!=='auto'?mode:sun?(minute>=sun.sunrise&&minute<sun.sunset?'day':minute>=sun.dawn&&minute<sun.dusk?'twilight':'night'):matchMedia('(prefers-color-scheme: dark)').matches?'night':'day';
  document.documentElement.dataset.theme=appearance==='day'?'day':'night';
  document.documentElement.dataset.lightPhase=appearance;
  document.documentElement.dataset.themeMode=mode;
})();
