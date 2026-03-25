/** Web Push + Badging API helpers for FitBase PWA (Chromium / Android / some desktop). */

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export async function subscribeFitbasePush(apiBase: string, token: string): Promise<{ ok: boolean; reason?: string }> {
  if (typeof window === "undefined") return { ok: false, reason: "no-window" };
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, reason: "unsupported" };
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    const pubRes = await fetch(`${apiBase.replace(/\/+$/, "")}/api/push/vapid-public`);
    const pubJson = await pubRes.json().catch(() => ({}));
    const publicKey = String((pubJson as { publicKey?: string }).publicKey || "").trim();
    if (!publicKey) return { ok: false, reason: "no-vapid" };

    let perm = Notification.permission;
    if (perm === "default") {
      perm = await Notification.requestPermission();
    }
    if (perm !== "granted") return { ok: false, reason: "denied" };

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource
    });
    const r = await fetch(`${apiBase.replace(/\/+$/, "")}/api/push/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(sub.toJSON())
    });
    if (!r.ok) return { ok: false, reason: "server" };
    try {
      localStorage.setItem("fitbase_push_enabled", "1");
    } catch {
      /* ignore */
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "error" };
  }
}

export function syncPwaAppBadge(count: number): void {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  if (typeof nav.setAppBadge !== "function") return;
  try {
    const n = Math.min(99, Math.max(0, Math.floor(count)));
    if (n > 0) void nav.setAppBadge(n);
    else void nav.clearAppBadge?.();
  } catch {
    /* ignore */
  }
}

export function clearPwaAppBadge(): void {
  syncPwaAppBadge(0);
}
