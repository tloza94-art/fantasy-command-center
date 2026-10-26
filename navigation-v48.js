// Four-tab navigation with full-page destinations. Existing view IDs stay intact.
(function(){
 const topLevel={homeView:"homeView",leaguesHub:"leaguesHub",toolsHub:"toolsHub",moreView:"moreView",teamsView:"leaguesHub",managerView:"leaguesHub",lineupToolView:"toolsHub",tradeToolView:"toolsHub",playersView:"toolsHub",sundayView:"moreView",exposureView:"moreView"};
 function openPage(id,mode){
   const target=document.getElementById(id);if(!target)return;
   document.querySelectorAll(".view").forEach(el=>el.classList.toggle("active",el===target));
   document.querySelectorAll("nav .nav").forEach(b=>{
     const active=b.dataset.view===topLevel[id];
     b.classList.toggle("active",active);
     b.setAttribute("aria-current",active?"page":"false");
   });
   if(mode&&typeof tradeSetMode==="function")tradeSetMode(mode);
   if(id==="teamsView"&&typeof renderTeam==="function")renderTeam();
   window.scrollTo({top:0,behavior:"instant"});
 }
 document.addEventListener("DOMContentLoaded",()=>{
   const profile=document.getElementById("profileCard"),destination=document.getElementById("profileDestination");
   if(profile&&destination)destination.appendChild(profile);
   document.querySelectorAll("nav .nav").forEach(b=>b.onclick=()=>openPage(b.dataset.view));
   document.querySelectorAll("[data-open-view]").forEach(b=>b.addEventListener("click",()=>openPage(b.dataset.openView,b.dataset.teamTool)));
   const home=document.getElementById("homeView");
   if(home){
     const prompt=document.createElement("div");
     prompt.className="profile-prompt card";
     prompt.innerHTML='<strong>My Sleeper Profile</strong><p class="muted">Your saved profile loads automatically. To add or change a username, open Profile & More.</p><button type="button">Manage profile</button>';
     prompt.querySelector("button").onclick=()=>openPage("moreView");
     home.insertBefore(prompt,home.firstChild);
   }
 });
})();
