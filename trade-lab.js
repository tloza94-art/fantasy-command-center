// Trade Lab: a private, in-memory what-if tool. No Sleeper writes.
const tradeLab={leagueId:null,partnerId:"",send:new Set(),receive:new Set(),market:null,pickMarket:null,loading:false,error:""};
function tradeLeague(){return S.leagues.find(l=>String(l.league_id)===String($("leagueSelect")?.value))}
function tradeRosterName(league,roster){
  const user=(S.leagueUsers?.[league.league_id]||[]).find(u=>String(u.user_id)===String(roster.owner_id));
  return user?.metadata?.team_name||user?.display_name||user?.username||"Roster "+roster.roster_id;
}
function tradeAssets(league,roster){
  const format=dynastyFormatForLeague(league);
  const players=(roster.players||[]).map(id=>{
    const p=S.players?.[id]||{};
    const name=p.full_name||((p.first_name||"")+" "+(p.last_name||"")).trim()||String(id);
    const raw=tradeLab.market?.map?.[String(id)]?.value?.[format];
    return{key:"player:"+id,name,position:p.position||"?",value:raw==null?null:Number(raw),type:"player"};
  });
  const picks=ownedFuturePicks(league,roster.roster_id,tradeLab.pickMarket?.map||{}).map(p=>{
    const raw=p.valueCard?.value?.[format];
    return{key:"pick:"+p.year+":"+p.round+":"+p.originalRosterId,name:p.year+" Round "+p.round+" (original roster #"+p.originalRosterId+")",position:"PICK",value:raw==null?null:Number(raw),type:"pick"};
  });
  return [...players,...picks];
}
function tradeSelectedTotal(assets,selected){
  const chosen=assets.filter(a=>selected.has(a.key));
  return{total:chosen.reduce((n,a)=>n+(a.value||0),0),missing:chosen.filter(a=>a.value===null).length,count:chosen.length};
}

function tradeImpact(league,mine,partner,mineAssets,theirAssets){
  const sent=mineAssets.filter(a=>tradeLab.send.has(a.key));
  const received=theirAssets.filter(a=>tradeLab.receive.has(a.key));
  if(!sent.length&&!received.length)return '<div class="trade-impact"><h3>How this affects your team</h3><p class="muted">Select players or picks on either side to preview the impact.</p></div>';
  const playerIds=assets=>assets.filter(a=>a.type==="player").map(a=>a.key.slice(7));
  const outgoing=playerIds(sent),incoming=playerIds(received);
  const beforeIds=(mine.players||[]).map(String);
  const afterIds=beforeIds.filter(id=>!outgoing.includes(id)).concat(incoming);
  const positions=["QB","RB","WR","TE"];
  const positionOf=id=>String(S.players?.[id]?.position||"?").toUpperCase();
  const counts=ids=>Object.fromEntries(positions.map(pos=>[pos,ids.filter(id=>positionOf(id)===pos).length]));
  const beforeCounts=counts(beforeIds),afterCounts=counts(afterIds);
  const positionRows=positions.map(pos=>{
    const diff=afterCounts[pos]-beforeCounts[pos];
    return '<div><span>'+pos+'</span><strong>'+beforeCounts[pos]+' → '+afterCounts[pos]+' <small class="'+(diff>0?"lab-gain":diff<0?"lab-loss":"")+'">'+(diff>0?"+":"")+(diff||"")+'</small></strong></div>';
  }).join("");
  const outgoingPicks=sent.filter(a=>a.type==="pick"),incomingPicks=received.filter(a=>a.type==="pick");
  const originalPicks=ownedFuturePicks(league,mine.roster_id,tradeLab.pickMarket?.map||{});
  const pickKey=p=>"pick:"+p.year+":"+p.round+":"+p.originalRosterId;
  const afterPickCount=originalPicks.length-outgoingPicks.length+incomingPicks.length;
  const firstsBefore=originalPicks.filter(p=>p.round===1).length;
  const firstsAfter=firstsBefore-outgoingPicks.filter(a=>Number(a.key.split(":")[2])===1).length+incomingPicks.filter(a=>Number(a.key.split(":")[2])===1).length;
  const allKnown=[...mineAssets,...theirAssets].filter(a=>a.type==="player");
  const format=dynastyFormatForLeague(league);
  const value=id=>{const v=tradeLab.market?.map?.[id]?.value?.[format];return v==null?null:Number(v)};
  const starterCount=Math.max(1,starterSlotsForLeague(league).length);
  const coreValue=ids=>{
    const vals=ids.map(value).filter(v=>v!==null&&Number.isFinite(v)).sort((a,b)=>b-a);
    return vals.slice(0,starterCount).reduce((n,v)=>n+v,0)+vals.slice(starterCount,starterCount*2).reduce((n,v)=>n+v*.35,0);
  };
  const known=tradeLab.market&&[...outgoing,...incoming].every(id=>value(id)!==null);
  const currentCore=coreValue(beforeIds),nextCore=coreValue(afterIds);
  const delta=nextCore-currentCore;
  const rosters=S.rosters?.[league.league_id]||[];
  let rankText='<p class="muted">League rank preview requires market values.</p>';
  if(known&&rosters.length>1){
    // Compare against the same league, not the user's other portfolios.
    const baseline=rosters.map(r=>({id:String(r.roster_id),score:coreValue((r.players||[]).map(String))}));
    const rank=score=>1+baseline.filter(r=>r.id!==String(mine.roster_id)&&r.score>score).length;
    const before=rank(currentCore),after=rank(nextCore);
    rankText='<div class="trade-rank-change"><span>Roster strength in this league</span><strong>#'+before+' → #'+after+' of '+rosters.length+'</strong></div><small class="muted">Market-value roster ranking only; this does not recalculate season standings or championship probability.</small>';
  }
  const incomplete=[...sent,...received].some(a=>a.value===null);
  return '<div class="trade-impact"><h3>How this affects your team</h3>'+
    '<div class="trade-impact-grid"><div><span>Core roster value</span><strong>'+(known?(delta>0?"+":"")+Math.round(delta).toLocaleString():"Unavailable")+'</strong></div><div><span>Future picks</span><strong>'+originalPicks.length+' → '+afterPickCount+'</strong></div><div><span>Future firsts</span><strong>'+firstsBefore+' → '+firstsAfter+'</strong></div></div>'+
    '<h4>Positional depth</h4><div class="rank-components rank-components-readable">'+positionRows+'</div>'+
    rankText+
    (incomplete?'<p class="muted">Some traded assets lack market values. The value comparison is incomplete.</p>':'')+
    '<p class="muted">This preview assumes the trade is completed; it does not alter Sleeper rosters or automatically change your starting lineup.</p></div>';
}

