// Refresh only the live data that can change while the user is in Sleeper.
// This keeps TFFCC current without repeating the full startup scan on every return.
let tffccWasHidden=false;
let tffccHiddenAt=0;
let tffccResumeRefreshInFlight=false;
let tffccLastResumeRefresh=0;

async function tffccRefreshAfterResume(){
  if(tffccResumeRefreshInFlight||!S?.user||!S?.leagues?.length)return;
  const now=Date.now();
  if(now-tffccLastResumeRefresh<3000)return;
  tffccLastResumeRefresh=now;
  tffccResumeRefreshInFlight=true;
  try{
    status("Refreshing live lineup data…");

    // Sleeper state decides which fantasy week is active.
    const nflState=await get(API+"/state/nfl").catch(()=>S.nflState||{});
    if(nflState?.week)nflState.display_week=nflState.week;
    S.nflState=nflState;
    const week=Number(S.nflState.week||S.nflState.display_week||1);

    // Refresh only data that can realistically change while the user is away:
    // rosters, current-week matchups, and NFL game state. League/user/player
    // metadata stays in memory (the player database has its own 24-hour cache).
    const rawType=String(S.nflState.season_type||"regular").toLowerCase();
    const seasonType=rawType.includes("post")?3:rawType.includes("pre")?1:2;
    const weeklyUrl=ESPN_SCOREBOARD+"?dates="+SEASON+"&seasontype="+seasonType+"&week="+week+"&limit=100";

    const [leagueData,weeklyScoreboard,currentScoreboard]=await Promise.all([
      Promise.all(S.leagues.map(async league=>{
        const [rosters,matchups]=await Promise.all([
          get(API+"/league/"+league.league_id+"/rosters").catch(()=>S.rosters?.[league.league_id]||[]),
          get(API+"/league/"+league.league_id+"/matchups/"+week).catch(()=>S.matchups?.[league.league_id]||[])
        ]);
        return {league,rosters,matchups};
      })),
      get(weeklyUrl).catch(()=>null),
      get(ESPN_SCOREBOARD).catch(()=>null)
    ]);

    // Merge the full weekly schedule and the live scoreboard so injury locking
    // remains accurate for every game in the current Sleeper week.
    S.gameStates={};
    [weeklyScoreboard,currentScoreboard].forEach(scoreboard=>{
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

    S.rows=[];
    S.lineups=[];
    S.matchups={};
    S.rosters={};

    leagueData.forEach(({league,rosters,matchups})=>{
      const leagueId=league.league_id;
      S.rosters[leagueId]=rosters||[];
      S.matchups[leagueId]=matchups||[];
      const users=S.leagueUsers?.[leagueId]||[];
      const roster=(rosters||[]).find(x=>String(x.owner_id)===String(S.user.user_id));
      if(!roster)return;

      const bestBall=isBestBallLeague(league);
      const starters=new Set((roster.starters||[]).filter(id=>id&&id!=="0"));
      const ir=new Set(roster.reserve||[]);
      const taxi=new Set(roster.taxi||[]);
      const emptySlots=(roster.starters||[]).filter(id=>!id||id==="0").length;
      const mine=(matchups||[]).find(m=>Number(m.roster_id)===Number(roster.roster_id));
      const opp=mine?(matchups||[]).find(m=>m.matchup_id===mine.matchup_id&&Number(m.roster_id)!==Number(roster.roster_id)):null;
      const oppRoster=opp?(rosters||[]).find(x=>Number(x.roster_id)===Number(opp.roster_id)):null;
      const oppUser=oppRoster?.owner_id?users.find(x=>String(x.user_id)===String(oppRoster.owner_id)):null;
      const opponentName=oppUser?.metadata?.team_name||oppUser?.display_name||oppUser?.username||null;

      S.lineups.push({
        leagueId,
        league:league.name,
        rosterId:roster.roster_id,
        emptySlots,
        points:Number(mine?.points||0),
        opponentPoints:opp?Number(opp.points||0):null,
        opponentName,
        matchupId:mine?.matchup_id??null,
        bestBall
      });

      (roster.players||[]).forEach(id=>{
        const p=S.players[id]||{};
        const rosterStatus=ir.has(id)?"IR":taxi.has(id)?"Taxi":starters.has(id)?"Starter":"Bench";
        S.rows.push({
          leagueId,
          league:league.name,
          id,
          name:p.full_name||((p.first_name||"")+" "+(p.last_name||"")).trim()||id,
          pos:p.position||"",
          team:p.team||"",
          rosterStatus,
          injury:p.injury_status||"",
          nflStatus:p.status||"",
          bestBall
        });
      });
    });

    renderAll();

    // Ranking now reuses S.rosters, so recomputing it is cheap. Projections are
    // still refreshed because they are part of the lineup-upgrade decision.
    await Promise.all([
      typeof buildManagerRanking==="function"?buildManagerRanking():Promise.resolve(),
      typeof buildPotentialUpgrades==="function"?buildPotentialUpgrades():Promise.resolve()
    ]);

    status((S.user.display_name||S.user.username)+" • "+S.leagues.length+" leagues • Week "+week+" • Live refresh "+new Date().toLocaleTimeString([], {hour:"numeric",minute:"2-digit"}));
  }catch(e){
    console.warn("Resume refresh failed",e);
    status("Live refresh failed. Tap ↻ to retry.");
  }finally{
    tffccResumeRefreshInFlight=false;
  }
}

document.addEventListener("visibilitychange",()=>{
  if(document.hidden){
    tffccWasHidden=true;
    tffccHiddenAt=Date.now();
    return;
  }
  if(tffccWasHidden){
    tffccWasHidden=false;
    // Ignore extremely brief visibility changes that are not real app switching.
    if(Date.now()-tffccHiddenAt>=500)tffccRefreshAfterResume();
  }
});

window.addEventListener("pagehide",()=>{
  tffccWasHidden=true;
  tffccHiddenAt=Date.now();
});

window.addEventListener("pageshow",event=>{
  if(event.persisted)tffccRefreshAfterResume();
});
