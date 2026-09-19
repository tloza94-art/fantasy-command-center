const API="https://api.sleeper.app/v1",SEASON="2026",ESPN_SCOREBOARD="https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";
let S={user:null,leagues:[],rows:[],players:{},nflState:{},lineups:[],matchups:{},gameStates:{},rosters:{},leagueUsers:{},leagueProfiles:{}};
const $=id=>document.getElementById(id);

document.addEventListener("DOMContentLoaded",()=>{
  $("username").value=localStorage.getItem("fcc_username")||"Txeagle";
  $("loadBtn").onclick=load;
  $("refreshBtn").onclick=load;
  $("sundayRefreshBtn").onclick=load;
  $("leagueSelect").onchange=renderTeam;
  $("playerSearch").oninput=renderSearch;
  document.querySelectorAll(".nav").forEach(b=>b.onclick=()=>switchView(b));
  if("serviceWorker"in navigator)navigator.serviceWorker.register("./service-worker.js");
  load();
});

function switchView(button){
  document.querySelectorAll(".nav,.view").forEach(x=>x.classList.remove("active"));
  button.classList.add("active");
  $(button.dataset.view).classList.add("active");
}

async function get(u){
  let r=await fetch(u,{cache:"no-store"});
  if(!r.ok)throw Error(r.status+" "+r.statusText);
  return r.json();
}

async function load(){
  let username=$("username").value.trim();
  if(!username)return;
  localStorage.setItem("fcc_username",username);
  status("Scanning "+username+"…");
  try{
    let user=await get(API+"/user/"+encodeURIComponent(username));
    if(!user?.user_id)throw Error("Sleeper user not found");
    S.user=user;
    let [leagues,players,nflState,scoreboard]=await Promise.all([
      get(API+"/user/"+user.user_id+"/leagues/nfl/"+SEASON),
      get(API+"/players/nfl"),
      get(API+"/state/nfl").catch(()=>({})),
      get(ESPN_SCOREBOARD).catch(()=>null)
    ]);
    S.leagues=leagues;S.players=players;S.nflState=nflState;S.leagueProfiles=Object.fromEntries((leagues||[]).map(l=>[l.league_id,buildLeagueProfile(l)]));
    // Sleeper's state.week is the source of truth for the active fantasy week.
    // Normalize display_week to it so every supplemental TFFCC module rolls over
    // at the same time Sleeper does instead of getting ahead of the platform.
    if(S.nflState?.week)S.nflState.display_week=S.nflState.week;
    buildGameStates(scoreboard);
    S.rows=[];S.lineups=[];S.matchups={};S.rosters={};S.leagueUsers={};
    let week=Number(S.nflState.week||S.nflState.display_week||1);
    let data=await Promise.all(S.leagues.map(async l=>{
      let [rs,mu,us]=await Promise.all([
        get(API+"/league/"+l.league_id+"/rosters").catch(()=>[]),
        get(API+"/league/"+l.league_id+"/matchups/"+week).catch(()=>[]),
        get(API+"/league/"+l.league_id+"/users").catch(()=>[])
      ]);
      return{l,rs,mu,us};
    }));
    data.forEach(({l,rs,mu,us})=>{
      S.matchups[l.league_id]=mu||[];
      S.rosters[l.league_id]=rs||[];
      S.leagueUsers[l.league_id]=us||[];
      let r=rs.find(x=>String(x.owner_id)===String(user.user_id));
      if(!r)return;
      let bestBall=isBestBallLeague(l);
      let st=new Set((r.starters||[]).filter(id=>id&&id!=="0")),ir=new Set(r.reserve||[]),tx=new Set(r.taxi||[]);
      let emptySlots=(r.starters||[]).filter(id=>!id||id==="0").length;
      let mine=(mu||[]).find(m=>Number(m.roster_id)===Number(r.roster_id));
      let opp=mine?(mu||[]).find(m=>m.matchup_id===mine.matchup_id&&Number(m.roster_id)!==Number(r.roster_id)):null;
      let oppRoster=opp?(rs||[]).find(x=>Number(x.roster_id)===Number(opp.roster_id)):null;
      let oppUser=oppRoster?.owner_id?(us||[]).find(x=>String(x.user_id)===String(oppRoster.owner_id)):null;
      let opponentName=oppUser?.metadata?.team_name||oppUser?.display_name||oppUser?.username||null;
      S.lineups.push({leagueId:l.league_id,league:l.name,rosterId:r.roster_id,emptySlots,points:Number(mine?.points||0),opponentPoints:opp?Number(opp.points||0):null,opponentName,matchupId:mine?.matchup_id??null,bestBall});
      (r.players||[]).forEach(id=>{
        let p=S.players[id]||{},rosterStatus=ir.has(id)?"IR":tx.has(id)?"Taxi":st.has(id)?"Starter":"Bench";
        let positions=(Array.isArray(p.fantasy_positions)?p.fantasy_positions:[]).map(x=>String(x||"").toUpperCase()).filter(Boolean);
        let primaryPos=String(p.position||positions[0]||"").toUpperCase();
        if(primaryPos&&!positions.includes(primaryPos))positions.unshift(primaryPos);
        S.rows.push({leagueId:l.league_id,league:l.name,id,name:p.full_name||((p.first_name||"")+" "+(p.last_name||"")).trim()||id,pos:primaryPos,positions,team:p.team||"",rosterStatus,injury:p.injury_status||"",nflStatus:p.status||"",bestBall});
      });
    });
    renderAll();
    status((user.display_name||user.username)+" • "+S.leagues.length+" leagues • Week "+week+" • "+new Date().toLocaleTimeString([], {hour:"numeric",minute:"2-digit"}));
  }catch(e){status("Could not load: "+e.message)}
}

