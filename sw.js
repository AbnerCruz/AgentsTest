/* Service Worker do simulador de empresa.
   Objetivo: depois da primeira execucao com internet, o app inteiro
   (pagina, biblioteca de IA, binarios WASM e pesos do modelo) passa a
   ser servido do cache local. */

const CACHE_APP = 'app-v2';
const CACHE_RUNTIME = 'ia-runtime-v1';
const CACHE_MODELOS = 'ia-modelos-v1';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_APP)
      .then(c => c.addAll(['./', './index.html']))
      .catch(() => null)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(nomes => Promise.all(
        nomes.filter(n => ![CACHE_APP, CACHE_RUNTIME, CACHE_MODELOS].includes(n))
             .map(n => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

function alvo(url) {
  if (url.hostname === 'cdn.jsdelivr.net') return CACHE_RUNTIME;
  if (url.hostname === 'huggingface.co' || url.hostname.endsWith('.hf.co') ||
      url.hostname.startsWith('cdn-lfs')) return CACHE_MODELOS;
  return null;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Biblioteca, WASM e pesos: cache primeiro, rede so quando faltar.
  const nome = alvo(url);
  if (nome) {
    e.respondWith((async () => {
      const cache = await caches.open(nome);
      const guardado = await cache.match(req, { ignoreVary: true });
      if (guardado) return guardado;
      const resp = await fetch(req);
      // Respostas opacas nao servem offline; so guardamos as legiveis.
      if (resp && resp.status === 200 && resp.type !== 'opaque') {
        cache.put(req, resp.clone()).catch(() => {});
      }
      return resp;
    })());
    return;
  }

  // Arquivos do proprio app: rede primeiro, cache como reserva.
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      try {
        const resp = await fetch(req);
        const cache = await caches.open(CACHE_APP);
        cache.put(req, resp.clone()).catch(() => {});
        return resp;
      } catch (err) {
        const guardado = await caches.match(req);
        if (guardado) return guardado;
        throw err;
      }
    })());
  }
});
