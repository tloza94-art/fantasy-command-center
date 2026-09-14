// Refresh TFFCC automatically after the user leaves the PWA and returns.
// This keeps lineup changes made in Sleeper from remaining stale in TFFCC.
let tffccWasHidden=false;
let tffccHiddenAt=0;
let tffccResumeRefreshInFlight=false;
let tffccLastResumeRefresh=0;

async function tffccRefreshAfterResume(){
  if(tffccResumeRefreshInFlight||typeof load!=="function"||!S?.user)return;
  const now=Date.now();
  if(now-tffccLastResumeRefresh<3000)return;
  tffccLastResumeRefresh=now;
  tffccResumeRefreshInFlight=true;
  try{
    status("Refreshing after return…");
    await load();
  }catch(e){
    console.warn("Resume refresh failed",e);
  }finally{
    tffccResumeRefreshInFlight=false;
  }
}

document.addEventListener("visibilitychange",()=>{
  if(document.hidden){
    tffccWasHidden=true;
    tffccHiddenAt=Date.now();
    return;
  }
  if(tffccWasHidden){
    tffccWasHidden=false;
    // Ignore extremely brief visibility changes that are not real app switching.
    if(Date.now()-tffccHiddenAt>=500)tffccRefreshAfterResume();
  }
});

window.addEventListener("pagehide",()=>{
  tffccWasHidden=true;
  tffccHiddenAt=Date.now();
});

window.addEventListener("pageshow",event=>{
  if(event.persisted)tffccRefreshAfterResume();
});
