"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type Chart
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Legend, Tooltip, Filler);

export type ClientProgressLogRow = {
  created_at: string;
  weight?: number | null;
  strength_bench?: number | null;
  strength_squat?: number | null;
  strength_deadlift?: number | null;
  workout_completed?: boolean;
  calories_intake?: number | null;
  protein_intake?: number | null;
  steps?: number | null;
  sleep_hours?: number | null;
};

function destroyMap(map: Record<string, Chart | null>) {
  Object.keys(map).forEach((k) => {
    if (map[k]) {
      map[k]!.destroy();
      map[k] = null;
    }
  });
}

function sortClientLogs(logs: ClientProgressLogRow[] | null | undefined): ClientProgressLogRow[] {
  return (logs || []).slice().sort((a, b) => {
    const da = new Date(a?.created_at).getTime();
    const db = new Date(b?.created_at).getTime();
    return (Number.isNaN(da) ? 0 : da) - (Number.isNaN(db) ? 0 : db);
  });
}

function buildWeeklyWorkoutSeries(sorted: ClientProgressLogRow[]) {
  const byWeek: Record<string, number> = {};
  sorted.forEach((l) => {
    const d = new Date(l.created_at);
    const start = new Date(d);
    start.setDate(start.getDate() - start.getDay());
    start.setHours(0, 0, 0, 0);
    const key = start.toISOString().slice(0, 10);
    if (!byWeek[key]) byWeek[key] = 0;
    if (l.workout_completed) byWeek[key]++;
  });
  const weeks = Object.keys(byWeek).sort().slice(-8);
  const weekLabels = weeks.map((k) =>
    new Date(k).toLocaleDateString("en-US", { month: "short", day: "numeric" })
  );
  const weekCounts = weeks.map((k) => byWeek[k] || 0);
  return { weekLabels, weekCounts };
}

