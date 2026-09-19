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
let tffccPickValuesCache=null;
let tffccPickValuesAt=0;

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

async function loadDynastyPickValues(){
  if(tffccPickValuesCache&&Date.now()-tffccPickValuesAt<12*60*60*1000)return tffccPickValuesCache;
  const payload=await get("https://api.statsguyfantasy.com/api/v1/picks");
  const map={};
  (payload?.picks||[]).forEach(p=>{if(p?.id)map[String(p.id)]=p});
  tffccPickValuesCache={map,valuesAsOf:payload.valuesAsOf||{}};
  tffccPickValuesAt=Date.now();
  return tffccPickValuesCache;
}

function pickRoundsForLeague(league){
  const rounds=Number(league?.settings?.draft_rounds||league?.settings?.rookie_draft_rounds||5);
  return Math.max(1,Math.min(10,Number.isFinite(rounds)?rounds:5));
}

function ownedFuturePicks(league,rosterId,pickMap){
  const currentYear=Number(S.nflState?.season||SEASON);
  const years=[currentYear+1,currentYear+2,currentYear+3];
  const rounds=pickRoundsForLeague(league);
  const traded=S.tradedPicks?.[league.league_id]||[];
  const rosterIds=(S.rosters?.[league.league_id]||[]).map(r=>Number(r.roster_id)).filter(Number.isFinite);
  const owned=[];
  years.forEach(year=>{
    for(let round=1;round<=rounds;round++){
      rosterIds.forEach(originalRosterId=>{
        const move=traded.find(p=>Number(p.season)===year&&Number(p.round)===round&&Number(p.roster_id)===originalRosterId);
        const owner=move?Number(move.owner_id):originalRosterId;
        if(owner!==Number(rosterId))return;
        const id="pick:"+year+":"+round;
        // /picks exposes early/mid/late variants for future classes. Use the
        // mid card as the neutral unknown-slot estimate when a bare round card
        // is not included in the bulk response.
        const card=pickMap?.[id]||pickMap?.[id+":mid"]||null;
        owned.push({id,year,round,originalRosterId,valueCard:card});
      });
    }
  });
  return owned;
}

