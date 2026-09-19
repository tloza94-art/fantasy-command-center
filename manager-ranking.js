// FCC Manager Ranking: portfolio-wide league ranking using Sleeper roster stats.
// Uses record first, then season points, current matchup, and actionable lineup health.
// Also adds projected bench-vs-starter upgrade alerts to Home and Sunday Mode.
let managerRankingData=[];
let potentialUpgradeData=[];
let potentialUpgradeProjectionState="idle";
const UPGRADE_MIN_EDGE=2.5;
const rankingBaseLoad=load;
let tffccUpgradeTimer=null;
function schedulePotentialUpgrades(delay=450){
  if(tffccUpgradeTimer)clearTimeout(tffccUpgradeTimer);
  tffccUpgradeTimer=setTimeout(()=>{
    tffccUpgradeTimer=null;
    if(S.user)buildPotentialUpgrades().catch(e=>console.warn("Deferred upgrade scan failed",e));
  },delay);
}
load=async function(){
  await rankingBaseLoad();
  if(!S.user)return;
  // Ranking is cheap and can render immediately. Projection parsing/scanning is
  // deferred so the initial iOS UI becomes interactive first.
  await buildManagerRanking();
  schedulePotentialUpgrades();
};

const TFFCC_DYNASTY_VALUES_API="https://api.statsguyfantasy.com/api/v1/players";
let tffccDynastyValuesCache=null;
let tffccDynastyValuesAt=0;

async function loadDynastyValues(){
  if(tffccDynastyValuesCache&&Date.now()-tffccDynastyValuesAt<12*60*60*1000)return tffccDynastyValuesCache;
  const payload=await get(TFFCC_DYNASTY_VALUES_API);
  const map={};
  (payload?.players||[]).forEach(p=>{if(p?.id)map[String(p.id)]=p});
  if(!Object.keys(map).length)throw Error("No dynasty market values returned");
  tffccDynastyValuesCache={map,valuesAsOf:payload.valuesAsOf||{}};
  tffccDynastyValuesAt=Date.now();
  return tffccDynastyValuesCache;
}

function percentile(value,values){
  const clean=values.filter(Number.isFinite).sort((a,b)=>a-b);
  if(!clean.length)return .5;
  if(clean.length===1)return 1;
  return clean.filter(x=>x<value).length/(clean.length-1);
}

function dynastyFormatForLeague(league){
  return leagueProfile(league)?.superflex?"sf_dynasty":"non_sf_dynasty";
}

function dynastyRosterMetrics(league,valueMap){
  const rows=S.rows.filter(r=>String(r.leagueId)===String(league.league_id)&&r.rosterStatus!=="IR");
  const format=dynastyFormatForLeague(league);
  const assets=rows.map(r=>({row:r,value:Number(valueMap[String(r.id)]?.value?.[format]||0),age:Number(valueMap[String(r.id)]?.age)}));
  const valued=assets.filter(x=>x.value>0);
  const sorted=valued.slice().sort((a,b)=>b.value-a.value);
  const starterCount=Math.max(1,starterSlotsForLeague(league).length);
  // Weight the players who can actually drive a lineup most heavily, while
  // still rewarding useful dynasty depth. This prevents huge benches from
  // automatically winning the roster-value comparison.
  const core=sorted.slice(0,starterCount).reduce((n,x)=>n+x.value,0);
  const depth=sorted.slice(starterCount,starterCount*2).reduce((n,x)=>n+x.value*.35,0);
  const rosterValue=core+depth;
  const youngCore=sorted.slice(0,Math.min(starterCount,8)).filter(x=>Number.isFinite(x.age)&&x.age<=25).reduce((n,x)=>n+x.value,0);
  const topCore=sorted.slice(0,Math.min(starterCount,8)).reduce((n,x)=>n+x.value,0)||1;
  const youthShare=youngCore/topCore;
  const coverage=rows.length?valued.length/rows.length:0;
  return{format,rosterValue,youthShare,coverage,topAssets:sorted.slice(0,3)};
}

