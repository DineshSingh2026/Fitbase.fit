/**
 * Absolute origin for API + shared static assets (e.g. /img/*) when not served via Next rewrites.
 * Set NEXT_PUBLIC_APP_SITE_URL or NEXT_PUBLIC_API_BASE_URL in .env.local (e.g. http://127.0.0.1:3000).
 */
const raw =
  process.env.NEXT_PUBLIC_APP_SITE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_LEGACY_SITE_URL ||
  "https://www.fitbase.fit";

export const API_SITE_BASE = raw.replace(/\/+$/, "");