function normalizeTeam(team){
  let t=String(team||"").trim().toUpperCase();
  return ({WAS:"WSH",JAC:"JAX",LA:"LAR",STL:"LAR",OAK:"LV",SD:"LAC"})[t]||t;
}

function buildGameStates(scoreboard){
  S.gameStates={};
  if(!scoreboard?.events)return;
  scoreboard.events.forEach(event=>{
    let state=String(event?.status?.type?.state||"pre").toLowerCase();
    let kickoff=event?.date?new Date(event.date).getTime():null;
    let started=state!=="pre"||(kickoff&&Date.now()>=kickoff);
    let competition=event?.competitions?.[0];
    (competition?.competitors||[]).forEach(c=>{
      let abbr=normalizeTeam(c?.team?.abbreviation);
      if(abbr)S.gameStates[abbr]={state,started,kickoff,eventId:event.id};
    });
  });
}

const norm=v=>String(v||"").trim().toLowerCase();
function isBestBallLeague(l){
  let v=l?.settings?.best_ball;
  return v===1||v==="1"||v===true||norm(v)==="true";
}

// Build capabilities from the league itself instead of asking the manager to
// configure league types. Features can key off this profile and stay invisible
// when the format does not use them.
function buildLeagueProfile(l){
  const slots=(l?.roster_positions||[]).map(x=>String(x||"").toUpperCase());
  const scoring=l?.scoring_settings||{};
  const hasSlot=(...names)=>names.some(n=>slots.includes(n));
  const defensiveSlots=new Set(["DL","DE","DT","LB","DB","CB","S","EDGE","IDP_FLEX","IDP"]);
  const idp=slots.some(s=>defensiveSlots.has(s));
  const superflex=hasSlot("SUPER_FLEX","SUPERFLEX","Q/W/R/T","QB/RB/WR/TE");
  const tePremiumKeys=["bonus_rec_te","bonus_rec_te_0_5","bonus_rec_te_1","te_rec_bonus","rec_te"];
  const tePremium=tePremiumKeys.some(k=>Number(scoring[k]||0)>0);
  const ppr=Number(scoring.rec||0);
  const formatTags=[];
  if(superflex)formatTags.push("SF");
  if(tePremium)formatTags.push("TEP");
  if(idp)formatTags.push("IDP");
  if(isBestBallLeague(l))formatTags.push("Best Ball");
  return {
    leagueId:l?.league_id,
    slots,
    scoring,
    superflex,
    tePremium,
    idp,
    bestBall:isBestBallLeague(l),
    ppr,
    formatTags
  };
}

