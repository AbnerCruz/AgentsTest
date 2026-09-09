const CACHE='urbe-v020-test-1';
const SHELL=['./','./index.html','./manifest.webmanifest'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('urbe-v020-test-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message',e=>{if(e.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 const u=new URL(e.request.url);
 if(u.hostname==='openrouter.ai'||u.hostname.endsWith('.openrouter.ai')){e.respondWith(fetch(e.request));return;}
 e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request).then(r=>{if(r&&r.ok)caches.open(CACHE).then(cache=>cache.put(e.request,r.clone())).catch(()=>{});return r}).catch(async()=>e.request.mode==='navigate'?await caches.match('./index.html'):Response.error())));
});
