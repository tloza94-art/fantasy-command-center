// FCC Manager Ranking: portfolio-wide league ranking using Sleeper roster stats.
// Uses record first, then season points, current matchup, and actionable lineup health.
// Also adds projected bench-vs-starter upgrade alerts to Home and Sunday Mode.
let managerRankingData=[];
let potentialUpgradeData=[];
let potentialUpgradeProjectionState="idle";
const UPGRADE_MIN_EDGE=2.5;
const rankingBaseLoad=load;
load=async function(){
  await rankingBaseLoad();
  if(!S.user)return;
  await Promise.all([
    buildManagerRanking(),
    buildPotentialUpgrades()
  ]);
};

async function buildManagerRanking(){
  const items=await Promise.all(S.leagues.map(async league=>{
    try{
      const rosters=await get(API+"/league/"+league.league_id+"/rosters");
      const roster=rosters.find(r=>String(r.owner_id)===String(S.user.user_id));
      if(!roster)return null;
      const settings=roster.settings||{};
      const wins=Number(settings.wins||0),losses=Number(settings.losses||0),ties=Number(settings.ties||0);
      const games=wins+losses+ties;
      const winPct=games?((wins+ties*.5)/games):0;
      const pf=Number(settings.fpts||0)+(Number(settings.fpts_decimal||0)/100);
      const lineup=S.lineups.find(x=>x.leagueId===league.league_id)||{};
      const rows=S.rows.filter(r=>r.leagueId===league.league_id&&r.rosterStatus==="Starter");
      const mustFix=league.settings&&isBestBallLeague(league)?0:rows.filter(r=>actionableInjury(r)&&must(r)).length+Number(lineup.emptySlots||0);
      const monitor=league.settings&&isBestBallLeague(league)?0:rows.filter(r=>actionableInjury(r)&&watch(r)).length;
      let matchupState="No matchup";
      if(lineup.matchupId!==null&&lineup.matchupId!==undefined&&lineup.opponentPoints!==null&&lineup.opponentPoints!==undefined){
        matchupState=lineup.points>lineup.opponentPoints?"Leading":lineup.points<lineup.opponentPoints?"Trailing":"Tied";
      }
      return {leagueId:league.league_id,league:league.name,bestBall:isBestBallLeague(league),wins,losses,ties,games,winPct,pf,weekPoints:Number(lineup.points||0),oppPoints:lineup.opponentPoints,matchupState,mustFix,monitor};
    }catch{return null}
  }));
  managerRankingData=items.filter(Boolean);
  scoreAndRenderManagerRanking();
}

function scoreAndRenderManagerRanking(){
  if(!$("managerRankingList"))return;
  const a=managerRankingData.slice();
  if(!a.length){$("managerRankingList").innerHTML='<div class="muted">No league ranking data available.</div>';return}
  const pfs=a.map(x=>x.pf).sort((x,y)=>x-y);
  const pfPercentile=v=>pfs.length===1?1:pfs.filter(x=>x<v).length/(pfs.length-1);
  a.forEach(x=>{
    const matchup=x.matchupState==="Leading"?1:x.matchupState==="Tied"?.5:0;
    const health=Math.max(0,1-(x.mustFix*.35+x.monitor*.12));
    x.score=Math.round((x.winPct*.60+pfPercentile(x.pf)*.25+matchup*.10+health*.05)*100);
    x.grade=x.score>=92?"A+":x.score>=88?"A":x.score>=84?"A-":x.score>=80?"B+":x.score>=76?"B":x.score>=72?"B-":x.score>=68?"C+":x.score>=64?"C":x.score>=60?"C-":x.score>=55?"D":"F";
  });
  a.sort((x,y)=>y.score-x.score||y.winPct-x.winPct||y.pf-x.pf);
  const totalWins=a.reduce((n,x)=>n+x.wins,0),avgWin=Math.round(a.reduce((n,x)=>n+x.winPct,0)/a.length*100);
  $("rankedLeagueCount").textContent=a.length;
  $("rankingWins").textContent=totalWins;
  $("rankingWinPct").textContent=avgWin+"%";
  $("rankingBest").textContent=a[0]?.grade||"—";
  $("managerRankingList").innerHTML=a.map((x,i)=>{
    const record=x.wins+"-"+x.losses+(x.ties?"-"+x.ties:"");
    const score=x.oppPoints===null||x.oppPoints===undefined?formatScore(x.weekPoints):formatScore(x.weekPoints)+" vs "+formatScore(x.oppPoints);
    const alerts=x.bestBall?'<span class="league-chip">Best Ball</span>':(x.mustFix?'<span class="league-chip danger-chip">'+x.mustFix+' must fix</span>':'')+(x.monitor?'<span class="league-chip warn-chip">'+x.monitor+' monitor</span>':'');
    return '<div class="player ranking-card"><div class="rank-number">#'+(i+1)+'</div><div class="rank-grade">'+x.grade+'<small>'+x.score+'</small></div><div class="rank-main"><div class="player-name">'+esc(x.league)+'</div><div class="sub">Record '+record+' • '+Math.round(x.winPct*100)+'% • PF '+formatScore(x.pf)+'</div><div class="sub">Week: '+score+' • '+x.matchupState+'</div><div>'+alerts+'</div></div></div>';
  }).join("");
}

