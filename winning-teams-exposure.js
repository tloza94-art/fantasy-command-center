// Top Winning Teams Exposure: compare players owned across the manager's winningest Sleeper teams.
(function(){
  const state={limit:"10",showAll:false};
  function winningTeams(){
    if(!S.user)return[];
    return (S.leagues||[]).map(league=>{
      const roster=(S.rosters?.[league.league_id]||[]).find(r=>String(r.owner_id)===String(S.user.user_id));
      if(!roster)return null;
      const settings=roster.settings||{};
      const wins=Number(settings.wins||0),losses=Number(settings.losses||0),ties=Number(settings.ties||0);
      const games=wins+losses+ties;
      const pf=Number(settings.fpts||0)+Number(settings.fpts_decimal||0)/100;
      return {id:String(league.league_id),name:league.name||"Unnamed league",wins,losses,ties,winPct:games?(wins+ties*.5)/games:0,pf};
    }).filter(Boolean).sort((a,b)=>b.wins-a.wins||b.winPct-a.winPct||b.pf-a.pf||a.name.localeCompare(b.name));
  }
  function render(){
    const target=document.getElementById("topWinningExposureList");
    if(!target)return;
    const all=winningTeams();
    if(!all.length){
      target.innerHTML='<div class="card muted">Load your Sleeper profile to compare player ownership across your winningest teams.</div>';
      return;
    }
    const limit=state.limit==="all"?all.length:Number(state.limit);
    const chosen=all.slice(0,limit);
    const selectedIds=new Set(chosen.map(t=>t.id));
    const names=new Map(chosen.map(t=>[t.id,t.name]));
    const map=new Map();
    (S.rows||[]).forEach(r=>{
      const leagueId=String(r.leagueId);
      if(!selectedIds.has(leagueId)||r.rosterStatus!=="Starter")return;
      const id=String(r.id);
      if(!map.has(id))map.set(id,{id,name:r.name,pos:r.pos,team:r.team,leagues:new Set(),starts:new Set()});
      const item=map.get(id);
      item.leagues.add(leagueId);
      if(r.rosterStatus==="Starter")item.starts.add(leagueId);
    });
    const players=[...map.values()].sort((a,b)=>b.starts.size-a.starts.size||a.name.localeCompare(b.name));
    const displayed=state.showAll?players:players.slice(0,25);
    const summary=document.getElementById("topWinningExposureSummary");
    if(summary)summary.textContent="Analyzing "+chosen.length+" of "+all.length+" teams • ranked by wins, then win percentage and points for. Only current starters are included, sorted by number of starting teams.";
    const teamsTarget=document.getElementById("topWinningTeamsDetail");
    if(teamsTarget)teamsTarget.innerHTML='<summary>View selected teams and records</summary><div class="winning-team-list">'+chosen.map((t,i)=>'<div class="winning-team-row"><span>'+(i+1)+'. '+esc(t.name)+'</span><strong>'+t.wins+'-'+t.losses+(t.ties?'-'+t.ties:'')+'</strong></div>').join("")+'</div>';
    target.innerHTML=players.length?displayed.map((p,i)=>{
      const count=p.leagues.size,starts=p.starts.size;
      const leagues=[...p.leagues].map(id=>({name:names.get(id)||id,starter:p.starts.has(id)})).sort((a,b)=>a.name.localeCompare(b.name));
      return '<div class="player winning-player"><div class="winning-player-head"><div><div class="player-name">'+esc(p.name)+'</div><div class="sub">'+esc(p.pos||"")+' • '+esc(p.team||"FA")+'</div></div><div class="winning-owned"><strong>'+count+' / '+chosen.length+'</strong><span>teams starting</span></div></div><div class="winning-starts">Starting in '+starts+' of '+count+' owned teams • '+Math.round(count/chosen.length*100)+'% exposure</div><details><summary>See leagues</summary><div class="winning-leagues">'+leagues.map(t=>'<div><span>'+esc(t.name)+'</span><small>'+ (t.starter?"Starter":"Not starting")+'</small></div>').join("")+'</div></details></div>';
    }).join(""):'<div class="card muted">No current starters found in the selected teams.</div>';
    const more=document.getElementById("topWinningShowAll");
    if(more){more.hidden=players.length<=25;more.textContent=state.showAll?"Show top 25":"Show all "+players.length+" players";}
  }
  document.addEventListener("DOMContentLoaded",()=>{
    const select=document.getElementById("topWinningCount");
    if(select)select.addEventListener("change",()=>{state.limit=select.value;state.showAll=false;render()});
    const more=document.getElementById("topWinningShowAll");
    if(more)more.addEventListener("click",()=>{state.showAll=!state.showAll;render()});
    render();
  });
  const originalRenderAll=renderAll;
  renderAll=function(){originalRenderAll();render()};
  window.renderTopWinningExposure=render;
})();
