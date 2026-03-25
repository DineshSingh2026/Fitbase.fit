/**
 * Login APIs (Nest + Express) return a flat body: { token, id, email, role, ... }.
 * The dashboard expects { token, user: { id, role, ... } }. Normalize both shapes.
 */

export type FitbaseSessionUser = {
  id?: string;
  email?: string;
  role?: string;
  first_name?: string;
  last_name?: string;
  profile_picture?: string;
  trainer_id?: string | null;
  country?: string;
  timezone?: string;
  /** Trainer must set password before dashboard (from JWT / login body) */
  must_change_password?: boolean;
};

export type FitbaseSession = {
  token: string;
  user: FitbaseSessionUser;
};

function pickUserFields(src: Record<string, unknown>): FitbaseSessionUser {
  return {
    id: String(src.id ?? ""),
    email: String(src.email ?? "").trim().toLowerCase(),
    role: String(src.role ?? "")
      .trim()
      .toLowerCase(),
    first_name: String(src.first_name ?? ""),
    last_name: String(src.last_name ?? ""),
    profile_picture: String(src.profile_picture ?? ""),
    trainer_id: src.trainer_id != null ? String(src.trainer_id) : null,
    country: String(src.country ?? ""),
    timezone: String(src.timezone ?? ""),
    must_change_password: src.must_change_password === true
  };
}

/** Normalize login response or stored JSON into { token, user }. */
export function normalizeFitbaseSession(raw: unknown): FitbaseSession | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const token = String(o.token || "");
  if (!token) return null;

  const nested = o.user;
  if (nested && typeof nested === "object" && nested !== null && !Array.isArray(nested)) {
    const u = nested as Record<string, unknown>;
    const merged: Record<string, unknown> = {
      ...u,
      id: u.id ?? o.id,
      email: u.email ?? o.email,
      role: u.role ?? o.role
    };
    return { token, user: pickUserFields(merged) };
  }

  return { token, user: pickUserFields(o) };
}

export function parseFitbaseSessionFromStorage(rawJson: string | null): FitbaseSession | null {
  if (!rawJson) return null;
  try {
    return normalizeFitbaseSession(JSON.parse(rawJson));
  } catch {
    return null;
  }
}

export const FITBASE_SESSION_KEY = "fitbase_session";

/** Read persisted session JSON (localStorage first, then sessionStorage mirror). */
export function readFitbaseSessionString(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(FITBASE_SESSION_KEY) || sessionStorage.getItem(FITBASE_SESSION_KEY);
  } catch {
    return null;
  }
}

export function loadFitbaseSessionFromBrowser(): FitbaseSession | null {
  return parseFitbaseSessionFromStorage(readFitbaseSessionString());
}

/**
 * Persist session to localStorage + sessionStorage and verify localStorage read-back.
 * Dual write helps some mobile browsers / PWA restores; verification catches private mode / quota failures.
 */
export function writeFitbaseSessionObject(session: FitbaseSession): boolean {
  if (typeof window === "undefined") return false;
  const str = JSON.stringify(session);
  try {
    localStorage.setItem(FITBASE_SESSION_KEY, str);
    sessionStorage.setItem(FITBASE_SESSION_KEY, str);
    return localStorage.getItem(FITBASE_SESSION_KEY) === str;
  } catch {
    return false;
  }
}

export function clearFitbaseSessionStorage(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(FITBASE_SESSION_KEY);
    sessionStorage.removeItem(FITBASE_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function persistNormalizedSession(rawLoginBody: unknown): FitbaseSession | null {
  const s = normalizeFitbaseSession(rawLoginBody);
  if (typeof window === "undefined" || !s) return s;
  if (!writeFitbaseSessionObject(s)) return null;
  return s;
}
