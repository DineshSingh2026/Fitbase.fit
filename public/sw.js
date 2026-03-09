/* BodyBank PWA Service Worker - v1.1 (network-first for HTML so updates show immediately) */
const CACHE_NAME = 'bodybank-v5';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Install: precache core assets
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[sw] Precache failed for some assets:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Push: show notification when coach replies etc.
self.addEventListener('push', (e) => {
  let payload = { title: 'BodyBank', body: 'New update' };
  if (e.data) {
    try { payload = JSON.parse(e.data.text()); } catch (_) { payload.body = e.data.text(); }
  }
  const opts = { body: payload.body || payload, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: payload.type || 'bodybank' };
  e.waitUntil(self.registration.showNotification(payload.title || 'BodyBank', opts));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((c) => {
    if (c.length) c[0].focus();
    else if (self.clients.openWindow) self.clients.openWindow('/');
  }));
});

// Activate: take control and prune old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: network-only for API, network-first for navigations (HTML), cache-first for other static
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Let API requests go straight to network
  if (url.pathname.startsWith('/api/')) return;
  if (req.method !== 'GET') return;

  const isNavigation = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');

  // HTML / navigations: network-first so users always get latest UI after refresh
  if (isNavigation) {
    e.respondWith(
      fetch(req).then((res) => {
        if (!res || res.status !== 200) return res;
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        return res;
      }).catch(() => {
        // Offline fallback to cached page if available
        return caches.match(req).then((cached) => cached || caches.match('/index.html'));
      })
    );
    return;
  }

  // Other static assets: cache-first with background fill of cache
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (!res || res.status !== 200 || res.type !== 'basic') return res;
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        return res;
      }).catch(() => new Response('', { status: 503, statusText: 'Offline' }));
    })
  );
});
