// Refresh only the live data that can change while the user is in Sleeper.
// Full scans and resume refreshes are serialized so they can never append to
// the same state at the same time (which previously produced duplicate cards).
let tffccWasHidden=false;
let tffccHiddenAt=0;
let tffccResumeRefreshInFlight=false;
let tffccFullLoadInFlight=false;
let tffccLastResumeRefresh=0;

// This script loads last, so wrap the final composed load() used by the UI.
// Manual/full refreshes cannot overlap the lightweight resume refresh.
const tffccFinalFullLoad=load;
load=async function(){
  if(tffccFullLoadInFlight)return;
  while(tffccResumeRefreshInFlight)await new Promise(r=>setTimeout(r,100));
  tffccFullLoadInFlight=true;
  try{return await tffccFinalFullLoad()}
  finally{tffccFullLoadInFlight=false}
};

const tffccDelay=ms=>new Promise(r=>setTimeout(r,ms));

async function tffccRefreshAfterResume(){
  if(tffccResumeRefreshInFlight||tffccFullLoadInFlight||!S?.user||!S?.leagues?.length)return;
  const now=Date.now();
  if(now-tffccLastResumeRefresh<3000)return;
  tffccLastResumeRefresh=now;
  tffccResumeRefreshInFlight=true;
  try{
    status("Refreshing live lineup data…");

    // Give Sleeper a brief moment to persist a lineup change made immediately
    // before the user switches back to TFFCC.
    await tffccDelay(700);

    const nflState=await get(API+"/state/nfl").catch(()=>S.nflState||{});
    if(nflState?.week)nflState.display_week=nflState.week;
    S.nflState=nflState;
    const week=Number(S.nflState.week||S.nflState.display_week||1);
    const rawType=String(S.nflState.season_type||"regular").toLowerCase();
    const seasonType=rawType.includes("post")?3:rawType.includes("pre")?1:2;
    const weeklyUrl=ESPN_SCOREBOARD+"?dates="+SEASON+"&seasontype="+seasonType+"&week="+week+"&limit=100";

    const [leagueData,weeklyScoreboard,currentScoreboard]=await Promise.all([
      Promise.all(S.leagues.map(async league=>{
        // Cache-busting query value plus fetch(cache:no-store) ensures the browser
        // cannot satisfy a just-changed roster from an old HTTP cache entry.
        const bust="?t="+Date.now();
        const [rosters,matchups]=await Promise.all([
          get(API+"/league/"+league.league_id+"/rosters"+bust).catch(()=>S.rosters?.[league.league_id]||[]),
          get(API+"/league/"+league.league_id+"/matchups/"+week+bust).catch(()=>S.matchups?.[league.league_id]||[])
        ]);
        return {league,rosters,matchups};
      })),
      get(weeklyUrl).catch(()=>null),
      get(ESPN_SCOREBOARD).catch(()=>null)
    ]);

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

    // Build fresh arrays off to the side, then swap them into S atomically.
    // This prevents partial/duplicate UI state even if rendering occurs nearby.
    const nextRows=[];
    const nextLineups=[];
    const nextMatchups={};
    const nextRosters={};

    leagueData.forEach(({league,rosters,matchups})=>{
      const leagueId=league.league_id;
      nextRosters[leagueId]=rosters||[];
      nextMatchups[leagueId]=matchups||[];
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

      nextLineups.push({leagueId,league:league.name,rosterId:roster.roster_id,emptySlots,points:Number(mine?.points||0),opponentPoints:opp?Number(opp.points||0):null,opponentName,matchupId:mine?.matchup_id??null,bestBall});
      (roster.players||[]).forEach(id=>{
        const p=S.players[id]||{};
        const rosterStatus=ir.has(id)?"IR":taxi.has(id)?"Taxi":starters.has(id)?"Starter":"Bench";
        nextRows.push({leagueId,league:league.name,id,name:p.full_name||((p.first_name||"")+" "+(p.last_name||"")).trim()||id,pos:p.position||"",team:p.team||"",rosterStatus,injury:p.injury_status||"",nflStatus:p.status||"",bestBall});
      });
    });

    S.rows=nextRows;
    S.lineups=nextLineups;
    S.matchups=nextMatchups;
    S.rosters=nextRosters;
    renderAll();

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
  if(document.hidden){tffccWasHidden=true;tffccHiddenAt=Date.now();return}
  if(tffccWasHidden){
    tffccWasHidden=false;
    if(Date.now()-tffccHiddenAt>=500)tffccRefreshAfterResume();
  }
});

window.addEventListener("pagehide",()=>{tffccWasHidden=true;tffccHiddenAt=Date.now()});
window.addEventListener("pageshow",event=>{if(event.persisted)tffccRefreshAfterResume()});