function draftCapitalMetrics(league,rosterId,pickMap,format){
  const picks=ownedFuturePicks(league,rosterId,pickMap);
  let total=0,firsts=0;
  picks.forEach(p=>{
    const value=Number(p.valueCard?.value?.[format]||0);
    total+=value;
    if(p.round===1)firsts++;
  });
  return{picks,total,firsts};
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

function portfolioRank(value,values){
  const sorted=values.filter(Number.isFinite).sort((a,b)=>b-a);
  const i=sorted.findIndex(v=>v===value);
  return i<0?null:i+1;
}
function strengthLabel(rank,total){
  if(!rank||!total)return "Unavailable";
  const p=(rank-1)/Math.max(total-1,1);
  return p<=.15?"Elite":p<=.35?"Strong":p<=.65?"Average":p<=.85?"Below Average":"Weak";
}

function rosterDynastyMetrics(league,roster,valueMap,pickMap){
  const format=dynastyFormatForLeague(league);
  const reserve=new Set(roster?.reserve||[]);
  const ids=(roster?.players||[]).filter(id=>!reserve.has(id));
  const assets=ids.map(id=>{
    const p=S.players?.[id]||{};
    return{
      id:String(id),
      name:p.full_name||((p.first_name||"")+" "+(p.last_name||"")).trim()||String(id),
      value:Number(valueMap?.[String(id)]?.value?.[format]||0),
      age:Number(valueMap?.[String(id)]?.age)
    };
  });
  const valued=assets.filter(x=>x.value>0).sort((a,b)=>b.value-a.value);
  const starterCount=Math.max(1,starterSlotsForLeague(league).length);
  const core=valued.slice(0,starterCount).reduce((n,x)=>n+x.value,0);
  const depth=valued.slice(starterCount,starterCount*2).reduce((n,x)=>n+x.value*.35,0);
  const rosterValue=core+depth;
  const youngCore=valued.slice(0,Math.min(starterCount,8)).filter(x=>Number.isFinite(x.age)&&x.age<=25).reduce((n,x)=>n+x.value,0);
  const topCore=valued.slice(0,Math.min(starterCount,8)).reduce((n,x)=>n+x.value,0)||1;
  const youthShare=youngCore/topCore;
  const coverage=ids.length?valued.length/ids.length:0;
  const pickMetrics=pickMap?draftCapitalMetrics(league,roster.roster_id,pickMap,format):null;

  const settings=roster.settings||{};
  const wins=Number(settings.wins||0),losses=Number(settings.losses||0),ties=Number(settings.ties||0);
  const games=wins+losses+ties;
  const winPct=games?((wins+ties*.5)/games):0;
  const pf=Number(settings.fpts||0)+(Number(settings.fpts_decimal||0)/100);

  const starterIds=(roster.starters||[]).filter(Boolean).filter(id=>id!=="0");
  let mustFix=(roster.starters||[]).filter(id=>!id||id==="0").length,monitor=0;
  if(!isBestBallLeague(league)){
    starterIds.forEach(id=>{
      const p=S.players?.[id]||{};
      const injury=norm(p.injury_status),status=norm(p.status);
      if(["o","out","ir","injured reserve","pup","susp","suspended"].includes(injury)||status==="inactive")mustFix++;
      else if(["q","questionable","d","doubtful"].includes(injury))monitor++;
    });
  }else{mustFix=0;monitor=0}
  const health=Math.max(0,1-(mustFix*.30+monitor*.10));

  return{rosterValue,youthShare,coverage,topAssets:valued.slice(0,3),pickMetrics,wins,losses,ties,winPct,pf,health,mustFix,monitor};
}

function outlookLabel(rank,total){
  if(rank===1)return "Front Runner";
  const p=(rank-1)/Math.max(total-1,1);
  return p<=.25?"Contender":p<=.5?"In the Mix":p<=.75?"Chasing":"Long Shot";
}

function buildLeaguePowerBoard(league,valueMap,pickMap){
  const rosters=(S.rosters?.[league.league_id]||[]).filter(r=>r&&r.roster_id!==undefined&&r.roster_id!==null);
  const teams=rosters.map(roster=>({roster,metrics:rosterDynastyMetrics(league,roster,valueMap,pickMap)}));
  if(!teams.length)return[];

  const rosterValues=teams.map(t=>t.metrics.rosterValue);
  const pickValues=teams.map(t=>t.metrics.pickMetrics?.total||0);
  const pfs=teams.map(t=>t.metrics.pf);
  teams.forEach(t=>{
    const m=t.metrics;
    const rosterPct=percentile(m.rosterValue,rosterValues);
    const capitalPct=percentile(m.pickMetrics?.total||0,pickValues);
    const future=(Math.min(1,Math.max(0,m.youthShare))*.55)+(capitalPct*.45);
    const season=(m.winPct*.55)+(percentile(m.pf,pfs)*.45);
    const dynasty=(rosterPct*.45)+(future*.20)+(season*.25)+(m.health*.10);
    const title=(rosterPct*.55)+(season*.35)+(m.health*.10);
    Object.assign(t,{rosterPct,future,season,health:m.health,dynasty,title});
  });

  const rankOf=(team,key)=>{
    const sorted=teams.slice().sort((a,b)=>b[key]-a[key]||b.metrics.pf-a.metrics.pf);
    return sorted.findIndex(t=>Number(t.roster.roster_id)===Number(team.roster.roster_id))+1;
  };
  teams.forEach(t=>{
    t.ranks={
      league:rankOf(t,"dynasty"),
      title:rankOf(t,"title"),
      roster:rankOf(t,"rosterPct"),
      future:rankOf(t,"future"),
      season:rankOf(t,"season"),
      health:rankOf(t,"health")
    };
  });
  return teams;
}

async function buildManagerRanking(){
  if(!$("managerRankingList"))return;
  $("managerRankingList").innerHTML='<div class="muted">Comparing your teams against each league…</div>';
  let market=null,pickMarket=null;
  try{[market,pickMarket]=await Promise.all([loadDynastyValues(),loadDynastyPickValues()])}catch(e){console.warn("Dynasty values unavailable",e)}
  const items=[];
  S.leagues.forEach(league=>{
    try{
      const board=buildLeaguePowerBoard(league,market?.map||{},pickMarket?.map||{});
      const mine=board.find(t=>String(t.roster.owner_id)===String(S.user.user_id));
      if(!mine)return;
      const m=mine.metrics,total=board.length;
      items.push({
        leagueId:league.league_id,
        league:league.name,
        bestBall:isBestBallLeague(league),
        totalTeams:total,
        ranks:mine.ranks,
        dynastyScore:mine.dynasty,
        titleScore:mine.title,
        outlook:outlookLabel(mine.ranks.title,total),
        wins:m.wins,losses:m.losses,ties:m.ties,winPct:m.winPct,pf:m.pf,
        marketMetrics:m,
        pickMetrics:m.pickMetrics
      });
    }catch(e){console.warn("League power board failed",league?.name,e)}
  });
  managerRankingData=items;
  scoreAndRenderManagerRanking(market);
}

function scoreAndRenderManagerRanking(market){
  if(!$("managerRankingList"))return;
  const a=managerRankingData.slice();
  if(!a.length){$("managerRankingList").innerHTML='<div class="muted">No league ranking data available.</div>';return}
  // Keep the list useful as a portfolio dashboard by ordering it by title
  // outlook, but every visible rank is against the managers inside that league.
  a.sort((x,y)=>y.titleScore-x.titleScore||x.ranks.title-y.ranks.title||x.ranks.league-y.ranks.league);

  const totalWins=a.reduce((n,x)=>n+x.wins,0),avgWin=Math.round(a.reduce((n,x)=>n+x.winPct,0)/a.length*100);
  const best=a.slice().sort((x,y)=>x.ranks.title-y.ranks.title||y.titleScore-x.titleScore)[0];
  $("rankedLeagueCount").textContent=a.length;
  $("rankingWins").textContent=totalWins;
  $("rankingWinPct").textContent=avgWin+"%";
  $("rankingBest").textContent=best?"#"+best.ranks.title+" / "+best.totalTeams:"—";

  $("managerRankingList").innerHTML=a.map(x=>{
    const record=x.wins+"-"+x.losses+(x.ties?"-"+x.ties:"");
    const tags=leagueProfile(x.leagueId)?.formatTags||[];
    const r=x.ranks,total=x.totalTeams;
    const leaders=x.marketMetrics?.topAssets?.map(v=>esc(v.name)).join(" • ")||"Market values unavailable";
    const coverage=x.marketMetrics?Math.round(x.marketMetrics.coverage*100):0;
    const picks=x.pickMetrics?.picks||[];
    const pickSummary=picks.length?(picks.length+" future picks • "+x.pickMetrics.firsts+" first"+(x.pickMetrics.firsts===1?"":"s")):"No future picks detected";
    const component=(label,key)=>'<div><span>'+label+'</span><strong>#'+r[key]+' of '+total+' • '+strengthLabel(r[key],total)+'</strong></div>';
    const zoneClass=x.outlook==="Front Runner"?"outlook-front":x.outlook==="Contender"?"outlook-contender":x.outlook==="In the Mix"?"outlook-mix":"outlook-chasing";
    return '<div class="player ranking-card league-ranking-card"><div class="league-rank"><span>LEAGUE POWER</span><strong>#'+r.league+'</strong><small>of '+total+'</small></div><div class="rank-main"><div class="ranking-title-row"><div class="player-name">'+esc(x.league)+'</div><span class="outlook-pill '+zoneClass+'">'+esc(x.outlook)+'</span></div><div class="sub">'+(tags.length?esc(tags.join(" / "))+' • ':'')+'Record '+record+' • PF '+formatScore(x.pf)+'</div><div class="title-outlook-row"><span>Title Outlook</span><strong>#'+r.title+' of '+total+'</strong></div><details class="rank-breakdown"><summary>League breakdown</summary><div class="rank-components rank-components-readable">'+component("Roster","roster")+component("Future / Picks","future")+component("Season Form","season")+component("Depth / Health","health")+'</div><div class="muted">Draft capital: '+esc(pickSummary)+'.<br>Core assets: '+leaders+'. Market-value coverage: '+coverage+'%.</div></details></div></div>';
  }).join("");

  const oldCredit=$("dynastyValueCredit");
  if(oldCredit)oldCredit.remove();
  if(market){
    const asOf=market.valuesAsOf?.sf_dynasty||market.valuesAsOf?.non_sf_dynasty||"";
    $("managerRankingList").insertAdjacentHTML("afterend",'<div id="dynastyValueCredit" class="muted ranking-note">Dynasty player market values by <a href="https://statsguyfantasy.com" target="_blank" rel="noopener">Stats Guy Fantasy</a>'+(asOf?' • values updated '+esc(new Date(asOf).toLocaleDateString()):'')+'. League Power compares your roster against every team inside that league; Title Outlook emphasizes roster strength, season form, and lineup health.</div>');
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