// SW cache bump — forza l’aggiornamento ed evita versioni in cache vecchie
const CACHE_NAME = 'marketspace-v1.3.10';

self.addEventListener('install', (e)=>{
  self.skipWaiting();
});
self.addEventListener('activate', (e)=>{
  e.waitUntil((async()=>{
    const keys = await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (event)=>{
  const req = event.request; if (req.method!=='GET') return;
  event.respondWith((async()=>{
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if (cached){
      event.waitUntil(fetch(req).then(res=>cache.put(req,res.clone())).catch(()=>{}));
      return cached;
    }
    try{
      const res = await fetch(req);
      cache.put(req,res.clone());
      return res;
    }catch(e){
      return cached || Response.error();
    }
  })());
});
