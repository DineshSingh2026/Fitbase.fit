"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FITBASE_SESSION_KEY, parseFitbaseSessionFromStorage } from "../../lib/fitbase-session";
import { getApiSiteBase } from "../../lib/site-url";
import "../coach-surfaces.css";

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

const MEAL_SLOTS = [
  { value: "breakfast", label: "Breakfast", time: "7–9 AM" },
  { value: "lunch", label: "Lunch", time: "12–2 PM" },
  { value: "snack", label: "Snack", time: "3–5 PM" },
  { value: "dinner", label: "Dinner", time: "6–9 PM" }
] as const;

type MealRow = { meal_type: string; manual_note?: string; submitted_at?: string };

export default function NutritionClient() {
  const base = useMemo(() => getApiSiteBase(), []);
  const session = useMemo(() => parseFitbaseSessionFromStorage(readSessionRaw()), []);
  const token = session?.token || "";
  const userId = session?.user?.id || "";

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dayMeals, setDayMeals] = useState<MealRow[]>([]);
  const [loadingDay, setLoadingDay] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [globalErr, setGlobalErr] = useState<string | null>(null);
  const [globalOk, setGlobalOk] = useState<string | null>(null);
  const [cardErr, setCardErr] = useState<Record<string, string>>({});
  const [cardBusy, setCardBusy] = useState<Record<string, boolean>>({});

  const [manualNote, setManualNote] = useState("");
  const [portionSize, setPortionSize] = useState("medium");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [fiber, setFiber] = useState("");

  const fetchDay = useCallback(async () => {
    if (!token || !userId) return;
    setLoadingDay(true);
    setGlobalErr(null);
    try {
      const r = await fetch(`${base}/api/nutrition/log/${encodeURIComponent(userId)}/${encodeURIComponent(date)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.message || data?.error || `Could not load day (${r.status})`);
      setDayMeals(Array.isArray(data?.meals) ? data.meals : []);
    } catch (e) {
      setDayMeals([]);
      setGlobalErr(e instanceof Error ? e.message : "Could not load nutrition day.");
    } finally {
      setLoadingDay(false);
    }
  }, [base, token, userId, date]);

  useEffect(() => {
    void fetchDay();
  }, [fetchDay]);

  const isLogged = (mt: string) => dayMeals.some((m) => String(m.meal_type).toLowerCase() === mt);

  const setBusy = (mt: string, v: boolean) => setCardBusy((p) => ({ ...p, [mt]: v }));
  const setErr = (mt: string, msg: string | null) =>
    setCardErr((p) => {
      const n = { ...p };
      if (msg) n[mt] = msg;
      else delete n[mt];
      return n;
    });

  const submitManual = async (mealType: string) => {
    setGlobalOk(null);
    const note = manualNote.trim();
    if (!note) {
      setErr(mealType, "Describe what you ate.");
      return;
    }
    setBusy(mealType, true);
    setErr(mealType, null);
    try {
      const body: Record<string, unknown> = {
        mealType,
        portionSize,
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
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body)
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.message || data?.error || `Save failed (${r.status})`);
      setGlobalOk(`Saved ${mealType}. Meals today: ${data?.mealsLoggedToday ?? "—"}.`);
      setManualNote("");
      setExpanded(null);
      await fetchDay();
    } catch (e) {
      setErr(mealType, e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(mealType, false);
    }
  };

  const submitPhoto = async (mealType: string, file: File) => {
    setGlobalOk(null);
    setBusy(mealType, true);
    setErr(mealType, null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result || ""));
        fr.onerror = () => reject(new Error("Could not read image."));
        fr.readAsDataURL(file);
      });
      const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
      const r = await fetch(`${base}/api/nutrition/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          mealType,
          portionSize: "medium",
          manualNote: "Meal from photo.",
          imageBase64: base64,
          mimeType: file.type || "image/jpeg",
          date,
          triggerNotify: false,
          autoNotifyOnComplete: false
        })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(
          data?.message || data?.error || `Photo analyze failed (${r.status}). Try “Enter manually” or check AI settings.`
        );
      }
      setGlobalOk(`Saved ${mealType} from photo.`);
      await fetchDay();
    } catch (e) {
      setErr(mealType, e instanceof Error ? e.message : "Photo upload failed.");
    } finally {
      setBusy(mealType, false);
    }
  };

  const openManual = (mt: string) => {
    setExpanded(expanded === mt ? null : mt);
    setErr(mt, null);
    setManualNote("");
    setPortionSize("medium");
    setCalories("");
    setProtein("");
    setCarbs("");
    setFat("");
    setFiber("");
  };

  if (!token || !userId) {
    return (
      <div className="nut-surface">
        <div className="nut-surface-inner">
          <Link href="/dashboard" className="nut-back">
            ← Back to dashboard
          </Link>
          <div className="fc-brand-head">
            <span className="fc-brand-title">Fitbase Nutrition</span>
            <span className="fc-brand-badge">AI</span>
            <p className="fc-brand-sub">Co-powered by Fitbase.</p>
          </div>
          <p className="fc-msg-err" style={{ color: "#aaa" }}>
            Sign in from the <Link href="/dashboard">dashboard</Link> first.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="nut-surface">
      <div className="nut-surface-inner">
        <Link href="/dashboard" className="nut-back">
          ← Back to dashboard
        </Link>

        <header className="fc-brand-head">
          <span className="fc-brand-title">Fitbase Nutrition</span>
          <span className="fc-brand-badge">AI</span>
          <p className="fc-brand-sub">Co-powered by Fitbase.</p>
        </header>

        <div className="nut-date-row">
          <label htmlFor="nut-date">Day</label>
          <input id="nut-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        {globalErr ? <p className="fc-msg-err">{globalErr}</p> : null}
        {globalOk ? <p className="fc-msg-ok">{globalOk}</p> : null}
        {loadingDay ? <p className="fc-brand-sub">Loading…</p> : null}

        {MEAL_SLOTS.map((slot) => {
          const logged = isLogged(slot.value);
          const busy = !!cardBusy[slot.value];
          const err = cardErr[slot.value];
          const isOpen = expanded === slot.value;

          return (
            <div key={slot.value} className="fc-meal-card">
              <div className="fc-meal-top">
                <div className="fc-meal-name">{slot.label}</div>
                <span className={`fc-status-pill${logged ? " fc-logged" : ""}`}>{logged ? "Logged" : "Not logged"}</span>
              </div>
              <div className="fc-meal-time">{slot.time}</div>

              <input
                id={`nut-file-${slot.value}`}
                type="file"
                accept="image/*"
                className="fc-file-hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void submitPhoto(slot.value, f);
                }}
              />
              <label htmlFor={`nut-file-${slot.value}`} className={`fc-photo-dash${busy ? " fc-disabled" : ""}`}>
                Take photo
              </label>

              <button
                type="button"
                className="fc-btn-upload"
                disabled={busy}
                onClick={() => document.getElementById(`nut-file-${slot.value}`)?.click()}
              >
                Upload from device
              </button>
              <div className="fc-or">or</div>
              <button type="button" className="fc-btn-manual" disabled={busy} onClick={() => openManual(slot.value)}>
                {isOpen ? "Close manual entry" : "Enter manually"}
              </button>

              {err ? <p className="fc-msg-err" style={{ marginTop: 10 }}>{err}</p> : null}

              {isOpen ? (
                <div className="fc-manual-panel">
                  <label htmlFor={`nut-portion-${slot.value}`}>Portion hint</label>
                  <select id={`nut-portion-${slot.value}`} value={portionSize} onChange={(e) => setPortionSize(e.target.value)}>
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
                    <option value="large">Large</option>
                  </select>

                  <label htmlFor={`nut-note-${slot.value}`}>What did you eat? *</label>
                  <textarea
                    id={`nut-note-${slot.value}`}
                    value={manualNote}
                    onChange={(e) => setManualNote(e.target.value)}
                    placeholder="e.g. Oats, eggs, greens…"
                  />

                  <label style={{ marginTop: 12 }}>Macros (optional)</label>
                  <div className="fc-macro-grid">
                    <input type="number" min={0} placeholder="Calories" value={calories} onChange={(e) => setCalories(e.target.value)} />
                    <input type="number" min={0} placeholder="Protein g" value={protein} onChange={(e) => setProtein(e.target.value)} />
                    <input type="number" min={0} placeholder="Carbs g" value={carbs} onChange={(e) => setCarbs(e.target.value)} />
                    <input type="number" min={0} placeholder="Fat g" value={fat} onChange={(e) => setFat(e.target.value)} />
                    <input type="number" min={0} placeholder="Fiber g" value={fiber} onChange={(e) => setFiber(e.target.value)} />
                  </div>

                  <div className="fc-save-row">
                    <button type="button" className="fc-btn-save" disabled={busy} onClick={() => void submitManual(slot.value)}>
                      {busy ? "Saving…" : `Save ${slot.label}`}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