function tradeReset(){tradeLab.send.clear();tradeLab.receive.clear()}
function tradeRender(){
  const target=$("tradeLab");if(!target)return;
  const league=tradeLeague(),rosters=league?(S.rosters?.[league.league_id]||[]):[];
  const mine=rosters.find(r=>String(r.owner_id)===String(S.user?.user_id));
  if(!mine){target.innerHTML='<div class="muted">Load your profile and select a league to build a trade.</div>';return}
  if(tradeLab.leagueId!==String(league.league_id)){tradeLab.leagueId=String(league.league_id);tradeLab.partnerId="";tradeReset()}
  const others=rosters.filter(r=>String(r.roster_id)!==String(mine.roster_id)&&r.owner_id);
  if(!others.some(r=>String(r.roster_id)===tradeLab.partnerId)){tradeLab.partnerId=String(others[0]?.roster_id||"");tradeReset()}
  const partner=others.find(r=>String(r.roster_id)===tradeLab.partnerId);
  if(!partner){target.innerHTML='<div class="muted">No trade partners available in this league.</div>';return}
  const mineAssets=tradeAssets(league,mine),theirAssets=tradeAssets(league,partner);
  const sent=tradeSelectedTotal(mineAssets,tradeLab.send),received=tradeSelectedTotal(theirAssets,tradeLab.receive);
  const delta=received.total-sent.total;
  const positionOrder=["QB","RB","WR","TE","K","DEF","DL","DE","DT","LB","DB","CB","S","IDP","OTHER","PICK"];
  const assetList=(assets,selected,side)=>{
    const groups={};
    assets.forEach(asset=>{
      const position=asset.type==="pick"?"PICK":String(asset.position||"OTHER").toUpperCase();
      const group=positionOrder.includes(position)?position:"OTHER";
      (groups[group]??=[]).push(asset);
    });
    return positionOrder.filter(group=>groups[group]?.length).map(group=>{
      const sorted=groups[group].sort((a,b)=>{
        if(group==="PICK"){
          const x=a.key.split(":"),y=b.key.split(":");
          return Number(x[1])-Number(y[1])||Number(x[2])-Number(y[2])||Number(x[3])-Number(y[3]);
        }
        if(a.value===null)return b.value===null?a.name.localeCompare(b.name):1;
        if(b.value===null)return -1;
        return b.value-a.value||a.name.localeCompare(b.name);
      });
      return '<div class="trade-position-group"><div class="trade-position-heading">'+esc(group==="PICK"?"DRAFT PICKS":group)+' <span>'+sorted.length+'</span></div>'+
        sorted.map(asset=>'<label class="trade-asset"><input type="checkbox" data-side="'+side+'" data-key="'+esc(asset.key)+'" '+(selected.has(asset.key)?"checked":"")+'><span><strong>'+esc(asset.name)+'</strong><small>'+esc(asset.position)+'</small></span><em>'+(asset.value===null?"Unvalued":Math.round(asset.value).toLocaleString())+'</em></label>').join("")+'</div>';
    }).join("");
  };
  const scrollPositions=[...target.querySelectorAll('.trade-assets')].map(el=>el.scrollTop);
  target.innerHTML='<div class="lab-heading"><strong>Trade Lab</strong><span class="lab-chip">WHAT-IF ONLY</span></div>'+
    '<p class="muted">Build a hypothetical trade with a manager in this league. Nothing is sent to Sleeper.</p>'+
    '<label class="trade-label">Trade partner</label><select id="tradePartner">'+others.map(r=>'<option value="'+esc(r.roster_id)+'" '+(String(r.roster_id)===tradeLab.partnerId?"selected":"")+'>'+esc(tradeRosterName(league,r))+'</option>').join("")+'</select>'+
    '<div class="trade-columns"><div><h3>You send</h3><div class="trade-assets">'+assetList(mineAssets,tradeLab.send,"send")+'</div></div><div><h3>You receive</h3><div class="trade-assets">'+assetList(theirAssets,tradeLab.receive,"receive")+'</div></div></div>'+
    '<div class="trade-result"><div><span>Send value</span><strong>'+Math.round(sent.total).toLocaleString()+'</strong></div><div><span>Receive value</span><strong>'+Math.round(received.total).toLocaleString()+'</strong></div><div><span>Net value</span><strong class="'+(delta>0?"lab-gain":delta<0?"lab-loss":"")+'">'+(delta>0?"+":"")+Math.round(delta).toLocaleString()+'</strong></div></div>'+
    (sent.missing+received.missing?'<p class="muted">⚠️ '+(sent.missing+received.missing)+' selected asset(s) have no market value; the comparison is incomplete.</p>':'')+
    (!tradeLab.market||!tradeLab.pickMarket?'<p class="muted">Market data is unavailable or still loading; unvalued assets are not zero-value assets.</p>':'')+
    tradeImpact(league,mine,partner,mineAssets,theirAssets)+
    '<div class="lab-actions"><button type="button" id="tradeClear">Clear trade</button><button type="button" id="tradeReload" '+(tradeLab.loading?"disabled":"")+'>'+(tradeLab.loading?"Loading…":"Refresh values")+'</button></div>'+
    '<p class="muted">Market value is a reference, not a fairness verdict. This first version does not adjust for roster needs, league-specific scoring premiums, or championship odds.</p>';
  target.querySelectorAll(".trade-assets").forEach((el,i)=>{el.scrollTop=scrollPositions[i]||0});
  $("tradePartner").onchange=e=>{tradeLab.partnerId=e.target.value;tradeReset();tradeRender()};
  target.querySelectorAll(".trade-asset input").forEach(input=>input.onchange=()=>{
    const selected=input.dataset.side==="send"?tradeLab.send:tradeLab.receive;
    if(input.checked)selected.add(input.dataset.key);else selected.delete(input.dataset.key);
    tradeRender();
  });
  $("tradeClear").onclick=()=>{tradeReset();tradeRender()};
  $("tradeReload").onclick=tradeLoadValues;
}
async function tradeLoadValues(){
  if(tradeLab.loading)return;
  tradeLab.loading=true;tradeRender();
  const results=await Promise.allSettled([loadDynastyValues(),loadDynastyPickValues()]);
  tradeLab.market=results[0].status==="fulfilled"?results[0].value:null;
  tradeLab.pickMarket=results[1].status==="fulfilled"?results[1].value:null;
  tradeLab.loading=false;tradeRender();
}
function tradeSetMode(mode){
  const trade=mode==="trade";
  $("tradeLab").hidden=!trade;
  $("lineupLab").hidden=trade;
  $("teamRoster").hidden=trade;
  document.querySelectorAll("[data-team-mode]").forEach(b=>{b.classList.toggle("selected",b.dataset.teamMode===mode);b.setAttribute("aria-pressed",String(b.dataset.teamMode===mode))});
  if(trade){tradeRender();if(!tradeLab.market&&!tradeLab.loading)tradeLoadValues()}
}
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll("[data-team-mode]").forEach(b=>b.onclick=()=>tradeSetMode(b.dataset.teamMode));
  $("leagueSelect").addEventListener("change",()=>{tradeReset();tradeLab.leagueId=null;tradeRender()});
  $("loadBtn").addEventListener("click",()=>{tradeLab.leagueId=null;tradeLab.partnerId="";tradeReset();tradeLab.market=null;tradeLab.pickMarket=null});
  document.querySelector('[data-view="teamsView"]').addEventListener("click",()=>{if(!$("tradeLab").hidden)tradeRender()});
});
