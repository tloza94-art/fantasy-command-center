const C="fantasy-cc-v15";
const SHELL=["./","./index.html","./styles.css","./app.js","./game-status-fix.js","./manager-ranking.js","./sleeper-links.js","./manifest.webmanifest","./icons/icon.svg"];

self.addEventListener("install",e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(C).then(c=>c.addAll(SHELL)));
});

self.addEventListener("activate",e=>{
  e.waitUntil(Promise.all([
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==C).map(k=>caches.delete(k)))),
    self.clients.claim()
  ]));
});

self.addEventListener("fetch",e=>{
  const u=new URL(e.request.url);
  if(u.hostname.includes("sleeper.app")||u.hostname.includes("espn.com")){
    e.respondWith(fetch(e.request,{cache:"no-store"}));
    return;
  }

  const sameOrigin=u.origin===self.location.origin;
  const isShell=sameOrigin&&(e.request.mode==="navigate"||/\.(?:html|js|css|webmanifest)$/.test(u.pathname));

  if(isShell){
    e.respondWith(
      fetch(e.request,{cache:"no-store"})
        .then(r=>{const copy=r.clone();caches.open(C).then(c=>c.put(e.request,copy));return r;})
        .catch(()=>caches.match(e.request).then(r=>r||caches.match("./index.html")))
    );
    return;
  }

  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});