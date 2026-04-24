"use client";

import { useEffect, useMemo, useRef } from "react";
import Chart from "chart.js/auto";

export type UserDesktopNavTarget =
  | "workout"
  | "progress"
  | "sunday"
  | "messages"
  | "contact"
  | "home"
  | "formsHub"
  | "nutrition"
  | "aiTrainer";

type Props = {
  displayName: string;
  workouts: any[];
  meetings: any[];
  userToday: any | null;
  userStreak: any | null;
  /** Assigned trainer display name for chat copy (from API). */
  trainerChatName?: string;
  onNavigate: (target: UserDesktopNavTarget) => void;
};

function fmtShortDate(s: string | undefined | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(s).slice(0, 10);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function UserMemberDesktopDashboard({
  displayName,
  workouts,
  meetings,
  userToday,
  userStreak,
  trainerChatName = "",
  onNavigate
}: Props) {
  const chartWRef = useRef<Chart | null>(null);
  const chartGRef = useRef<Chart | null>(null);
  const c1 = useRef<HTMLCanvasElement>(null);
  const c2 = useRef<HTMLCanvasElement>(null);

  const data = useMemo(() => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const list = Array.isArray(workouts) ? workouts : [];
    const workoutsThisWeek = list.filter((w: any) => new Date(w.created_at) >= weekStart).length;
    const sortedWorkouts = list.slice().sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const lastWorkout = sortedWorkouts.length ? new Date(sortedWorkouts[0].created_at) : null;
    const daysSince = lastWorkout ? Math.floor((now.getTime() - lastWorkout.getTime()) / (24 * 60 * 60 * 1000)) : null;
    const mlist = Array.isArray(meetings) ? meetings : [];
    const upcomingMeetings = mlist
      .filter((m: any) => String(m.status || "").toLowerCase() !== "cancelled")
      .sort((a: any, b: any) => new Date(a.meeting_date).getTime() - new Date(b.meeting_date).getTime());
    const nextCall = upcomingMeetings.length ? upcomingMeetings[0] : null;
    const nextCallStr = nextCall
      ? new Date(`${nextCall.meeting_date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : "None";
    const lastMsg = userToday?.lastMessage?.body ? String(userToday.lastMessage.body) : "";
    const lastMsgShort = lastMsg ? (lastMsg.slice(0, 18) + (lastMsg.length > 18 ? "…" : "")) : "—";
    const dailyToday = userToday?.checkin;
    const steps = dailyToday?.steps != null ? parseInt(String(dailyToday.steps), 10) : null;
    const water = dailyToday?.water_ml != null ? parseInt(String(dailyToday.water_ml), 10) : null;
    const protein = dailyToday?.protein_g != null ? parseInt(String(dailyToday.protein_g), 10) : null;
    const sleep = dailyToday?.sleep_hours != null ? parseFloat(String(dailyToday.sleep_hours)) : null;
    const streakN = userStreak?.streak != null ? parseInt(String(userStreak.streak), 10) : 0;
    const streakAtRisk = !!userStreak?.atRisk;
    const byDay: Record<string, number> = {};
    list.forEach((w: any) => {
      const d = new Date(w.created_at);
      if (Number.isNaN(d.getTime())) return;
      const key = d.toISOString().slice(0, 10);
      byDay[key] = (byDay[key] || 0) + 1;
    });
    const dayKeys = Object.keys(byDay).sort().slice(-14);
    const chartLabels = dayKeys.map((k) => fmtShortDate(k));
    const chartValues = dayKeys.map((k) => byDay[k] || 0);
    const activity: {
      at: string;
      type: string;
      summary: string;
      status: string;
      link: UserDesktopNavTarget;
    }[] = [];
    sortedWorkouts.slice(0, 6).forEach((w: any) => {
      activity.push({
        at: w.created_at,
        type: "Workout",
        summary: w.workout_name || "Workout",
        status: "DONE",
        link: "workout"
      });
    });
    upcomingMeetings.slice(0, 4).forEach((m: any) => {
      activity.push({
        at: m.meeting_date ? `${m.meeting_date}T12:00:00` : m.created_at,
        type: "Meeting",
        summary: m.time_slot || "Scheduled",
        status: String(m.status || "NEW").toUpperCase(),
        link: "contact"
      });
    });
    if (userToday?.lastMessage) {
      activity.push({
        at: userToday.lastMessage.created_at || userToday.lastMessage.createdAt || new Date().toISOString(),
        type: "Message",
        summary: (userToday.lastMessage.body || "").slice(0, 40) || "Message",
        status: "UNREAD",
        link: "messages"
      });
    }
    if (dailyToday && (steps != null || water != null || protein != null || sleep != null)) {
      activity.push({
        at: new Date().toISOString(),
        type: "Daily Check-in",
        summary: "Saved today",
        status: "DONE",
        link: "home"
      });
    }
    activity.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    const activityRows = activity.slice(0, 8);
    return {
      workoutsThisWeek,
      nextCallStr,
      nextCall,
      daysSince,
      lastMsg,
      lastMsgShort,
      steps,
      water,
      protein,
      sleep,
      streakN,
      streakAtRisk,
      chartLabels,
      chartValues,
      activityRows
    };
  }, [workouts, meetings, userToday, userStreak]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const gold = "#c9a84c";
      const muted = "#888888";
      const grid = "#1f1f1f";
      if (c1.current) {
        chartWRef.current?.destroy();
        chartWRef.current = new Chart(c1.current, {
          type: "line",
          data: {
            labels: data.chartLabels,
            datasets: [
              {
                data: data.chartValues,
                borderColor: gold,
                backgroundColor: "rgba(201,168,76,0.08)",
                fill: true,
                tension: 0.4,
                pointRadius: 3,
                pointBackgroundColor: gold
              }
            ]
          },
          options: {
            plugins: { legend: { display: false } },
            scales: {
              x: { grid: { display: false }, ticks: { color: muted } },
              y: { grid: { color: grid }, ticks: { color: muted }, beginAtZero: true }
            }
          }
        });
      }
      if (c2.current) {
        chartGRef.current?.destroy();
        const goal = 5;
        const done = Math.min(goal, data.workoutsThisWeek);
        const remaining = Math.max(0, goal - done);
        chartGRef.current = new Chart(c2.current, {
          type: "doughnut",
          data: {
            labels: ["Done", "Remaining"],
            datasets: [
              {
                data: [done, remaining || 0.0001],
                backgroundColor: [gold, "#3a3a3a"],
                borderWidth: 0,
                hoverOffset: 4
              }
            ]
          },
          options: {
            cutout: "70%",
            plugins: {
              legend: { position: "right", labels: { color: muted, font: { size: 12 } } }
            }
          }
        });
      }
    }, 150);
    return () => {
      window.clearTimeout(t);
      chartWRef.current?.destroy();
      chartGRef.current?.destroy();
      chartWRef.current = null;
      chartGRef.current = null;
    };
  }, [data.chartLabels, data.chartValues, data.workoutsThisWeek]);

  const stepGoal = 8000;
  const waterGoal = 2000;
  const proteinGoal = 120;
  const sleepGoal = 8;

  const barPct = (v: number | null, g: number) => (v != null ? Math.min(100, (v / g) * 100) : 0);

  return (
    <>
      <style>{`
        .udesk-topbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;padding-bottom:20px;border-bottom:1px solid var(--border);flex-wrap:wrap;gap:12px}
        .udesk-topbar h2{font-family:'Syne',sans-serif;font-size:22px;font-weight:700;color:var(--text-primary);letter-spacing:.04em;margin:0}
        .udesk-topbar-right{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
        .udesk-topbar-right input[type="search"]{background:var(--bg-card);border:1px solid var(--border);color:var(--text-primary);padding:8px 16px;border-radius:8px;font-size:13px;width:min(220px,100%);outline:none}
        .udesk-stat-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin-bottom:20px}
        @media(max-width:1100px){.udesk-stat-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
        .udesk-stat-card{background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:20px;box-shadow:var(--shadow-sm)}
        .udesk-stat-card .sl{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--accent);margin-bottom:8px}
        .udesk-stat-card .sn{font-family:'Bebas Neue',sans-serif;font-size:38px;font-weight:700;color:var(--text-primary);line-height:1;margin-bottom:8px}
        .udesk-stat-card .ss{font-size:12px;color:var(--text-secondary)}
        .udesk-stat-card .ss.up{color:var(--green)}
        .udesk-chart-grid{display:grid;grid-template-columns:2fr 1fr;gap:16px;margin-bottom:20px}
        @media(max-width:900px){.udesk-chart-grid{grid-template-columns:1fr}}
        .udesk-chart-card{background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:20px;box-shadow:var(--shadow-sm)}
        .udesk-chart-card h3{font-family:'Syne',sans-serif;font-size:14px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--text-primary);margin:0 0 16px;padding-bottom:10px;border-bottom:1px solid var(--border)}
        .udesk-prog-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-bottom:20px}
        @media(max-width:1100px){.udesk-prog-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
        @media(max-width:700px){.udesk-prog-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
        .udesk-prog-card{background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px;box-shadow:var(--shadow-sm)}
        .udesk-prog-card .pl{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-secondary);margin-bottom:10px}
        .udesk-prog-card .pn{font-family:'Bebas Neue',sans-serif;font-size:28px;font-weight:700;color:var(--text-primary);margin-bottom:10px}
        .udesk-bar-track{background:color-mix(in srgb,var(--text-primary) 12%,transparent);border-radius:4px;height:4px;width:100%}
        .udesk-bar-fill{height:4px;border-radius:4px;background:var(--accent)}
        .udesk-prog-card .pp{font-size:11px;color:var(--accent);margin-top:6px}
        .udesk-table-card{background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:20px;box-shadow:var(--shadow-sm);overflow-x:auto}
        .udesk-table-card h3{font-family:'Syne',sans-serif;font-size:14px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;margin:0 0 16px;padding-bottom:10px;border-bottom:1px solid var(--border);color:var(--text-primary)}
        .udesk-tbl{width:100%;border-collapse:collapse;font-size:13px;min-width:520px}
        .udesk-tbl th{text-align:left;color:var(--text-secondary);font-size:11px;text-transform:uppercase;letter-spacing:.08em;padding:8px 12px;border-bottom:1px solid var(--border)}
        .udesk-tbl td{padding:12px;border-bottom:1px solid var(--border);vertical-align:middle;color:var(--text-secondary)}
        .udesk-pill{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em}
        .udesk-pill.low{background:color-mix(in srgb,var(--green) 18%,transparent);color:var(--green)}
        .udesk-pill.medium{background:color-mix(in srgb,var(--accent) 22%,transparent);color:var(--accent)}
        .udesk-pill.high{background:color-mix(in srgb,var(--red) 22%,transparent);color:var(--red)}
        .udesk-quick{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:20px}
        @media(max-width:900px){.udesk-quick{grid-template-columns:repeat(2,minmax(0,1fr))}}
        .udesk-qbtn{background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px;display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer;transition:all .2s;font:inherit;color:var(--text-secondary);font-size:11px;text-transform:uppercase;letter-spacing:.06em}
        .udesk-qbtn:hover{border-color:var(--accent);color:var(--accent);background:rgb(var(--accent-rgb) / 0.06)}
      `}</style>
      <div className="udesk-member-desktop">
        <div className="udesk-topbar">
          <h2>
            Welcome back, <span>{displayName}</span> 👋
          </h2>
          <div className="udesk-topbar-right">
            <input type="search" placeholder="Search…" readOnly aria-label="Search" />
            <span style={{ fontSize: 18 }} aria-hidden>
              🔔
            </span>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Member ▾</span>
          </div>
        </div>

        <div className="udesk-stat-grid">
          <div className="udesk-stat-card">
            <div className="sl">Workouts This Week</div>
            <div className="sn">{String(data.workoutsThisWeek)}</div>
            <div className="ss up">Goal: 5 / week</div>
          </div>
          <div className="udesk-stat-card">
            <div className="sl">Next Call</div>
            <div className="sn">{data.nextCallStr}</div>
            <div className="ss">{data.nextCall ? data.nextCall.time_slot || "Scheduled" : "No meeting booked"}</div>
          </div>
          <div className="udesk-stat-card">
            <div className="sl">Days Since Workout</div>
            <div className="sn">{data.daysSince !== null ? String(data.daysSince) : "—"}</div>
            <div className="ss">Since last workout</div>
          </div>
          <div className="udesk-stat-card">
            <div className="sl">Last Message</div>
            <div className="sn">{data.lastMsgShort}</div>
            <div className="ss">
              {data.lastMsg
                ? trainerChatName.trim()
                  ? `Most recent reply from ${trainerChatName.trim()}`
                  : "Most recent reply from your coach"
                : "No messages yet"}
            </div>
          </div>
        </div>

        <div className="udesk-chart-grid">
          <div className="udesk-chart-card">
            <h3>Workouts Trend</h3>
            <canvas ref={c1} height={120} />
          </div>
          <div className="udesk-chart-card">
            <h3>Weekly Goal (5 Workouts)</h3>
            <canvas ref={c2} height={120} />
          </div>
        </div>

        <div className="udesk-prog-grid">
          <div className="udesk-prog-card">
            <div className="pl">Steps (today)</div>
            <div className="pn">{data.steps != null ? String(data.steps) : "—"}</div>
            <div className="udesk-bar-track">
              <div className="udesk-bar-fill" style={{ width: `${barPct(data.steps, stepGoal)}%` }} />
            </div>
            <div className="pp">
              {data.steps != null ? `${Math.round((data.steps / stepGoal) * 100)}% of ${stepGoal}` : "—"}
            </div>
          </div>
          <div className="udesk-prog-card">
            <div className="pl">Water (ml)</div>
            <div className="pn">{data.water != null ? String(data.water) : "—"}</div>
            <div className="udesk-bar-track">
              <div className="udesk-bar-fill" style={{ width: `${barPct(data.water, waterGoal)}%` }} />
            </div>
            <div className="pp">
              {data.water != null ? `${Math.round((data.water / waterGoal) * 100)}% of ${waterGoal}` : "—"}
            </div>
          </div>
          <div className="udesk-prog-card">
            <div className="pl">Protein (g)</div>
            <div className="pn">{data.protein != null ? String(data.protein) : "—"}</div>
            <div className="udesk-bar-track">
              <div className="udesk-bar-fill" style={{ width: `${barPct(data.protein, proteinGoal)}%` }} />
            </div>
            <div className="pp">
              {data.protein != null ? `${Math.round((data.protein / proteinGoal) * 100)}% of ${proteinGoal}` : "—"}
            </div>
          </div>
          <div className="udesk-prog-card">
            <div className="pl">Sleep (hrs)</div>
            <div className="pn">{data.sleep != null ? String(data.sleep) : "—"}</div>
            <div className="udesk-bar-track">
              <div className="udesk-bar-fill" style={{ width: `${barPct(data.sleep, sleepGoal)}%` }} />
            </div>
            <div className="pp">
              {data.sleep != null ? `${Math.round((data.sleep / sleepGoal) * 100)}% of ${sleepGoal}` : "—"}
            </div>
          </div>
          <div className="udesk-prog-card">
            <div className="pl">Streak</div>
            <div className="pn">{String(data.streakN)}</div>
            <div className="udesk-bar-track">
              <div className="udesk-bar-fill" style={{ width: `${Math.min(100, (data.streakN / 7) * 100)}%` }} />
            </div>
            <div className="pp">
              {data.streakN
                ? `${data.streakN} day streak${data.streakAtRisk ? " — save today!" : ""}`
                : "Start today"}
            </div>
          </div>
        </div>

        <div
          style={{
            marginBottom: 20,
            padding: "16px 18px",
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "color-mix(in srgb, var(--text-primary) 4%, var(--bg-card))"
          }}
        >
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--accent)", marginBottom: 8 }}>
            Daily check-in · Nutrition AI
          </div>
          <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            Log meals and macros alongside your steps, water, and protein on mobile.
          </p>
          <button type="button" className="udesk-qbtn" style={{ width: "100%", maxWidth: 280 }} onClick={() => onNavigate("nutrition")}>
            <span aria-hidden>🥗</span> Open Nutrition AI
          </button>
        </div>

        <div className="udesk-table-card">
          <h3>Recent Activity</h3>
          <table className="udesk-tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Summary</th>
                <th>Status</th>
                <th>Link</th>
              </tr>
            </thead>
            <tbody>
              {data.activityRows.length ? (
                data.activityRows.map((a, i) => {
                  const pillClass = a.status === "DONE" ? "low" : a.status === "UNREAD" ? "high" : "medium";
                  return (
                    <tr key={`${a.type}-${i}-${a.at}`}>
                      <td>{fmtShortDate(a.at)}</td>
                      <td>{a.type}</td>
                      <td style={{ color: "var(--text-primary)" }}>{a.summary}</td>
                      <td>
                        <span className={`udesk-pill ${pillClass}`}>{a.status}</span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="udesk-qbtn"
                          style={{ padding: "8px 10px", borderRadius: 10, fontSize: 11, width: "auto", minHeight: 0 }}
                          onClick={() => onNavigate(a.link)}
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: 20 }}>
                    No activity yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="udesk-quick">
          <button type="button" className="udesk-qbtn" onClick={() => onNavigate("workout")}>
            <span aria-hidden>🏋️</span> Log Workout
          </button>
          <button type="button" className="udesk-qbtn" onClick={() => onNavigate("aiTrainer")}>
            <span aria-hidden>🎯</span> AI Trainer
          </button>
          <button type="button" className="udesk-qbtn" onClick={() => onNavigate("progress")}>
            <span aria-hidden>📈</span> My Progress
          </button>
          <button type="button" className="udesk-qbtn" onClick={() => onNavigate("sunday")}>
            <span aria-hidden>✅</span> Sunday Check-in
          </button>
          <button type="button" className="udesk-qbtn" onClick={() => onNavigate("messages")}>
            <span aria-hidden>💬</span> Messages
          </button>
          <button type="button" className="udesk-qbtn" onClick={() => onNavigate("contact")}>
            <span aria-hidden>📅</span> Schedule Call
          </button>
        </div>
      </div>
    </>
  );
}
