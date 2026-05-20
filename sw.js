const CACHE='travel-app-v1',SHELL=['/','/index.html'];
const EXT=['firestore.googleapis.com','firebase','gstatic.com','googleapis.com','google.com'];

self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));

self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));

self.addEventListener('fetch',e=>{
  if(EXT.some(h=>new URL(e.request.url).hostname.includes(h))){
    e.respondWith(fetch(e.request).catch(()=>new Response('',{status:503})));return;
  }
  e.respondWith(caches.match(e.request).then(cached=>{
    const net=fetch(e.request).then(r=>{
      if(r?.status===200&&e.request.method==='GET')caches.open(CACHE).then(c=>c.put(e.request,r.clone()));
      return r;
    }).catch(()=>null);
    return cached||net;
  }));
});
