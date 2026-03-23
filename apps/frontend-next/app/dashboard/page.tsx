"use client";

import { useEffect, useMemo, useState } from "react";

type Session = { token: string; user?: { id?: string; role?: string; first_name?: string; last_name?: string; email?: string } };

const APP_SITE_URL =
  process.env.NEXT_PUBLIC_APP_SITE_URL ||
  process.env.NEXT_PUBLIC_LEGACY_SITE_URL ||
  "http://localhost:3200";
const APP_SITE_BASE = APP_SITE_URL.replace(/\/+$/, "");

function getSession(): Session | null {
  try {
    const raw = localStorage.getItem("fitbase_session");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default function DashboardPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [threadsCount, setThreadsCount] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<"home" | "clients" | "forms" | "messages" | "ai">("home");
  const [error, setError] = useState("");

  const displayName = useMemo(() => {
    const u = session?.user;
    if (!u) return "Trainer";
    const name = [u.first_name || "", u.last_name || ""].join(" ").trim();
    if (name) return name;
    const email = String(u.email || "");
    return email ? email.split("@")[0] : "Trainer";
  }, [session]);

  useEffect(() => {
    const s = getSession();
    if (!s?.token) {
      window.location.replace(`${APP_SITE_BASE}/login.html`);
      return;
    }
    setSession(s);
  }, []);

  useEffect(() => {
    if (!session?.token) return;
    const headers = { Authorization: `Bearer ${session.token}` };
    Promise.all([
      fetch(`${APP_SITE_BASE}/api/stats`, { headers }).then((r) => r.json()).catch(() => null),
      fetch(`${APP_SITE_BASE}/api/admin/recent-activity`, { headers }).then((r) => r.json()).catch(() => []),
      fetch(`${APP_SITE_BASE}/api/threads`, { headers }).then((r) => r.json()).catch(() => [])
    ])
      .then(([s, a, t]) => {
        if (s?.error) setError(s.error);
        setStats(s || null);
        setActivity(Array.isArray(a) ? a : []);
        setThreadsCount(Array.isArray(t) ? t.length : 0);
      })
      .catch(() => setError("Failed to load dashboard data."));
  }, [session]);

  const s = {
    bg: "#f5f2eb",
    panel: "#fbf8f1",
    line: "rgba(126,95,55,.24)",
    text: "#1f1a14",
    muted: "#746858",
    gold: "#8c6a3f"
  };

  return (
    <main style={{ minHeight: "100dvh", background: s.bg, color: s.text }}>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "12px 14px",
          borderBottom: `1px solid ${s.line}`,
          background: "rgba(250,248,242,.92)",
          backdropFilter: "blur(8px)"
        }}
      >
        <img src={`${APP_SITE_BASE}/img/Fitbase_logo2.png`} alt="FitBase" style={{ height: 36, width: "auto", objectFit: "contain" }} />
        <button
          onClick={() => {
            localStorage.removeItem("fitbase_session");
            window.location.replace(`${APP_SITE_BASE}/login.html`);
          }}
          style={{
            border: `1px solid ${s.line}`,
            background: "#fff",
            color: "#c56868",
            borderRadius: 8,
            padding: "9px 14px",
            fontWeight: 700,
            cursor: "pointer"
          }}
        >
          LOGOUT
        </button>
      </header>

      <section style={{ padding: "14px 14px 96px" }}>
        <h1 style={{ margin: "0 0 10px", fontSize: 28, lineHeight: 1, letterSpacing: 0.4, color: s.gold }}>DASHBOARD</h1>
        <div style={{ background: s.panel, border: `1px solid ${s.line}`, borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Welcome back "{displayName}"</div>
          <div style={{ color: s.muted, fontSize: 14 }}>{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
        </div>

        {error ? <p style={{ color: "#c56868", marginTop: 12 }}>{error}</p> : null}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
          {[
            { k: "MEMBERS", v: stats?.active_members ?? 0 },
            { k: "DAILY CHECK-IN", v: stats?.daily_checkins ?? 0 },
            { k: "PENDING", v: stats?.pending_signups ?? 0 },
            { k: "MESSAGES", v: threadsCount }
          ].map((x) => (
            <div key={x.k} style={{ background: s.panel, border: `1px solid ${s.line}`, borderRadius: 12, padding: 12 }}>
              <div style={{ color: s.muted, fontSize: 11, letterSpacing: 1.2 }}>{x.k}</div>
              <div style={{ color: s.gold, fontSize: 34, fontWeight: 700, lineHeight: 1.1 }}>{x.v}</div>
            </div>
          ))}
        </div>

        <h2 style={{ margin: "18px 0 8px", color: s.muted, fontSize: 12, letterSpacing: 2 }}>LIVE ACTIVITY</h2>
        <div style={{ background: s.panel, border: `1px solid ${s.line}`, borderRadius: 12, padding: 14 }}>
          {activity.length ? (
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
              {activity.slice(0, 6).map((a, i) => (
                <li key={i} style={{ borderBottom: i === 5 ? "none" : `1px solid ${s.line}`, paddingBottom: 8 }}>
                  <strong>{a?.name || "User"}</strong> - {a?.type || "Update"}
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ margin: 0, color: s.muted }}>No recent activity.</p>
          )}
        </div>
      </section>

      <nav
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 30,
          background: "#fff",
          borderTop: `1px solid ${s.line}`,
          paddingBottom: "max(0px, calc(env(safe-area-inset-bottom,0px) - 6px))"
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", minHeight: 66 }}>
          {[
            ["home", "Home", "★"],
            ["clients", "Clients", "👥"],
            ["forms", "Forms", "📋"],
            ["messages", "Messages", "💬"],
            ["ai", "AI", "💡"]
          ].map(([id, label, icon]) => {
            const active = activeTab === (id as any);
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id as any)}
                style={{
                  border: "none",
                  background: "transparent",
                  color: active ? s.gold : s.muted,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                  fontSize: 11,
                  fontWeight: 600,
                  position: "relative"
                }}
              >
                {active ? <span style={{ position: "absolute", top: 0, height: 3, width: 26, background: s.gold, borderRadius: 2 }} /> : null}
                <span style={{ fontSize: 18, lineHeight: 1 }}>{icon}</span>
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </main>
  );
}

