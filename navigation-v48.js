// Four-tab navigation with direct access to every tool.
(function(){
 const topLevel={homeView:"homeView",leaguesHub:"leaguesHub",toolsHub:"toolsHub",moreView:"moreView",teamsView:"leaguesHub",managerView:"leaguesHub",playersView:"toolsHub",sundayView:"moreView",exposureView:"moreView"};
 function openPage(id,mode){
   const target=document.getElementById(id);if(!target)return;
   document.querySelectorAll(".view").forEach(el=>el.classList.toggle("active",el===target));
   const teamTool=id==="teamsView"&&(mode==="trade"||mode==="lineup");
   document.querySelectorAll("nav .nav").forEach(b=>{
     const active=b.dataset.view===(teamTool?"toolsHub":topLevel[id]);
     b.classList.toggle("active",active);
     b.setAttribute("aria-current",active?"page":"false");
   });
   const teams=document.getElementById("teamsView");
   if(teams){
     teams.classList.toggle("direct-tool",teamTool);
     teams.classList.toggle("direct-lineup",teamTool&&mode==="lineup");
     teams.classList.toggle("direct-trade",teamTool&&mode==="trade");
     const title=document.getElementById("teamPageTitle");
     if(title)title.textContent=teamTool?(mode==="trade"?"Trade Lab":"What-If Lineup"):"Team Rosters";
   }
   if(id==="teamsView"){
     if(typeof tradeSetMode==="function")tradeSetMode(mode==="trade"?"trade":"roster");
     if(typeof renderTeam==="function")renderTeam();
   }
   window.scrollTo(0,0);
 }
 document.addEventListener("DOMContentLoaded",()=>{
   const profile=document.getElementById("profileCard"),destination=document.getElementById("profileDestination");
   if(profile&&destination)destination.appendChild(profile);
   document.querySelectorAll("nav .nav").forEach(b=>b.onclick=()=>openPage(b.dataset.view));
   document.querySelectorAll("[data-open-view]").forEach(b=>b.addEventListener("click",()=>openPage(b.dataset.openView,b.dataset.teamTool)));
   // No large profile tutorial card: the saved manager loads automatically.
 });
})();