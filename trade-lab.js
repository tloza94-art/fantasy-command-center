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
  const assetList=(assets,selected,side)=>assets.map(a=>'<label class="trade-asset"><input type="checkbox" data-side="'+side+'" data-key="'+esc(a.key)+'" '+(selected.has(a.key)?"checked":"")+'><span><strong>'+esc(a.name)+'</strong><small>'+esc(a.position)+'</small></span><em>'+(a.value===null?"Unvalued":Math.round(a.value).toLocaleString())+'</em></label>').join("");
  target.innerHTML='<div class="lab-heading"><strong>Trade Lab</strong><span class="lab-chip">WHAT-IF ONLY</span></div>'+
    '<p class="muted">Build a hypothetical trade with a manager in this league. Nothing is sent to Sleeper.</p>'+
    '<label class="trade-label">Trade partner</label><select id="tradePartner">'+others.map(r=>'<option value="'+esc(r.roster_id)+'" '+(String(r.roster_id)===tradeLab.partnerId?"selected":"")+'>'+esc(tradeRosterName(league,r))+'</option>').join("")+'</select>'+
    '<div class="trade-columns"><div><h3>You send</h3><div class="trade-assets">'+assetList(mineAssets,tradeLab.send,"send")+'</div></div><div><h3>You receive</h3><div class="trade-assets">'+assetList(theirAssets,tradeLab.receive,"receive")+'</div></div></div>'+
    '<div class="trade-result"><div><span>Send value</span><strong>'+Math.round(sent.total).toLocaleString()+'</strong></div><div><span>Receive value</span><strong>'+Math.round(received.total).toLocaleString()+'</strong></div><div><span>Net value</span><strong class="'+(delta>0?"lab-gain":delta<0?"lab-loss":"")+'">'+(delta>0?"+":"")+Math.round(delta).toLocaleString()+'</strong></div></div>'+
    (sent.missing+received.missing?'<p class="muted">⚠️ '+(sent.missing+received.missing)+' selected asset(s) have no market value; the comparison is incomplete.</p>':'')+
    (!tradeLab.market||!tradeLab.pickMarket?'<p class="muted">Market data is unavailable or still loading; unvalued assets are not zero-value assets.</p>':'')+
    '<div class="lab-actions"><button type="button" id="tradeClear">Clear trade</button><button type="button" id="tradeReload" '+(tradeLab.loading?"disabled":"")+'>'+(tradeLab.loading?"Loading…":"Refresh values")+'</button></div>'+
    '<p class="muted">Market value is a reference, not a fairness verdict. This first version does not adjust for roster needs, league-specific scoring premiums, or championship odds.</p>';
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
