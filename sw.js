/* Service Worker do Hell Protocol — mantém o jogo SEMPRE atualizado no GitHub Pages.
   Estratégia: rede primeiro SEM o cache HTTP do navegador (cache: 'no-store') para
   tudo que é do jogo — derrotando o max-age=600 do GitHub Pages; o cache local
   (Cache API) serve apenas como reserva para o jogo funcionar offline. */
const CACHE = 'hellproto-v12';

self.addEventListener('install', function () {
  self.skipWaiting(); // nova versão assume o controle imediatamente
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (ev) {
  if (ev.request.method !== 'GET') return;
  ev.respondWith(
    fetch(ev.request, { cache: 'no-store' }).then(function (resp) {
      // atualiza o cache local (reserva offline) apenas com conteúdo do próprio jogo
      if (resp && resp.status === 200 && ev.request.url.indexOf(self.registration.scope) === 0) {
        const clone = resp.clone();
        caches.open(CACHE).then(function (c) { c.put(ev.request, clone).catch(function () {}); });
      }
      return resp;
    }).catch(function () {
      // sem rede: serve do cache local (offline)
      return caches.match(ev.request).then(function (r) {
        return r || new Response('offline', { status: 503, statusText: 'offline' });
      });
    })
  );
});