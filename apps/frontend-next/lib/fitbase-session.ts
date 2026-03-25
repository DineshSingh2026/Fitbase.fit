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

export function persistNormalizedSession(rawLoginBody: unknown): FitbaseSession | null {
  const s = normalizeFitbaseSession(rawLoginBody);
  if (typeof window === "undefined" || !s) return s;
  try {
    localStorage.setItem(FITBASE_SESSION_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
  return s;
}
