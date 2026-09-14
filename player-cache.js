// Cache Sleeper's large NFL player database locally for 24 hours.
// Live league, roster, matchup, injury/status, and projection requests are not cached here.
const TFFCC_PLAYER_CACHE_DB="tffcc-player-cache";
const TFFCC_PLAYER_CACHE_STORE="data";
const TFFCC_PLAYER_CACHE_KEY="nfl-players";
const TFFCC_PLAYER_CACHE_TTL=24*60*60*1000;

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
    const data=await fetchFresh();
    if(data&&typeof data==="object")writePlayerCache(data).catch(e=>console.warn("Player cache write unavailable",e));
    return data;
  }catch(e){
    // If Sleeper is temporarily unreachable, an expired cache is still more useful than no player data.
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
