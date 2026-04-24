"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { FITBASE_SESSION_KEY, parseFitbaseSessionFromStorage } from "../../lib/fitbase-session";

const LEGACY_SESSION_KEY = "bodybank_session";

function readSessionRaw(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return (
      localStorage.getItem(FITBASE_SESSION_KEY) ||
      sessionStorage.getItem(FITBASE_SESSION_KEY) ||
      localStorage.getItem(LEGACY_SESSION_KEY) ||
      sessionStorage.getItem(LEGACY_SESSION_KEY)
    );
  } catch {
    return null;
  }
}
import { getApiSiteBase } from "../../lib/site-url";

const MEALS = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "snack", label: "Snack" },
  { value: "dinner", label: "Dinner" }
] as const;

export default function NutritionClient() {
  const base = useMemo(() => getApiSiteBase(), []);
  const [mealType, setMealType] = useState<string>("breakfast");
  const [portionSize, setPortionSize] = useState<string>("medium");
  const [manualNote, setManualNote] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [fiber, setFiber] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const session = useMemo(() => parseFitbaseSessionFromStorage(readSessionRaw()), []);

  const token = session?.token || "";

  const submit = useCallback(async () => {
    setErr(null);
    setMsg(null);
    if (!token) {
      setErr("Please log in from the dashboard first.");
      return;
    }
    const note = manualNote.trim();
    if (!note) {
      setErr("Describe what you ate so we can log this meal.");
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        mealType,
        portionSize: portionSize || "medium",
        manualNote: note,
        date,
        triggerNotify: false,
        autoNotifyOnComplete: false
      };
      const c = calories.trim();
      const p = protein.trim();
      const cb = carbs.trim();
      const f = fat.trim();
      const fb = fiber.trim();
      if (c !== "") body.calories = Number(c);
      if (p !== "") body.protein = Number(p);
      if (cb !== "") body.carbs = Number(cb);
      if (f !== "") body.fat = Number(f);
      if (fb !== "") body.fiber = Number(fb);

      const r = await fetch(`${base}/api/nutrition/log`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(data?.message || data?.error || `Request failed (${r.status})`);
      }
      setMsg(
        `Saved ${mealType}. Meals logged today: ${data?.mealsLoggedToday ?? "—"}. Streak: ${data?.streak ?? "—"} day(s).`
      );
      setManualNote("");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Could not save meal.");
    } finally {
      setBusy(false);
    }
  }, [base, token, mealType, portionSize, manualNote, calories, protein, carbs, fat, fiber, date]);

  return (
    <div className="nut-page">
      <div className="nut-inner">
        <header className="nut-head">
          <Link href="/dashboard" className="nut-back">
            ← Back to dashboard
          </Link>
          <h1>Nutrition AI</h1>
          <p className="nut-sub">
            Log a meal with macros. Entries sync to your coach dashboard when nutrition tools are enabled on the server.
          </p>
        </header>

        {!token ? (
          <p className="nut-warn">You need to be logged in. Open <Link href="/dashboard">Dashboard</Link> and sign in, then return here.</p>
        ) : (
          <form
            className="nut-form"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {err ? <p className="nut-err">{err}</p> : null}
            {msg ? <p className="nut-ok">{msg}</p> : null}

            <label className="nut-lab">
              Date
              <input className="nut-inp" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>

            <label className="nut-lab">
              Meal
              <select className="nut-inp" value={mealType} onChange={(e) => setMealType(e.target.value)}>
                {MEALS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="nut-lab">
              Portion hint
              <select className="nut-inp" value={portionSize} onChange={(e) => setPortionSize(e.target.value)}>
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </label>

            <label className="nut-lab">
              What did you eat? <span className="nut-req">*</span>
              <textarea
                className="nut-ta"
                value={manualNote}
                onChange={(e) => setManualNote(e.target.value)}
                placeholder="e.g. Oats with banana, black coffee, grilled chicken salad…"
                rows={4}
                required
              />
            </label>

            <div className="nut-macros">
              <label className="nut-lab nut-lab-inline">
                Calories
                <input className="nut-inp" type="number" min={0} placeholder="—" value={calories} onChange={(e) => setCalories(e.target.value)} />
              </label>
              <label className="nut-lab nut-lab-inline">
                Protein (g)
                <input className="nut-inp" type="number" min={0} placeholder="—" value={protein} onChange={(e) => setProtein(e.target.value)} />
              </label>
              <label className="nut-lab nut-lab-inline">
                Carbs (g)
                <input className="nut-inp" type="number" min={0} placeholder="—" value={carbs} onChange={(e) => setCarbs(e.target.value)} />
              </label>
              <label className="nut-lab nut-lab-inline">
                Fat (g)
                <input className="nut-inp" type="number" min={0} placeholder="—" value={fat} onChange={(e) => setFat(e.target.value)} />
              </label>
              <label className="nut-lab nut-lab-inline">
                Fiber (g)
                <input className="nut-inp" type="number" min={0} placeholder="—" value={fiber} onChange={(e) => setFiber(e.target.value)} />
              </label>
            </div>

            <button type="submit" className="nut-submit" disabled={busy}>
              {busy ? "Saving…" : "Save meal"}
            </button>
          </form>
        )}
      </div>
      <style jsx global>{`
        .nut-page {
          min-height: 100vh;
          background: var(--bg-primary, #0f0f0f);
          color: var(--text-primary, #eaeaea);
          padding: 24px 16px 48px;
        }
        .nut-inner {
          max-width: 520px;
          margin: 0 auto;
        }
        .nut-head h1 {
          font-family: Syne, system-ui, sans-serif;
          font-size: 1.75rem;
          margin: 12px 0 8px;
        }
        .nut-sub {
          color: var(--text-secondary, #9a9a9a);
          font-size: 14px;
          line-height: 1.5;
          margin: 0 0 24px;
        }
        .nut-back {
          color: var(--accent, #c9a84c);
          text-decoration: none;
          font-size: 14px;
        }
        .nut-back:hover {
          text-decoration: underline;
        }
        .nut-warn {
          color: var(--text-secondary, #bbb);
        }
        .nut-warn a {
          color: var(--accent, #c9a84c);
        }
        .nut-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .nut-lab {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-secondary, #9a9a9a);
        }
        .nut-lab-inline {
          flex: 1;
          min-width: 0;
        }
        .nut-macros {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: 12px;
        }
        .nut-req {
          color: var(--accent, #c9a84c);
        }
        .nut-inp,
        .nut-ta {
          background: var(--bg-card, #1a1a1a);
          border: 1px solid var(--border, #2a2a2a);
          border-radius: 10px;
          color: var(--text-primary, #eaeaea);
          padding: 10px 12px;
          font-size: 15px;
          text-transform: none;
          letter-spacing: normal;
        }
        .nut-ta {
          resize: vertical;
        }
        .nut-err {
          color: #f07178;
          margin: 0;
          font-size: 14px;
        }
        .nut-ok {
          color: #7ec699;
          margin: 0;
          font-size: 14px;
        }
        .nut-submit {
          margin-top: 8px;
          padding: 14px;
          border-radius: 10px;
          border: 1px solid var(--accent-border, #8a7340);
          background: linear-gradient(145deg, var(--accent-light, #d4b76a), var(--accent, #c9a84c));
          color: var(--on-accent, #111);
          font-weight: 700;
          cursor: pointer;
        }
        .nut-submit:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
