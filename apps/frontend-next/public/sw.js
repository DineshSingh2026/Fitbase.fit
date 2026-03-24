/* FitBase Next.js: push only. No fetch caching (avoids stale UI after deploy). */

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("push", (e) => {
  if (!e.data) return;
  let title = "FitBase";
  let body = "";
  let data = {};
  try {
    const j = e.data.json();
    if (j) {
      title = j.title || title;
      body = j.body || j.desc || "";
      data = j;
    }
  } catch (_) {
    body = e.data.text() || "";
  }
  const opts = {
    body: (body || "You have a new notification").substring(0, 200),
    icon: "/img/Fitbase_logo_PWA2.png",
    badge: "/img/Fitbase_logo_PWA2.png",
    tag: data.id || "fitbase-" + Date.now(),
    requireInteraction: false,
    data: { url: "/", ...data }
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      for (let i = 0; i < clientList.length; i++) {
        if (clientList[i].url && clientList[i].focus) {
          clientList[i].navigate(url);
          return clientList[i].focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

/* Clear Cache Storage from previous service worker versions. */
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

/* No fetch handler: normal browser + server Cache-Control only. */
