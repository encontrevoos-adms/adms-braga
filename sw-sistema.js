// Versão de limpeza: remove o cache offline antigo e deixa o navegador usar a rede normalmente.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.map(key=>caches.delete(key))))
      .then(()=>self.registration.unregister())
      .then(()=>self.clients.claim())
  );
});
