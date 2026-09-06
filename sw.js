/* Service worker do Estúdio.
   Só o shell é cacheado. As chamadas de IA (Groq, Ollama ou o download
   do modelo WebLLM) são de outras origens e passam direto, sem cache
   nosso — o WebLLM já guarda o próprio modelo no navegador. */
const CACHE = 'estudio-v24-acervo';
/* Origens de onde vem a biblioteca do WebLLM. Sem guardar esses arquivos,
   o "funciona offline" seria mentira: o modelo estaria no aparelho, mas
   o código que o executa não. Estratégia: cache primeiro, rede depois. */
const CDN_IA = ['https://esm.run/', 'https://cdn.jsdelivr.net/', 'https://esm.sh/'];
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './app.css',
  './core.js', './local.js', './ai.js', './market.js',
  './factory.js', './studio.js', './ui.js'
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
  if (new URL(req.url).origin !== self.location.origin) {
    if (!CDN_IA.some(p => req.url.startsWith(p))) return;
    ev.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const resp = await fetch(req);
      if (resp && resp.ok) { const c = await caches.open(CACHE); c.put(req, resp.clone()).catch(() => {}); }
      return resp;
    })());
    return;
  }
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
