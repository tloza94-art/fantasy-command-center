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
