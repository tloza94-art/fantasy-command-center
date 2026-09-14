// Native-style pull-to-refresh for the installed TFFCC PWA.
// Uses the lightweight live refresh when portfolio data is already loaded.
(()=>{
  const THRESHOLD=72;
  const MAX_PULL=110;
  let startY=0;
  let pulling=false;
  let distance=0;
  let armed=false;
  let refreshing=false;

  const indicator=document.getElementById("pullRefreshIndicator");
  const icon=document.getElementById("pullRefreshIcon");
  const label=document.getElementById("pullRefreshLabel");
  if(!indicator||!icon||!label)return;

  function atTop(){
    return (window.scrollY||document.documentElement.scrollTop||0)<=0;
  }

  function setVisual(px){
    const shown=Math.min(px,MAX_PULL);
    const progress=Math.min(shown/THRESHOLD,1);
    indicator.style.transform="translate(-50%, "+Math.round(-58+shown*.78)+"px)";
    indicator.style.opacity=String(Math.min(.25+progress*.75,1));
    icon.style.transform="rotate("+Math.round(progress*210)+"deg)";
    label.textContent=progress>=1?"Release to refresh":"Pull to refresh";
    armed=progress>=1;
  }

  function resetVisual(){
    distance=0;
    armed=false;
    indicator.classList.remove("pulling");
    indicator.style.transform="translate(-50%, -58px)";
    indicator.style.opacity="0";
    icon.style.transform="rotate(0deg)";
    label.textContent="Pull to refresh";
  }

  async function runRefresh(){
    if(refreshing)return;
    refreshing=true;
    indicator.classList.add("refreshing");
    indicator.style.transform="translate(-50%, 10px)";
    indicator.style.opacity="1";
    label.textContent="Refreshing…";
    try{
      if(typeof tffccRefreshAfterResume==="function"&&S?.user&&S?.leagues?.length){
        // The resume helper has its own short cooldown. Reset it so a deliberate
        // pull always refreshes immediately.
        if(typeof tffccLastResumeRefresh!=="undefined")tffccLastResumeRefresh=0;
        await tffccRefreshAfterResume();
      }else if(typeof load==="function"){
        await load();
      }
      label.textContent="Updated";
      await new Promise(r=>setTimeout(r,450));
    }catch(e){
      console.warn("Pull refresh failed",e);
      label.textContent="Refresh failed";
      await new Promise(r=>setTimeout(r,700));
    }finally{
      refreshing=false;
      indicator.classList.remove("refreshing");
      resetVisual();
    }
  }

  document.addEventListener("touchstart",e=>{
    if(refreshing||!atTop()||e.touches.length!==1)return;
    startY=e.touches[0].clientY;
    pulling=true;
    distance=0;
    indicator.classList.add("pulling");
  },{passive:true});

  document.addEventListener("touchmove",e=>{
    if(!pulling||refreshing||e.touches.length!==1)return;
    const raw=e.touches[0].clientY-startY;
    if(raw<=0){resetVisual();pulling=false;return}
    if(!atTop()){resetVisual();pulling=false;return}
    // Dampen the gesture so it feels like native elastic overscroll.
    distance=Math.min(raw*.58,MAX_PULL);
    if(distance>4)e.preventDefault();
    setVisual(distance);
  },{passive:false});

  document.addEventListener("touchend",()=>{
    if(!pulling||refreshing)return;
    pulling=false;
    if(armed)runRefresh();
    else resetVisual();
  },{passive:true});

  document.addEventListener("touchcancel",()=>{
    if(refreshing)return;
    pulling=false;
    resetVisual();
  },{passive:true});
})();
