/* FitBase Next.js PWA: web push + badge. No fetch caching (avoids stale UI after deploy). */

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
  const badgeCount = typeof data.badgeCount === "number" ? data.badgeCount : null;
  const openUrl = typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/dashboard";
  const opts = {
    body: (body || "You have a new notification").substring(0, 200),
    icon: "/img/Fitbase_logo_PWA2.png",
    badge: "/img/Fitbase_logo_PWA2.png",
    tag: String(data.tag || data.id || "fitbase-" + Date.now()),
    requireInteraction: false,
    vibrate: [120, 80, 120],
    silent: false,
    data: { url: openUrl, ...data }
  };

  const notifPromise = self.registration.showNotification(title, opts);
  let badgePromise = Promise.resolve();
  if (self.registration.setAppBadge) {
    if (badgeCount != null && badgeCount > 0) {
      badgePromise = self.registration.setAppBadge(Math.min(99, badgeCount));
    } else {
      badgePromise = self.registration.setAppBadge(1);
    }
  }
  e.waitUntil(Promise.all([notifPromise, badgePromise]));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/dashboard";
  const path = typeof url === "string" && url.startsWith("http") ? url : self.location.origin + (typeof url === "string" ? url : "/dashboard");
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      for (let i = 0; i < clientList.length; i++) {
        const c = clientList[i];
        if (c.url && "focus" in c) {
          try {
            c.navigate(path);
            return c.focus();
          } catch (_) {
            return c.focus();
          }
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(path);
    })
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});