function leagueProfile(leagueOrId){
  const id=typeof leagueOrId==="object"?leagueOrId?.league_id:leagueOrId;
  return S.leagueProfiles?.[id]||(typeof leagueOrId==="object"?buildLeagueProfile(leagueOrId):null);
}
const must=r=>["o","out","ir","injured reserve","pup","susp","suspended"].includes(norm(r.injury))||norm(r.nflStatus)==="inactive";
const watch=r=>["q","questionable","d","doubtful"].includes(norm(r.injury));
const injured=r=>must(r)||watch(r)||!!norm(r.injury);
const gameStarted=r=>!!S.gameStates[normalizeTeam(r.team)]?.started;
const actionableInjury=r=>!r.bestBall&&!gameStarted(r);

function renderAll(){renderHome();renderSunday();renderLeagueSelect();renderTeam();renderSearch();renderExposure()}

function emptyLineupCard(l){
  return '<div class="player urgent-card"><span class="badge danger-badge">EMPTY</span><div class="player-name">'+esc(l.league)+'</div><div class="sub">'+l.emptySlots+' empty starter slot'+(l.emptySlots===1?'':'s')+' detected. Fill this lineup.</div></div>';
}

function renderHome(){
  let starters=S.rows.filter(r=>r.rosterStatus==="Starter"),pregame=starters.filter(actionableInjury),m=pregame.filter(must),w=pregame.filter(watch),map={};
  let managedLineups=S.lineups.filter(l=>!l.bestBall);
  let empty=managedLineups.filter(l=>l.emptySlots>0);
  pregame.filter(injured).forEach(r=>{if(!map[r.id])map[r.id]={...r,leagues:[]};map[r.id].leagues.push(r.league)});
  let risks=Object.values(map).filter(r=>r.leagues.length>1).sort((a,b)=>b.leagues.length-a.leagues.length);
  let mustFixCards=[...empty.map(emptyLineupCard),...m.map(card)];
  $("leagueCount").textContent=S.leagues.length;
  $("mustFixCount").textContent=m.length+empty.reduce((n,l)=>n+l.emptySlots,0);
  $("watchCount").textContent=w.length;
  $("riskCount").textContent=risks.length;
  $("mustFixList").innerHTML=mustFixCards.length?mustFixCards.join(""):'<div class="muted">✅ No must-change injured starters or empty managed-lineup slots.</div>';
  $("watchList").innerHTML=w.length?w.map(card).join(""):'<div class="muted">✅ No Q/D starters with games still open.</div>';
  $("riskList").innerHTML=risks.length?risks.map(r=>riskCard(r)).join(""):'<div class="muted">✅ No multi-league pre-kickoff injury risks.</div>';
}

