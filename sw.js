/* Service Worker do simulador de empresa — shell do app somente.
   A IA desta versão é remota pela API Groq; nenhuma biblioteca, WASM ou peso
   de modelo é baixado/cacheado pelo service worker. */
const CACHE_APP = 'app-api-v1';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_APP)
      .then(cache => cache.addAll(['./', './index.html']))
      .catch(() => null)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names.filter(name => name !== CACHE_APP).map(name => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      const response = await fetch(req);
      const cache = await caches.open(CACHE_APP);
      cache.put(req, response.clone()).catch(() => {});
      return response;
    } catch (error) {
      const cached = await caches.match(req);
      if (cached) return cached;
      throw error;
    }
  })());
});
