/** Rough MET by workout name keywords (when calories_burned not logged). */
function metFromWorkoutName(name: string): number {
  const n = name.toLowerCase();
  if (n.includes("hiit") || n.includes("circuit")) return 8;
  if (n.includes("run") || n.includes("cardio") || n.includes("bike") || n.includes("cycle")) return 7.5;
  if (n.includes("swim")) return 7;
  if (n.includes("lift") || n.includes("strength") || n.includes("gym") || n.includes("weight")) return 5;
  if (n.includes("walk")) return 3.5;
  if (n.includes("yoga") || n.includes("stretch")) return 2.5;
  return 5;
}

/** kcal ≈ MET * 3.5 * kg / 200 * minutes */
export function metEstimateKcal(params: {
  durationSeconds: number;
  weightKg: number;
  workoutName: string;
}): number {
  const mins = Math.max(0, (Number(params.durationSeconds) || 0) / 60);
  const kg = Math.max(35, Number(params.weightKg) || 70);
  const met = metFromWorkoutName(params.workoutName || "");
  return Math.round((met * 3.5 * kg) / 200 * mins);
}

export function workoutCompletedTruthy(v: unknown): boolean {
  if (v === false || v === 0) return false;
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "false" || s === "0" || s === "f" || s === "no") return false;
  return true;
}

export interface WorkoutRowForBurn {
  duration_seconds: number | null;
  workout_name: string | null;
  workout_type?: string | null;
  calories_burned?: number | null;
  workout_completed?: boolean | null;
  created_at: Date | string;
  session_date?: string | Date | null;
}

export function sumWorkoutCaloriesOut(rows: WorkoutRowForBurn[], weightKg: number, dayYmd: string): number {
  let sum = 0;
  for (const w of rows) {
    if (!workoutCompletedTruthy(w.workout_completed)) continue;
    const dayMatch =
      w.session_date != null && String(w.session_date).slice(0, 10) === dayYmd
        ? true
        : String(new Date(w.created_at as Date).toISOString()).slice(0, 10) === dayYmd;
    if (!dayMatch) continue;
    const logged = Number(w.calories_burned);
    if (Number.isFinite(logged) && logged > 0) {
      sum += Math.round(logged);
      continue;
    }
    const name = String(w.workout_type || w.workout_name || "");
    sum += metEstimateKcal({
      durationSeconds: Number(w.duration_seconds) || 0,
      weightKg,
      workoutName: name
    });
  }
  return sum;
}

/** Step kcal from distance (km) and sex-specific kcal per kg·km. */
export function stepCaloriesOut(params: {
  steps: number;
  weightKg: number;
  sex: "male" | "female" | "unknown";
}): number {
  const steps = Math.max(0, Math.round(Number(params.steps) || 0));
  const strideM = params.sex === "female" ? 0.7 : params.sex === "male" ? 0.78 : 0.74;
  const kcalPerKgKm = params.sex === "female" ? 0.72 : params.sex === "male" ? 0.78 : 0.75;
  const km = (steps * strideM) / 1000;
  const kg = Math.max(35, Number(params.weightKg) || 70);
  return Math.round(km * kg * kcalPerKgKm);
}

export function parseSex(gender: string | null | undefined): "male" | "female" | "unknown" {
  const g = String(gender || "")
    .trim()
    .toLowerCase();
  if (g.startsWith("f")) return "female";
  if (g.startsWith("m")) return "male";
  return "unknown";
}

export function mifflinStJeorKcal(input: {
  weightKg: number;
  heightCm: number;
  ageYears: number;
  sex: "male" | "female" | "unknown";
}): number {
  const w = Math.max(30, Number(input.weightKg) || 70);
  const h = Math.max(120, Number(input.heightCm) || 170);
  const a = Math.max(16, Math.min(100, Number(input.ageYears) || 35));
  const s = input.sex === "female" ? -161 : input.sex === "male" ? 5 : -78;
  return Math.round(10 * w + 6.25 * h - 5 * a + s);
}

export function defaultHeightCm(sex: "male" | "female" | "unknown"): number {
  if (sex === "female") return 162;
  if (sex === "male") return 175;
  return 170;
}
