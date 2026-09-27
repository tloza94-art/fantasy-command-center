// Read-only what-if lineup planner. Never writes to Sleeper or persists a manager.
const lineupLab={leagueId:null,starters:null,projections:null,loading:false,error:""};
const lineupLabBaseRenderTeam=renderTeam;
renderTeam=function(){
  lineupLabBaseRenderTeam();
  renderLineupLab();
};
function labLeague(){return S.leagues.find(l=>String(l.league_id)===String($("leagueSelect")?.value))}
function labRoster(league){return(S.rosters?.[league.league_id]||[]).find(r=>String(r.owner_id)===String(S.user?.user_id))}
function labPlayer(id){
  const p=S.players?.[id]||{};
  const positions=(p.fantasy_positions||[]).map(v=>String(v).toUpperCase());
  if(p.position&&!positions.includes(String(p.position).toUpperCase()))positions.unshift(String(p.position).toUpperCase());
  return{id:String(id),name:p.full_name||((p.first_name||"")+" "+(p.last_name||"")).trim()||String(id),pos:p.position||positions[0]||"?",positions,team:p.team||"FA",injury:p.injury_status||"",status:p.status||""};
}
function labEligible(id,slot){return eligibleForStarterSlot(labPlayer(id),slot)}
function labLocked(id){
  const p=labPlayer(id);
  return !!S.gameStates?.[normalizeTeam(p.team)]?.started;
}
function labInitial(league,roster){
  const slots=starterSlotsForLeague(league);
  const original=roster.starters||[];
  return slots.map((slot,i)=>original[i]&&original[i]!=="0"?String(original[i]):"");
}
function labCurrent(league,roster){
  if(lineupLab.leagueId!==String(league.league_id)){
    lineupLab.leagueId=String(league.league_id);
    lineupLab.starters=labInitial(league,roster);
    lineupLab.error="";
  }
  return lineupLab.starters;
}
function labLegal(lineup,league){
  const slots=starterSlotsForLeague(league);
  return lineup.length===slots.length&&lineup.every((id,i)=>!id||labEligible(id,slots[i]))&&new Set(lineup.filter(Boolean)).size===lineup.filter(Boolean).length;
}
function labProjected(id,league){
  if(!id||!lineupLab.projections)return null;
  return projectedPoints(id,league,lineupLab.projections);
}
function labSum(ids,league){
  const values=ids.filter(Boolean).map(id=>labProjected(id,league));
  if(!values.length||values.some(v=>v===null))return null;
  return values.reduce((a,b)=>a+b,0);
}
function labOptions(league,roster,slotIndex){
  const lineup=labCurrent(league,roster),slot=starterSlotsForLeague(league)[slotIndex];
  const original=labInitial(league,roster);
  const current=lineup[slotIndex];
  const locked=original[slotIndex]&&labLocked(original[slotIndex]);
  if(locked)return [{id:current,label:labPlayer(current).name+" (locked)"}];
  const reserved=new Set(roster.reserve||[]),taxi=new Set(roster.taxi||[]);
  const available=(roster.players||[]).map(String).filter(id=>!reserved.has(id)&&!taxi.has(id)&&labEligible(id,slot)&&!labLocked(id));
  const options=[{id:"",label:"Empty slot"}];
  available.forEach(id=>{
    const otherIndex=lineup.findIndex((v,i)=>i!==slotIndex&&v===id);
    if(otherIndex>=0){
      // Only allow a two-way swap when the displaced player is eligible for
      // the other slot. Never displace an already locked starter.
      if(original[otherIndex]&&labLocked(original[otherIndex]))return;
      if(current&&!labEligible(current,starterSlotsForLeague(league)[otherIndex]))return;
    }
    options.push({id,label:labPlayer(id).name+" • "+labPlayer(id).pos});
  });
  if(current&&!options.some(o=>o.id===current))options.push({id:current,label:labPlayer(current).name});
  return options.sort((a,b)=>a.id===""?-1:b.id===""?1:a.label.localeCompare(b.label));
}
function labChange(index,next){
  const league=labLeague(),roster=league&&labRoster(league);
  if(!roster)return;
  const lineup=labCurrent(league,roster).slice();
  const original=labInitial(league,roster);
  if(original[index]&&labLocked(original[index]))return;
  const previous=lineup[index],other=lineup.findIndex((id,i)=>i!==index&&id===next);
  if(other>=0){
    if(original[other]&&labLocked(original[other]))return;
    lineup[other]=previous||"";
  }
  lineup[index]=next;
  if(!labLegal(lineup,league))return;
  lineupLab.starters=lineup;
  renderLineupLab();
}
async function labLoadProjections(){
  if(lineupLab.loading)return;
  lineupLab.loading=true;lineupLab.error="";
  renderLineupLab();
  try{lineupLab.projections=await loadWeeklyProjectionMap()}
  catch(e){lineupLab.error="Weekly projections unavailable. You can still test legal lineup swaps.";console.warn(e)}
  finally{lineupLab.loading=false;renderLineupLab()}
}
function renderLineupLab(){
  const target=$("lineupLab");if(!target)return;
  const league=labLeague(),roster=league&&labRoster(league);
  if(!roster){target.innerHTML='<div class="muted">Load a Sleeper manager and select a league to try lineup changes.</div>';return}
  if(isBestBallLeague(league)){target.innerHTML='<div class="muted">Best Ball automatically sets lineups, so manual lineup experiments are unavailable here.</div>';return}
  const slots=starterSlotsForLeague(league),current=labCurrent(league,roster),original=labInitial(league,roster);
  const baseline=labSum(original,league),hypothetical=labSum(current,league);
  const delta=baseline!==null&&hypothetical!==null?hypothetical-baseline:null;
  target.innerHTML='<div class="lab-heading"><strong>What-if Lineup Builder</strong><span class="lab-chip">TFFCC ONLY</span></div><p class="muted">Try legal starter/bench swaps without changing Sleeper. Players whose NFL games have started stay locked.</p>'+
    '<div class="lab-totals"><div><small>Current projected</small><strong>'+(baseline===null?"—":baseline.toFixed(1))+'</strong></div><div><small>What-if projected</small><strong>'+(hypothetical===null?"—":hypothetical.toFixed(1))+'</strong></div><div><small>Difference</small><strong class="'+(delta>0?"lab-gain":delta<0?"lab-loss":"")+'">'+(delta===null?"—":(delta>0?"+":"")+delta.toFixed(1))+'</strong></div></div>'+
    slots.map((slot,i)=>{
      const id=current[i],p=id?labPlayer(id):null,locked=!!original[i]&&labLocked(original[i]);
      const opts=labOptions(league,roster,i);
      return '<div class="lab-slot"><div class="lab-slot-label"><strong>'+esc(slot)+'</strong><small>'+(locked?"🔒 Started":p&&p.injury?esc(p.injury):"")+'</small></div><select class="lab-select" data-slot="'+i+'" '+(locked?"disabled":"")+'>'+opts.map(o=>'<option value="'+esc(o.id)+'" '+(o.id===id?"selected":"")+'>'+esc(o.label)+'</option>').join("")+'</select><span class="lab-points">'+(id&&labProjected(id,league)!==null?labProjected(id,league).toFixed(1):"—")+'</span></div>';
    }).join("")+
    '<div class="lab-actions"><button type="button" id="labReset">Reset lineup</button><button type="button" id="labProjections" '+(lineupLab.loading?"disabled":"")+'>'+(lineupLab.loading?"Loading…":"Refresh projections")+'</button></div>'+
    (lineupLab.error?'<div class="muted">'+esc(lineupLab.error)+'</div>':'')+
    '<div class="muted">Projected totals require a complete set of available player projections. Nothing here submits a lineup to Sleeper.</div>';
  target.querySelectorAll(".lab-select").forEach(select=>select.addEventListener("change",()=>labChange(Number(select.dataset.slot),select.value)));
  $("labReset").onclick=()=>{lineupLab.starters=labInitial(league,roster);renderLineupLab()};
  $("labProjections").onclick=labLoadProjections;
}
document.addEventListener("DOMContentLoaded",()=>{
  $("loadBtn").addEventListener("click",()=>{lineupLab.leagueId=null;lineupLab.starters=null;lineupLab.projections=null});
  const teams=document.querySelector('[data-view="teamsView"]');
  if(teams)teams.addEventListener("click",()=>{renderLineupLab();if(!lineupLab.projections&&!lineupLab.loading&&S.user)labLoadProjections()});
});