async function buildManagerRanking(){
  if(!$("managerRankingList"))return;
  $("managerRankingList").innerHTML='<div class="muted">Calculating dynasty roster strength…</div>';
  let market=null;
  try{market=await loadDynastyValues()}catch(e){console.warn("Dynasty values unavailable",e)}
  const items=S.leagues.map(league=>{
    try{
      const rosters=S.rosters?.[league.league_id]||[];
      const roster=rosters.find(r=>String(r.owner_id)===String(S.user.user_id));
      if(!roster)return null;
      const settings=roster.settings||{};
      const wins=Number(settings.wins||0),losses=Number(settings.losses||0),ties=Number(settings.ties||0);
      const games=wins+losses+ties,winPct=games?((wins+ties*.5)/games):0;
      const pf=Number(settings.fpts||0)+(Number(settings.fpts_decimal||0)/100);
      const lineup=S.lineups.find(x=>String(x.leagueId)===String(league.league_id))||{};
      const starters=S.rows.filter(r=>String(r.leagueId)===String(league.league_id)&&r.rosterStatus==="Starter");
      const mustFix=isBestBallLeague(league)?0:starters.filter(r=>actionableInjury(r)&&must(r)).length+Number(lineup.emptySlots||0);
      const monitor=isBestBallLeague(league)?0:starters.filter(r=>actionableInjury(r)&&watch(r)).length;
      const marketMetrics=market?dynastyRosterMetrics(league,market.map):null;
      return{leagueId:league.league_id,league:league.name,bestBall:isBestBallLeague(league),wins,losses,ties,games,winPct,pf,mustFix,monitor,marketMetrics};
    }catch{return null}
  }).filter(Boolean);
  managerRankingData=items;
  scoreAndRenderManagerRanking(market);
}