async function buildPotentialUpgrades(){
  ensurePotentialUpgradeUI();
  potentialUpgradeProjectionState="loading";
  renderPotentialUpgrades();
  try{
    const projections=await loadWeeklyProjectionMap();
    potentialUpgradeData=findPotentialUpgrades(projections);
    potentialUpgradeProjectionState="ready";
  }catch(e){
    console.warn("Weekly projections unavailable",e);
    potentialUpgradeData=[];
    potentialUpgradeProjectionState="error";
  }
  renderPotentialUpgrades();
}

async function loadWeeklyProjectionMap(){
  const week=Number(S.nflState.display_week||S.nflState.week||1);
  const rawType=String(S.nflState.season_type||"regular").toLowerCase();
  const seasonType=rawType.includes("post")?"post":rawType.includes("pre")?"pre":"regular";
  const urls=[
    "https://api.sleeper.com/projections/nfl/"+SEASON+"/"+week+"?season_type="+seasonType,
    API+"/projections/nfl/"+seasonType+"/"+SEASON+"/"+week
  ];
  let lastError=null;
  for(const url of urls){
    try{
      const data=await get(url);
      const map=normalizeProjectionPayload(data);
      if(Object.keys(map).length)return map;
    }catch(e){lastError=e}
  }
  throw lastError||Error("No weekly projection data returned");
}

function normalizeProjectionPayload(data){
  const out={};
  const add=(key,row)=>{
    if(!row||typeof row!=="object")return;
    const id=row.player_id??row.player?.player_id??row.player?.id??key;
    if(id===undefined||id===null||id==="")return;
    out[String(id)]=(row.stats&&typeof row.stats==="object")?row.stats:row;
  };
  if(Array.isArray(data))data.forEach(row=>add(null,row));
  else if(data&&typeof data==="object")Object.entries(data).forEach(([key,row])=>add(key,row));
  return out;
}

function projectedPoints(playerId,league,projectionMap){
  const stats=projectionMap[String(playerId)];
  if(!stats||typeof stats!=="object")return null;
  const scoring=league?.scoring_settings||{};
  let total=0,hits=0;
  Object.entries(scoring).forEach(([stat,multiplier])=>{
    const raw=Number(stats[stat]),mult=Number(multiplier);
    if(Number.isFinite(raw)&&Number.isFinite(mult)){
      total+=raw*mult;
      hits++;
    }
  });
  if(hits>=2&&Number.isFinite(total))return total;

  const receptionValue=Number(scoring.rec||0);
  const preferred=receptionValue>=.75?"pts_ppr":receptionValue>=.25?"pts_half_ppr":"pts_std";
  const fallbacks=[preferred,"pts_ppr","pts_half_ppr","pts_std"];
  for(const key of fallbacks){
    const value=Number(stats[key]);
    if(Number.isFinite(value))return value;
  }
  return hits&&Number.isFinite(total)?total:null;
}

function starterSlotsForLeague(league){
  const nonStarters=new Set(["BN","IR","TAXI"]);
  return (league?.roster_positions||[]).map(x=>String(x||"").toUpperCase()).filter(x=>x&&!nonStarters.has(x));
}

function eligibleForStarterSlot(position,slot){
  const p=String(position||"").toUpperCase(),s=String(slot||"").toUpperCase();
  if(!p||!s)return false;
  if(p===s)return true;
  if(s==="FLEX"||s==="W/R/T"||s==="RB/WR/TE")return ["RB","WR","TE"].includes(p);
  if(s==="SUPER_FLEX"||s==="SUPERFLEX"||s==="Q/W/R/T"||s==="QB/RB/WR/TE")return ["QB","RB","WR","TE"].includes(p);
  if(s==="WRRB_FLEX"||s==="WR/RB")return ["WR","RB"].includes(p);
  if(s==="REC_FLEX"||s==="WRTE_FLEX"||s==="WR/TE")return ["WR","TE"].includes(p);
  if(s==="IDP_FLEX")return ["DL","DE","DT","LB","DB","CB","S","EDGE"].includes(p);
  return false;
}

function lineupCanFit(players,league){
  const slots=starterSlotsForLeague(league);
  if(players.length>slots.length)return false;
  const ordered=players.slice().sort((a,b)=>{
    const ac=slots.filter(s=>eligibleForStarterSlot(a.pos,s)).length;
    const bc=slots.filter(s=>eligibleForStarterSlot(b.pos,s)).length;
    return ac-bc;
  });
  const used=new Array(slots.length).fill(false);
  const place=i=>{
    if(i>=ordered.length)return true;
    for(let j=0;j<slots.length;j++){
      if(used[j]||!eligibleForStarterSlot(ordered[i].pos,slots[j]))continue;
      used[j]=true;
      if(place(i+1))return true;
      used[j]=false;
    }
    return false;
  };
  return place(0);
}