function renderSunday(){
  let week=Number(S.nflState.week||S.nflState.display_week||1);
  let starters=S.rows.filter(r=>r.rosterStatus==="Starter"),pregame=starters.filter(actionableInjury),m=pregame.filter(must),w=pregame.filter(watch);
  let managedLineups=S.lineups.filter(l=>!l.bestBall);
  let empty=managedLineups.filter(l=>l.emptySlots>0);
  let urgentCount=m.length+empty.reduce((n,l)=>n+l.emptySlots,0);
  let affected=new Set([...m.map(r=>r.leagueId),...w.map(r=>r.leagueId),...empty.map(l=>l.leagueId)]);
  let map={};
  pregame.filter(injured).forEach(r=>{if(!map[r.id])map[r.id]={...r,leagues:[]};map[r.id].leagues.push(r.league)});
  let risks=Object.values(map).filter(r=>r.leagues.length>1).sort((a,b)=>b.leagues.length-a.leagues.length);
  let filteredStarted=starters.filter(r=>!r.bestBall&&injured(r)&&gameStarted(r)).length;
  let filteredBestBall=starters.filter(r=>r.bestBall&&injured(r)).length;

  $("sundayTitle").textContent="Week "+week+" Command Center";
  $("sundayLineups").textContent=managedLineups.length;
  $("sundayUrgent").textContent=urgentCount;
  $("sundayWatch").textContent=w.length;
  $("sundayAffected").textContent=affected.size;
  let filteredNotes=[];
  if(filteredStarted)filteredNotes.push(filteredStarted+" started-game alert"+(filteredStarted===1?"":"s"));
  if(filteredBestBall)filteredNotes.push(filteredBestBall+" Best Ball injury alert"+(filteredBestBall===1?"":"s"));
  $("sundaySummary").textContent=affected.size?affected.size+" league"+(affected.size===1?"":"s")+" need attention. Injury alerts disappear after kickoff and Best Ball leagues are excluded."+(filteredNotes.length?" Filtered: "+filteredNotes.join(" + ")+".":""):"Every managed lineup currently looks clean. Started-game injuries and Best Ball injury designations are hidden.";
  $("sundayAllClear").innerHTML=!urgentCount&&!w.length?'<div class="all-clear-card">✅ <strong>All clear.</strong> No actionable pre-kickoff injury alerts or empty starter slots detected in managed leagues.</div>':"";

  let urgentCards=[];
  urgentCards.push(...empty.map(emptyLineupCard));
  urgentCards.push(...m.map(r=>sundayPlayerCard(r,"ACT NOW")));
  $("sundayUrgentList").innerHTML=urgentCards.length?urgentCards.join(""):'<div class="muted">✅ Nothing urgent detected before kickoff.</div>';
  $("sundayWatchList").innerHTML=w.length?w.map(r=>sundayPlayerCard(r,"MONITOR")).join(""):'<div class="muted">✅ No questionable or doubtful starters still awaiting kickoff.</div>';
  $("sundayRiskList").innerHTML=risks.length?risks.map(r=>riskCard(r,true)).join(""):'<div class="muted">✅ No pre-kickoff injured starter is hitting multiple managed leagues.</div>';

  let matchups=S.lineups.slice().sort((a,b)=>a.league.localeCompare(b.league));
  $("sundayMatchups").innerHTML=matchups.length?matchups.map(l=>{
    let score=l.matchupId===null?'Matchup data unavailable':(l.opponentPoints===null?formatScore(l.points):formatScore(l.points)+' vs '+formatScore(l.opponentPoints));
    let opponent=l.opponentName?' • vs '+esc(l.opponentName):'';
    return '<div class="player matchup-card"><div class="player-name">'+esc(l.league)+(l.bestBall?' <span class="league-chip">Best Ball</span>':'')+'</div><div class="sub">'+score+opponent+(!l.bestBall&&l.emptySlots?' • ⚠️ '+l.emptySlots+' empty slot'+(l.emptySlots===1?'':'s'):'')+'</div></div>';
  }).join(""):'<div class="muted">No matchup data available.</div>';
}

function sundayPlayerCard(r,label){
  return '<div class="player"><span class="badge '+(label==="ACT NOW"?'danger-badge':'warn-badge')+'">'+esc(r.injury||r.nflStatus||label)+'</span><div class="player-name">'+esc(r.name)+'</div><div class="sub">'+esc(r.pos)+' • '+esc(r.team||"FA")+'<br>'+esc(r.league)+' • Starter</div></div>';
}

