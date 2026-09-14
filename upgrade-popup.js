// Lets the manager choose which projected lineup upgrade to inspect in a modal.
// Nothing opens automatically; each upgrade is a compact selectable item.
let selectedUpgradeIndex=null;

function ensureUpgradePopupStyles(){
  if(document.getElementById("upgradePopupStyles"))return;
  const style=document.createElement("style");
  style.id="upgradePopupStyles";
  style.textContent=`
    .upgrade-picker{display:none;margin:14px 0 18px}
    .upgrade-picker h2{margin-bottom:8px}
    .upgrade-choice-list{display:grid;gap:8px}
    .upgrade-choice{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border:1px solid rgba(56,189,248,.45);border-radius:12px;background:rgba(56,189,248,.10);color:#e2e8f0;text-align:left}
    .upgrade-choice-main{min-width:0}
    .upgrade-choice-name{display:block;font-weight:900;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .upgrade-choice-sub{display:block;margin-top:3px;font-size:11px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .upgrade-choice-edge{flex:0 0 auto;font-size:13px;font-weight:900;color:#7dd3fc}
    .upgrade-picker-note{margin-top:7px;font-size:11px;color:#94a3b8}
    .upgrade-modal{display:none;position:fixed;inset:0;z-index:2000;background:rgba(2,6,23,.78);backdrop-filter:blur(4px);padding:18px;align-items:center;justify-content:center}
    .upgrade-modal.open{display:flex}
    .upgrade-modal-panel{width:min(560px,100%);max-height:84vh;overflow:auto;background:#0f172a;border:1px solid rgba(148,163,184,.25);border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,.55)}
    .upgrade-modal-head{position:sticky;top:0;z-index:2;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px 16px 12px;background:#0f172a;border-bottom:1px solid rgba(148,163,184,.16)}
    .upgrade-modal-title{font-size:20px;font-weight:900;margin:2px 0 3px}
    .upgrade-modal-sub{font-size:12px;color:#94a3b8}
    .upgrade-modal-close{border:0;background:rgba(148,163,184,.14);color:#e2e8f0;border-radius:10px;width:38px;height:38px;font-size:22px;line-height:1}
    .upgrade-modal-body{padding:14px}
  `;
  document.head.appendChild(style);
}

function closeUpgradeModal(){
  const modal=document.getElementById("upgradeModal");
  if(modal)modal.classList.remove("open");
  document.body.style.overflow="";
  selectedUpgradeIndex=null;
}

function openUpgradeModal(index){
  const x=potentialUpgradeData[index];
  const modal=$("upgradeModal"),body=$("upgradeModalBody"),title=$("upgradeModalTitle"),sub=$("upgradeModalSub");
  if(!modal||!x)return;
  selectedUpgradeIndex=index;
  if(title)title.textContent="Upgrade "+x.starter.name;
  if(sub)sub.textContent=x.league+" • +"+x.edge.toFixed(1)+" projected points";
  if(body)body.innerHTML=upgradeCard(x);
  modal.classList.add("open");
  document.body.style.overflow="hidden";
}

function upgradeChoice(x,index){
  return '<button class="upgrade-choice" type="button" data-upgrade-index="'+index+'"><span class="upgrade-choice-main"><span class="upgrade-choice-name">'+esc(x.starter.name)+' → '+esc(x.bench.name)+'</span><span class="upgrade-choice-sub">'+esc(x.league)+' • '+esc(x.starter.pos)+' starter</span></span><span class="upgrade-choice-edge">+'+x.edge.toFixed(1)+'</span></button>';
}

function bindUpgradeChoices(container){
  if(!container)return;
  container.querySelectorAll("[data-upgrade-index]").forEach(button=>{
    button.onclick=()=>openUpgradeModal(Number(button.dataset.upgradeIndex));
  });
}

ensurePotentialUpgradeUI=function(){
  ensureUpgradePopupStyles();
  document.getElementById("homeUpgradeSection")?.remove();
  document.getElementById("sundayUpgradeSection")?.remove();
  document.getElementById("homeUpgradeButton")?.remove();
  document.getElementById("sundayUpgradeButton")?.remove();

  if($("watchList")&&!$("homeUpgradePicker")){
    const section=document.createElement("section");
    section.id="homeUpgradePicker";
    section.className="upgrade-picker";
    section.innerHTML='<h2>🔵 Potential Upgrades</h2><div id="homeUpgradeChoices" class="upgrade-choice-list"></div><div class="upgrade-picker-note">Tap a starter to review the suggested bench upgrade.</div>';
    $("watchList").insertAdjacentElement("afterend",section);
  }
  if($("sundayWatchList")&&!$("sundayUpgradePicker")){
    const section=document.createElement("section");
    section.id="sundayUpgradePicker";
    section.className="upgrade-picker";
    section.innerHTML='<h2>🔵 Potential Upgrades</h2><div id="sundayUpgradeChoices" class="upgrade-choice-list"></div><div class="upgrade-picker-note">Tap a starter to review the suggested bench upgrade.</div>';
    $("sundayWatchList").insertAdjacentElement("afterend",section);
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
  const ready=potentialUpgradeProjectionState==="ready"&&potentialUpgradeData.length>0;
  const homePicker=$("homeUpgradePicker"),sundayPicker=$("sundayUpgradePicker");
  const html=ready?potentialUpgradeData.map(upgradeChoice).join(""):"";

  [homePicker,sundayPicker].forEach(picker=>{
    if(picker)picker.style.display=ready?"block":"none";
  });
  if($("homeUpgradeChoices")){
    $("homeUpgradeChoices").innerHTML=html;
    bindUpgradeChoices($("homeUpgradeChoices"));
  }
  if($("sundayUpgradeChoices")){
    $("sundayUpgradeChoices").innerHTML=html;
    bindUpgradeChoices($("sundayUpgradeChoices"));
  }

  if(!ready){
    closeUpgradeModal();
    return;
  }

  if($("sundayAllClear"))$("sundayAllClear").innerHTML="";
  if($("sundaySummary")&&!$("sundaySummary").dataset.upgradeSummaryAdded){
    $("sundaySummary").textContent+=" "+potentialUpgradeData.length+" projected lineup upgrade"+(potentialUpgradeData.length===1?"":"s")+" found.";
    $("sundaySummary").dataset.upgradeSummaryAdded="1";
  }
};
