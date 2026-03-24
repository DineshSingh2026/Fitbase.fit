import type { UserRole } from "./auth.types";

/** DB / legacy tokens may use mixed case or trailing spaces — guards compare strictly. */
export function normalizeRoleString(role: unknown): string {
  return String(role ?? "")
    .trim()
    .toLowerCase();
}

export function toUserRole(role: unknown): UserRole {
  const r = normalizeRoleString(role);
  if (r === "superadmin" || r === "admin" || r === "user") return r;
  return "user";
}
