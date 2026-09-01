const CACHE='adms-sistema-v20260901-3';
const STATIC=['/manifest-sistema.json'];
self.addEventListener('install',event=>{self.skipWaiting();event.waitUntil(caches.open(CACHE).then(c=>c.addAll(STATIC).catch(()=>{})))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
  const req=event.request; if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.origin===location.origin && (url.pathname==='/sistema'||url.pathname==='/sistema/'||url.pathname==='/sistema.html')){
    event.respondWith(fetch(req,{cache:'no-store'}).catch(()=>caches.match(req))); return;
  }
  event.respondWith(fetch(req).catch(()=>caches.match(req)));
});
