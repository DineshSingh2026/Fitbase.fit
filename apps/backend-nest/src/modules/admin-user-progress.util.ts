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

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Days the client showed any engagement: logged workout, daily check-in, progress row, or Sunday check-in. */
function collectActivityDayKeys(input: {
  workoutRows: { created_at?: string | Date }[];
  dailyRows: { checkin_date?: string }[];
  progressRows: { created_at?: string | Date }[];
  sundayRows: { created_at?: string | Date }[];
}): Set<string> {
  const s = new Set<string>();
  const add = (raw: string | Date | null | undefined) => {
    if (raw == null) return;
    const t = typeof raw === "string" ? raw : raw.toISOString();
    const day = t.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) s.add(day);
  };
  (input.workoutRows || []).forEach((r) => add(r.created_at));
  (input.dailyRows || []).forEach((r) => add(r.checkin_date));
  (input.progressRows || []).forEach((r) => add(r.created_at));
  (input.sundayRows || []).forEach((r) => add(r.created_at));
  return s;
}

/** Longest run of consecutive calendar days ending on the client’s most recent activity day (UTC). */
function consecutiveActivityStreak(activityDays: Set<string>): number {
  if (activityDays.size === 0) return 0;
  const sorted = [...activityDays].sort();
  let d = new Date(`${sorted[sorted.length - 1]}T12:00:00.000Z`);
  let streak = 0;
  while (activityDays.has(isoDay(d))) {
    streak++;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return streak;
}

/** Share of last `windowDays` calendar days (ending today UTC) that have any activity. */
function rollingActivityConsistency(activityDays: Set<string>, windowDays: number): string {
  if (windowDays <= 0) return "0.0";
  let hit = 0;
  const end = new Date();
  for (let i = 0; i < windowDays; i++) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    if (activityDays.has(isoDay(d))) hit++;
  }
  return ((hit / windowDays) * 100).toFixed(1);
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

function computeInsights(logs: MergedProgressLog[]): string[] {
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
    const firstAvg = averageStrengthTriplet(first);
    const lastAvg = averageStrengthTriplet(last);
    if (firstAvg != null && lastAvg != null && firstAvg > 0 && lastAvg > 0) {
      const growth = ((lastAvg - firstAvg) / firstAvg) * 100;
      if (growth > 10) insights.push("Strength Milestone Achieved");
    }
  }

  return insights;
}

function tagWorkoutDaysOnLogs(logs: MergedProgressLog[], workoutRows: { created_at?: string | Date }[]): MergedProgressLog[] {
  const days = new Set<string>();
  workoutRows.forEach((r) => {
    if (r.created_at == null) return;
    const t = typeof r.created_at === "string" ? r.created_at : (r.created_at as Date).toISOString();
    const day = t.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) days.add(day);
  });
  if (days.size === 0) return logs;
  return logs.map((l) => {
    const day = String(l.created_at).slice(0, 10);
    if (days.has(day)) return { ...l, workout_completed: true };
    return l;
  });
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

  const [progressRes, dailyRes, sundayRes, workoutRes] = await Promise.all([
    pool.query("SELECT * FROM progress_logs WHERE user_id = $1 ORDER BY created_at ASC", [userId]),
    pool.query(
      "SELECT checkin_date, steps, water_ml, protein_g, sleep_hours FROM daily_checkins WHERE user_id = $1 ORDER BY checkin_date ASC",
      [userId]
    ),
    pool.query(
      "SELECT current_weight_waist_week, last_week_weight_waist, sleep, created_at FROM sunday_checkins WHERE user_id = $1 ORDER BY created_at ASC",
      [userId]
    ),
    pool
      .query("SELECT created_at FROM workout_logs WHERE user_id::text = $1::text ORDER BY created_at ASC", [userId])
      .then((r) => r)
      .catch(() => ({ rows: [] as { created_at: string }[] }))
  ]);

  const progressLogs = progressRes.rows || [];
  const dailyRows = dailyRes.rows || [];
  const sundayRows = sundayRes.rows || [];
  const workoutRows = workoutRes.rows || [];

  let logs = mergeLogs(progressLogs, dailyRows, sundayRows);
  logs = tagWorkoutDaysOnLogs(logs, workoutRows);

  const activityDays = collectActivityDayKeys({
    workoutRows,
    dailyRows,
    progressRows: progressLogs,
    sundayRows
  });

  const streak = consecutiveActivityStreak(activityDays);
  const goalPct = await getGoalCompletionPercent(pool, userId);
  const insights = computeInsights(logs);

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const thirtyMs = thirtyDaysAgo.getTime();
  const withWeight = logs.filter((l) => l.weight != null);
  const currentWeight = withWeight.length ? parseFloat(String(withWeight[withWeight.length - 1].weight)) : null;

  let weightBaseline: number | null = null;
  if (withWeight.length >= 1) {
    const beforeOrOn = withWeight.filter((l) => new Date(l.created_at).getTime() <= thirtyMs);
    if (beforeOrOn.length) {
      weightBaseline = parseFloat(String(beforeOrOn[beforeOrOn.length - 1].weight));
    } else if (withWeight.length >= 2) {
      weightBaseline = parseFloat(String(withWeight[0].weight));
    }
  }

  const weightChange =
    currentWeight != null && weightBaseline != null && Math.abs(weightBaseline) > 1e-6
      ? (((currentWeight - weightBaseline) / weightBaseline) * 100).toFixed(1)
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

  const consistency = rollingActivityConsistency(activityDays, 28);

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
