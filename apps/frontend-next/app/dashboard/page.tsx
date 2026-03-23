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
  const [threads, setThreads] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [forms, setForms] = useState<any[]>([]);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiReply, setAiReply] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
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
      fetch(`${APP_SITE_BASE}/api/threads`, { headers }).then((r) => r.json()).catch(() => []),
      fetch(`${APP_SITE_BASE}/api/admin/users`, { headers }).then((r) => r.json()).catch(() => []),
      fetch(`${APP_SITE_BASE}/api/admin/audit-requests`, { headers }).then((r) => r.json()).catch(() => [])
    ])
      .then(([s, a, t, u, f]) => {
        if (s?.error) setError(s.error);
        setStats(s || null);
        setActivity(Array.isArray(a) ? a : []);
        setThreads(Array.isArray(t) ? t : []);
        setClients(Array.isArray(u) ? u : []);
        setForms(Array.isArray(f) ? f : []);
      })
      .catch(() => setError("Failed to load dashboard data."));
  }, [session]);

  async function sendAi() {
    const text = aiPrompt.trim();
    if (!text || !session?.token) return;
    setIsAiLoading(true);
    setAiReply("");
    try {
      const r = await fetch(`${APP_SITE_BASE}/api/admin/ai-assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ message: text })
      });
      const data = await r.json().catch(() => ({}));
      if (data?.error) {
        setAiReply(data.error);
      } else {
        setAiReply(String(data?.reply || "No response."));
      }
    } catch {
      setAiReply("Failed to reach AI assistant.");
    } finally {
      setIsAiLoading(false);
    }
  }

  const s = {
    bg: "#f5f2eb",
    panel: "#fbf8f1",
    line: "rgba(126,95,55,.24)",
    text: "#1f1a14",
    muted: "#746858",
    gold: "#8c6a3f"
  };

  const cardBase: React.CSSProperties = { background: s.panel, border: `1px solid ${s.line}`, borderRadius: 12, padding: 14 };

  function tabButton(id: typeof activeTab, label: string, icon: string) {
    const active = activeTab === id;
    return (
      <button
        key={id}
        onClick={() => setActiveTab(id)}
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
  }

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
        <h1 style={{ margin: "0 0 10px", fontSize: 28, lineHeight: 1, letterSpacing: 0.4, color: s.gold }}>
          {activeTab === "home" ? "DASHBOARD" : activeTab.toUpperCase()}
        </h1>
        <div style={cardBase}>
          <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Welcome back "{displayName}"</div>
          <div style={{ color: s.muted, fontSize: 14 }}>{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
        </div>

        {error ? <p style={{ color: "#c56868", marginTop: 12 }}>{error}</p> : null}

        {activeTab === "home" ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
              {[
                { k: "MEMBERS", v: stats?.active_members ?? 0 },
                { k: "DAILY CHECK-IN", v: stats?.daily_checkins ?? 0 },
                { k: "PENDING", v: stats?.pending_signups ?? 0 },
                { k: "MESSAGES", v: threads.length }
              ].map((x) => (
                <div key={x.k} style={{ ...cardBase, padding: 12 }}>
                  <div style={{ color: s.muted, fontSize: 11, letterSpacing: 1.2 }}>{x.k}</div>
                  <div style={{ color: s.gold, fontSize: 34, fontWeight: 700, lineHeight: 1.1 }}>{x.v}</div>
                </div>
              ))}
            </div>

            <h2 style={{ margin: "18px 0 8px", color: s.muted, fontSize: 12, letterSpacing: 2 }}>LIVE ACTIVITY</h2>
            <div style={cardBase}>
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
          </>
        ) : null}

        {activeTab === "clients" ? (
          <div style={{ ...cardBase, marginTop: 12 }}>
            {clients.length ? (
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
                {clients.slice(0, 25).map((u: any) => (
                  <li key={u.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, borderBottom: `1px solid ${s.line}`, paddingBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{[u.first_name, u.last_name].filter(Boolean).join(" ") || u.email}</div>
                      <div style={{ color: s.muted, fontSize: 12 }}>{u.email}</div>
                    </div>
                    <span style={{ color: s.gold, fontWeight: 700 }}>VIEW</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ margin: 0, color: s.muted }}>No clients found.</p>
            )}
          </div>
        ) : null}

        {activeTab === "forms" ? (
          <div style={{ ...cardBase, marginTop: 12 }}>
            {forms.length ? (
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
                {forms.slice(0, 20).map((f: any) => (
                  <li key={f.id || `${f.email}-${f.created_at}`} style={{ borderBottom: `1px solid ${s.line}`, paddingBottom: 8 }}>
                    <div style={{ fontWeight: 700 }}>{[f.first_name, f.last_name].filter(Boolean).join(" ") || f.email || "Request"}</div>
                    <div style={{ color: s.muted, fontSize: 12 }}>{f.city || "City not provided"} - {f.status || "pending"}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ margin: 0, color: s.muted }}>No forms/audits found.</p>
            )}
          </div>
        ) : null}

        {activeTab === "messages" ? (
          <div style={{ ...cardBase, marginTop: 12 }}>
            {threads.length ? (
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
                {threads.slice(0, 20).map((t: any) => (
                  <li key={t.id} style={{ borderBottom: `1px solid ${s.line}`, paddingBottom: 8 }}>
                    <div style={{ fontWeight: 700 }}>{[t.first_name, t.last_name].filter(Boolean).join(" ") || t.email || "Client"}</div>
                    <div style={{ color: s.muted, fontSize: 12 }}>{String(t.last_message || "No messages yet").slice(0, 80)}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ margin: 0, color: s.muted }}>No message threads yet.</p>
            )}
          </div>
        ) : null}

        {activeTab === "ai" ? (
          <div style={{ ...cardBase, marginTop: 12 }}>
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Ask FitBase AI about your clients, check-ins, workouts..."
              style={{ width: "100%", minHeight: 120, border: `1px solid ${s.line}`, borderRadius: 10, padding: 10, font: "inherit", background: "#fff" }}
            />
            <button
              onClick={sendAi}
              disabled={isAiLoading}
              style={{ marginTop: 10, border: "none", background: `linear-gradient(135deg,#9b7648,#7e5f37)`, color: "#fff", borderRadius: 10, padding: "10px 14px", fontWeight: 700 }}
            >
              {isAiLoading ? "Sending..." : "Ask AI"}
            </button>
            <div style={{ marginTop: 12, color: s.muted, whiteSpace: "pre-wrap" }}>{aiReply || "AI reply will appear here."}</div>
          </div>
        ) : null}
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
          {tabButton("home", "Home", "★")}
          {tabButton("clients", "Clients", "👥")}
          {tabButton("forms", "Forms", "📋")}
          {tabButton("messages", "Messages", "💬")}
          {tabButton("ai", "AI", "💡")}
        </div>
      </nav>
    </main>
  );
}

