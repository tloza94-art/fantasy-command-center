// Native-style pull-to-refresh for the installed TFFCC PWA.
// This version never blocks normal taps or scrolling.
(()=>{
  const THRESHOLD=72;
  const MAX_PULL=110;
  const TOP_GESTURE_ZONE=110;
  const START_SLOP=12;

  let startY=0;
  let startX=0;
  let tracking=false;
  let pulling=false;
  let distance=0;
  let armed=false;
  let refreshing=false;

  const indicator=document.getElementById("pullRefreshIndicator");
  const icon=document.getElementById("pullRefreshIcon");
  const label=document.getElementById("pullRefreshLabel");
  if(!indicator||!icon||!label)return;

  function atTop(){
    return (window.scrollY||document.documentElement.scrollTop||0)<=1;
  }

  function interactiveTarget(target){
    return !!target?.closest?.("button,input,select,textarea,a,[role='button'],nav");
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
    tracking=false;
    pulling=false;
    indicator.classList.remove("pulling");
    indicator.style.transform="translate(-50%, -58px)";
    indicator.style.opacity="0";
    icon.style.transform="rotate(0deg)";
    label.textContent="Pull to refresh";
  }

  async function runRefresh(){
    if(refreshing)return;
    refreshing=true;
    tracking=false;
    pulling=false;
    indicator.classList.add("refreshing");
    indicator.style.transform="translate(-50%, 10px)";
    indicator.style.opacity="1";
    label.textContent="Refreshing…";
    try{
      if(typeof tffccRefreshAfterResume==="function"&&S?.user&&S?.leagues?.length){
        if(typeof tffccLastResumeRefresh!=="undefined")tffccLastResumeRefresh=0;
        await tffccRefreshAfterResume();
      }else if(typeof load==="function"){
        await load();
      }
      label.textContent="Updated";
      await new Promise(r=>setTimeout(r,350));
    }catch(e){
      console.warn("Pull refresh failed",e);
      label.textContent="Refresh failed";
      await new Promise(r=>setTimeout(r,600));
    }finally{
      refreshing=false;
      indicator.classList.remove("refreshing");
      resetVisual();
    }
  }

  document.addEventListener("touchstart",e=>{
    if(refreshing||!atTop()||e.touches.length!==1)return;
    const touch=e.touches[0];

    // Only begin a pull gesture from the top of the screen and never steal
    // touches that started on an actual control.
    if(touch.clientY>TOP_GESTURE_ZONE||interactiveTarget(e.target))return;

    startY=touch.clientY;
    startX=touch.clientX;
    tracking=true;
    pulling=false;
    distance=0;
  },{passive:true});

  document.addEventListener("touchmove",e=>{
    if(!tracking||refreshing||e.touches.length!==1)return;
    const touch=e.touches[0];
    const dy=touch.clientY-startY;
    const dx=Math.abs(touch.clientX-startX);

    // Wait until we know this is an intentional vertical pull. Horizontal
    // swipes and ordinary taps remain completely untouched.
    if(!pulling){
      if(dy<START_SLOP)return;
      if(dx>dy){resetVisual();return}
      if(!atTop()){resetVisual();return}
      pulling=true;
      indicator.classList.add("pulling");
    }

    if(dy<=0||!atTop()){resetVisual();return}

    distance=Math.min(dy*.58,MAX_PULL);
    setVisual(distance);

    // Intentionally do NOT call preventDefault(). The old implementation did,
    // which could make iOS treat ordinary interaction as a blocked gesture and
    // make the PWA appear frozen.
  },{passive:true});

  document.addEventListener("touchend",()=>{
    if(refreshing)return;
    if(pulling&&armed){
      tracking=false;
      pulling=false;
      runRefresh();
    }else{
      resetVisual();
    }
  },{passive:true});

  document.addEventListener("touchcancel",()=>{
    if(!refreshing)resetVisual();
  },{passive:true});

  // Failsafe: if iOS interrupts a touch sequence, never leave the gesture
  // state armed and able to interfere with later interactions.
  window.addEventListener("blur",()=>{if(!refreshing)resetVisual()});
  document.addEventListener("visibilitychange",()=>{
    if(document.hidden&&!refreshing)resetVisual();
  });
})();