export function ClientProgressCharts({ logs }: { logs: ClientProgressLogRow[] | null | undefined }) {
  const refWeight = useRef<HTMLCanvasElement>(null);
  const refStrength = useRef<HTMLCanvasElement>(null);
  const refWeekly = useRef<HTMLCanvasElement>(null);
  const refCalories = useRef<HTMLCanvasElement>(null);
  const refProtein = useRef<HTMLCanvasElement>(null);
  const refSteps = useRef<HTMLCanvasElement>(null);
  const refSleep = useRef<HTMLCanvasElement>(null);
  const charts = useRef<Record<string, Chart | null>>({});

  const sorted = useMemo(() => sortClientLogs(logs), [logs]);
  const weeklySeries = useMemo(() => buildWeeklyWorkoutSeries(sorted), [sorted]);

  useEffect(() => {
    destroyMap(charts.current);
    charts.current = {};

    const labels = sorted.map((l) => {
      const d = new Date(l.created_at);
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    });

    const scaleOpts = { ticks: { color: "#666" }, grid: { color: "rgba(255,255,255,0.06)" } };
    const chartOpts = {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { labels: { color: "#bfb9ab" } } },
      scales: { x: scaleOpts, y: scaleOpts }
    };

    if (sorted.filter((l) => l.weight != null).length && refWeight.current) {
      const ctx = refWeight.current.getContext("2d");
      if (ctx) {
        charts.current.weight = new ChartJS(ctx, {
          type: "line",
          data: {
            labels,
            datasets: [
              {
                label: "Weight (kg)",
                data: sorted.map((l) => l.weight ?? null),
                borderColor: "#c8a44e",
                backgroundColor: "rgba(200,164,78,0.1)",
                fill: true,
                tension: 0.3
              }
            ]
          },
          options: chartOpts as any
        });
      }
    }

    const hasStrength = sorted.some(
      (l) => l.strength_bench != null || l.strength_squat != null || l.strength_deadlift != null
    );
    if (hasStrength && refStrength.current) {
      const ctx = refStrength.current.getContext("2d");
      if (ctx) {
        charts.current.strength = new ChartJS(ctx, {
          type: "line",
          data: {
            labels,
            datasets: [
              { label: "Bench", data: sorted.map((l) => l.strength_bench ?? null), borderColor: "#c8a44e", tension: 0.3 },
              { label: "Squat", data: sorted.map((l) => l.strength_squat ?? null), borderColor: "#d0b058", tension: 0.3 },
              { label: "Deadlift", data: sorted.map((l) => l.strength_deadlift ?? null), borderColor: "#a68c3e", tension: 0.3 }
            ]
          },
          options: chartOpts as any
        });
      }
    }

    const { weekLabels, weekCounts } = weeklySeries;
    if (refWeekly.current && weekLabels.length) {
      const ctx = refWeekly.current.getContext("2d");
      if (ctx) {
        charts.current.weekly = new ChartJS(ctx, {
          type: "bar",
          data: {
            labels: weekLabels,
            datasets: [
              {
                label: "Workouts",
                data: weekCounts,
                backgroundColor: "rgba(200,164,78,0.6)",
                borderColor: "#c8a44e",
                borderWidth: 1
              }
            ]
          },
          options: chartOpts as any
        });
      }
    }

    if (sorted.filter((l) => l.calories_intake != null).length && refCalories.current) {
      const ctx = refCalories.current.getContext("2d");
      if (ctx) {
        charts.current.calories = new ChartJS(ctx, {
          type: "line",
          data: {
            labels,
            datasets: [
              {
                label: "Calories",
                data: sorted.map((l) => l.calories_intake ?? null),
                borderColor: "#d0b058",
                backgroundColor: "rgba(208,176,88,0.1)",
                fill: true,
                tension: 0.3
              }
            ]
          },
          options: chartOpts as any
        });
      }
    }

    if (sorted.filter((l) => l.protein_intake != null).length && refProtein.current) {
      const ctx = refProtein.current.getContext("2d");
      if (ctx) {
        charts.current.protein = new ChartJS(ctx, {
          type: "line",
          data: {
            labels,
            datasets: [
              {
                label: "Protein (g)",
                data: sorted.map((l) => l.protein_intake ?? null),
                borderColor: "#a68c3e",
                backgroundColor: "rgba(166,140,62,0.1)",
                fill: true,
                tension: 0.3
              }
            ]
          },
          options: chartOpts as any
        });
      }
    }

    if (sorted.filter((l) => l.steps != null).length && refSteps.current) {
      const ctx = refSteps.current.getContext("2d");
      if (ctx) {
        charts.current.steps = new ChartJS(ctx, {
          type: "bar",
          data: {
            labels,
            datasets: [
              {
                label: "Steps",
                data: sorted.map((l) => l.steps ?? null),
                backgroundColor: "rgba(200,164,78,0.6)",
                borderColor: "#c8a44e",
                borderWidth: 1
              }
            ]
          },
          options: chartOpts as any
        });
      }
    }

    if (sorted.filter((l) => l.sleep_hours != null).length && refSleep.current) {
      const ctx = refSleep.current.getContext("2d");
      if (ctx) {
        charts.current.sleep = new ChartJS(ctx, {
          type: "line",
          data: {
            labels,
            datasets: [
              {
                label: "Sleep (hrs)",
                data: sorted.map((l) => l.sleep_hours ?? null),
                borderColor: "#d0b058",
                backgroundColor: "rgba(208,176,88,0.1)",
                fill: true,
                tension: 0.3
              }
            ]
          },
          options: chartOpts as any
        });
      }
    }

    return () => {
      destroyMap(charts.current);
    };
  }, [sorted, weeklySeries]);

  const hasAny =
    sorted.length > 0 &&
    sorted.some(
      (l) =>
        l.weight != null ||
        l.strength_bench != null ||
        l.strength_squat != null ||
        l.strength_deadlift != null ||
        l.workout_completed ||
        l.calories_intake != null ||
        l.protein_intake != null ||
        l.steps != null ||
        l.sleep_hours != null
    );

  if (!hasAny) {
    return <p className="bb-list-row-sub" style={{ marginTop: 12 }}>No chart data yet (progress logs, daily check-ins, or Sunday check-ins).</p>;
  }

  const showWeight = sorted.some((l) => l.weight != null);
  const showStrength = sorted.some(
    (l) => l.strength_bench != null || l.strength_squat != null || l.strength_deadlift != null
  );
  const showWeekly = weeklySeries.weekLabels.length > 0;
  const showCal = sorted.some((l) => l.calories_intake != null);
  const showProt = sorted.some((l) => l.protein_intake != null);
  const showSteps = sorted.some((l) => l.steps != null);
  const showSleep = sorted.some((l) => l.sleep_hours != null);

  return (
    <div className="bb-client-progress-charts">
      {showWeight ? (
        <div className="bb-cp-chart-wrap">
          <canvas ref={refWeight} />
          <p className="bb-cp-chart-title">Weight over time</p>
        </div>
      ) : null}
      {showStrength ? (
        <div className="bb-cp-chart-wrap">
          <canvas ref={refStrength} />
          <p className="bb-cp-chart-title">Strength over time</p>
        </div>
      ) : null}
      {showWeekly ? (
        <div className="bb-cp-chart-wrap">
          <canvas ref={refWeekly} />
          <p className="bb-cp-chart-title">Weekly workout frequency</p>
        </div>
      ) : null}
      {showCal ? (
        <div className="bb-cp-chart-wrap">
          <canvas ref={refCalories} />
          <p className="bb-cp-chart-title">Calories trend</p>
        </div>
      ) : null}
      {showProt ? (
        <div className="bb-cp-chart-wrap">
          <canvas ref={refProtein} />
          <p className="bb-cp-chart-title">Protein intake trend</p>
        </div>
      ) : null}
      {showSteps ? (
        <div className="bb-cp-chart-wrap">
          <canvas ref={refSteps} />
          <p className="bb-cp-chart-title">Steps (Daily check-in)</p>
        </div>
      ) : null}
      {showSleep ? (
        <div className="bb-cp-chart-wrap">
          <canvas ref={refSleep} />
          <p className="bb-cp-chart-title">Sleep hours (all sources)</p>
        </div>
      ) : null}
    </div>
  );
}
