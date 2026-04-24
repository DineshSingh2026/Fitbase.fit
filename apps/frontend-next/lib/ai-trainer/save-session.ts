import { parseFitbaseSessionFromStorage } from "../fitbase-session";
import { getApiSiteBase } from "../site-url";

const LEGACY_SESSION_KEY = "bodybank_session";

function readSessionToken(): { token: string; userId: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw =
      localStorage.getItem("fitbase_session") || localStorage.getItem(LEGACY_SESSION_KEY);
    if (!raw) return null;
    const s = parseFitbaseSessionFromStorage(raw);
    const token = s?.token || "";
    const userId = s?.user?.id != null ? String(s.user.id) : "";
    if (!token) return null;
    return { token, userId };
  } catch {
    return null;
  }
}

export async function saveAiTrainerSession(
  reps: number,
  sets: number,
  durSec: number,
  workoutLabel: string
): Promise<string> {
  const notes = `AI Trainer session — reps: ${reps}, sets: ${sets}`;
  const dateIso = new Date().toISOString().slice(0, 10);
  const base = getApiSiteBase();
  const sess = readSessionToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (sess?.token) {
    headers.Authorization = `Bearer ${sess.token}`;
    const r = await fetch(`${base}/api/workouts/session`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        date: dateIso,
        workout_type: workoutLabel,
        duration_seconds: Math.round(durSec),
        workout_completed: true,
        notes
      })
    });
    if (!r.ok) throw new Error(await r.text());
    return "Saved to your workout log.";
  }
  if (sess?.userId) {
    const r = await fetch(`${base}/api/workouts`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        user_id: sess.userId,
        workout_name: workoutLabel,
        duration_seconds: Math.round(durSec),
        feedback: notes
      })
    });
    if (!r.ok) throw new Error(await r.text());
    return "Saved (legacy workout log).";
  }
  throw new Error("Log in from the Fitbase app to save sessions.");
}
