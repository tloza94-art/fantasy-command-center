// FCC Manager Ranking: portfolio-wide league ranking using Sleeper roster stats.
// Uses record first, then season points, current matchup, and actionable lineup health.
let managerRankingData=[];
const rankingBaseLoad=load;
load=async function(){
  await rankingBaseLoad();
  if(!S.user)return;
  await buildManagerRanking();
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
