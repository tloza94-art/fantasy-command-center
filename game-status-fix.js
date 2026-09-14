// Ensures Home and Sunday Mode use the full current NFL week, not just today's scoreboard.
// Players tab intentionally keeps injury designations for all players.
const baseLoad=load;
load=async function(){
  await baseLoad();
  if(!S.user)return;
  try{
    const week=Number(S.nflState.display_week||S.nflState.week||1);
    const seasonTypeName=String(S.nflState.season_type||"regular").toLowerCase();
    const seasonType=seasonTypeName.includes("post")?3:seasonTypeName.includes("pre")?1:2;
    const weeklyUrl=ESPN_SCOREBOARD+"?dates="+SEASON+"&seasontype="+seasonType+"&week="+week+"&limit=100";
    const [weekly,current]=await Promise.all([
      get(weeklyUrl).catch(()=>null),
      get(ESPN_SCOREBOARD).catch(()=>null)
    ]);
    S.gameStates={};
    [weekly,current].forEach(scoreboard=>{
      (scoreboard?.events||[]).forEach(event=>{
        const state=String(event?.status?.type?.state||"pre").toLowerCase();
        const kickoff=event?.date?new Date(event.date).getTime():null;
        const started=state!=="pre"||(kickoff&&Date.now()>=kickoff);
        const competition=event?.competitions?.[0];
        (competition?.competitors||[]).forEach(c=>{
          const abbr=normalizeTeam(c?.team?.abbreviation);
          if(abbr)S.gameStates[abbr]={state,started,kickoff,eventId:event.id};
        });
      });
    });
    renderAll();
  }catch(e){
    console.warn("Weekly game-status refresh failed",e);
  }
};

// Handoff from TFFCC into the matching Sleeper league.
// Use the league root URL. Current Sleeper examples put the league ID at the end of the URL;
// the native app appears to handle this route more reliably than the nested /team route.
function sleeperLeagueUrl(leagueId){
  return "https://sleeper.app/leagues/"+encodeURIComponent(leagueId);
}
function sleeperLink(leagueId){
  if(!leagueId)return "";
  return '<a class="sleeper-link" href="'+sleeperLeagueUrl(leagueId)+'">Fix in Sleeper ↗</a>';
}
const sleeperLinkStyle=document.createElement("style");
sleeperLinkStyle.textContent='.sleeper-link{display:inline-block;margin-top:10px;padding:8px 11px;border-radius:10px;background:#38bdf8;color:#07111f;text-decoration:none;font-size:12px;font-weight:900}.sleeper-link:active{transform:translateY(1px)}';
document.head.appendChild(sleeperLinkStyle);

emptyLineupCard=function(l){
  return '<div class="player urgent-card"><span class="badge danger-badge">EMPTY</span><div class="player-name">'+esc(l.league)+'</div><div class="sub">'+l.emptySlots+' empty starter slot'+(l.emptySlots===1?'':'s')+' detected. Fill this lineup.</div>'+sleeperLink(l.leagueId)+'</div>';
};
card=function(r){
  return '<div class="player"><span class="badge">'+esc(r.injury||r.nflStatus)+'</span><div class="player-name">'+esc(r.name)+'</div><div class="sub">'+esc(r.pos)+' • '+esc(r.team||"FA")+'<br>'+esc(r.league)+'</div>'+sleeperLink(r.leagueId)+'</div>';
};
sundayPlayerCard=function(r,label){
  return '<div class="player"><span class="badge '+(label==="ACT NOW"?'danger-badge':'warn-badge')+'">'+esc(r.injury||r.nflStatus||label)+'</span><div class="player-name">'+esc(r.name)+'</div><div class="sub">'+esc(r.pos)+' • '+esc(r.team||"FA")+'<br>'+esc(r.league)+' • Starter</div>'+sleeperLink(r.leagueId)+'</div>';
};
