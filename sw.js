// 旅遊助手 Service Worker
// 版本號：每次 index.html 有重大更新時，升版號讓舊快取失效
const CACHE = 'travel-app-v1';

// App Shell：這些資源離線時必須能載入
const SHELL = [
  '/',
  '/index.html',
];

// ── 安裝：快取 App Shell ──
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

// ── 啟動：清除舊版快取 ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── 攔截請求：App Shell 用快取優先，Firebase/CDN 用網路優先 ──
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Firebase API、Google API、CDN → 永遠走網路，不快取
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('google.com')
  ) {
    e.respondWith(fetch(e.request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // App Shell（HTML/同源資源）→ Cache First，有更新時背景更新
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetchPromise = fetch(e.request).then(res => {
        if (res && res.status === 200 && e.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => null);

      // 有快取先回傳快取，同時背景更新；沒快取則等網路
      return cached || fetchPromise;
    })
  );
});
