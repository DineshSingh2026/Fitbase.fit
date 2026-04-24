import type { NormalizedLandmarkList } from "./types";

export function vis(lm: NormalizedLandmarkList | null, i: number, t = 0.38): boolean {
  const p = lm?.[i];
  return !!(p && p.visibility != null && p.visibility > t);
}

export function ang(lm: NormalizedLandmarkList, a: number, b: number, c: number): number | null {
  if (!vis(lm, a) || !vis(lm, b) || !vis(lm, c)) return null;
  const A = lm[a]!;
  const B = lm[b]!;
  const C = lm[c]!;
  const v1 = { x: A.x - B.x, y: A.y - B.y };
  const v2 = { x: C.x - B.x, y: C.y - B.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const m = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
  if (!m) return null;
  return (Math.acos(Math.max(-1, Math.min(1, dot / m))) * 180) / Math.PI;
}

export function avg2(a: number | null, b: number | null): number | null {
  if (a != null && b != null) return (a + b) / 2;
  if (a != null) return a;
  if (b != null) return b;
  return null;
}
