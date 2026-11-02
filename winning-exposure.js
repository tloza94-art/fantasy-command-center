// Most-owned players across the manager's ten winningest Sleeper teams.
(function(){
  let showAll=false;
  const htmlEscape=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  function renderWinningExposure(){
    const container=document.getElementById("winningExposureResults");
    const summary=document.getElementById("winningExposureSummary");
    if(!container||!summary)return;
    if(!S.user){summary.textContent="Load your Sleeper manager to compare winning teams.";container.innerHTML="";return}
    const teams=(S.leagues||[]).map(league=>{
      const roster=(S.rosters?.[league.league_id]||[]).find(r=>String(r.owner_id)===String(S.user.user_id));
      if(!roster)return null;
      const settings=roster.settings||{};
      const wins=Number(settings.wins||0),losses=Number(settings.losses||0),ties=Number(settings.ties||0);
      const games=wins+losses+ties;
      const pf=Number(settings.fpts||0)+Number(settings.fpts_decimal||0)/100;
      return {id:String(league.league_id),name:league.name,wins,losses,ties,winPct:games?(wins+ties*.5)/games:0,pf,roster};
    }).filter(Boolean).sort((a,b)=>b.wins-a.wins||b.winPct-a.winPct||b.pf-a.pf||a.name.localeCompare(b.name)).slice(0,10);
    if(!teams.length){summary.textContent="No league rosters found.";container.innerHTML="";return}
    const players=new Map();
    for(const team of teams){
      const current=(S.rows||[]).filter(r=>String(r.leagueId)===team.id);
      const byId=new Map(current.map(r=>[String(r.id),r]));
      for(const id of new Set(team.roster.players||[])){
        const key=String(id),row=byId.get(key),player=S.players?.[key]||{};
        const name=row?.name||player.full_name||[player.first_name,player.last_name].filter(Boolean).join(" ")||key;
        const pos=row?.pos||player.position||"—";
        if(!players.has(key))players.set(key,{name,pos,team:row?.team||player.team||"",owned:0,starts:0,leagues:[]});
        const p=players.get(key);
        p.owned++;
        if(row?.rosterStatus==="Starter")p.starts++;
        p.leagues.push({name:team.name,starting:row?.rosterStatus==="Starter"});
      }
    }
    const ranked=[...players.values()].sort((a,b)=>b.owned-a.owned||b.starts-a.starts||a.name.localeCompare(b.name));
    summary.textContent="Your "+teams.length+" winningest teams, ranked by wins, then win rate and points for. Ownership counts are limited to these teams.";
    const visible=showAll?ranked:ranked.slice(0,20);
    const teamDetails='<details class="winning-team-details"><summary>See the '+teams.length+' teams included</summary><ol>'+teams.map(t=>'<li><span>'+htmlEscape(t.name)+'</span><strong>'+t.wins+'-'+t.losses+(t.ties?'-'+t.ties:'')+'</strong></li>').join("")+'</ol></details>';
    const playerCards=visible.map((p,index)=>'<div class="player winning-player"><div class="winning-player-heading"><div><span class="winning-rank">#'+(index+1)+'</span><span class="player-name">'+htmlEscape(p.name)+'</span><div class="sub">'+htmlEscape(p.pos)+' • '+htmlEscape(p.team||"FA")+'</div></div><div class="winning-count"><strong>'+p.owned+'/'+teams.length+'</strong><span>Owned</span></div></div><div class="winning-starts">Currently starting in '+p.starts+' of those '+p.owned+' teams</div><details class="winning-player-leagues"><summary>View leagues</summary><div>'+p.leagues.map(l=>'<div>'+htmlEscape(l.name)+(l.starting?'<span>Starter</span>':'')+'</div>').join("")+'</div></details></div>').join("");
    container.innerHTML=teamDetails+'<div class="winning-player-list">'+playerCards+'</div>'+(ranked.length>20?'<button class="winning-show-all" type="button">'+(showAll?"Show top 20":"Show all "+ranked.length+" players")+'</button>':'');
    const button=container.querySelector(".winning-show-all");
    if(button)button.addEventListener("click",()=>{showAll=!showAll;renderWinningExposure()});
  }
  window.renderWinningExposure=renderWinningExposure;
})();
