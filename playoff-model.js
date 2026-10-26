
/* v54: Schedule-adjusted Sleeper playoff model. All percentages are simulation estimates. */
(function(){
 const iterations=1600;
 const randn=()=>Math.sqrt(-2*Math.log(Math.max(1e-10,Math.random())))*Math.cos(2*Math.PI*Math.random());
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const pct=v=>(100*v).toFixed(1)+"%";
 function standings(league){
  return (S.rosters[league.league_id]||[]).map(r=>({id:Number(r.roster_id),wins:Number(r.settings?.wins||0),ties:Number(r.settings?.ties||0),pf:Number(r.settings?.fpts||0)+Number(r.settings?.fpts_decimal||0)/100}));
 }
 async function estimate(league){
  const week=Number(S.nflState?.week||S.nflState?.display_week||1);
  const start=Number(league.settings?.playoff_week_start);
  const slots=Number(league.settings?.playoff_teams);
  const teams=standings(league),n=teams.length;
  if(!Number.isInteger(start)||start<=week||!Number.isInteger(slots)||slots<2||slots>n)return null;
  const mine=(S.rosters[league.league_id]||[]).find(r=>String(r.owner_id)===String(S.user?.user_id));
  if(!mine)return null;
  const all=await Promise.all(Array.from({length:start-1},(_,i)=>i+1).map(w=>
   w===week?Promise.resolve(S.matchups[league.league_id]||[]):get(API+"/league/"+league.league_id+"/matchups/"+w).catch(()=>[])
  ));
  const past=all.slice(0,Math.max(0,week-1)),future=all.slice(Math.max(0,week-1));
  const history=new Map(teams.map(t=>[t.id,[]]));
  const pa=new Map(teams.map(t=>[t.id,0]));
  const opponentCounts=new Map(teams.map(t=>[t.id,0]));
  let completeWeeks=0;
  past.forEach(entries=>{
   const byGame=new Map();
   entries.forEach(e=>{
    const id=Number(e.roster_id),points=Number(e.points);
    if(!history.has(id)||!Number.isFinite(points))return;
    history.get(id).push(points);
    const key=String(e.matchup_id);
    if(e.matchup_id!==null&&e.matchup_id!==undefined){
      if(!byGame.has(key))byGame.set(key,[]);
      byGame.get(key).push({id,points});
    }
   });
   byGame.forEach(pair=>{
    if(pair.length!==2)return;
    for(const [a,b] of [[pair[0],pair[1]],[pair[1],pair[0]]]){
      pa.set(a.id,pa.get(a.id)+b.points);
      opponentCounts.set(a.id,opponentCounts.get(a.id)+1);
    }
   });
   completeWeeks++;
  });
  const allScores=[...history.values()].flat();
  if(allScores.length<n*2)return null;
  const leagueMean=allScores.reduce((a,b)=>a+b,0)/allScores.length;
  const leagueVariance=allScores.reduce((a,b)=>a+(b-leagueMean)**2,0)/allScores.length;
  const leagueSd=Math.sqrt(leagueVariance);
  const skills=new Map(teams.map(t=>{
    const values=history.get(t.id),avg=values.length?values.reduce((a,b)=>a+b,0)/values.length:leagueMean;
    const shrunk=(avg*values.length+leagueMean*3)/(values.length+3);
    const variance=values.length>1?values.reduce((a,b)=>a+(b-avg)**2,0)/values.length:leagueVariance;
    return[t.id,{mean:shrunk,sd:clamp(Math.sqrt((variance+leagueVariance)/2),Math.max(10,leagueMean*.10),Math.max(25,leagueMean*.32))}];
  }));
  const scheduled=future.map(entries=>{
    const grouped=new Map();
    entries.forEach(e=>{
      if(e.matchup_id===null||e.matchup_id===undefined)return;
      const k=String(e.matchup_id);
      if(!grouped.has(k))grouped.set(k,[]);
      grouped.get(k).push(Number(e.roster_id));
    });
    return [...grouped.values()].filter(pair=>pair.length===2&&pair.every(id=>skills.has(id)));
  });
  const scheduleCoverage=scheduled.reduce((a,p)=>a+p.length,0);
  if(!scheduleCoverage)return null;
  const score=id=>Math.max(0,skills.get(id).mean+randn()*skills.get(id).sd);
  const compare=(a,b)=>b.wins-a.wins||b.pf-a.pf;
  let playoffs=0,titles=0;
  const mineId=Number(mine.roster_id);
  for(let run=0;run<iterations;run++){
    const sim=teams.map(t=>({...t})),byId=new Map(sim.map(t=>[t.id,t]));
    scheduled.forEach(pairs=>pairs.forEach(([a,b])=>{
      const x=score(a),y=score(b),ta=byId.get(a),tb=byId.get(b);
      ta.pf+=x;tb.pf+=y;
      if(x>y)ta.wins++;else if(y>x)tb.wins++;else{ta.ties++;tb.ties++}
    }));
    sim.sort(compare);
    const qualified=sim.slice(0,slots).map(t=>t.id);
    if(!qualified.includes(mineId))continue;
    playoffs++;
    // Approximate seeded bracket with top seeds receiving first-round byes.
    let alive=qualified;
    const rounds=Math.ceil(Math.log2(slots));
    for(let round=0;round<rounds&&alive.length>1;round++){
      const byes=Math.max(0,2**Math.ceil(Math.log2(alive.length))-alive.length);
      const byeCount=round===0?Math.min(byes,alive.length):0;
      const survivors=alive.slice(0,byeCount);
      const remaining=alive.slice(byeCount);
      for(let i=0;i<Math.floor(remaining.length/2);i++){
        const a=remaining[i],b=remaining[remaining.length-1-i];
        survivors.push(score(a)>=score(b)?a:b);
      }
      alive=survivors.sort((a,b)=>qualified.indexOf(a)-qualified.indexOf(b));
    }
    if(alive[0]===mineId)titles++;
  }
  const own=history.get(mineId),pf=own.reduce((a,b)=>a+b,0);
  const games=opponentCounts.get(mineId),allowed=pa.get(mineId);
  const allPA=teams.map(t=>({id:t.id,pa:pa.get(t.id)/Math.max(1,opponentCounts.get(t.id))})).sort((a,b)=>a.pa-b.pa);
  const paRank=allPA.findIndex(t=>t.id===mineId)+1;
  const ownAvg=pf/Math.max(1,own.length),paAvg=allowed/Math.max(1,games);
  return{playoffs:playoffs/iterations,title:titles/iterations,pf,pa:allowed,pfAvg:ownAvg,paAvg,paRank,teams:n,weekCount:completeWeeks,scheduleWeeks:scheduled.length,expectedWeeks:start-week,leagueMean,adjustedMean:skills.get(mineId).mean};
 }
 async function refresh(){
  if(!S.user||!S.leagues?.length)return;
  const token=S.user.user_id+"-"+(S.nflState?.week||"");
  if(refresh.token===token&&refresh.running)return;
  refresh.token=token;refresh.running=true;
  const leagues=S.leagues.slice();
  for(let i=0;i<leagues.length;i+=3){
   await Promise.all(leagues.slice(i,i+3).map(async l=>{
    try{
      const result=await estimate(l);
      const row=managerRankingData.find(x=>String(x.leagueId)===String(l.league_id));
      if(row&&result){row.playoffModel=result;scoreAndRenderManagerRanking(null)}
    }catch(e){console.warn("Playoff model unavailable",l.name,e)}
   }));
  }
  refresh.running=false;
 }
 window.tffccRefreshPlayoffOdds=refresh;
 const original=window.buildManagerRanking;
 window.buildManagerRanking=async function(){await original();refresh().catch(console.warn)};
})();
