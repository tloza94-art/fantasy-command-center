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

// Sleeper's iOS app currently discards the league destination when launched from TFFCC.
// Retire the handoff button for now instead of presenting a control that opens the wrong place.
// Keep this function so existing actionable-card rendering remains simple and can be restored later
// if Sleeper exposes a reliable supported deep link.
function sleeperLink(){
  return "";
}

emptyLineupCard=function(l){
  return '<div class="player urgent-card"><span class="badge danger-badge">EMPTY</span><div class="player-name">'+esc(l.league)+'</div><div class="sub">'+l.emptySlots+' empty starter slot'+(l.emptySlots===1?'':'s')+' detected. Fill this lineup.</div>'+sleeperLink(l.leagueId)+'</div>';
};
card=function(r){
  return '<div class="player"><span class="badge">'+esc(r.injury||r.nflStatus)+'</span><div class="player-name">'+esc(r.name)+'</div><div class="sub">'+esc(r.pos)+' • '+esc(r.team||"FA")+'<br>'+esc(r.league)+'</div>'+sleeperLink(r.leagueId)+'</div>';
};
sundayPlayerCard=function(r,label){
  return '<div class="player"><span class="badge '+(label==="ACT NOW"?'danger-badge':'warn-badge')+'">'+esc(r.injury||r.nflStatus||label)+'</span><div class="player-name">'+esc(r.name)+'</div><div class="sub">'+esc(r.pos)+' • '+esc(r.team||"FA")+'<br>'+esc(r.league)+' • Starter</div>'+sleeperLink(r.leagueId)+'</div>';
};
