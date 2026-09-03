const CACHE='adms-integrado-v11-20260903';
const PORTAL='/sistema.html';
const STATIC_ASSETS=[PORTAL,'/logo-portal.webp'];

self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(STATIC_ASSETS)).catch(()=>{}));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin) return;

  if(event.request.mode==='navigate' && url.pathname.startsWith('/sistema')){
    event.respondWith(
      caches.match(PORTAL).then(cached=>{
        const refresh=fetch(PORTAL,{cache:'no-cache'}).then(response=>{
          if(response.ok) caches.open(CACHE).then(cache=>cache.put(PORTAL,response.clone()));
          return response;
        }).catch(()=>cached);
        return cached||refresh;
      })
    );
    return;
  }

  if(STATIC_ASSETS.includes(url.pathname)){
    event.respondWith(caches.match(url.pathname).then(cached=>cached||fetch(event.request)));
  }
});
