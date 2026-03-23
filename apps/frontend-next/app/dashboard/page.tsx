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
  const role = String(session?.user?.role || "");
  const [stats, setStats] = useState<any>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [threads, setThreads] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [forms, setForms] = useState<any[]>([]);
  const [dailyCheckins, setDailyCheckins] = useState<any[]>([]);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [pendingUsers, setPendingUsers] = useState<any[]>([]);
  const [isUserActionBusy, setIsUserActionBusy] = useState<string>("");
  const [selectedThreadId, setSelectedThreadId] = useState<string>("");
  const [threadMessages, setThreadMessages] = useState<any[]>([]);
  const [replyText, setReplyText] = useState("");
  const [isReplying, setIsReplying] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiReply, setAiReply] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"home" | "clients" | "forms" | "messages" | "ai">("home");
  const [error, setError] = useState("");
  const [selectedClient, setSelectedClient] = useState<any | null>(null);
  const [selectedForm, setSelectedForm] = useState<any | null>(null);
  const [selectedCheckin, setSelectedCheckin] = useState<any | null>(null);
  const [selectedWorkout, setSelectedWorkout] = useState<any | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<any | null>(null);
  const [clientProgress, setClientProgress] = useState<any | null>(null);
  const [clientProgressLink, setClientProgressLink] = useState("");
  const [newClient, setNewClient] = useState({ first_name: "", last_name: "", email: "", phone: "", password: "" });
  const [isCreatingClient, setIsCreatingClient] = useState(false);
  const [isMeetingUpdating, setIsMeetingUpdating] = useState(false);

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
    if (role === "superadmin") {
      Promise.all([
        fetch(`${APP_SITE_BASE}/api/superadmin/dashboard`, { headers }).then((r) => r.json()).catch(() => null),
        fetch(`${APP_SITE_BASE}/api/superadmin/trainer-requests`, { headers }).then((r) => r.json()).catch(() => []),
        fetch(`${APP_SITE_BASE}/api/threads`, { headers }).then((r) => r.json()).catch(() => [])
      ])
        .then(([s, reqs, t]) => {
          if (s?.error) setError(s.error);
          const statObj = s?.stats || {};
          setStats({
            active_members: Number(statObj.approved_users || 0),
            daily_checkins: Number(statObj.daily_checkins || 0),
            pending_signups: Number(statObj.pending_signups || 0),
            messages: Number(statObj.messages || 0)
          });
          setForms(Array.isArray(reqs) ? reqs : []);
          setThreads(Array.isArray(t) ? t : []);
          setActivity(Array.isArray(s?.meetings) ? s.meetings.slice(0, 8) : []);
          setClients(Array.isArray(s?.users) ? s.users : []);
          setDailyCheckins(Array.isArray(s?.daily_checkins) ? s.daily_checkins : []);
          setWorkouts(Array.isArray(s?.workouts) ? s.workouts : []);
          setPendingUsers(Array.isArray(s?.users) ? s.users.filter((u: any) => String(u.approval_status || "").toLowerCase() === "pending") : []);
        })
        .catch(() => setError("Failed to load dashboard data."));
      return;
    }

    if (role === "user") {
      const userId = String(session?.user?.id || "");
      Promise.all([
        fetch(`${APP_SITE_BASE}/api/workouts/${encodeURIComponent(userId)}`, { headers }).then((r) => r.json()).catch(() => []),
        fetch(`${APP_SITE_BASE}/api/meetings/user/${encodeURIComponent(userId)}`, { headers }).then((r) => r.json()).catch(() => []),
        fetch(`${APP_SITE_BASE}/api/threads`, { headers }).then((r) => r.json()).catch(() => [])
      ])
        .then(([w, m, t]) => {
          setStats({
            active_members: 1,
            daily_checkins: 0,
            pending_signups: 0,
            messages: Array.isArray(t) ? t.length : 0
          });
          setWorkouts(Array.isArray(w) ? w : []);
          setActivity(Array.isArray(m) ? m : []);
          setThreads(Array.isArray(t) ? t : []);
          setClients([]);
          setForms([]);
          setDailyCheckins([]);
          setPendingUsers([]);
        })
        .catch(() => setError("Failed to load dashboard data."));
      return;
    }

    Promise.all([
      fetch(`${APP_SITE_BASE}/api/stats`, { headers }).then((r) => r.json()).catch(() => null),
      fetch(`${APP_SITE_BASE}/api/admin/recent-activity`, { headers }).then((r) => r.json()).catch(() => []),
      fetch(`${APP_SITE_BASE}/api/threads`, { headers }).then((r) => r.json()).catch(() => []),
      fetch(`${APP_SITE_BASE}/api/admin/users`, { headers }).then((r) => r.json()).catch(() => []),
      fetch(`${APP_SITE_BASE}/api/admin/audit-requests`, { headers }).then((r) => r.json()).catch(() => []),
      fetch(`${APP_SITE_BASE}/api/admin/daily-checkins`, { headers }).then((r) => r.json()).catch(() => []),
      fetch(`${APP_SITE_BASE}/api/admin/workouts`, { headers }).then((r) => r.json()).catch(() => []),
      fetch(`${APP_SITE_BASE}/api/admin/pending-signups`, { headers }).then((r) => r.json()).catch(() => [])
    ])
      .then(([s, a, t, u, f, d, w, p]) => {
        if (s?.error) setError(s.error);
        setStats(s || null);
        setActivity(Array.isArray(a) ? a : []);
        setThreads(Array.isArray(t) ? t : []);
        setClients(Array.isArray(u) ? u : []);
        setForms(Array.isArray(f) ? f : []);
        setDailyCheckins(Array.isArray(d) ? d : []);
        setWorkouts(Array.isArray(w) ? w : []);
        setPendingUsers(Array.isArray(p) ? p : []);
      })
      .catch(() => setError("Failed to load dashboard data."));
  }, [session, role]);

  useEffect(() => {
    if (!session?.token || !selectedThreadId) return;
    const headers = { Authorization: `Bearer ${session.token}` };
    fetch(`${APP_SITE_BASE}/api/threads/${encodeURIComponent(selectedThreadId)}/messages`, { headers })
      .then((r) => r.json())
      .then((data) => setThreadMessages(Array.isArray(data) ? data : []))
      .catch(() => setThreadMessages([]));
  }, [session, selectedThreadId]);

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

  async function sendReply() {
    const text = replyText.trim();
    if (!text || !session?.token || !selectedThreadId) return;
    setIsReplying(true);
    try {
      await fetch(`${APP_SITE_BASE}/api/threads/${encodeURIComponent(selectedThreadId)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ body: text })
      });
      setReplyText("");
      const data = await fetch(`${APP_SITE_BASE}/api/threads/${encodeURIComponent(selectedThreadId)}/messages`, {
        headers: { Authorization: `Bearer ${session.token}` }
      }).then((r) => r.json()).catch(() => []);
      setThreadMessages(Array.isArray(data) ? data : []);
    } finally {
      setIsReplying(false);
    }
  }

  async function updatePendingUser(userId: string, action: "approve" | "reject") {
    if (!session?.token || !userId) return;
    setIsUserActionBusy(userId + action);
    try {
      const endpoint =
        action === "approve"
          ? `${APP_SITE_BASE}/api/admin/approve-user/${encodeURIComponent(userId)}`
          : `${APP_SITE_BASE}/api/admin/reject-user/${encodeURIComponent(userId)}`;
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.token}` }
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data?.error) throw new Error(data?.error || "Failed");
      setPendingUsers((prev) => prev.filter((u: any) => String(u.id) !== String(userId)));
    } catch (e: any) {
      setError(e?.message || "Failed to update user.");
    } finally {
      setIsUserActionBusy("");
    }
  }

  async function openClientDetail(user: any) {
    setSelectedClient(user || null);
    setClientProgress(null);
    setClientProgressLink("");
    if (!session?.token || !user?.id || role === "user" || role === "superadmin") return;
    const headers = { Authorization: `Bearer ${session.token}` };
    try {
      const [progress, linkData] = await Promise.all([
        fetch(`${APP_SITE_BASE}/api/admin/user-progress/${encodeURIComponent(String(user.id))}`, { headers }).then((r) => r.json()).catch(() => null),
        fetch(`${APP_SITE_BASE}/api/admin/progress-report-link/${encodeURIComponent(String(user.id))}`, { headers }).then((r) => r.json()).catch(() => null)
      ]);
      setClientProgress(progress || null);
      setClientProgressLink(String(linkData?.link || ""));
    } catch {
      setClientProgress(null);
      setClientProgressLink("");
    }
  }

  async function openCheckinDetail(checkin: any) {
    setSelectedCheckin(checkin || null);
    if (!session?.token || !checkin?.id || role === "user" || role === "superadmin") return;
    const headers = { Authorization: `Bearer ${session.token}` };
    const data = await fetch(`${APP_SITE_BASE}/api/admin/daily-checkins/${encodeURIComponent(String(checkin.id))}`, { headers }).then((r) => r.json()).catch(() => null);
    if (data && !data.error) setSelectedCheckin(data);
  }

  async function openWorkoutDetail(workout: any) {
    setSelectedWorkout(workout || null);
    if (!session?.token || !workout?.id || role === "user" || role === "superadmin") return;
    const headers = { Authorization: `Bearer ${session.token}` };
    const data = await fetch(`${APP_SITE_BASE}/api/admin/workouts/${encodeURIComponent(String(workout.id))}`, { headers }).then((r) => r.json()).catch(() => null);
    if (data && !data.error) setSelectedWorkout(data);
  }

  async function createClient() {
    if (!session?.token || role !== "admin") return;
    const email = newClient.email.trim().toLowerCase();
    const password = newClient.password.trim();
    if (!email || !password) {
      setError("Client email and password are required.");
      return;
    }
    setIsCreatingClient(true);
    setError("");
    try {
      const r = await fetch(`${APP_SITE_BASE}/api/admin/create-client`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({
          email,
          password,
          first_name: newClient.first_name.trim(),
          last_name: newClient.last_name.trim(),
          phone: newClient.phone.trim()
        })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data?.error) throw new Error(data?.error || "Failed to create client.");
      setClients((prev) => [data, ...prev]);
      setNewClient({ first_name: "", last_name: "", email: "", phone: "", password: "" });
    } catch (e: any) {
      setError(e?.message || "Failed to create client.");
    } finally {
      setIsCreatingClient(false);
    }
  }

  async function updateMeetingStatus(status: "cancelled" | "completed" | "scheduled") {
    if (!session?.token || !selectedMeeting?.id) return;
    setIsMeetingUpdating(true);
    try {
      const r = await fetch(`${APP_SITE_BASE}/api/meetings/${encodeURIComponent(String(selectedMeeting.id))}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ status })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data?.error) throw new Error(data?.error || "Failed to update meeting.");
      setSelectedMeeting((prev: any) => (prev ? { ...prev, status } : prev));
      setActivity((prev) =>
        prev.map((m: any) => (String(m.id || "") === String(selectedMeeting.id) ? { ...m, status } : m))
      );
    } catch (e: any) {
      setError(e?.message || "Failed to update meeting.");
    } finally {
      setIsMeetingUpdating(false);
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

            {role !== "user" ? (
              <>
                <h2 style={{ margin: "18px 0 8px", color: s.muted, fontSize: 12, letterSpacing: 2 }}>PENDING SIGN-UPS</h2>
                <div style={cardBase}>
                  {pendingUsers.length ? (
                    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
                      {pendingUsers.slice(0, 8).map((u: any) => {
                        const id = String(u.id || "");
                        const approveBusy = isUserActionBusy === id + "approve";
                        const rejectBusy = isUserActionBusy === id + "reject";
                        return (
                          <li key={id} style={{ borderBottom: `1px solid ${s.line}`, paddingBottom: 8 }}>
                            <div style={{ fontWeight: 700 }}>
                              {[u.first_name, u.last_name].filter(Boolean).join(" ") || u.email || "User"}
                            </div>
                            <div style={{ color: s.muted, fontSize: 12 }}>{u.email || "No email"}</div>
                            {role === "admin" || role === "superadmin" ? (
                              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                                <button
                                  onClick={() => updatePendingUser(id, "approve")}
                                  disabled={approveBusy || rejectBusy}
                                  style={{ border: "none", background: "#2f9a64", color: "#fff", borderRadius: 8, padding: "8px 10px", fontWeight: 700 }}
                                >
                                  {approveBusy ? "..." : "Approve"}
                                </button>
                                <button
                                  onClick={() => updatePendingUser(id, "reject")}
                                  disabled={approveBusy || rejectBusy}
                                  style={{ border: "none", background: "#b85e5e", color: "#fff", borderRadius: 8, padding: "8px 10px", fontWeight: 700 }}
                                >
                                  {rejectBusy ? "..." : "Reject"}
                                </button>
                              </div>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p style={{ margin: 0, color: s.muted }}>No pending sign-ups.</p>
                  )}
                </div>
              </>
            ) : null}

            <h2 style={{ margin: "18px 0 8px", color: s.muted, fontSize: 12, letterSpacing: 2 }}>CHECK-INS</h2>
            <div style={cardBase}>
              {dailyCheckins.length ? (
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
                  {dailyCheckins.slice(0, 6).map((c: any) => (
                    <li
                      key={String(c.id || `${c.user_id}-${c.checkin_date}`)}
                      onClick={() => openCheckinDetail(c)}
                      style={{ borderBottom: `1px solid ${s.line}`, paddingBottom: 8, cursor: "pointer" }}
                    >
                      <strong>{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || "Client"}</strong>
                      <span style={{ color: s.muted, fontSize: 12 }}> - {c.checkin_date || "No date"}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ margin: 0, color: s.muted }}>No recent check-ins.</p>
              )}
            </div>

            <h2 style={{ margin: "18px 0 8px", color: s.muted, fontSize: 12, letterSpacing: 2 }}>WORKOUTS</h2>
            <div style={cardBase}>
              {workouts.length ? (
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
                  {workouts.slice(0, 6).map((w: any) => (
                    <li
                      key={String(w.id || `${w.user_id}-${w.created_at}`)}
                      onClick={() => openWorkoutDetail(w)}
                      style={{ borderBottom: `1px solid ${s.line}`, paddingBottom: 8, cursor: "pointer" }}
                    >
                      <strong>{[w.first_name, w.last_name].filter(Boolean).join(" ") || "Client"}</strong>
                      <span style={{ color: s.muted, fontSize: 12 }}>
                        {" "}
                        - {w.workout_name || "Workout"} ({Math.floor((Number(w.duration_seconds) || 0) / 60)} min)
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ margin: 0, color: s.muted }}>No recent workouts.</p>
              )}
            </div>
          </>
        ) : null}

        {activeTab === "clients" ? (
          <div style={{ ...cardBase, marginTop: 12 }}>
            {role === "user" ? (
              <>
                <div style={{ marginBottom: 10, color: s.muted, fontSize: 12 }}>
                  Recent workouts: <strong style={{ color: s.gold }}>{workouts.length}</strong>
                </div>
                {workouts.length ? (
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
                    {workouts.slice(0, 20).map((w: any) => (
                      <li key={String(w.id || `${w.workout_name}-${w.created_at}`)} style={{ borderBottom: `1px solid ${s.line}`, paddingBottom: 8 }}>
                        <div style={{ fontWeight: 700 }}>{w.workout_name || "Workout"}</div>
                        <div style={{ color: s.muted, fontSize: 12 }}>
                          {Math.floor((Number(w.duration_seconds) || 0) / 60)} min - {w.created_at ? new Date(w.created_at).toLocaleString() : ""}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ margin: 0, color: s.muted }}>No workouts yet.</p>
                )}
              </>
            ) : (
              <>
                {role === "admin" ? (
                  <div style={{ ...cardBase, marginBottom: 12, padding: 12 }}>
                    <div style={{ color: s.muted, fontSize: 12, marginBottom: 8 }}>ADD NEW CLIENT</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <input
                        value={newClient.first_name}
                        onChange={(e) => setNewClient((p) => ({ ...p, first_name: e.target.value }))}
                        placeholder="First name"
                        style={{ border: `1px solid ${s.line}`, borderRadius: 8, padding: "9px 10px", font: "inherit", background: "#fff" }}
                      />
                      <input
                        value={newClient.last_name}
                        onChange={(e) => setNewClient((p) => ({ ...p, last_name: e.target.value }))}
                        placeholder="Last name"
                        style={{ border: `1px solid ${s.line}`, borderRadius: 8, padding: "9px 10px", font: "inherit", background: "#fff" }}
                      />
                      <input
                        value={newClient.email}
                        onChange={(e) => setNewClient((p) => ({ ...p, email: e.target.value }))}
                        placeholder="Email"
                        style={{ border: `1px solid ${s.line}`, borderRadius: 8, padding: "9px 10px", font: "inherit", background: "#fff" }}
                      />
                      <input
                        value={newClient.phone}
                        onChange={(e) => setNewClient((p) => ({ ...p, phone: e.target.value }))}
                        placeholder="Phone"
                        style={{ border: `1px solid ${s.line}`, borderRadius: 8, padding: "9px 10px", font: "inherit", background: "#fff" }}
                      />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginTop: 8 }}>
                      <input
                        value={newClient.password}
                        onChange={(e) => setNewClient((p) => ({ ...p, password: e.target.value }))}
                        placeholder="Temporary password"
                        style={{ border: `1px solid ${s.line}`, borderRadius: 8, padding: "9px 10px", font: "inherit", background: "#fff" }}
                      />
                      <button
                        onClick={createClient}
                        disabled={isCreatingClient}
                        style={{ border: "none", background: `linear-gradient(135deg,#9b7648,#7e5f37)`, color: "#fff", borderRadius: 8, padding: "9px 12px", fontWeight: 700 }}
                      >
                        {isCreatingClient ? "..." : "Add Client"}
                      </button>
                    </div>
                  </div>
                ) : null}
                <div style={{ marginBottom: 10, color: s.muted, fontSize: 12 }}>
                  Total clients: <strong style={{ color: s.gold }}>{clients.length}</strong>
                </div>
                {clients.length ? (
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
                    {clients.slice(0, 25).map((u: any) => (
                      <li
                        key={u.id}
                        onClick={() => openClientDetail(u)}
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, borderBottom: `1px solid ${s.line}`, paddingBottom: 8, cursor: "pointer" }}
                      >
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
              </>
            )}
          </div>
        ) : null}

        {activeTab === "forms" ? (
          <div style={{ ...cardBase, marginTop: 12 }}>
            {role === "user" ? (
              <>
                <div style={{ marginBottom: 10, color: s.muted, fontSize: 12 }}>
                  Upcoming meetings: <strong style={{ color: s.gold }}>{activity.length}</strong>
                </div>
                {activity.length ? (
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
                    {activity.slice(0, 20).map((m: any) => (
                      <li
                        key={String(m.id || `${m.meeting_date}-${m.time_slot}`)}
                        onClick={() => setSelectedMeeting(m)}
                        style={{ borderBottom: `1px solid ${s.line}`, paddingBottom: 8, cursor: "pointer" }}
                      >
                        <div style={{ fontWeight: 700 }}>{m.user_name || "Meeting"}</div>
                        <div style={{ color: s.muted, fontSize: 12 }}>
                          {m.meeting_date || "No date"} {m.time_slot || ""} - {m.status || "scheduled"}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ margin: 0, color: s.muted }}>No meetings found.</p>
                )}
              </>
            ) : (
              <>
                <div style={{ marginBottom: 10, color: s.muted, fontSize: 12 }}>
                  Pending audits/forms: <strong style={{ color: s.gold }}>{forms.length}</strong>
                </div>
                {forms.length ? (
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
                    {forms.slice(0, 20).map((f: any) => (
                      <li
                        key={f.id || `${f.email}-${f.created_at}`}
                        onClick={() => setSelectedForm(f)}
                        style={{ borderBottom: `1px solid ${s.line}`, paddingBottom: 8, cursor: "pointer" }}
                      >
                        <div style={{ fontWeight: 700 }}>{[f.first_name, f.last_name].filter(Boolean).join(" ") || f.email || "Request"}</div>
                        <div style={{ color: s.muted, fontSize: 12 }}>{f.city || "City not provided"} - {f.status || "pending"}</div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ margin: 0, color: s.muted }}>No forms/audits found.</p>
                )}
              </>
            )}
          </div>
        ) : null}

        {activeTab === "messages" ? (
          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            <div style={cardBase}>
              {threads.length ? (
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
                  {threads.slice(0, 20).map((t: any) => {
                    const id = String(t.id || "");
                    const active = selectedThreadId === id;
                    return (
                      <li
                        key={id}
                        onClick={() => setSelectedThreadId(id)}
                        style={{
                          border: `1px solid ${active ? s.gold : s.line}`,
                          borderRadius: 10,
                          padding: 10,
                          cursor: "pointer",
                          background: active ? "rgba(140,106,63,.08)" : "transparent"
                        }}
                      >
                        <div style={{ fontWeight: 700 }}>{[t.first_name, t.last_name].filter(Boolean).join(" ") || t.email || "Client"}</div>
                        <div style={{ color: s.muted, fontSize: 12 }}>{String(t.last_message || "No messages yet").slice(0, 80)}</div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p style={{ margin: 0, color: s.muted }}>No message threads yet.</p>
              )}
            </div>

            <div style={cardBase}>
              {!selectedThreadId ? (
                <p style={{ margin: 0, color: s.muted }}>Select a thread to view conversation.</p>
              ) : (
                <>
                  <div style={{ maxHeight: 260, overflowY: "auto", display: "grid", gap: 8 }}>
                    {threadMessages.length ? (
                      threadMessages.map((m: any) => {
                        const isAdmin = m.sender_role === "admin";
                        return (
                          <div
                            key={m.id}
                            style={{
                              alignSelf: isAdmin ? "end" : "start",
                              justifySelf: isAdmin ? "end" : "start",
                              maxWidth: "88%",
                              background: isAdmin ? "rgba(140,106,63,.14)" : "#fff",
                              border: `1px solid ${s.line}`,
                              borderRadius: 10,
                              padding: 10
                            }}
                          >
                            <div style={{ fontSize: 13 }}>{m.body}</div>
                            <div style={{ marginTop: 4, color: s.muted, fontSize: 10 }}>
                              {isAdmin ? "You" : "Client"} - {m.created_at ? new Date(m.created_at).toLocaleString() : ""}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p style={{ margin: 0, color: s.muted }}>No messages yet.</p>
                    )}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginTop: 10 }}>
                    <input
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Type your reply..."
                      style={{ width: "100%", border: `1px solid ${s.line}`, borderRadius: 10, padding: "10px 12px", font: "inherit" }}
                    />
                    <button
                      onClick={sendReply}
                      disabled={isReplying}
                      style={{ border: "none", background: `linear-gradient(135deg,#9b7648,#7e5f37)`, color: "#fff", borderRadius: 10, padding: "10px 12px", fontWeight: 700 }}
                    >
                      {isReplying ? "..." : "Send"}
                    </button>
                  </div>
                </>
              )}
            </div>
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

        {(selectedClient || selectedForm || selectedCheckin || selectedWorkout || selectedMeeting) ? (
          <div style={{ ...cardBase, marginTop: 14, borderColor: "rgba(140,106,63,.45)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
              <strong style={{ color: s.gold }}>DETAIL VIEW</strong>
              <button
                onClick={() => {
                  setSelectedClient(null);
                  setSelectedForm(null);
                  setSelectedCheckin(null);
                  setSelectedWorkout(null);
                  setSelectedMeeting(null);
                  setClientProgress(null);
                  setClientProgressLink("");
                }}
                style={{ border: `1px solid ${s.line}`, background: "#fff", borderRadius: 8, padding: "6px 10px", fontWeight: 700 }}
              >
                CLOSE
              </button>
            </div>
            {selectedClient ? (
              <div style={{ display: "grid", gap: 6 }}>
                <div><strong>Client:</strong> {[selectedClient.first_name, selectedClient.last_name].filter(Boolean).join(" ") || selectedClient.email || "User"}</div>
                <div><strong>Email:</strong> {selectedClient.email || "-"}</div>
                <div><strong>Phone:</strong> {selectedClient.phone || "-"}</div>
                <div><strong>Status:</strong> {selectedClient.approval_status || "-"}</div>
                {clientProgress ? <div><strong>Progress:</strong> {JSON.stringify(clientProgress)}</div> : null}
                {clientProgressLink ? (
                  <a href={clientProgressLink} target="_blank" rel="noreferrer" style={{ color: s.gold, fontWeight: 700 }}>
                    Open progress report
                  </a>
                ) : null}
              </div>
            ) : null}
            {selectedForm ? (
              <div style={{ display: "grid", gap: 6 }}>
                <div><strong>Request:</strong> {[selectedForm.first_name, selectedForm.last_name].filter(Boolean).join(" ") || selectedForm.email || "Request"}</div>
                <div><strong>Email:</strong> {selectedForm.email || "-"}</div>
                <div><strong>City:</strong> {selectedForm.city || "-"}</div>
                <div><strong>Status:</strong> {selectedForm.status || "pending"}</div>
                <div><strong>Created:</strong> {selectedForm.created_at ? new Date(selectedForm.created_at).toLocaleString() : "-"}</div>
              </div>
            ) : null}
            {selectedCheckin ? (
              <div style={{ display: "grid", gap: 6 }}>
                <div><strong>Check-in date:</strong> {selectedCheckin.checkin_date || "-"}</div>
                <div><strong>User:</strong> {[selectedCheckin.first_name, selectedCheckin.last_name].filter(Boolean).join(" ") || selectedCheckin.email || "-"}</div>
                <div><strong>Weight:</strong> {selectedCheckin.weight || "-"}</div>
                <div><strong>Notes:</strong> {selectedCheckin.notes || "-"}</div>
              </div>
            ) : null}
            {selectedWorkout ? (
              <div style={{ display: "grid", gap: 6 }}>
                <div><strong>Workout:</strong> {selectedWorkout.workout_name || "-"}</div>
                <div><strong>Duration:</strong> {Math.floor((Number(selectedWorkout.duration_seconds) || 0) / 60)} min</div>
                <div><strong>Created:</strong> {selectedWorkout.created_at ? new Date(selectedWorkout.created_at).toLocaleString() : "-"}</div>
                <div><strong>Notes:</strong> {selectedWorkout.notes || "-"}</div>
              </div>
            ) : null}
            {selectedMeeting ? (
              <div style={{ display: "grid", gap: 6 }}>
                <div><strong>Meeting date:</strong> {selectedMeeting.meeting_date || "-"}</div>
                <div><strong>Slot:</strong> {selectedMeeting.time_slot || "-"}</div>
                <div><strong>Status:</strong> {selectedMeeting.status || "-"}</div>
                <div><strong>Message:</strong> {selectedMeeting.message || "-"}</div>
                {role === "user" || role === "admin" ? (
                  <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                    <button
                      onClick={() => updateMeetingStatus("scheduled")}
                      disabled={isMeetingUpdating}
                      style={{ border: "none", background: "#2f9a64", color: "#fff", borderRadius: 8, padding: "7px 10px", fontWeight: 700 }}
                    >
                      {isMeetingUpdating ? "..." : "Mark Scheduled"}
                    </button>
                    <button
                      onClick={() => updateMeetingStatus("completed")}
                      disabled={isMeetingUpdating}
                      style={{ border: "none", background: "#5a7fa6", color: "#fff", borderRadius: 8, padding: "7px 10px", fontWeight: 700 }}
                    >
                      {isMeetingUpdating ? "..." : "Mark Completed"}
                    </button>
                    <button
                      onClick={() => updateMeetingStatus("cancelled")}
                      disabled={isMeetingUpdating}
                      style={{ border: "none", background: "#b85e5e", color: "#fff", borderRadius: 8, padding: "7px 10px", fontWeight: 700 }}
                    >
                      {isMeetingUpdating ? "..." : "Cancel"}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
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
          {tabButton("clients", role === "user" ? "Workouts" : "Clients", "👥")}
          {tabButton("forms", role === "user" ? "Meetings" : "Forms", "📋")}
          {tabButton("messages", "Messages", "💬")}
          {tabButton("ai", "AI", "💡")}
        </div>
      </nav>
    </main>
  );
}

