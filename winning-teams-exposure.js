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
    const teamById=new Map(chosen.map(t=>[t.id,t]));
    const map=new Map();
    // Shared roster ownership, regardless of this week's starter/bench designation.
    (S.rows||[]).forEach(r=>{
      const leagueId=String(r.leagueId);
      if(!selectedIds.has(leagueId))return;
      const id=String(r.id);
      if(!map.has(id))map.set(id,{id,name:r.name,pos:r.pos,leagues:new Set()});
      map.get(id).leagues.add(leagueId);
    });
    const players=[...map.values()].filter(p=>p.leagues.size>=2).sort((a,b)=>{
      const strength=p=>[...p.leagues].reduce((sum,id)=>{
        const t=teamById.get(id);
        return sum+(t?t.wins+t.winPct*.01:0);
      },0);
      return b.leagues.size-a.leagues.size||strength(b)-strength(a)||a.name.localeCompare(b.name);
    });
    const displayed=state.showAll?players:players.slice(0,25);
    const summary=document.getElementById("topWinningExposureSummary");
    if(summary)summary.textContent="Players shared by at least two of your top "+chosen.length+" teams. Bench and starter status do not affect this comparison.";
    const teamsTarget=document.getElementById("topWinningTeamsDetail");
    if(teamsTarget)teamsTarget.innerHTML='<summary>See which teams are included</summary><div class="winning-team-list">'+chosen.map((t,i)=>'<div class="winning-team-row"><span>'+(i+1)+'. '+esc(t.name)+'</span><strong>'+t.wins+'-'+t.losses+(t.ties?'-'+t.ties:'')+'</strong></div>').join("")+'</div>';
    target.innerHTML=players.length?displayed.map(p=>{
      const leagues=chosen.filter(t=>p.leagues.has(t.id));
      return '<div class="player shared-player"><div class="shared-player-top"><div class="player-name">'+esc(p.name)+'</div><strong class="shared-player-count">'+leagues.length+' teams</strong></div><div class="shared-player-leagues">'+leagues.map(t=>esc(t.name)+' ('+t.wins+'-'+t.losses+(t.ties?'-'+t.ties:'')+')').join(' · ')+'</div></div>';
    }).join(""):'<div class="card muted">No players are shared by two or more of these teams.</div>';
    const more=document.getElementById("topWinningShowAll");
    if(more){more.hidden=players.length<=25;more.textContent=state.showAll?"Show top 25":"Show all "+players.length+" shared players";}

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