function findPotentialUpgrades(projectionMap){
  const all=[];
  S.leagues.forEach(league=>{
    if(isBestBallLeague(league))return;
    const lineup=S.lineups.find(x=>String(x.leagueId)===String(league.league_id));
    if(!lineup||Number(lineup.emptySlots||0)>0)return;
    const rows=S.rows.filter(r=>String(r.leagueId)===String(league.league_id));
    const starters=rows.filter(r=>r.rosterStatus==="Starter");
    const bench=rows.filter(r=>r.rosterStatus==="Bench");
    const candidates=[];

    bench.forEach(b=>{
      if(injured(b)||gameStarted(b))return;
      const benchProj=projectedPoints(b.id,league,projectionMap);
      if(benchProj===null||benchProj<=0)return;
      starters.forEach(s=>{
        if(injured(s)||gameStarted(s))return;
        const starterProj=projectedPoints(s.id,league,projectionMap);
        if(starterProj===null)return;
        const edge=benchProj-starterProj;
        if(edge<UPGRADE_MIN_EDGE)return;
        const swapped=starters.filter(x=>x.id!==s.id).concat(b);
        if(!lineupCanFit(swapped,league))return;
        candidates.push({
          leagueId:league.league_id,
          league:league.name,
          bench:b,
          starter:s,
          benchProj,
          starterProj,
          edge
        });
      });
    });

    candidates.sort((a,b)=>b.edge-a.edge);
    const usedBench=new Set(),usedStarters=new Set();
    candidates.forEach(c=>{
      if(usedBench.has(c.bench.id)||usedStarters.has(c.starter.id))return;
      if(usedBench.size>=3)return;
      usedBench.add(c.bench.id);
      usedStarters.add(c.starter.id);
      all.push(c);
    });
  });
  return all.sort((a,b)=>b.edge-a.edge||a.league.localeCompare(b.league));
}

function ensurePotentialUpgradeUI(){
  if($("watchList")&&!$("homeUpgradeSection")){
    const section=document.createElement("div");
    section.id="homeUpgradeSection";
    section.innerHTML='<h2>🔵 Potential Upgrades</h2><div id="homeUpgradeList" class="stack"></div><div class="muted">Healthy bench players projected at least '+UPGRADE_MIN_EDGE.toFixed(1)+' points above a legal starter swap.</div>';
    $("watchList").insertAdjacentElement("afterend",section);
  }
  if($("sundayWatchList")&&!$("sundayUpgradeSection")){
    const section=document.createElement("div");
    section.id="sundayUpgradeSection";
    section.innerHTML='<h2>🔵 Potential Upgrades</h2><div id="sundayUpgradeList" class="stack"></div><div class="muted">League-scored weekly projections • '+UPGRADE_MIN_EDGE.toFixed(1)+'+ point edge • Best Ball and locked games excluded.</div>';
    $("sundayWatchList").insertAdjacentElement("afterend",section);
  }
}

function upgradeCard(x){
  const edge=x.edge.toFixed(1),bench=x.bench,starter=x.starter;
  const button=typeof sleeperLink==="function"?sleeperLink(x.leagueId):"";
  return '<div class="player"><span class="badge">UPGRADE +'+edge+'</span><div class="player-name">Start '+esc(bench.name)+'</div><div class="sub">'+esc(x.league)+'<br>'+esc(bench.pos)+' '+esc(bench.name)+' • '+x.benchProj.toFixed(1)+' proj<br>over '+esc(starter.pos)+' '+esc(starter.name)+' • '+x.starterProj.toFixed(1)+' proj</div>'+button+'</div>';
}

function renderPotentialUpgrades(){
  ensurePotentialUpgradeUI();
  const loading='<div class="muted">Checking weekly projections…</div>';
  const unavailable='<div class="muted">Projection comparison is unavailable right now. Injury and empty-lineup checks still work normally.</div>';
  const none='<div class="muted">✅ No healthy bench player is projected '+UPGRADE_MIN_EDGE.toFixed(1)+'+ points above a legal starter swap.</div>';
  const html=potentialUpgradeProjectionState==="loading"?loading:potentialUpgradeProjectionState==="error"?unavailable:potentialUpgradeData.length?potentialUpgradeData.map(upgradeCard).join(""):none;
  if($("homeUpgradeList"))$("homeUpgradeList").innerHTML=html;
  if($("sundayUpgradeList"))$("sundayUpgradeList").innerHTML=html;

  if(potentialUpgradeProjectionState==="ready"){
    if(potentialUpgradeData.length&&$("sundayAllClear"))$("sundayAllClear").innerHTML="";
    if($("sundaySummary")&&potentialUpgradeData.length){
      $("sundaySummary").textContent+=" "+potentialUpgradeData.length+" projected lineup upgrade"+(potentialUpgradeData.length===1?"":"s")+" found.";
    }
  }
}
