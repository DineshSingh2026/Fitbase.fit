"use client";

import { useEffect } from "react";

/**
 * Registers `/sw.js` for push + PWA install.
 * Production + localhost so dev can test notifications; other hosts skip in dev to avoid stray SW.
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const host = window.location.hostname;
    const isLocal = host === "localhost" || host === "127.0.0.1";
    const allow = process.env.NODE_ENV === "production" || isLocal;
    if (!allow) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}