function scoreAndRenderManagerRanking(market){
  if(!$("managerRankingList"))return;
  const a=managerRankingData.slice();
  if(!a.length){$("managerRankingList").innerHTML='<div class="muted">No league ranking data available.</div>';return}
  const rosterValues=a.map(x=>x.marketMetrics?.rosterValue).filter(Number.isFinite);
  const pfs=a.map(x=>x.pf);
  a.forEach(x=>{
    const roster=x.marketMetrics?percentile(x.marketMetrics.rosterValue,rosterValues):.5;
    const future=x.marketMetrics?Math.min(1,Math.max(0,x.marketMetrics.youthShare)):.5;
    const contender=(x.winPct*.55)+(percentile(x.pf,pfs)*.45);
    const health=Math.max(0,1-(x.mustFix*.30+x.monitor*.10));
    // Dynasty-first score: market roster value is the anchor. Current-season
    // results matter, but no single weekly matchup affects the ranking.
    x.components={
      roster:Math.round(roster*45),
      future:Math.round(future*20),
      contender:Math.round(contender*25),
      depthHealth:Math.round(health*10)
    };
    x.score=x.components.roster+x.components.future+x.components.contender+x.components.depthHealth;
    x.grade=x.score>=92?"A+":x.score>=88?"A":x.score>=84?"A-":x.score>=80?"B+":x.score>=76?"B":x.score>=72?"B-":x.score>=68?"C+":x.score>=64?"C":x.score>=60?"C-":x.score>=55?"D":"F";
    const c=x.components;
    x.profile=c.future>=16&&c.contender>=18?"Young Contender":c.contender>=19?"Contender":c.future>=16?"Ascending":c.roster>=34?"Strong Core":"Retool";
  });
  a.sort((x,y)=>y.score-x.score||y.components.roster-x.components.roster||y.pf-x.pf);
  const totalWins=a.reduce((n,x)=>n+x.wins,0),avgWin=Math.round(a.reduce((n,x)=>n+x.winPct,0)/a.length*100);
  $("rankedLeagueCount").textContent=a.length;
  $("rankingWins").textContent=totalWins;
  $("rankingWinPct").textContent=avgWin+"%";
  $("rankingBest").textContent=a[0]?.grade||"—";
  $("managerRankingList").innerHTML=a.map((x,i)=>{
    const record=x.wins+"-"+x.losses+(x.ties?"-"+x.ties:"");
    const tags=leagueProfile(x.leagueId)?.formatTags||[];
    const c=x.components;
    const leaders=x.marketMetrics?.topAssets?.map(v=>esc(v.row.name)).join(" • ")||"Market values unavailable";
    const coverage=x.marketMetrics?Math.round(x.marketMetrics.coverage*100):0;
    return '<div class="player ranking-card"><div class="rank-number">#'+(i+1)+'</div><div class="rank-grade">'+x.grade+'<small>'+x.score+'</small></div><div class="rank-main"><div class="player-name">'+esc(x.league)+'</div><div class="sub">'+esc(x.profile)+(tags.length?' • '+esc(tags.join(" / ")):'')+' • Record '+record+' • PF '+formatScore(x.pf)+'</div><details class="rank-breakdown"><summary>Dynasty breakdown</summary><div class="rank-components"><div><span>Roster Strength</span><strong>'+c.roster+' / 45</strong></div><div><span>Future / Youth</span><strong>'+c.future+' / 20</strong></div><div><span>Contender</span><strong>'+c.contender+' / 25</strong></div><div><span>Depth / Health</span><strong>'+c.depthHealth+' / 10</strong></div></div><div class="muted">Core assets: '+leaders+'. Market-value coverage: '+coverage+'%.</div></details></div></div>';
  }).join("");
  if(market){
    const asOf=market.valuesAsOf?.sf_dynasty||market.valuesAsOf?.non_sf_dynasty||"";
    $("managerRankingList").insertAdjacentHTML("afterend",'<div id="dynastyValueCredit" class="muted ranking-note">Dynasty player market values by <a href="https://statsguyfantasy.com" target="_blank" rel="noopener">Stats Guy Fantasy</a>'+(asOf?' • values updated '+esc(new Date(asOf).toLocaleDateString()):'')+'. TFFCC applies league format and its own portfolio scoring.</div>');
  }
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
  const week=Number(S.nflState.week||S.nflState.display_week||1);
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

function eligibleForStarterSlot(positionOrPlayer,slot){
  const positions=Array.isArray(positionOrPlayer?.positions)&&positionOrPlayer.positions.length
    ?positionOrPlayer.positions
    :[typeof positionOrPlayer==="object"?positionOrPlayer?.pos:positionOrPlayer];
  const ps=positions.map(x=>String(x||"").toUpperCase()).filter(Boolean);
  const s=String(slot||"").toUpperCase();
  if(!ps.length||!s)return false;
  const any=allowed=>ps.some(p=>allowed.includes(p));
  if(ps.includes(s))return true;
  if(s==="FLEX"||s==="W/R/T"||s==="RB/WR/TE")return any(["RB","WR","TE"]);
  if(s==="SUPER_FLEX"||s==="SUPERFLEX"||s==="Q/W/R/T"||s==="QB/RB/WR/TE")return any(["QB","RB","WR","TE"]);
  if(s==="WRRB_FLEX"||s==="WR/RB")return any(["WR","RB"]);
  if(s==="REC_FLEX"||s==="WRTE_FLEX"||s==="WR/TE")return any(["WR","TE"]);
  if(s==="DL")return any(["DL","DE","DT","EDGE"]);
  if(s==="DB")return any(["DB","CB","S"]);
  if(s==="IDP_FLEX"||s==="IDP")return any(["DL","DE","DT","EDGE","LB","DB","CB","S"]);
  return false;
}

function lineupCanFit(players,league){
  const slots=starterSlotsForLeague(league);
  if(players.length>slots.length)return false;
  const ordered=players.slice().sort((a,b)=>{
    const ac=slots.filter(s=>eligibleForStarterSlot(a,s)).length;
    const bc=slots.filter(s=>eligibleForStarterSlot(b,s)).length;
    return ac-bc;
  });
  const used=new Array(slots.length).fill(false);
  const place=i=>{
    if(i>=ordered.length)return true;
    for(let j=0;j<slots.length;j++){
      if(used[j]||!eligibleForStarterSlot(ordered[i],slots[j]))continue;
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