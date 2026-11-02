// Top Winning Teams Exposure: compare players owned across the manager's winningest Sleeper teams.
(function(){
  const state={limit:"10",quality:"top15",showAll:false,stats:null,loading:false,error:"",season:null,request:null};
  const positions=new Set(["QB","RB","WR","TE"]);
  async function loadSeasonStats(){
    const season=String(S.nflState?.season||SEASON);
    if(state.season===season&&state.stats)return;
    if(state.request)return state.request;
    state.loading=true;state.error="";render();
    state.request=(async()=>{
      try{
        const raw=await get(API+"/stats/nfl/regular/"+season);
        if(!raw||typeof raw!=="object"||Object.keys(raw).length<50)throw Error("No season stats available");
        const ranks=new Map();
        for(const [id,entry] of Object.entries(raw)){
          const p=S.players?.[id];
          const pos=String(p?.position||p?.fantasy_positions?.[0]||"").toUpperCase();
          if(!positions.has(pos))continue;
          const points=Number(entry?.pts_ppr??entry?.stats?.pts_ppr);
          if(!Number.isFinite(points)||points<=0)continue;
          if(!ranks.has(pos))ranks.set(pos,[]);
          ranks.get(pos).push({id:String(id),points});
        }
        const byId=new Map();
        for(const [pos,entries] of ranks){
          entries.sort((a,b)=>b.points-a.points||a.id.localeCompare(b.id));
          entries.forEach((p,i)=>byId.set(p.id,{points:p.points,pos,rank:i+1}));
        }
        if(!byId.size)throw Error("No fantasy points available");
        state.stats=byId;state.season=season;
      }catch(e){
        state.stats=null;state.error="Season fantasy scoring data is unavailable. Try refreshing later.";
        console.warn("Shared winning players: season stats unavailable",e);
      }finally{state.loading=false;state.request=null;render()}
    })();
    return state.request;
  }
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
    const players=[...map.values()].filter(p=>{
      if(p.leagues.size<2||!state.stats)return false;
      const s=state.stats.get(p.id);
      if(!s)return false;
      if(state.quality==="top15")return s.rank<=15;
      if(state.quality==="top30")return s.rank<=30;
      if(state.quality==="points50")return s.points>=50;
      return s.points>0;
    }).sort((a,b)=>{
      const strength=p=>[...p.leagues].reduce((sum,id)=>{
        const t=teamById.get(id);
        return sum+(t?t.wins+t.winPct*.01:0);
      },0);
      return b.leagues.size-a.leagues.size||(state.stats.get(b.id)?.points||0)-(state.stats.get(a.id)?.points||0)||strength(b)-strength(a)||a.name.localeCompare(b.name);
    });
    const displayed=state.showAll?players:players.slice(0,25);
    const summary=document.getElementById("topWinningExposureSummary");
    if(summary)summary.textContent="Shared by two or more of your top "+chosen.length+" teams • "+(state.quality==="top15"?"top 15 per position":state.quality==="top30"?"top 30 per position":state.quality==="points50"?"50+ PPR points":"scored PPR points")+" • "+(state.season||SEASON)+" season.";
    const teamsTarget=document.getElementById("topWinningTeamsDetail");
    if(teamsTarget)teamsTarget.innerHTML='<summary>See which teams are included</summary><div class="winning-team-list">'+chosen.map((t,i)=>'<div class="winning-team-row"><span>'+(i+1)+'. '+esc(t.name)+'</span><strong>'+t.wins+'-'+t.losses+(t.ties?'-'+t.ties:'')+'</strong></div>').join("")+'</div>';
    if(state.loading){target.innerHTML='<div class="card muted">Checking season fantasy points…</div>';return}
    if(!state.stats){target.innerHTML='<div class="card muted">'+esc(state.error||"Loading season scoring data…")+'</div>';return}
    target.innerHTML=players.length?displayed.map(p=>{
      const leagues=chosen.filter(t=>p.leagues.has(t.id));
      const performance=state.stats.get(p.id);
      return '<div class="player shared-player"><div class="shared-player-top"><div class="player-name">'+esc(p.name)+'</div><strong class="shared-player-count">'+leagues.length+' teams</strong></div><div class="shared-player-points">'+esc(performance.pos)+' #'+performance.rank+' · '+performance.points.toFixed(1)+' PPR pts</div><div class="shared-player-leagues">'+leagues.map(t=>esc(t.name)+' ('+t.wins+'-'+t.losses+(t.ties?'-'+t.ties:'')+')').join(' · ')+'</div></div>';
    }).join(""):'<div class="card muted">No shared players meet this fantasy production filter.</div>';
    const more=document.getElementById("topWinningShowAll");
    if(more){more.hidden=players.length<=25;more.textContent=state.showAll?"Show top 25":"Show all "+players.length+" shared players";}

  }
  document.addEventListener("DOMContentLoaded",()=>{
    const select=document.getElementById("topWinningCount");
    if(select)select.addEventListener("change",()=>{state.limit=select.value;state.showAll=false;render()});
    const quality=document.getElementById("topWinningQuality");
    if(quality)quality.addEventListener("change",()=>{state.quality=quality.value;state.showAll=false;render()});
    const more=document.getElementById("topWinningShowAll");
    if(more)more.addEventListener("click",()=>{state.showAll=!state.showAll;render()});
    render();
  });
  const originalRenderAll=renderAll;
  renderAll=function(){originalRenderAll();render();if(S.user)loadSeasonStats()};
  window.renderTopWinningExposure=render;
})();
