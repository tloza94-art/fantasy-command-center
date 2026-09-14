// Shows projected lineup upgrades in a modal instead of a full page section.
let upgradePopupShownForRun=false;

function ensureUpgradePopupStyles(){
  if(document.getElementById("upgradePopupStyles"))return;
  const style=document.createElement("style");
  style.id="upgradePopupStyles";
  style.textContent=`
    .upgrade-reopen{display:none;width:100%;margin:12px 0 18px;padding:12px 14px;border:1px solid #38bdf8;border-radius:12px;background:rgba(56,189,248,.12);color:#e2e8f0;font-weight:900;font-size:14px;text-align:left}
    .upgrade-modal{display:none;position:fixed;inset:0;z-index:2000;background:rgba(2,6,23,.78);backdrop-filter:blur(4px);padding:18px;align-items:center;justify-content:center}
    .upgrade-modal.open{display:flex}
    .upgrade-modal-panel{width:min(560px,100%);max-height:84vh;overflow:auto;background:#0f172a;border:1px solid rgba(148,163,184,.25);border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,.55)}
    .upgrade-modal-head{position:sticky;top:0;z-index:2;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px 16px 12px;background:#0f172a;border-bottom:1px solid rgba(148,163,184,.16)}
    .upgrade-modal-title{font-size:20px;font-weight:900;margin:2px 0 3px}
    .upgrade-modal-sub{font-size:12px;color:#94a3b8}
    .upgrade-modal-close{border:0;background:rgba(148,163,184,.14);color:#e2e8f0;border-radius:10px;width:38px;height:38px;font-size:22px;line-height:1}
    .upgrade-modal-body{padding:14px}
    .upgrade-modal-body .player{margin-bottom:10px}
    .upgrade-modal-body .player:last-child{margin-bottom:0}
  `;
  document.head.appendChild(style);
}

function closeUpgradeModal(){
  const modal=document.getElementById("upgradeModal");
  if(modal)modal.classList.remove("open");
  document.body.style.overflow="";
}

function openUpgradeModal(){
  const modal=document.getElementById("upgradeModal");
  if(!modal||!potentialUpgradeData.length)return;
  modal.classList.add("open");
  document.body.style.overflow="hidden";
}

ensurePotentialUpgradeUI=function(){
  ensureUpgradePopupStyles();
  document.getElementById("homeUpgradeSection")?.remove();
  document.getElementById("sundayUpgradeSection")?.remove();

  if($("watchList")&&!$("homeUpgradeButton")){
    const button=document.createElement("button");
    button.id="homeUpgradeButton";
    button.className="upgrade-reopen";
    button.type="button";
    button.onclick=openUpgradeModal;
    $("watchList").insertAdjacentElement("afterend",button);
  }
  if($("sundayWatchList")&&!$("sundayUpgradeButton")){
    const button=document.createElement("button");
    button.id="sundayUpgradeButton";
    button.className="upgrade-reopen";
    button.type="button";
    button.onclick=openUpgradeModal;
    $("sundayWatchList").insertAdjacentElement("afterend",button);
  }

  if(!$("upgradeModal")){
    const modal=document.createElement("div");
    modal.id="upgradeModal";
    modal.className="upgrade-modal";
    modal.setAttribute("role","dialog");
    modal.setAttribute("aria-modal","true");
    modal.setAttribute("aria-labelledby","upgradeModalTitle");
    modal.innerHTML='<div class="upgrade-modal-panel"><div class="upgrade-modal-head"><div><div class="eyebrow">LINEUP ASSISTANT</div><div id="upgradeModalTitle" class="upgrade-modal-title">Potential Upgrade</div><div id="upgradeModalSub" class="upgrade-modal-sub"></div></div><button id="upgradeModalClose" class="upgrade-modal-close" type="button" aria-label="Close">×</button></div><div id="upgradeModalBody" class="upgrade-modal-body"></div></div>';
    modal.addEventListener("click",e=>{if(e.target===modal)closeUpgradeModal()});
    document.body.appendChild(modal);
    $("upgradeModalClose").onclick=closeUpgradeModal;
    document.addEventListener("keydown",e=>{if(e.key==="Escape")closeUpgradeModal()});
  }
};

renderPotentialUpgrades=function(){
  ensurePotentialUpgradeUI();
  if(potentialUpgradeProjectionState==="loading")upgradePopupShownForRun=false;

  const homeBtn=$("homeUpgradeButton"),sundayBtn=$("sundayUpgradeButton");
  const modalBody=$("upgradeModalBody"),modalTitle=$("upgradeModalTitle"),modalSub=$("upgradeModalSub");
  const ready=potentialUpgradeProjectionState==="ready"&&potentialUpgradeData.length>0;

  [homeBtn,sundayBtn].forEach(btn=>{
    if(!btn)return;
    btn.style.display=ready?"block":"none";
    if(ready)btn.textContent="🔵 View "+potentialUpgradeData.length+" Potential Upgrade"+(potentialUpgradeData.length===1?"":"s");
  });

  if(!ready){
    if(potentialUpgradeProjectionState!=="loading")closeUpgradeModal();
    return;
  }

  if(modalTitle)modalTitle.textContent=potentialUpgradeData.length===1?"Potential Lineup Upgrade":"Potential Lineup Upgrades";
  if(modalSub)modalSub.textContent="Healthy bench options projected "+UPGRADE_MIN_EDGE.toFixed(1)+"+ points above a legal starter swap.";
  if(modalBody)modalBody.innerHTML=potentialUpgradeData.map(upgradeCard).join("");

  if($("sundayAllClear"))$("sundayAllClear").innerHTML="";
  if($("sundaySummary")){
    $("sundaySummary").textContent+=" "+potentialUpgradeData.length+" projected lineup upgrade"+(potentialUpgradeData.length===1?"":"s")+" found.";
  }

  if(!upgradePopupShownForRun){
    upgradePopupShownForRun=true;
    openUpgradeModal();
  }
};
