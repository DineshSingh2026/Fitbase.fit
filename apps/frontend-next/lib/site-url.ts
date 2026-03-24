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

/**
 * In the browser, always use the current page origin so API calls match where the user is
 * (e.g. https://www.fitbase.fit/api → Next rewrites → Nest). Avoids split-brain when env
 * points at a raw Render URL while the site is served on a custom domain.
 */
export function getApiSiteBase(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return String(window.location.origin).replace(/\/+$/, "");
  }
  return API_SITE_BASE;
}
