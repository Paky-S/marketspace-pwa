self.addEventListener('install', (e)=>self.skipWaiting());
self.addEventListener('activate', (e)=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event)=>{
  const req = event.request; if (req.method!=='GET') return;
  event.respondWith((async()=>{
    const cache = await caches.open('marketspace-dynamic');
    const cached = await cache.match(req);
    if (cached){ event.waitUntil(fetch(req).then(res=>cache.put(req,res.clone()))); return cached; }
    try{ const res = await fetch(req); cache.put(req,res.clone()); return res; }
    catch(e){ return cached || Response.error(); }
  })());
});