function riskCard(r,sunday=false){
  return '<div class="player"><span class="badge">'+esc(r.injury||r.nflStatus)+'</span><div class="player-name">'+esc(r.name)+'</div><div class="sub">'+esc(r.pos)+' • '+esc(r.team||"FA")+' • Starting in '+r.leagues.length+' leagues'+(sunday?' • '+Math.round((r.leagues.length/Math.max(S.lineups.filter(l=>!l.bestBall).length,1))*100)+'% managed-lineup exposure':'')+'</div><div>'+r.leagues.map(x=>'<span class="league-chip">'+esc(x)+'</span>').join("")+'</div></div>';
}

function card(r){return'<div class="player"><span class="badge">'+esc(r.injury||r.nflStatus)+'</span><div class="player-name">'+esc(r.name)+'</div><div class="sub">'+esc(r.pos)+' • '+esc(r.team||"FA")+'<br>'+esc(r.league)+'</div></div>'}

function renderLeagueSelect(){
  let s=$("leagueSelect"),old=s.value;
  s.innerHTML=S.leagues.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(l=>{let tags=leagueProfile(l)?.formatTags||[];return '<option value="'+esc(l.league_id)+'">'+esc(l.name)+(tags.length?' • '+esc(tags.join(" / ")):'')+'</option>'}).join("");
  if([...s.options].some(o=>o.value===old))s.value=old;
}

function renderTeam(){
  let id=$("leagueSelect").value,rows=S.rows.filter(r=>r.leagueId===id),groups=["Starter","Bench","IR","Taxi"];
  $("teamRoster").innerHTML=groups.map(g=>{let a=rows.filter(r=>r.rosterStatus===g);if(!a.length)return"";return'<section class="roster-group"><div class="roster-title">'+g.toUpperCase()+'</div><div class="card">'+a.map(r=>'<div class="roster-row"><div class="pos">'+esc(r.pos)+'</div><div><div class="player-name">'+esc(r.name)+'</div><div class="sub">'+esc(r.team||"FA")+(r.injury?' • '+esc(r.injury):'')+'</div></div><div class="sub">'+g+'</div></div>').join("")+'</div></section>'}).join("");
}

function renderSearch(){
  let q=norm($("playerSearch").value);
  if(!q){$("playerResults").innerHTML='<div class="muted">Type a player name.</div>';return}
  let a=S.rows.filter(r=>norm(r.name).includes(q));
  $("playerResults").innerHTML=a.length?a.map(r=>'<div class="player"><span class="badge">'+esc(r.injury)+'</span><div class="player-name">'+esc(r.name)+'</div><div class="sub">'+esc(r.pos)+' • '+esc(r.team||"FA")+'<br>'+esc(r.league)+' • '+r.rosterStatus+(r.bestBall?' • Best Ball':'')+'</div></div>').join(""):'<div class="muted">No match.</div>';
}

function renderExposure(){
  let m={};
  S.rows.forEach(r=>{if(!m[r.id])m[r.id]={...r,owned:new Set(),starts:new Set()};m[r.id].owned.add(r.leagueId);if(r.rosterStatus==="Starter")m[r.id].starts.add(r.leagueId)});
  $("exposureList").innerHTML=Object.values(m).sort((a,b)=>b.owned.size-a.owned.size||b.starts.size-a.starts.size).map(r=>'<div class="player"><span class="badge">'+esc(r.injury)+'</span><div class="player-name">'+esc(r.name)+'</div><div class="sub">'+esc(r.pos)+' • '+esc(r.team||"FA")+'<br>Owned '+r.owned.size+' • Starting '+r.starts.size+' • '+Math.round((r.owned.size/Math.max(S.leagues.length,1))*100)+'% exposure</div></div>').join("");
}

function formatScore(n){return Number(n||0).toFixed(2).replace(/\.00$/,'')}
function status(t){$("statusText").textContent=t}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}