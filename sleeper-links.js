// Adds safe read-only handoff buttons from FCC into the matching Sleeper league.
// Sleeper's web app uses sleeper.app; the league ID is part of the selected league URL.
function sleeperLeagueUrl(leagueId){
  return "https://sleeper.app/leagues/"+encodeURIComponent(leagueId)+"/team";
}

function sleeperLink(leagueId,label="Fix in Sleeper ↗"){
  if(!leagueId)return "";
  return '<a class="sleeper-link" href="'+sleeperLeagueUrl(leagueId)+'" target="_blank" rel="noopener">'+label+'</a>';
}

const sleeperLinkStyle=document.createElement("style");
sleeperLinkStyle.textContent=`
.sleeper-link{display:inline-block;margin-top:10px;padding:8px 11px;border-radius:10px;background:#38bdf8;color:#07111f;text-decoration:none;font-size:12px;font-weight:900}
.sleeper-link:active{transform:translateY(1px)}
`;
document.head.appendChild(sleeperLinkStyle);

// Override only actionable cards. Player search keeps being informational.
emptyLineupCard=function(l){
  return '<div class="player urgent-card"><span class="badge danger-badge">EMPTY</span><div class="player-name">'+esc(l.league)+'</div><div class="sub">'+l.emptySlots+' empty starter slot'+(l.emptySlots===1?'':'s')+' detected. Fill this lineup.</div>'+sleeperLink(l.leagueId)+'</div>';
};

card=function(r){
  return '<div class="player"><span class="badge">'+esc(r.injury||r.nflStatus)+'</span><div class="player-name">'+esc(r.name)+'</div><div class="sub">'+esc(r.pos)+' • '+esc(r.team||"FA")+'<br>'+esc(r.league)+'</div>'+sleeperLink(r.leagueId)+'</div>';
};

sundayPlayerCard=function(r,label){
  return '<div class="player"><span class="badge '+(label==="ACT NOW"?'danger-badge':'warn-badge')+'">'+esc(r.injury||r.nflStatus||label)+'</span><div class="player-name">'+esc(r.name)+'</div><div class="sub">'+esc(r.pos)+' • '+esc(r.team||"FA")+'<br>'+esc(r.league)+' • Starter</div>'+sleeperLink(r.leagueId)+'</div>';
};
