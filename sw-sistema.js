// Service Worker — Sistema de Gestão ADMS Braga
// Permite que a aplicação abra mesmo sem ligação à internet, depois da primeira visita.
const CACHE_NAME = 'adms-braga-v13-secure';
const FICHEIROS_PARA_GUARDAR = [
  '/sistema',
  '/manifest-sistema.json',
  '/sistema-icon-192.png',
  '/sistema-icon-512.png'
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FICHEIROS_PARA_GUARDAR))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((nomes) =>
      Promise.all(nomes.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', evento => {
  if(evento.request.mode === 'navigate'){
    evento.respondWith(fetch(evento.request).then(resposta => {
      const copia=resposta.clone();
      caches.open(CACHE_NAME).then(cache=>cache.put(evento.request,copia));
      return resposta;
    }).catch(()=>caches.match(evento.request).then(r=>r||caches.match('/sistema'))));
    return;
  }
  evento.respondWith(caches.match(evento.request).then(guardada=>guardada||fetch(evento.request).then(resposta=>{
    const copia=resposta.clone(); caches.open(CACHE_NAME).then(cache=>cache.put(evento.request,copia)); return resposta;
  })));
});
