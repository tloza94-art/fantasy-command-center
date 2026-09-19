// Cache only the player fields TFFCC actually uses.
// Sleeper's full NFL player payload is very large; storing/cloning that entire
// object in IndexedDB can stall iOS. The compact cache is dramatically smaller.
const TFFCC_PLAYER_CACHE_DB="tffcc-player-cache";
const TFFCC_PLAYER_CACHE_STORE="data";
const TFFCC_PLAYER_CACHE_KEY="nfl-players-compact-v2";
const TFFCC_PLAYER_CACHE_TTL=24*60*60*1000;

function compactSleeperPlayers(data){
  const out={};
  if(!data||typeof data!=="object")return out;
  for(const [id,p] of Object.entries(data)){
    if(!p||typeof p!=="object")continue;
    out[id]={
      full_name:p.full_name||"",
      first_name:p.first_name||"",
      last_name:p.last_name||"",
      position:p.position||"",
      team:p.team||"",
      injury_status:p.injury_status||"",
      status:p.status||""
    };
  }
  return out;
}

function openPlayerCacheDb(){
  return new Promise((resolve,reject)=>{
    if(!("indexedDB" in window)){reject(Error("IndexedDB unavailable"));return}
    const req=indexedDB.open(TFFCC_PLAYER_CACHE_DB,1);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(TFFCC_PLAYER_CACHE_STORE))db.createObjectStore(TFFCC_PLAYER_CACHE_STORE);
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||Error("Could not open player cache"));
  });
}

async function readPlayerCache(){
  const db=await openPlayerCacheDb();
  try{
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction(TFFCC_PLAYER_CACHE_STORE,"readonly");
      const req=tx.objectStore(TFFCC_PLAYER_CACHE_STORE).get(TFFCC_PLAYER_CACHE_KEY);
      req.onsuccess=()=>resolve(req.result||null);
      req.onerror=()=>reject(req.error||Error("Could not read player cache"));
    });
  }finally{db.close()}
}

async function writePlayerCache(data){
  const db=await openPlayerCacheDb();
  try{
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(TFFCC_PLAYER_CACHE_STORE,"readwrite");
      tx.objectStore(TFFCC_PLAYER_CACHE_STORE).put({timestamp:Date.now(),data},TFFCC_PLAYER_CACHE_KEY);
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error||Error("Could not write player cache"));
      tx.onabort=()=>reject(tx.error||Error("Player cache write aborted"));
    });
  }finally{db.close()}
}

async function getCachedSleeperPlayers(fetchFresh){
  let cached=null;
  try{cached=await readPlayerCache()}catch(e){console.warn("Player cache read unavailable",e)}

  const fresh=cached?.data&&Number(cached.timestamp)&&Date.now()-Number(cached.timestamp)<TFFCC_PLAYER_CACHE_TTL;
  if(fresh)return cached.data;

  try{
    const raw=await fetchFresh();
    // Yield once before compacting a large payload so iOS can paint/respond.
    await new Promise(r=>setTimeout(r,0));
    const data=compactSleeperPlayers(raw);
    if(Object.keys(data).length)writePlayerCache(data).catch(e=>console.warn("Player cache write unavailable",e));
    return data;
  }catch(e){
    if(cached?.data){
      console.warn("Using stale Sleeper player cache after refresh failure",e);
      return cached.data;
    }
    throw e;
  }
}

const tffccBaseGet=get;
get=async function(u){
  if(String(u)===API+"/players/nfl"){
    return getCachedSleeperPlayers(()=>tffccBaseGet(u));
  }
  return tffccBaseGet(u);
};
