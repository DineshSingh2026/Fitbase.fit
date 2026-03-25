import { Pool } from "pg";

export type MergedProgressLog = {
  created_at: string;
  weight: number | null;
  body_fat: number | null;
  calories_intake: number | null;
  protein_intake: number | null;
  workout_completed: boolean;
  workout_type: string | null;
  strength_bench: number | null;
  strength_squat: number | null;
  strength_deadlift: number | null;
  sleep_hours: number | null;
  water_intake: number | null;
  steps: number | null;
};

function parseWeightFromText(txt: string | null | undefined): number | null {
  if (!txt || typeof txt !== "string") return null;
  const m = txt.match(/(\d+\.?\d*)\s*(?:kg|kgs)?/i) || txt.match(/(\d+\.?\d*)/);
  return m ? parseFloat(m[1]) : null;
}

function parseSleepFromText(txt: string | null | undefined): number | null {
  if (!txt || typeof txt !== "string") return null;
  const m = txt.match(/(\d+\.?\d*)\s*(?:hrs?|hours?)?/i) || txt.match(/(\d+\.?\d*)/);
  return m ? parseFloat(m[1]) : null;
}

function averageStrengthTriplet(l: MergedProgressLog | null | undefined): number | null {
  if (!l) return null;
  const vals = [l.strength_bench, l.strength_squat, l.strength_deadlift]
    .map((v) => (v != null && !Number.isNaN(Number(v)) ? parseFloat(String(v)) : null))
    .filter((v): v is number => v != null);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function mergeLogs(
  progressLogs: any[],
  dailyCheckins: any[],
  sundayCheckins: any[]
): MergedProgressLog[] {
  const byDate: Record<string, MergedProgressLog> = {};

  const emptyBase = (): MergedProgressLog => ({
    created_at: "",
    weight: null,
    body_fat: null,
    calories_intake: null,
    protein_intake: null,
    workout_completed: false,
    workout_type: null,
    strength_bench: null,
    strength_squat: null,
    strength_deadlift: null,
    sleep_hours: null,
    water_intake: null,
    steps: null
  });

  progressLogs.forEach((row) => {
    const d = (row.created_at ? String(row.created_at) : "").slice(0, 10);
    if (!d) return;
    byDate[d] = {
      created_at: row.created_at,
      weight: row.weight != null ? parseFloat(String(row.weight)) : null,
      body_fat: row.body_fat != null ? parseFloat(String(row.body_fat)) : null,
      calories_intake: row.calories_intake != null ? parseInt(String(row.calories_intake), 10) : null,
      protein_intake: row.protein_intake != null ? parseInt(String(row.protein_intake), 10) : null,
      workout_completed: !!row.workout_completed,
      workout_type: row.workout_type || null,
      strength_bench: row.strength_bench != null ? parseFloat(String(row.strength_bench)) : null,
      strength_squat: row.strength_squat != null ? parseFloat(String(row.strength_squat)) : null,
      strength_deadlift: row.strength_deadlift != null ? parseFloat(String(row.strength_deadlift)) : null,
      sleep_hours: row.sleep_hours != null ? parseFloat(String(row.sleep_hours)) : null,
      water_intake: row.water_intake != null ? parseFloat(String(row.water_intake)) : null,
      steps: null
    };
  });

  (dailyCheckins || []).forEach((row) => {
    const d = (row.checkin_date ? String(row.checkin_date) : "").slice(0, 10);
    if (!d) return;
    const base = byDate[d] || {
      ...emptyBase(),
      created_at: `${d}T12:00:00.000Z`
    };
    if (row.steps != null) base.steps = parseInt(String(row.steps), 10);
    if (row.protein_g != null && base.protein_intake == null) base.protein_intake = parseInt(String(row.protein_g), 10);
    if (row.sleep_hours != null && base.sleep_hours == null) base.sleep_hours = parseFloat(String(row.sleep_hours));
    if (row.water_ml != null && base.water_intake == null) base.water_intake = parseFloat(String(row.water_ml));
    byDate[d] = base;
  });

  (sundayCheckins || []).forEach((row) => {
    const d = (row.created_at ? String(row.created_at) : "").slice(0, 10);
    if (!d) return;
    const base = byDate[d] || {
      ...emptyBase(),
      created_at: row.created_at || `${d}T12:00:00.000Z`
    };
    const w = parseWeightFromText(row.current_weight_waist_week || row.last_week_weight_waist);
    if (w != null && base.weight == null) base.weight = w;
    const s = parseSleepFromText(row.sleep);
    if (s != null && base.sleep_hours == null) base.sleep_hours = s;
    byDate[d] = base;
  });

  return Object.keys(byDate)
    .sort()
    .map((d) => {
      const x = byDate[d];
      return { ...x, created_at: x.created_at || `${d}T12:00:00.000Z` };
    });
}

async function getCurrentStreak(pool: Pool, userId: string): Promise<number> {
  const r = await pool.query(
    `SELECT created_at::date AS d, workout_completed FROM progress_logs
     WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  const rows = r.rows || [];
  if (rows.length === 0) return 0;

  const byDate: Record<string, boolean> = {};
  rows.forEach((row: any) => {
    const d = row.d ? String(row.d).slice(0, 10) : null;
    if (!d) return;
    if (byDate[d] === undefined) byDate[d] = false;
    if (row.workout_completed) byDate[d] = true;
  });

  const sortedDates = Object.keys(byDate).sort().reverse();
  let streak = 0;
  for (let i = 0; i < sortedDates.length; i++) {
    const d = sortedDates[i];
    if (!byDate[d]) break;
    const diff =
      i === 0
        ? Math.floor((Date.now() - new Date(d + "T12:00:00").getTime()) / (24 * 60 * 60 * 1000))
        : Math.floor(
            (new Date(sortedDates[i - 1] + "T12:00:00").getTime() - new Date(d + "T12:00:00").getTime()) /
              (24 * 60 * 60 * 1000)
          );
    if (i === 0 && diff > 1) break;
    if (i > 0 && diff > 1) break;
    streak++;
  }
  return streak;
}

async function getGoalCompletionPercent(pool: Pool, userId: string): Promise<number | null> {
  try {
    const goalRes = await pool.query(
      "SELECT target_weight FROM user_goals WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
      [userId]
    );
    const goal = goalRes.rows[0];
    if (!goal || goal.target_weight == null) return null;

    const firstRes = await pool.query(
      "SELECT weight FROM progress_logs WHERE user_id = $1 AND weight IS NOT NULL ORDER BY created_at ASC LIMIT 1",
      [userId]
    );
    const latestRes = await pool.query(
      "SELECT weight FROM progress_logs WHERE user_id = $1 AND weight IS NOT NULL ORDER BY created_at DESC LIMIT 1",
      [userId]
    );
    const startWeight = firstRes.rows[0]?.weight != null ? parseFloat(String(firstRes.rows[0].weight)) : null;
    const targetWeight = parseFloat(String(goal.target_weight));
    const currentWeight = latestRes.rows[0]?.weight != null ? parseFloat(String(latestRes.rows[0].weight)) : null;

    if (startWeight == null || currentWeight == null) return null;
    const denom = startWeight - targetWeight;
    if (Math.abs(denom) < 0.01) return 100;
    const pct = ((startWeight - currentWeight) / denom) * 100;
    return Math.round(Math.min(100, Math.max(0, pct)) * 10) / 10;
  } catch {
    return null;
  }
}

function computeInsights(logs: any[]): string[] {
  const insights: string[] = [];
  if (!logs || logs.length === 0) return insights;

  const total = logs.length;
  const withWorkout = logs.filter((l) => l.workout_completed);
  const consistency = total > 0 ? (withWorkout.length / total) * 100 : 0;
  if (consistency < 60) insights.push("Consistency Needs Improvement");

  const weights = logs.filter((l) => l.weight != null).map((l) => parseFloat(String(l.weight)));
  if (weights.length >= 14) {
    const last14 = weights.slice(-14);
    const avg = last14.reduce((a, b) => a + b, 0) / last14.length;
    const allSame = last14.every((w) => Math.abs(w - avg) < 0.5);
    if (allSame) insights.push("Weight Plateau Detected");
  }

  const withStrength = logs.filter(
    (l) => l.strength_bench != null || l.strength_squat != null || l.strength_deadlift != null
  );
  if (withStrength.length >= 2) {
    const first = withStrength[0];
    const last = withStrength[withStrength.length - 1];
    const firstAvg = averageStrengthTriplet(first as MergedProgressLog);
    const lastAvg = averageStrengthTriplet(last as MergedProgressLog);
    if (firstAvg != null && lastAvg != null && firstAvg > 0 && lastAvg > 0) {
      const growth = ((lastAvg - firstAvg) / firstAvg) * 100;
      if (growth > 10) insights.push("Strength Milestone Achieved");
    }
  }

  return insights;
}

export type AdminUserProgressPayload = {
  currentWeight: number | null;
  weightChangePercent: string | null;
  strengthGrowthPercent: string | null;
  workoutConsistencyPercent: string;
  activeStreak: number;
  goalCompletionPercent: number | null;
  averageCalories: string | null;
  averageSleep: string | null;
  insights: string[];
  logs: MergedProgressLog[];
  suspended: boolean;
};

export async function buildAdminUserProgressPayload(pool: Pool, userId: string): Promise<AdminUserProgressPayload> {
  const userRow = await pool.query("SELECT COALESCE(suspended, false) AS suspended FROM users WHERE id = $1 LIMIT 1", [
    userId
  ]);
  const suspended = !!(userRow.rows[0]?.suspended === true || userRow.rows[0]?.suspended === "t");

  const [progressRes, dailyRes, sundayRes] = await Promise.all([
    pool.query("SELECT * FROM progress_logs WHERE user_id = $1 ORDER BY created_at ASC", [userId]),
    pool.query(
      "SELECT checkin_date, steps, water_ml, protein_g, sleep_hours FROM daily_checkins WHERE user_id = $1 ORDER BY checkin_date ASC",
      [userId]
    ),
    pool.query(
      "SELECT current_weight_waist_week, last_week_weight_waist, sleep, created_at FROM sunday_checkins WHERE user_id = $1 ORDER BY created_at ASC",
      [userId]
    )
  ]);

  const progressLogs = progressRes.rows || [];
  const logs = mergeLogs(progressLogs, dailyRes.rows || [], sundayRes.rows || []);

  const [streak, goalPct, insights] = await Promise.all([
    getCurrentStreak(pool, userId),
    getGoalCompletionPercent(pool, userId),
    Promise.resolve(computeInsights(progressLogs))
  ]);

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const recent = logs.filter((l) => new Date(l.created_at).getTime() >= thirtyDaysAgo.getTime());
  const withWeight = logs.filter((l) => l.weight != null);
  const currentWeight = withWeight.length ? parseFloat(String(withWeight[withWeight.length - 1].weight)) : null;

  const weight30Ago =
    recent.length > 0
      ? (() => {
          const past = logs.filter((l) => new Date(l.created_at) <= thirtyDaysAgo);
          const w = past.filter((l) => l.weight != null);
          return w.length ? parseFloat(String(w[w.length - 1].weight)) : null;
        })()
      : null;

  const weightChange =
    currentWeight != null && weight30Ago != null && weight30Ago !== 0
      ? (((currentWeight - weight30Ago) / weight30Ago) * 100).toFixed(1)
      : null;

  const withStrength = logs.filter(
    (l) => l.strength_bench != null || l.strength_squat != null || l.strength_deadlift != null
  );
  let strengthGrowth: string | null = null;
  if (withStrength.length >= 2) {
    const first = withStrength[0];
    const last = withStrength[withStrength.length - 1];
    const firstAvg = averageStrengthTriplet(first);
    const lastAvg = averageStrengthTriplet(last);
    if (firstAvg != null && lastAvg != null && firstAvg > 0) {
      strengthGrowth = (((lastAvg - firstAvg) / firstAvg) * 100).toFixed(1);
    }
  }

  const total = logs.length;
  const workoutCount = logs.filter((l) => l.workout_completed).length;
  const consistency = total > 0 ? ((workoutCount / total) * 100).toFixed(1) : "0.0";

  const calRows = logs.filter((l) => l.calories_intake != null);
  const avgCalories = calRows.length
    ? (calRows.reduce((s, l) => s + (parseInt(String(l.calories_intake), 10) || 0), 0) / calRows.length).toFixed(0)
    : null;

  const sleepRows = logs.filter((l) => l.sleep_hours != null);
  const avgSleep = sleepRows.length
    ? (sleepRows.reduce((s, l) => s + (parseFloat(String(l.sleep_hours)) || 0), 0) / sleepRows.length).toFixed(1)
    : null;

  return {
    currentWeight,
    weightChangePercent: weightChange,
    strengthGrowthPercent: strengthGrowth,
    workoutConsistencyPercent: consistency,
    activeStreak: streak,
    goalCompletionPercent: goalPct,
    averageCalories: avgCalories,
    averageSleep: avgSleep,
    insights,
    logs,
    suspended
  };
}
