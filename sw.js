/* Service worker do Estúdio.
   Só o shell é cacheado. A IA é remota (OpenRouter) e nunca passa por aqui:
   requisições para outras origens são ignoradas de propósito. */
const CACHE = 'estudio-v49-index-jogo';
const SHELL = [
  './', './index.html', './classico.html', './manifest.webmanifest',
  './app.css', './game.css',
  './core.js', './ai.js',
  './factory.js', './assets.js', './agency.js', './studio.js', './ui.js', './game-ui.js'
];

self.addEventListener('install', ev => {
  ev.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => null).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', ev => {
  ev.waitUntil(
    caches.keys()
      .then(ns => Promise.all(ns.filter(n => n !== CACHE).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

/* Rede primeiro, cache como rede de segurança: assim uma atualização do
   app aparece na hora, mas o estúdio continua abrindo sem internet. */
self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;
  ev.respondWith((async () => {
    try {
      const resp = await fetch(req);
      const cache = await caches.open(CACHE);
      cache.put(req, resp.clone()).catch(() => {});
      return resp;
    } catch (e) {
      const cached = await caches.match(req);
      if (cached) return cached;
      throw e;
    }
  })());
});
