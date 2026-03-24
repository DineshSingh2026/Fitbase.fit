"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { getApiSiteBase } from "../../lib/site-url";
import { FITBASE_SESSION_KEY, parseFitbaseSessionFromStorage, type FitbaseSession } from "../../lib/fitbase-session";

type DashboardTab = "home" | "clients" | "forms" | "messages" | "ai" | "programs" | "contact" | "profile" | "progress";

type Session = FitbaseSession;

function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(FITBASE_SESSION_KEY);
    const s = parseFitbaseSessionFromStorage(raw);
    if (!s) return null;
    const normalized = JSON.stringify(s);
    if (normalized !== raw) {
      try {
        localStorage.setItem(FITBASE_SESSION_KEY, normalized);
      } catch {
        /* ignore */
      }
    }
    return s;
  } catch {
    return null;
  }
}

type FetchFitbaseJsonResult = { ok: boolean; data: any; error?: string };

async function fetchFitbaseJson(
  baseUrl: string,
  path: string,
  headers: HeadersInit,
  label: string
): Promise<FetchFitbaseJsonResult> {
  try {
    const r = await fetch(`${baseUrl}${path}`, { headers });
    const text = await r.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      return { ok: false, data: null, error: `${label}: response is not valid JSON` };
    }
    if (!r.ok) {
      const fromBody =
        data && typeof data === "object" ? String((data as { message?: string; error?: string }).message || (data as { error?: string }).error || "") : "";
      const detail = fromBody || text.slice(0, 200) || r.statusText;
      return { ok: false, data, error: `${label}: HTTP ${r.status} — ${detail}` };
    }
    return { ok: true, data };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Network error";
    return { ok: false, data: null, error: `${label}: ${msg}` };
  }
}

export default function DashboardPage() {
  const [session, setSession] = useState<Session | null>(null);
  const role = String(session?.user?.role || "")
    .trim()
    .toLowerCase();
  const apiBase = useMemo(() => getApiSiteBase(), []);
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
  const [activeTab, setActiveTab] = useState<DashboardTab>("home");
  const [error, setError] = useState("");
  const [selectedClient, setSelectedClient] = useState<any | null>(null);
  const [selectedForm, setSelectedForm] = useState<any | null>(null);
  const [selectedCheckin, setSelectedCheckin] = useState<any | null>(null);
  const [selectedWorkout, setSelectedWorkout] = useState<any | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<any | null>(null);
  const [clientProgress, setClientProgress] = useState<any | null>(null);
  const [clientProgressLink, setClientProgressLink] = useState("");
  const [newClient, setNewClient] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    city: "",
    password: ""
  });
  const [trainerReferral, setTrainerReferral] = useState<{ code: string; join_path: string } | null>(null);
  const [isCreatingClient, setIsCreatingClient] = useState(false);
  const [isMeetingUpdating, setIsMeetingUpdating] = useState(false);
  const [todayLabel, setTodayLabel] = useState("");
  const [trainerClientsView, setTrainerClientsView] = useState<"hub" | "pending" | "tribe" | "progress">("hub");
  const [trainerFormsView, setTrainerFormsView] = useState<"hub" | "audits" | "part2" | "sunday" | "daily">("hub");
  const [trainerMessagesView, setTrainerMessagesView] = useState<"hub" | "threads">("hub");
  const [sundayCheckinsApi, setSundayCheckinsApi] = useState<any[]>([]);
  const [part2Submissions, setPart2Submissions] = useState<any[]>([]);
  const [trainerRequests, setTrainerRequests] = useState<any[]>([]);
  const [clientLeadRequests, setClientLeadRequests] = useState<any[]>([]);
  const [trainerClientOverview, setTrainerClientOverview] = useState<any[]>([]);
  const [superadminSnapshot, setSuperadminSnapshot] = useState<any | null>(null);
  const [superadminTrainers, setSuperadminTrainers] = useState<any[]>([]);
  const [superadminQueueBusy, setSuperadminQueueBusy] = useState("");
  const [superadminSync, setSuperadminSync] = useState<{
    loading: boolean;
    lastLoadedLabel: string | null;
    issues: string[];
  }>({ loading: false, lastLoadedLabel: null, issues: [] });
  const [assignTrainerForClient, setAssignTrainerForClient] = useState<Record<string, string>>({});
  type StaffOverlay = null | "workouts" | "programs" | "analytics" | "insights" | "campaigns";
  const [staffOverlay, setStaffOverlay] = useState<StaffOverlay>(null);
  const [staffAiOpen, setStaffAiOpen] = useState(false);
  const [perfInsights, setPerfInsights] = useState<{ summary?: Record<string, number>; data?: any[] } | null>(null);
  const [perfInsightsLoading, setPerfInsightsLoading] = useState(false);
  const [programCatalog, setProgramCatalog] = useState<any[]>([]);
  const [assignUserId, setAssignUserId] = useState("");
  const [assignProgramId, setAssignProgramId] = useState("");
  const [isAssigningProgram, setIsAssigningProgram] = useState(false);
  const [selectedSunday, setSelectedSunday] = useState<any | null>(null);
  const [selectedPart2, setSelectedPart2] = useState<any | null>(null);
  const [userCheckinView, setUserCheckinView] = useState<"hub" | "daily" | "sunday" | "progress">("hub");
  const [userToday, setUserToday] = useState<any | null>(null);
  const [userStreak, setUserStreak] = useState<any | null>(null);
  const [userPrograms, setUserPrograms] = useState<any[]>([]);
  const [userProgressLogs, setUserProgressLogs] = useState<any[]>([]);
  const [microSteps, setMicroSteps] = useState("");
  const [microWater, setMicroWater] = useState("");
  const [microProtein, setMicroProtein] = useState("");
  const [microSleep, setMicroSleep] = useState("");
  const [microSaving, setMicroSaving] = useState(false);
  const [wkName, setWkName] = useState("");
  const [wkFeedback, setWkFeedback] = useState("");
  const [wkSubmitting, setWkSubmitting] = useState(false);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [meetingDate, setMeetingDate] = useState("");
  const [meetingTime, setMeetingTime] = useState("");
  const [meetingSubmitting, setMeetingSubmitting] = useState(false);
  const [sundayForm, setSundayForm] = useState({
    full_name: "",
    plan: "",
    current_weight_waist_week: "",
    last_week_weight_waist: "",
    total_weight_loss: "",
    training_go: "",
    nutrition_go: "",
    sleep: "",
    occupation_stress: "",
    other_stress: "",
    differences_felt: "",
    achievements: "",
    improve_next_week: "",
    questions: ""
  });
  const [sundaySubmitting, setSundaySubmitting] = useState(false);
  const [progressForm, setProgressForm] = useState({
    log_date: "",
    weight: "",
    body_fat: "",
    calories_intake: "",
    protein_intake: "",
    workout_completed: false,
    workout_type: "",
    strength_bench: "",
    strength_squat: "",
    strength_deadlift: "",
    sleep_hours: "",
    water_intake: ""
  });
  const [progressSaving, setProgressSaving] = useState(false);
  const [progressSuccess, setProgressSuccess] = useState(false);

  const displayName = useMemo(() => {
    const u = session?.user;
    if (!u) return "Trainer";
    const name = [u.first_name || "", u.last_name || ""].join(" ").trim();
    if (name) return name;
    const email = String(u.email || "");
    return email ? email.split("@")[0] : "Trainer";
  }, [session]);

  const isStaff = role !== "user";

  const tribeMembers = useMemo(() => {
    return clients.filter((u: any) => String(u.approval_status || "").toLowerCase() !== "pending");
  }, [clients]);

  const microAlreadyFilled = useMemo(() => {
    const c = userToday?.checkin;
    return !!(c && (c.steps != null || c.water_ml != null || c.protein_g != null || c.sleep_hours != null));
  }, [userToday]);

  const userStreakBadge = useMemo(() => {
    const st = userStreak;
    if (!st) return { text: "0 day streak", tier: "seed", atRisk: false as boolean };
    const n = st.streak || 0;
    const atRisk = !!st.atRisk;
    let tier = "seed";
    let emoji = atRisk ? "\u23F1" : "\uD83C\uDF31";
    if (!atRisk) {
      if (n >= 100) {
        emoji = "\uD83D\uDC51";
        tier = "legend";
      } else if (n >= 50) {
        emoji = "\uD83D\uDC8E";
        tier = "diamond";
      } else if (n >= 21) {
        emoji = "\uD83D\uDE80";
        tier = "rocket";
      } else if (n >= 7) {
        emoji = "\uD83D\uDD25\uD83D\uDD25";
        tier = "fire";
      } else if (n >= 3) {
        emoji = "\uD83D\uDD25";
        tier = "fire";
      } else if (n >= 1) {
        emoji = "\uD83D\uDCAA";
        tier = "seed";
      }
    }
    const text = `${emoji} ${n} day streak${atRisk ? " — save today!" : ""}`;
    return { text, tier, atRisk };
  }, [userStreak]);

  const userLastMsgPreview = useMemo(() => {
    const b = userToday?.lastMessage?.body;
    if (!b) return "—";
    const t = String(b);
    return t.length > 60 ? `${t.slice(0, 60)}…` : t;
  }, [userToday]);

  const userNextCallLabel = useMemo(() => {
    const m = userToday?.nextMeeting;
    if (!m?.meeting_date) return "None";
    const d = new Date(`${m.meeting_date}T12:00:00`);
    return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${m.time_slot || ""}`.trim();
  }, [userToday]);

  const loadSuperadminDashboard = useCallback(async () => {
    const token = session?.token;
    if (!token || role !== "superadmin") return;

    const headers = { Authorization: `Bearer ${token}` };
    const issues: string[] = [];

    setSuperadminSync((s) => ({ ...s, loading: true }));

    try {
      const [dash, reqsRes, clientRes, overviewRes, trainersRes, threadRes, sunRes, p2Res] = await Promise.all([
        fetchFitbaseJson(apiBase, "/api/superadmin/dashboard", headers, "Platform overview"),
        fetchFitbaseJson(apiBase, "/api/superadmin/trainer-requests?status=all", headers, "Trainer applications"),
        fetchFitbaseJson(apiBase, "/api/superadmin/client-requests?status=all", headers, "Client coaching requests"),
        fetchFitbaseJson(apiBase, "/api/superadmin/trainer-client-overview", headers, "Roster overview"),
        fetchFitbaseJson(apiBase, "/api/superadmin/trainers", headers, "Trainers list"),
        fetchFitbaseJson(apiBase, "/api/threads", headers, "Message threads"),
        fetchFitbaseJson(apiBase, "/api/admin/sunday-checkins", headers, "Sunday check-ins"),
        fetchFitbaseJson(apiBase, "/api/admin/part2-submissions", headers, "Part 2 submissions")
      ]);

      const listFrom = (res: FetchFitbaseJsonResult, label: string): any[] => {
        if (!res.ok) {
          if (res.error) issues.push(res.error);
          return [];
        }
        if (!Array.isArray(res.data)) {
          issues.push(`${label}: expected a JSON array`);
          return [];
        }
        return res.data;
      };

      if (!dash.ok) {
        if (dash.error) issues.push(dash.error);
        setSuperadminSnapshot(null);
      } else if (dash.data && typeof dash.data === "object" && dash.data.error) {
        issues.push(`Platform overview: ${dash.data.error}`);
        setSuperadminSnapshot(null);
      } else if (dash.data && typeof dash.data === "object") {
        const s = dash.data;
        setSuperadminSnapshot(s);
        const statObj = s?.stats || {};
        setStats({
          active_members: Number(statObj.approved_users || 0),
          daily_checkins: Number(statObj.daily_checkins || 0),
          pending_signups: Number(statObj.pending_signups || 0),
          messages: Number(statObj.messages || 0)
        });
        setForms(Array.isArray(s?.audit) ? s.audit : []);
        setActivity(Array.isArray(s?.meetings) ? s.meetings.slice(0, 8) : []);
        setClients(Array.isArray(s?.users) ? s.users : []);
        setDailyCheckins(Array.isArray(s?.daily_checkins) ? s.daily_checkins : []);
        setWorkouts(Array.isArray(s?.workouts) ? s.workouts : []);
        setPendingUsers(
          Array.isArray(s?.users) ? s.users.filter((u: any) => String(u.approval_status || "").toLowerCase() === "pending") : []
        );
      } else {
        issues.push("Platform overview: empty response");
        setSuperadminSnapshot(null);
      }

      setTrainerRequests(listFrom(reqsRes, "Trainer applications"));
      setClientLeadRequests(listFrom(clientRes, "Client coaching requests"));
      setTrainerClientOverview(listFrom(overviewRes, "Roster overview"));
      setSuperadminTrainers(listFrom(trainersRes, "Trainers list"));
      setThreads(listFrom(threadRes, "Message threads"));
      setSundayCheckinsApi(listFrom(sunRes, "Sunday check-ins"));
      setPart2Submissions(listFrom(p2Res, "Part 2 submissions"));

      const nowLabel = new Date().toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });

      setSuperadminSync({
        loading: false,
        lastLoadedLabel: nowLabel,
        issues
      });

      if (issues.length) {
        setError(
          issues.slice(0, 3).join(" · ") + (issues.length > 3 ? ` (+${issues.length - 3} more — see status panel)` : "")
        );
      } else {
        setError("");
      }
    } catch (e: unknown) {
      const crash = e instanceof Error ? e.message : "Unknown error";
      const nowLabel = new Date().toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
      setSuperadminSync({
        loading: false,
        lastLoadedLabel: nowLabel,
        issues: [`Unexpected error while loading: ${crash}`]
      });
      setError(`Unexpected error while loading: ${crash}`);
    }
  }, [apiBase, role, session?.token]);

  const refreshUserTodayAndStreak = useCallback(() => {
    if (!session?.token || role !== "user") return;
    const headers = { Authorization: `Bearer ${session.token}` };
    Promise.all([
      fetch(`${apiBase}/api/today`, { headers }).then((r) => r.json()).catch(() => null),
      fetch(`${apiBase}/api/daily-checkin/streak`, { headers }).then((r) => r.json()).catch(() => null)
    ]).then(([todayData, streakData]) => {
      if (todayData && !todayData.error) setUserToday(todayData);
      if (streakData && !streakData.error) setUserStreak(streakData);
    });
  }, [session?.token, role, apiBase]);

  useEffect(() => {
    if (!timerRunning) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    timerRef.current = setInterval(() => setTimerSeconds((n) => n + 1), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timerRunning]);

  useEffect(() => {
    if (role !== "user") return;
    const c = userToday?.checkin;
    const filled = !!(c && (c.steps != null || c.water_ml != null || c.protein_g != null || c.sleep_hours != null));
    if (filled) {
      setMicroSteps(c.steps != null ? String(c.steps) : "");
      setMicroWater(c.water_ml != null ? String(c.water_ml) : "");
      setMicroProtein(c.protein_g != null ? String(c.protein_g) : "");
      setMicroSleep(c.sleep_hours != null ? String(c.sleep_hours) : "");
    } else {
      setMicroSteps("");
      setMicroWater("");
      setMicroProtein("");
      setMicroSleep("");
    }
  }, [role, userToday]);

  useEffect(() => {
    if (!session?.token || role !== "user" || activeTab !== "programs") return;
    const headers = { Authorization: `Bearer ${session.token}` };
    fetch(`${apiBase}/api/me/programs`, { headers })
      .then((r) => r.json())
      .then((rows) => setUserPrograms(Array.isArray(rows) ? rows : []))
      .catch(() => setUserPrograms([]));
  }, [session, role, activeTab]);

  useEffect(() => {
    if (!session?.token || role !== "user") return;
    if (activeTab !== "progress" && !(activeTab === "forms" && userCheckinView === "progress")) return;
    const headers = { Authorization: `Bearer ${session.token}` };
    fetch(`${apiBase}/api/progress`, { headers })
      .then((r) => r.json())
      .then((d) => setUserProgressLogs(Array.isArray(d?.logs) ? d.logs : []))
      .catch(() => setUserProgressLogs([]));
  }, [session, role, activeTab, userCheckinView]);

  useEffect(() => {
    if (role !== "user") return;
    if (activeTab !== "progress" && !(activeTab === "forms" && userCheckinView === "progress")) return;
    if (!progressForm.log_date) {
      setProgressForm((p) => ({ ...p, log_date: new Date().toISOString().slice(0, 10) }));
    }
  }, [role, activeTab, userCheckinView, progressForm.log_date]);

  useEffect(() => {
    const s = getSession();
    if (!s?.token) {
      window.location.replace("/login");
      return;
    }
    setSession(s);
  }, []);

  useEffect(() => {
    const d = new Date();
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    setTodayLabel(`${days[d.getDay()]} · ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`);
  }, []);

  useEffect(() => {
    if (!session?.token || role !== "superadmin") return;
    void loadSuperadminDashboard();
  }, [session?.token, role, apiBase, loadSuperadminDashboard]);

  useEffect(() => {
    if (!session?.token) return;
    if (role === "superadmin") return;

    const headers = { Authorization: `Bearer ${session.token}` };
    if (role === "user") {
      const userId = String(session?.user?.id || "");
      Promise.all([
        fetch(`${apiBase}/api/workouts/${encodeURIComponent(userId)}`, { headers }).then((r) => r.json()).catch(() => []),
        fetch(`${apiBase}/api/meetings/user/${encodeURIComponent(userId)}`, { headers }).then((r) => r.json()).catch(() => []),
        fetch(`${apiBase}/api/threads`, { headers }).then((r) => r.json()).catch(() => []),
        fetch(`${apiBase}/api/today`, { headers }).then((r) => r.json()).catch(() => null),
        fetch(`${apiBase}/api/daily-checkin/streak`, { headers }).then((r) => r.json()).catch(() => null)
      ])
        .then(([w, m, t, todayData, streakData]) => {
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
          if (todayData && !todayData.error) setUserToday(todayData);
          if (streakData && !streakData.error) setUserStreak(streakData);
        })
        .catch(() => setError("Failed to load dashboard data."));
      return;
    }

    Promise.all([
      fetch(`${apiBase}/api/stats`, { headers }).then((r) => r.json()).catch(() => null),
      fetch(`${apiBase}/api/admin/recent-activity`, { headers }).then((r) => r.json()).catch(() => []),
      fetch(`${apiBase}/api/threads`, { headers }).then((r) => r.json()).catch(() => []),
      fetch(`${apiBase}/api/admin/users`, { headers }).then((r) => r.json()).catch(() => []),
      fetch(`${apiBase}/api/admin/audit-requests`, { headers }).then((r) => r.json()).catch(() => []),
      fetch(`${apiBase}/api/admin/daily-checkins`, { headers }).then((r) => r.json()).catch(() => []),
      fetch(`${apiBase}/api/admin/workouts`, { headers }).then((r) => r.json()).catch(() => []),
      fetch(`${apiBase}/api/admin/pending-signups`, { headers }).then((r) => r.json()).catch(() => []),
      fetch(`${apiBase}/api/admin/sunday-checkins`, { headers }).then((r) => r.json()).catch(() => []),
      fetch(`${apiBase}/api/admin/part2-submissions`, { headers }).then((r) => r.json()).catch(() => [])
    ])
      .then(([s, a, t, u, f, d, w, p, sun, p2]) => {
        if (s?.error) setError(s.error);
        setStats(s || null);
        setActivity(Array.isArray(a) ? a : []);
        setThreads(Array.isArray(t) ? t : []);
        setClients(Array.isArray(u) ? u : []);
        setForms(Array.isArray(f) ? f : []);
        setDailyCheckins(Array.isArray(d) ? d : []);
        setWorkouts(Array.isArray(w) ? w : []);
        setPendingUsers(Array.isArray(p) ? p : []);
        setSundayCheckinsApi(Array.isArray(sun) ? sun : []);
        setPart2Submissions(Array.isArray(p2) ? p2 : []);
      })
      .catch(() => setError("Failed to load dashboard data."));
  }, [session?.token, role, apiBase]);

  useEffect(() => {
    if (!session?.token || role !== "admin") {
      setTrainerReferral(null);
      return;
    }
    const headers = { Authorization: `Bearer ${session.token}` };
    fetch(`${apiBase}/api/admin/referral-link`, { headers })
      .then((r) => r.json())
      .then((d) => {
        if (d?.referral_code) {
          setTrainerReferral({
            code: String(d.referral_code),
            join_path: String(d.join_path || `/join/${d.referral_code}`)
          });
        } else setTrainerReferral(null);
      })
      .catch(() => setTrainerReferral(null));
  }, [session?.token, role]);

  useEffect(() => {
    if (!session?.token || !selectedThreadId) return;
    const headers = { Authorization: `Bearer ${session.token}` };
    fetch(`${apiBase}/api/threads/${encodeURIComponent(selectedThreadId)}/messages`, { headers })
      .then((r) => r.json())
      .then((data) => setThreadMessages(Array.isArray(data) ? data : []))
      .catch(() => setThreadMessages([]));
  }, [session, selectedThreadId]);

  useEffect(() => {
    if (role !== "user" || activeTab !== "messages") return;
    if (selectedThreadId || !threads.length) return;
    const id = String(threads[0]?.id || "");
    if (id) setSelectedThreadId(id);
  }, [role, activeTab, threads, selectedThreadId]);

  useEffect(() => {
    if (!session?.token || staffOverlay !== "insights" || !isStaff) return;
    const headers = { Authorization: `Bearer ${session.token}` };
    setPerfInsightsLoading(true);
    fetch(`${apiBase}/api/admin/performance-insights`, { headers })
      .then((r) => r.json())
      .then((d) => {
        if (d?.error) setPerfInsights(null);
        else setPerfInsights({ summary: d?.summary || {}, data: Array.isArray(d?.data) ? d.data : [] });
      })
      .catch(() => setPerfInsights(null))
      .finally(() => setPerfInsightsLoading(false));
  }, [session, staffOverlay, isStaff]);

  useEffect(() => {
    if (!session?.token || staffOverlay !== "programs" || !isStaff) return;
    const headers = { Authorization: `Bearer ${session.token}` };
    fetch(`${apiBase}/api/admin/program-catalog`, { headers })
      .then((r) => r.json())
      .then((rows) => setProgramCatalog(Array.isArray(rows) ? rows : []))
      .catch(() => setProgramCatalog([]));
  }, [session, staffOverlay, isStaff]);

  async function sendAi() {
    const text = aiPrompt.trim();
    if (!text || !session?.token) return;
    setIsAiLoading(true);
    setAiReply("");
    try {
      const r = await fetch(`${apiBase}/api/admin/ai-assist`, {
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
    if (!text || !session?.token) return;
    setIsReplying(true);
    try {
      let tid = selectedThreadId;
      if (!tid && role === "user") {
        const cr = await fetch(`${apiBase}/api/threads`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
          body: JSON.stringify({ first_message: text })
        });
        const thread = await cr.json().catch(() => null);
        if (!cr.ok || !thread?.id) return;
        tid = String(thread.id);
        setSelectedThreadId(tid);
        setThreads([thread]);
        setReplyText("");
        const initial = await fetch(`${apiBase}/api/threads/${encodeURIComponent(tid)}/messages`, {
          headers: { Authorization: `Bearer ${session.token}` }
        }).then((r) => r.json()).catch(() => []);
        setThreadMessages(Array.isArray(initial) ? initial : []);
        return;
      }
      if (!tid) return;
      await fetch(`${apiBase}/api/threads/${encodeURIComponent(tid)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ body: text })
      });
      setReplyText("");
      const data = await fetch(`${apiBase}/api/threads/${encodeURIComponent(tid)}/messages`, {
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
          ? `${apiBase}/api/admin/approve-user/${encodeURIComponent(userId)}`
          : `${apiBase}/api/admin/reject-user/${encodeURIComponent(userId)}`;
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
        fetch(`${apiBase}/api/admin/user-progress/${encodeURIComponent(String(user.id))}`, { headers }).then((r) => r.json()).catch(() => null),
        fetch(`${apiBase}/api/admin/progress-report-link/${encodeURIComponent(String(user.id))}`, { headers }).then((r) => r.json()).catch(() => null)
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
    const data = await fetch(`${apiBase}/api/admin/daily-checkins/${encodeURIComponent(String(checkin.id))}`, { headers }).then((r) => r.json()).catch(() => null);
    if (data && !data.error) setSelectedCheckin(data);
  }

  async function openWorkoutDetail(workout: any) {
    setSelectedWorkout(workout || null);
    if (!session?.token || !workout?.id || role === "user" || role === "superadmin") return;
    const headers = { Authorization: `Bearer ${session.token}` };
    const data = await fetch(`${apiBase}/api/admin/workouts/${encodeURIComponent(String(workout.id))}`, { headers }).then((r) => r.json()).catch(() => null);
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
      const r = await fetch(`${apiBase}/api/admin/create-client`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({
          email,
          password,
          first_name: newClient.first_name.trim(),
          last_name: newClient.last_name.trim(),
          phone: newClient.phone.trim(),
          city: newClient.city.trim()
        })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data?.error) throw new Error(data?.error || "Failed to create client.");
      setClients((prev) => [data, ...prev]);
      setNewClient({ first_name: "", last_name: "", email: "", phone: "", city: "", password: "" });
    } catch (e: any) {
      setError(e?.message || "Failed to create client.");
    } finally {
      setIsCreatingClient(false);
    }
  }

  async function assignProgramToUser() {
    if (!session?.token || !assignUserId || !assignProgramId) {
      setError("Select a client and a program.");
      return;
    }
    setIsAssigningProgram(true);
    setError("");
    try {
      const r = await fetch(`${apiBase}/api/programs/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ user_id: assignUserId, program_id: assignProgramId })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data?.error) throw new Error(data?.error || "Assign failed.");
      setAssignProgramId("");
    } catch (e: any) {
      setError(e?.message || "Failed to assign program.");
    } finally {
      setIsAssigningProgram(false);
    }
  }

  async function updateMeetingStatus(status: "cancelled" | "completed" | "scheduled") {
    if (!session?.token || !selectedMeeting?.id) return;
    setIsMeetingUpdating(true);
    try {
      const r = await fetch(`${apiBase}/api/meetings/${encodeURIComponent(String(selectedMeeting.id))}`, {
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

  async function submitUserMicroGoals(e: FormEvent) {
    e.preventDefault();
    if (!session?.token || microAlreadyFilled) return;
    setMicroSaving(true);
    setError("");
    try {
      const r = await fetch(`${apiBase}/api/daily-checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({
          steps: microSteps === "" ? null : Number(microSteps),
          water_ml: microWater === "" ? null : Number(microWater),
          protein_g: microProtein === "" ? null : Number(microProtein),
          sleep_hours: microSleep === "" ? null : Number(microSleep)
        })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data?.error) throw new Error(data?.error || "Failed to save.");
      refreshUserTodayAndStreak();
    } catch (e2: any) {
      setError(e2?.message || "Failed to save check-in.");
    } finally {
      setMicroSaving(false);
    }
  }

  async function submitUserWorkout() {
    const uid = session?.user?.id;
    if (!session?.token || !uid) return;
    const name = wkName.trim();
    const fb = wkFeedback.trim();
    if (!name || !fb) {
      setError("Workout name and feedback are required.");
      return;
    }
    setWkSubmitting(true);
    setError("");
    try {
      const r = await fetch(`${apiBase}/api/workouts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: uid,
          workout_name: name,
          duration_seconds: timerSeconds,
          feedback: fb
        })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data?.error) throw new Error(data?.error || "Failed to log workout.");
      setWkName("");
      setWkFeedback("");
      setTimerSeconds(0);
      setTimerRunning(false);
      const rows = await fetch(`${apiBase}/api/workouts/${encodeURIComponent(String(uid))}`).then((x) => x.json()).catch(() => []);
      setWorkouts(Array.isArray(rows) ? rows : []);
      refreshUserTodayAndStreak();
    } catch (e2: any) {
      setError(e2?.message || "Failed to log workout.");
    } finally {
      setWkSubmitting(false);
    }
  }

  async function submitUserMeeting() {
    const uid = session?.user?.id;
    if (!session?.token || !uid) return;
    if (!meetingDate || !meetingTime) {
      setError("Please choose a date and time.");
      return;
    }
    setMeetingSubmitting(true);
    setError("");
    try {
      const u = session.user;
      const r = await fetch(`${apiBase}/api/meetings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: uid,
          user_name: [u?.first_name, u?.last_name].filter(Boolean).join(" "),
          user_email: u?.email || "",
          user_phone: "",
          meeting_date: meetingDate,
          time_slot: meetingTime
        })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data?.error) throw new Error(data?.error || "Failed to schedule.");
      setMeetingDate("");
      setMeetingTime("");
      const rows = await fetch(`${apiBase}/api/meetings/user/${encodeURIComponent(String(uid))}`, {
        headers: { Authorization: `Bearer ${session.token}` }
      })
        .then((x) => x.json())
        .catch(() => []);
      setActivity(Array.isArray(rows) ? rows : []);
      refreshUserTodayAndStreak();
    } catch (e2: any) {
      setError(e2?.message || "Failed to schedule meeting.");
    } finally {
      setMeetingSubmitting(false);
    }
  }

  async function submitSundayCheckinUser(e: FormEvent) {
    e.preventDefault();
    const uid = session?.user?.id;
    if (!session?.token || !uid) return;
    const full_name = sundayForm.full_name.trim();
    if (!full_name) {
      setError("Full name is required.");
      return;
    }
    setSundaySubmitting(true);
    setError("");
    try {
      const r = await fetch(`${apiBase}/api/sunday-checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: uid,
          full_name,
          reply_email: String(session.user?.email || ""),
          plan: sundayForm.plan.trim(),
          current_weight_waist_week: sundayForm.current_weight_waist_week.trim(),
          last_week_weight_waist: sundayForm.last_week_weight_waist.trim(),
          total_weight_loss: sundayForm.total_weight_loss.trim(),
          training_go: sundayForm.training_go.trim(),
          nutrition_go: sundayForm.nutrition_go.trim(),
          sleep: sundayForm.sleep.trim(),
          occupation_stress: sundayForm.occupation_stress.trim(),
          other_stress: sundayForm.other_stress.trim(),
          differences_felt: sundayForm.differences_felt.trim(),
          achievements: sundayForm.achievements.trim(),
          improve_next_week: sundayForm.improve_next_week.trim(),
          questions: sundayForm.questions.trim()
        })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data?.error) throw new Error(data?.error || "Failed to submit.");
      setUserCheckinView("hub");
      refreshUserTodayAndStreak();
    } catch (e2: any) {
      setError(e2?.message || "Failed to submit Sunday check-in.");
    } finally {
      setSundaySubmitting(false);
    }
  }

  async function submitProgressFormUser(e: FormEvent) {
    e.preventDefault();
    if (!session?.token) return;
    if (!progressForm.log_date) {
      setError("Date is required.");
      return;
    }
    setProgressSaving(true);
    setProgressSuccess(false);
    setError("");
    try {
      const r = await fetch(`${apiBase}/api/progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({
          log_date: progressForm.log_date,
          weight: progressForm.weight === "" ? null : progressForm.weight,
          body_fat: progressForm.body_fat === "" ? null : progressForm.body_fat,
          calories_intake: progressForm.calories_intake === "" ? null : progressForm.calories_intake,
          protein_intake: progressForm.protein_intake === "" ? null : progressForm.protein_intake,
          workout_completed: progressForm.workout_completed,
          workout_type: progressForm.workout_type || null,
          strength_bench: progressForm.strength_bench === "" ? null : progressForm.strength_bench,
          strength_squat: progressForm.strength_squat === "" ? null : progressForm.strength_squat,
          strength_deadlift: progressForm.strength_deadlift === "" ? null : progressForm.strength_deadlift,
          sleep_hours: progressForm.sleep_hours === "" ? null : progressForm.sleep_hours,
          water_intake: progressForm.water_intake === "" ? null : progressForm.water_intake
        })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || "Failed to save progress.");
      setProgressSuccess(true);
      const logsRes = await fetch(`${apiBase}/api/progress`, {
        headers: { Authorization: `Bearer ${session.token}` }
      }).then((x) => x.json()).catch(() => null);
      setUserProgressLogs(Array.isArray(logsRes?.logs) ? logsRes.logs : []);
    } catch (e2: any) {
      setError(e2?.message || "Failed to save progress.");
    } finally {
      setProgressSaving(false);
    }
  }

  async function refreshSuperadminQueues() {
    if (role === "superadmin") {
      await loadSuperadminDashboard();
      return;
    }
    if (!session?.token) return;
    const headers = { Authorization: `Bearer ${session.token}` };
    const [reqs, clientReqs, overview, trainersList] = await Promise.all([
      fetch(`${apiBase}/api/superadmin/trainer-requests?status=all`, { headers }).then((r) => r.json()).catch(() => []),
      fetch(`${apiBase}/api/superadmin/client-requests?status=all`, { headers }).then((r) => r.json()).catch(() => []),
      fetch(`${apiBase}/api/superadmin/trainer-client-overview`, { headers }).then((r) => r.json()).catch(() => []),
      fetch(`${apiBase}/api/superadmin/trainers`, { headers }).then((r) => r.json()).catch(() => [])
    ]);
    setTrainerRequests(Array.isArray(reqs) ? reqs : []);
    setClientLeadRequests(Array.isArray(clientReqs) ? clientReqs : []);
    setTrainerClientOverview(Array.isArray(overview) ? overview : []);
    setSuperadminTrainers(Array.isArray(trainersList) ? trainersList : []);
  }

  async function superadminApproveTrainerRequestRow(requestId: string) {
    const pwd = typeof window !== "undefined" ? window.prompt("Set trainer login password (min 6 characters):") : null;
    if (pwd === null) return;
    if (!pwd || pwd.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (!session?.token) return;
    setSuperadminQueueBusy(`${requestId}-ta`);
    setError("");
    try {
      const r = await fetch(`${apiBase}/api/superadmin/trainer-requests/${encodeURIComponent(requestId)}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ password: pwd })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data?.error) throw new Error(data?.error || "Approve failed");
      const msg = data?.referral_code
        ? `Trainer approved. Referral code: ${data.referral_code}\nJoin URL path: /join/${data.referral_code}`
        : "Trainer approved.";
      if (typeof window !== "undefined") window.alert(msg);
      await refreshSuperadminQueues();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setSuperadminQueueBusy("");
    }
  }

  async function superadminRejectTrainerRequestRow(requestId: string) {
    if (typeof window !== "undefined" && !window.confirm("Reject this trainer request?")) return;
    if (!session?.token) return;
    setSuperadminQueueBusy(`${requestId}-tr`);
    setError("");
    try {
      const r = await fetch(`${apiBase}/api/superadmin/trainer-requests/${encodeURIComponent(requestId)}/reject`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.token}` }
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data?.error) throw new Error(data?.error || "Reject failed");
      await refreshSuperadminQueues();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Reject failed");
    } finally {
      setSuperadminQueueBusy("");
    }
  }

  async function superadminApproveClientRequestRow(requestId: string, trainerId: string) {
    if (!trainerId) {
      setError("Choose a trainer to assign.");
      return;
    }
    if (!session?.token) return;
    setSuperadminQueueBusy(`${requestId}-ca`);
    setError("");
    try {
      const r = await fetch(`${apiBase}/api/superadmin/client-requests/${encodeURIComponent(requestId)}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ trainer_user_id: trainerId })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data?.error) throw new Error(data?.error || "Approve failed");
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const path = String(data?.join_path || "");
      const url = path ? `${origin}${path}` : "";
      if (url && typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        if (typeof window !== "undefined") {
          window.alert(`Approved. Join link copied to clipboard:\n${url}\nSend it to the client to complete signup.`);
        }
      } else if (typeof window !== "undefined") {
        window.alert(url ? `Approved. Share this link with the client:\n${url}` : data?.message || "Approved.");
      }
      await refreshSuperadminQueues();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setSuperadminQueueBusy("");
    }
  }

  async function superadminRejectClientRequestRow(requestId: string) {
    if (typeof window !== "undefined" && !window.confirm("Reject this client coaching request?")) return;
    if (!session?.token) return;
    setSuperadminQueueBusy(`${requestId}-cr`);
    setError("");
    try {
      const r = await fetch(`${apiBase}/api/superadmin/client-requests/${encodeURIComponent(requestId)}/reject`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.token}` }
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data?.error) throw new Error(data?.error || "Reject failed");
      await refreshSuperadminQueues();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Reject failed");
    } finally {
      setSuperadminQueueBusy("");
    }
  }

  function toggleUserTimer() {
    setTimerRunning((r) => !r);
  }

  function resetUserTimer() {
    setTimerRunning(false);
    setTimerSeconds(0);
  }

  const s = {
    bg: "var(--bg-primary)",
    panel: "var(--bg-surface)",
    line: "var(--accent-border)",
    text: "var(--text-primary)",
    muted: "var(--text-secondary)",
    gold: "var(--accent)"
  };

  function HubCard({ icon, title, desc, onClick }: { icon: string; title: string; desc: string; onClick: () => void }) {
    return (
      <button type="button" className="bb-admin-hub-card" onClick={onClick}>
        <span className="bb-admin-hub-card-icon" aria-hidden>
          {icon}
        </span>
        <span className="bb-admin-hub-card-title">{title}</span>
        <span className="bb-admin-hub-card-desc">{desc}</span>
      </button>
    );
  }

  function goTab(id: DashboardTab) {
    setStaffAiOpen(false);
    setStaffOverlay(null);
    if (id !== activeTab) {
      setTrainerClientsView("hub");
      setTrainerFormsView("hub");
      setTrainerMessagesView("hub");
    }
    if (role === "user" && id === "forms") setUserCheckinView("hub");
    setActiveTab(id);
  }

  function tabButton(id: DashboardTab, label: string, icon: string) {
    const userMainTabs: DashboardTab[] = ["home", "clients", "programs", "forms", "messages"];
    const active =
      id === "ai" && isStaff
        ? staffAiOpen
        : role === "user" && !userMainTabs.includes(activeTab)
          ? false
          : activeTab === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => {
          if (id === "ai" && isStaff) {
            setStaffAiOpen((o) => !o);
            return;
          }
          goTab(id);
        }}
        className={`bb-nav-btn${active ? " bb-nav-btn-active" : ""}`}
      >
        {active ? <span className="bb-nav-tabbar" /> : null}
        <span style={{ fontSize: 18, lineHeight: 1 }}>{icon}</span>
        <span>{label}</span>
      </button>
    );
  }

  const hideTrainerHubWelcome = isStaff && (activeTab === "clients" || activeTab === "forms" || activeTab === "messages");

  const timerHr = String(Math.floor(timerSeconds / 3600)).padStart(2, "0");
  const timerMin = String(Math.floor((timerSeconds % 3600) / 60)).padStart(2, "0");
  const timerSec = String(timerSeconds % 60).padStart(2, "0");
  const weeklyRecap = userStreak?.weekly || {};

  const userPageTitle: Record<DashboardTab, string> = {
    home: "HOME",
    clients: "WORKOUT",
    programs: "PROGRAMS",
    forms: "CHECK-IN",
    messages: "MESSAGES",
    ai: "AI",
    contact: "SCHEDULE A MEETING",
    profile: "MY PROFILE",
    progress: "MY PROGRESS"
  };

  return (
    <main className="bb-dash-root" style={{ minHeight: "100dvh", background: s.bg, color: s.text }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Syne:wght@600;700;800&family=Outfit:wght@300;400;500;600;700&family=Cormorant+Garamond:wght@600&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;1,9..40,400&family=Rajdhani:wght@600;700&display=swap');
        .bb-dash-header{padding-top:max(12px, env(safe-area-inset-top, 0px));padding-left:max(14px, env(safe-area-inset-left, 0px));padding-right:max(14px, env(safe-area-inset-right, 0px));padding-bottom:12px}
        .bb-dash-main{padding-left:max(14px, env(safe-area-inset-left, 0px));padding-right:max(14px, env(safe-area-inset-right, 0px));padding-top:14px;padding-bottom:calc(96px + env(safe-area-inset-bottom, 0px))}
        .bb-header-btn{position:relative;width:42px;height:42px;border-radius:50%;border:1px solid rgba(45,212,191,.35);background:transparent;color:var(--accent);display:grid;place-items:center;cursor:pointer}
        .bb-header-badge{position:absolute;top:-7px;right:-6px;background:var(--red);color:#0f0f0f;border-radius:999px;padding:1px 6px;font-size:10px;font-weight:700;line-height:1.4}
        .bb-admin-welcome-card{background:var(--bg-surface);border-radius:12px;border-left:3px solid var(--accent);padding:16px 18px;margin-bottom:16px;box-sizing:border-box;width:100%}
        .bb-admin-welcome-title{font-size:clamp(17px,4.2vw,24px);font-weight:700;color:var(--accent);margin:0 0 8px;line-height:1.32;letter-spacing:.02em}
        .bb-admin-welcome-role{font-weight:800;letter-spacing:.03em}
        .bb-admin-welcome-date{font-size:13px;color:var(--text-secondary);margin:0;line-height:1.45}
        .bb-dash-root{font-family:'Outfit',sans-serif;font-weight:400;-webkit-font-smoothing:antialiased}
        .bb-dashboard-title{margin:0 0 10px;font-family:'Bebas Neue',sans-serif;font-size:clamp(28px,8vw,42px);letter-spacing:1px;line-height:1;color:var(--accent)}
        .bb-admin-section-page-title{font-size:28px;letter-spacing:2px;margin-bottom:6px}
        .bb-admin-hub-cards{display:grid;grid-template-columns:1fr;gap:10px}
        @media(min-width:480px){.bb-admin-hub-cards{grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px}}
        .bb-admin-hub-card{display:flex;flex-direction:column;align-items:flex-start;padding:18px 20px;background:color-mix(in srgb, var(--text-primary) 5%, var(--bg-primary));border:1px solid rgba(45,212,191,0.2);border-radius:10px;cursor:pointer;transition:all .25s;color:inherit;text-align:left;width:100%;box-sizing:border-box;font:inherit}
        .bb-admin-hub-card:hover{background:rgba(45,212,191,0.08);border-color:rgba(45,212,191,0.4);transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,0.25)}
        .bb-admin-hub-card-icon{font-size:22px;margin-bottom:12px;opacity:.9;line-height:1}
        .bb-admin-hub-card-title{font-family:'Outfit',sans-serif;font-size:14px;font-weight:700;letter-spacing:.5px;color:var(--text-primary);margin-bottom:8px;line-height:1.3}
        .bb-admin-hub-card-desc{font-family:'DM Sans',sans-serif;font-size:12px;color:var(--text-secondary);line-height:1.5;letter-spacing:.2px}
        .bb-admin-summary-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:18px}
        .bb-admin-summary-card{background:var(--bg-surface);border-radius:12px;padding:14px;min-height:72px;display:flex;flex-direction:column;justify-content:center;border:none;cursor:pointer;text-align:left}
        .bb-admin-summary-lbl{font-size:10px;font-weight:600;letter-spacing:1.5px;color:var(--text-secondary);margin-bottom:8px}
        .bb-admin-summary-num{font-family:'Bebas Neue',sans-serif;font-size:36px;line-height:1;font-weight:700}
        .bb-admin-summary-num.num-gold{color:var(--accent)}.bb-admin-summary-num.num-green{color:var(--green)}.bb-admin-summary-num.num-orange{color:var(--accent-light)}.bb-admin-summary-num.num-pink{color:var(--accent-light)}
        .bb-admin-qa-title{font-size:10px;font-weight:600;letter-spacing:1.5px;color:var(--text-secondary);margin:0 0 10px}
        .bb-admin-qa-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
        .bb-admin-qa-btn{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:16px 10px;background:var(--bg-surface);border-radius:12px;color:var(--text-primary);font-size:12px;font-weight:600;cursor:pointer;border:none}
        .bb-admin-qa-btn:hover{background:var(--bg-card-hover)}
        .bb-admin-qa-ic{display:flex;align-items:center;justify-content:center;width:26px;height:26px;font-size:22px;line-height:1;opacity:.9}
        .bb-user-welcome{background:var(--bg-surface);border:1px solid var(--border);border-radius:14px;padding:22px 16px;text-align:center}
        .bb-user-welcome-label{display:block;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:var(--text-secondary);margin-bottom:7px}
        .bb-user-welcome-name{font-family:'Syne',sans-serif;font-size:30px;line-height:1.1;background:linear-gradient(135deg,var(--text-primary) 0%,var(--accent-light) 45%,var(--accent) 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
        .bb-user-welcome-tag{font-family:'Cormorant Garamond',serif;font-size:20px;letter-spacing:2px;color:var(--accent);margin-top:8px}
        .bb-user-today{display:grid;grid-template-columns:1fr;gap:10px;margin-top:12px}
        .bb-user-prog-card{background:linear-gradient(180deg,var(--bg-surface),var(--bg-primary));border:1px solid var(--border);border-radius:12px;padding:12px}
        .bb-user-prog-title{font-family:'Syne',sans-serif;font-size:12px;letter-spacing:1px;text-transform:uppercase}
        .bb-user-prog-value{font-family:'Bebas Neue',sans-serif;font-size:36px;color:var(--accent);line-height:1}
        .bb-user-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}
        .bb-user-action-card{background:var(--bg-surface);border:1px solid var(--border);border-radius:12px;padding:12px;display:flex;gap:10px;align-items:flex-start;cursor:pointer}
        .bb-user-action-title{font-family:'Syne',sans-serif;font-size:12px;letter-spacing:.8px;text-transform:uppercase}
        .bb-user-action-desc{font-size:11px;color:var(--text-secondary);margin-top:2px}
        .bb-live-list{margin:0;padding:0;list-style:none;display:grid;gap:8px}
        .bb-live-row{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px;border-bottom:1px solid var(--border);padding:8px 0}
        .bb-live-dot{width:9px;height:9px;border-radius:50%;background:var(--green)}
        .bb-live-pill{font-size:11px;font-weight:700;padding:6px 10px;border-radius:8px;background:var(--green-dim);color:var(--green);letter-spacing:.4px}
        .bb-live-empty{margin:0;color:var(--text-secondary);font-size:14px}
        .bb-admin-la-list-wrap{display:flex;flex-direction:column;gap:0}
        .bb-admin-la-title{font-size:10px;font-weight:600;letter-spacing:1.5px;color:var(--text-secondary);margin:0 0 10px}
        .bb-section-page{padding:4px 0 8px}
        .bb-back-btn{display:inline-flex;align-items:center;gap:6px;background:transparent;border:1px solid rgba(45,212,191,.4);color:var(--accent);padding:8px 16px;border-radius:8px;cursor:pointer;font-family:'Outfit',sans-serif;font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-bottom:14px;min-height:40px}
        .bb-back-btn:hover{background:rgba(45,212,191,.1);border-color:var(--accent)}
        .bb-section-h2{font-family:'Bebas Neue',sans-serif;font-size:26px;letter-spacing:2px;color:var(--accent);margin:0 0 16px;text-transform:uppercase}
        .bb-panel{background:var(--bg-surface);border:1px solid rgba(45,212,191,.2);border-radius:12px;padding:14px;box-sizing:border-box}
        .bb-list-rows{list-style:none;margin:0;padding:0;display:grid;gap:10px}
        .bb-list-row{display:block;padding:14px 16px;background:rgba(45,212,191,.06);border:1px solid rgba(45,212,191,.2);border-radius:8px;cursor:pointer;box-sizing:border-box}
        .bb-list-row-static{cursor:default}
        .bb-list-row-active{border-color:rgba(45,212,191,.55)!important;background:rgba(45,212,191,.1)!important}
        .bb-msg-scroll{max-height:260px;overflow-y:auto;display:grid;gap:8px}
        .bb-msg-meta{margin-top:4px;color:var(--text-secondary);font-size:10px}
        .bb-list-row-title{font-size:14px;font-weight:700;color:var(--text-primary);margin:0 0 4px}
        .bb-list-row-sub{font-family:'DM Sans',sans-serif;font-size:12px;color:var(--text-secondary);margin:0;line-height:1.45}
        .bb-inline-label{font-size:10px;font-weight:600;letter-spacing:1.2px;color:var(--text-secondary);margin-bottom:8px;display:block}
        .bb-input,.bb-textarea{background:var(--bg-card);border:1px solid var(--border);color:var(--text-primary);border-radius:8px;padding:10px 12px;font:inherit;width:100%;box-sizing:border-box}.bb-input:focus,.bb-textarea:focus{border-color:var(--accent);outline:none}
        @media(max-width:520px){.bb-input,.bb-textarea{font-size:16px;line-height:1.35}}
        .bb-input::placeholder,.bb-textarea::placeholder{color:var(--text-muted)}
        .bb-btn-primary{border:none;background:var(--accent);color:#0f0f0f;border-radius:8px;padding:10px 14px;font-weight:700;cursor:pointer;font:inherit}
        .bb-btn-primary:disabled{opacity:.55;cursor:not-allowed}
        .bb-msg-bubble-user{align-self:end;max-width:88%;background:rgba(45,212,191,.14);border:1px solid rgba(45,212,191,.25);border-radius:10px;padding:10px}
        .bb-msg-bubble-client{align-self:start;max-width:88%;background:var(--bg-surface);border:1px solid rgba(45,212,191,.2);border-radius:10px;padding:10px}
        .bb-detail-panel{border-color:rgba(45,212,191,.45)!important}
        .bb-nav-dock{position:fixed;left:0;right:0;bottom:0;z-index:30;background:var(--bg-primary);border-top:1px solid rgba(45,212,191,0.15);padding-bottom:max(0px,calc(env(safe-area-inset-bottom,0px) - 8px))}
        .bb-nav-inner{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));min-height:70px;align-items:center}
        .bb-nav-btn{border:none;background:transparent;color:var(--text-secondary);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-size:11px;font-weight:600;letter-spacing:.3px;position:relative;cursor:pointer;font:inherit;padding:9px 2px;font-family:'Outfit',sans-serif}
        .bb-nav-btn:hover,.bb-nav-btn:focus{color:var(--text-primary);outline:none}
        .bb-nav-btn-active{color:var(--accent)}
        .bb-nav-tabbar{position:absolute;top:0;left:50%;transform:translateX(-50%);height:3px;width:24px;background:var(--accent);border-radius:2px}
        .bb-staff-overlay{position:fixed;left:0;right:0;top:calc(58px + env(safe-area-inset-top,0px));bottom:calc(70px + max(0px,calc(env(safe-area-inset-bottom,0px) - 8px)));z-index:25;background:var(--bg-primary);overflow-y:auto;padding:14px 14px 20px;-webkit-overflow-scrolling:touch}
        .bb-ai-assist-panel{position:fixed;bottom:calc(70px + max(12px,env(safe-area-inset-bottom,0px)));right:max(16px,env(safe-area-inset-right,0px));left:auto;width:min(380px,calc(100vw - 32px));max-height:min(420px,65dvh);background:var(--bg-surface);border:1px solid rgba(45,212,191,0.2);border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,0.5);z-index:40;display:flex;flex-direction:column;overflow:hidden}
        .bb-ai-assist-panel[hidden]{display:none!important}
        .bb-ai-assist-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(45,212,191,0.2);background:var(--accent-dim)}
        .bb-ai-assist-head strong{font-size:15px;color:var(--text-primary)}
        .bb-ai-assist-x{width:36px;height:36px;border:none;background:transparent;color:var(--text-secondary);font-size:22px;cursor:pointer;border-radius:8px}
        .bb-ai-assist-body{padding:12px 16px;font-size:12px;color:var(--text-secondary);line-height:1.5;border-bottom:1px solid var(--border)}
        .bb-ai-assist-foot{padding:10px 12px;border-top:1px solid rgba(45,212,191,0.15);display:flex;flex-direction:column;gap:8px}
        .bb-user-welcome-card{background:linear-gradient(180deg,var(--bg-surface),var(--bg-primary));border:1px solid var(--border);border-radius:16px;padding:16px;display:flex;gap:12px;align-items:flex-start;text-align:left;cursor:pointer;width:100%;box-sizing:border-box}
        .bb-user-welcome-card:hover{border-color:rgba(45,212,191,.28)}
        .bb-user-wc-icon{width:44px;height:44px;border-radius:12px;background:rgba(45,212,191,.08);border:1px solid rgba(45,212,191,.15);display:grid;place-items:center;font-size:20px;flex-shrink:0}
        .bb-user-wc-copy{min-width:0}
        .bb-user-wc-title{font-family:'Syne',sans-serif;font-size:13px;font-weight:700;letter-spacing:1px;color:var(--text-primary);text-transform:uppercase;margin:0 0 4px}
        .bb-user-wc-desc{font-size:12px;color:var(--text-secondary);margin:0;line-height:1.45}
        #usec-home .user-welcome{text-align:left;padding:0 0 8px;position:relative}
        #usec-home .user-welcome::before{display:none}
        #usec-home .user-welcome-avatar,#usec-home .user-welcome-avatar-placeholder{width:64px;height:64px;margin:0 0 20px;border-width:2px}
        #usec-home .user-welcome-avatar-placeholder svg{width:28px;height:28px}
        #usec-home .user-welcome h1{font-size:clamp(28px,3.5vw,40px);margin-bottom:6px}
        #usec-home .user-welcome h1 .welcome-label{font-size:12px;letter-spacing:3px;margin-bottom:4px}
        #usec-home .user-welcome .user-welcome-tag{font-size:16px;margin-bottom:28px}
        #usec-home .today-dash{max-width:none;margin:0;gap:24px}
        #usec-home .today-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}
        #usec-home .today-card{min-height:100px;padding:20px;border-radius:14px;border:1px solid rgba(45,212,191,0.1);background:color-mix(in srgb, var(--text-primary) 4%, var(--bg-primary))}
        #usec-home .micro-goals-wrap{padding:28px;border-radius:16px;border-color:rgba(45,212,191,0.12);background:color-mix(in srgb, var(--text-primary) 3%, var(--bg-primary))}
        #usec-home .micro-goals-grid{grid-template-columns:repeat(4,1fr);gap:16px}
        #usec-home .weekly-recap{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
        #usec-home .weekly-recap-item{min-width:0;padding:14px;border-radius:10px}
        #usec-home .welcome-cards{max-width:none;margin:0;grid-template-columns:repeat(3,1fr);gap:16px}
        #usec-home .welcome-card{border-radius:14px;padding:20px 22px}
        @media(max-width:900px){
          #usec-home .welcome-cards{grid-template-columns:repeat(2,minmax(0,1fr))}
          #usec-home .micro-goals-grid{grid-template-columns:repeat(2,1fr)}
          #usec-home .weekly-recap{grid-template-columns:repeat(2,1fr)}
        }
        @media(max-width:520px){
          #usec-home .welcome-cards{grid-template-columns:1fr}
        }
        .user-welcome{text-align:center;padding:56px 24px 64px;position:relative}
        .user-welcome::before{content:'';position:absolute;top:0;left:50%;transform:translateX(-50%);width:min(480px,95%);height:320px;background:radial-gradient(ellipse 70% 60% at 50% 0%,rgba(45,212,191,0.08) 0%,transparent 70%);pointer-events:none}
        .user-welcome-avatar-placeholder{position:relative;margin:0 auto 32px;width:100px;height:100px;border-radius:50%;border:3px solid rgba(45,212,191,0.55);background:radial-gradient(circle at 50% 30%,rgba(45,212,191,0.14),rgba(14,14,14,0.96) 68%);display:grid;place-items:center;color:var(--text-secondary);box-shadow:0 12px 40px rgba(0,0,0,0.4),0 0 0 4px rgba(45,212,191,0.1),0 0 24px rgba(45,212,191,0.18);flex-shrink:0}
        .user-welcome-avatar-placeholder svg{width:44px;height:44px;stroke:var(--text-secondary);fill:none;stroke-width:1.5}
        .user-welcome h1{font-family:'Syne',sans-serif;font-size:clamp(34px,5vw,56px);font-weight:800;letter-spacing:-0.02em;margin-bottom:12px;line-height:1.1}
        .user-welcome h1 .welcome-label{display:block;font-size:11px;font-weight:600;letter-spacing:4px;text-transform:uppercase;color:var(--text-secondary);margin-bottom:8px;opacity:.9}
        .user-welcome h1 .welcome-name{background:linear-gradient(135deg,var(--text-primary) 0%,var(--accent-light) 45%,var(--accent) 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
        .user-welcome .user-welcome-tag{font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:600;letter-spacing:2.5px;color:var(--accent);margin-bottom:32px;opacity:1}
        .welcome-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;max-width:860px;margin:0 auto}
        .welcome-card{position:relative;display:flex;align-items:center;gap:14px;padding:18px 20px;background:linear-gradient(180deg,var(--bg-surface),var(--bg-primary));border:1px solid var(--border);border-radius:16px;text-align:left;cursor:pointer;transition:all .3s ease;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.22);border:none;font:inherit;color:inherit;width:100%;box-sizing:border-box}
        .welcome-card::before{content:'';position:absolute;left:0;top:14px;bottom:14px;width:3px;background:linear-gradient(180deg,rgba(45,212,191,0.95),rgba(45,212,191,0.18));border-radius:999px;opacity:.75;transition:opacity .3s}
        .welcome-card::after{content:'›';margin-left:auto;color:rgba(45,212,191,0.9);font-size:22px;line-height:1;transition:transform .3s ease,color .3s ease}
        .welcome-card:hover{border-color:rgba(45,212,191,0.28);transform:translateY(-2px);box-shadow:0 14px 30px rgba(0,0,0,0.3)}
        .welcome-card:hover::before{opacity:1}
        .welcome-card:hover::after{transform:translateX(3px);color:var(--accent)}
        .welcome-card .wc-icon-wrap{width:48px;height:48px;flex:0 0 48px;margin:0;border-radius:12px;background:rgba(45,212,191,0.06);border:1px solid rgba(45,212,191,0.12);display:grid;place-items:center;transition:all .3s}
        .welcome-card .wc-icon-wrap svg{width:28px;height:28px;stroke:var(--accent);fill:none;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round;transition:stroke .4s}
        .welcome-card:hover .wc-icon-wrap{background:rgba(45,212,191,0.1);border-color:rgba(45,212,191,0.2)}
        .welcome-card:hover .wc-icon-wrap svg{stroke:var(--accent-light)}
        .welcome-card .wc-copy{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1;text-align:left}
        .welcome-card .wc-title{font-family:'Syne',sans-serif;font-size:13px;font-weight:700;letter-spacing:1.2px;color:var(--text-primary);margin:0;text-transform:uppercase}
        .welcome-card .wc-desc{font-size:12px;color:var(--text-secondary);line-height:1.45;letter-spacing:0.1px;margin:0}
        .wc-title.sc-style{font-family:'Bebas Neue',sans-serif;letter-spacing:2px;color:var(--accent)}
        .welcome-card .req{color:var(--red)}
        .today-dash{display:flex;flex-direction:column;gap:24px;max-width:640px;margin:0 auto}
        .today-row{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start}
        .today-card{flex:1;min-width:200px;padding:20px;background:color-mix(in srgb, var(--text-primary) 5%, var(--bg-primary));border:1px solid rgba(45,212,191,0.2);border-radius:12px}
        .today-card h3{font-size:12px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:var(--accent);margin-bottom:12px}
        .today-card p{margin:0;font-size:14px;color:var(--text-secondary);line-height:1.5}
        .today-card .val{font-weight:600;color:var(--text-primary);margin-top:6px}
        .today-card.action{cursor:pointer;transition:background .2s,border-color .2s}
        .today-card.action:hover{background:rgba(45,212,191,0.06);border-color:var(--accent)}
        .micro-goals-wrap{background:color-mix(in srgb, var(--text-primary) 3%, var(--bg-primary));border:1px solid rgba(45,212,191,0.2);border-radius:14px;padding:24px;margin:0}
        .micro-goals-wrap h3{font-size:13px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:var(--accent);margin-bottom:16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
        .micro-goals-wrap .streak-badge{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;background:rgba(45,212,191,0.2);border-radius:20px;font-size:13px;font-weight:700;color:var(--accent);transition:background .3s,box-shadow .3s,transform .15s}
        .micro-goals-wrap .streak-badge[data-tier="fire"]{background:rgba(255,100,50,0.25);box-shadow:0 0 12px rgba(255,140,0,0.2)}
        .micro-goals-wrap .streak-badge[data-tier="rocket"]{background:linear-gradient(135deg,rgba(45,212,191,0.3),rgba(255,180,50,0.15));box-shadow:0 0 16px rgba(45,212,191,0.25)}
        .micro-goals-wrap .streak-badge[data-tier="diamond"]{background:linear-gradient(135deg,rgba(180,220,255,0.2),rgba(45,212,191,0.2));box-shadow:0 0 20px rgba(45,212,191,0.35)}
        .micro-goals-wrap .streak-badge[data-tier="legend"]{background:linear-gradient(135deg,rgba(255,215,0,0.3),rgba(45,212,191,0.25));box-shadow:0 0 24px rgba(255,215,0,0.4);animation:bbStreakGlow 2s ease-in-out infinite alternate}
        .micro-goals-wrap .streak-badge[data-at-risk="true"]{background:rgba(251,146,60,0.32);box-shadow:0 0 16px rgba(251,146,60,0.45);animation:bbStreakPulse 1.5s ease-in-out infinite}
        @keyframes bbStreakGlow{from{box-shadow:0 0 20px rgba(255,215,0,0.3)}to{box-shadow:0 0 28px rgba(255,215,0,0.5)}}
        @keyframes bbStreakPulse{0%,100%{opacity:1}50%{opacity:.85}}
        .streak-at-risk-banner{display:flex;align-items:center;gap:10px;padding:12px 16px;background:linear-gradient(90deg,rgba(251,146,60,0.22),rgba(251,146,60,0.08));border:1px solid rgba(251,146,60,0.42);border-radius:10px;margin-bottom:16px}
        .streak-at-risk-banner .text{flex:1;font-size:13px;font-weight:600;color:var(--text-primary)}
        .micro-goals-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin-bottom:20px}
        @media(min-width:600px){.micro-goals-grid{grid-template-columns:repeat(4,1fr)}}
        .micro-goal-field{display:flex;flex-direction:column;gap:6px}
        .micro-goal-field label{font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--text-secondary)}
        .micro-goal-field input{width:100%;padding:10px 14px;border:1px solid var(--border);border-radius:8px;background:var(--bg-card);color:var(--text-primary);font-size:14px;box-sizing:border-box}
        .micro-goal-field input:focus{border-color:var(--accent);outline:none}
        .micro-goal-field input::placeholder{color:var(--text-muted)}
        .micro-goal-field input:disabled{opacity:0.75}
        .micro-goals-submit{width:100%;padding:12px;background:linear-gradient(135deg,var(--accent-light),var(--accent));border:none;border-radius:8px;color:#0f0f0f;font-weight:700;font-size:13px;letter-spacing:1px;cursor:pointer;transition:opacity .2s}
        .micro-goals-submit:hover{opacity:.95}
        .micro-goals-submit:disabled{opacity:.5;cursor:not-allowed}
        .weekly-recap{display:flex;flex-wrap:wrap;gap:12px;margin-top:16px;padding-top:16px;border-top:1px solid rgba(45,212,191,0.2)}
        .weekly-recap-item{flex:1;min-width:100px;text-align:center;padding:12px;background:var(--bg-card);border-radius:8px}
        .weekly-recap-item .lbl{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-secondary);margin-bottom:4px;display:block}
        .weekly-recap-item .num{font-size:18px;font-weight:700;color:var(--accent)}
        .push-enable-wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:18px 20px;background:rgba(45,212,191,0.1);border:1px solid rgba(45,212,191,0.35);border-radius:10px;margin-top:16px;text-align:center}
        .push-enable-wrap p{margin:0;min-width:0;font-size:13px;color:var(--text-secondary);max-width:320px}
        .push-enable-btn{padding:10px 20px;background:linear-gradient(135deg,var(--accent-light),var(--accent));border:none;border-radius:8px;color:#0f0f0f;font-weight:700;font-size:12px;letter-spacing:.5px;cursor:pointer;box-shadow:0 6px 18px rgba(45,212,191,0.22)}
        .ud-user-back{margin-bottom:16px}
        .ud-back-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;background:transparent;border:1px solid rgba(45,212,191,0.4);color:var(--accent);border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;transition:all .2s;font-family:'Outfit',sans-serif}
        .ud-back-btn:hover{background:rgba(45,212,191,0.1);border-color:var(--accent)}
        .form-hint{font-size:14px;color:var(--text-secondary);margin:0 0 16px;line-height:1.5}
        .checkin-hub-back{margin-bottom:16px}
        .checkin-back-btn{display:inline-flex;align-items:center;gap:4px;padding:6px 12px;background:transparent;border:1px solid rgba(45,212,191,0.4);color:var(--accent);border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;transition:all .2s;font-family:'Outfit',sans-serif}
        .checkin-back-btn:hover{background:rgba(45,212,191,0.1);border-color:var(--accent)}
        .checkin-hub-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;max-width:720px}
        .checkin-option-card{display:flex;flex-direction:column;align-items:flex-start;gap:10px;padding:20px;background:linear-gradient(180deg,var(--bg-surface),var(--bg-primary));border:1px solid var(--border);border-radius:16px;cursor:pointer;transition:all .3s ease;box-shadow:0 4px 20px rgba(0,0,0,0.22);text-align:left;font:inherit;color:inherit;width:100%;box-sizing:border-box}
        .checkin-option-card:hover{border-color:rgba(45,212,191,0.28);transform:translateY(-2px);box-shadow:0 14px 30px rgba(0,0,0,0.3)}
        .checkin-option-card .checkin-card-icon{width:48px;height:48px;border-radius:12px;background:rgba(45,212,191,0.06);border:1px solid rgba(45,212,191,0.12);display:grid;place-items:center}
        .checkin-option-card .checkin-card-icon svg{width:28px;height:28px;stroke:var(--accent);fill:none;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
        .checkin-option-card .checkin-card-title{font-family:'Syne',sans-serif;font-size:14px;font-weight:700;letter-spacing:1px;color:var(--text-primary);text-transform:uppercase;margin:0}
        .checkin-option-card .checkin-card-desc{font-size:12px;color:var(--text-secondary);line-height:1.45;margin:0}
        .ud-form-section-title{font-family:'Syne',sans-serif;font-size:14px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--accent);margin-bottom:20px;margin-top:0}
        .ud-form-group{margin-bottom:18px;min-width:0}
        .ud-form-group label{display:block;font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:6px;letter-spacing:.5px}
        .ud-form-group label .req{color:var(--red)}
        .ud-form-input{width:100%;padding:12px 16px;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-family:'Outfit',sans-serif;font-size:14px;transition:border-color .3s;outline:none;box-sizing:border-box}
        .ud-form-input:focus{border-color:var(--accent)}
        .ud-form-input::placeholder{color:var(--text-muted)}
        .ud-form-input:focus{border-color:var(--accent)}
        .ud-form-input::placeholder{color:var(--text-secondary)}
        textarea.ud-form-input{resize:vertical;min-height:80px}
        .ud-form-submit{width:100%;padding:14px;background:linear-gradient(135deg,var(--accent-light),var(--accent));border:none;border-radius:8px;color:#0f0f0f;font-family:'Outfit',sans-serif;font-weight:700;font-size:15px;letter-spacing:1px;text-transform:uppercase;cursor:pointer;transition:all .3s;margin-top:8px}
        .ud-form-submit:hover{transform:translateY(-1px);box-shadow:0 4px 20px rgba(45,212,191,0.3)}
        .ud-form-divider{height:1px;background:var(--border);margin:24px 0}
        .ud-form-hint-sm{font-size:11px;color:var(--text-secondary);margin-top:4px;display:block}
        .timer-display{text-align:center;margin:28px 0}
        .timer-digits{font-family:'Bebas Neue',sans-serif;font-size:64px;letter-spacing:6px;color:var(--text-primary)}
        .timer-digits span{display:inline-block;min-width:70px;padding:8px 12px;background:var(--bg-card);border-radius:8px;margin:0 4px}
        .timer-sep{color:var(--accent);font-size:48px;vertical-align:middle}
        .timer-btn{display:block;margin:16px auto;padding:14px 60px;border:1.5px solid var(--accent);border-radius:10px;background:rgba(45,212,191,0.05);color:var(--accent);font-size:28px;cursor:pointer;transition:all .3s;box-shadow:0 0 20px rgba(45,212,191,0.1);font-family:inherit}
        .timer-btn:hover{background:rgba(45,212,191,0.15);box-shadow:0 0 30px rgba(45,212,191,0.2)}
        .timer-reset{display:block;margin:8px auto;padding:8px 20px;border:none;background:transparent;color:var(--text-secondary);font-size:12px;cursor:pointer;letter-spacing:1px;text-transform:uppercase;font-family:'Outfit',sans-serif}
        .timer-reset:hover{color:var(--accent)}
        .workout-programs-box{margin-top:28px}
        .user-programs-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px}
        .prog-card{background:linear-gradient(180deg,var(--bg-surface),var(--bg-primary));border:1px solid var(--border);border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.22);display:flex;flex-direction:column;min-width:0}
        .prog-meta{padding:14px 16px;display:flex;flex-direction:column;gap:6px}
        .prog-title{font-family:'Syne',sans-serif;font-size:14px;font-weight:700;letter-spacing:0.6px;color:var(--text-primary);text-transform:uppercase;line-height:1.25}
        .prog-sub{font-size:12px;color:var(--text-secondary);line-height:1.4}
        .prog-actions{display:flex;gap:10px;flex-wrap:wrap;padding:0 16px 16px}
        .prog-actions a{flex:1 1 0%;min-width:120px;text-align:center;padding:10px;border-radius:8px;background:rgba(45,212,191,0.12);color:var(--accent);font-weight:600;font-size:12px;text-decoration:none;border:1px solid rgba(45,212,191,0.25)}
        .schedule-call-block{padding:24px;background:rgba(45,212,191,0.06);border:1px solid rgba(45,212,191,0.2);border-radius:14px;margin-bottom:24px;min-width:0;overflow:hidden}
        .ud-form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        @media(max-width:520px){.ud-form-row{grid-template-columns:1fr}}
        .my-meetings{margin-top:24px}
        .my-meeting-item{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:14px 18px;background:color-mix(in srgb, var(--text-primary) 5%, var(--bg-primary));border:1px solid rgba(45,212,191,0.2);border-radius:10px;margin-bottom:10px}
        .my-meeting-item .m-info{font-size:14px;color:var(--text-primary)}
        .my-meeting-item .m-date{color:var(--accent);font-weight:600}
        .chat-header-strip{margin-bottom:20px;text-align:center}
        .chat-header-desc{font-size:14px;color:var(--text-secondary);margin:0}
        .chat-container{background:linear-gradient(180deg,rgba(0,0,0,0.2),rgba(0,0,0,0.08));border:1px solid rgba(45,212,191,0.2);border-radius:20px;padding:20px}
        .thread-messages-box{display:flex;flex-direction:column;gap:10px;min-height:240px;max-height:420px;overflow-y:auto;padding:20px;background:linear-gradient(180deg,rgba(0,0,0,0.35) 0%,rgba(0,0,0,0.2) 100%);border:1px solid rgba(45,212,191,0.2);border-radius:16px;margin-bottom:20px;-webkit-overflow-scrolling:touch}
        .thread-msg{display:flex;align-items:flex-end;gap:10px;max-width:82%}
        .thread-msg.user{align-self:flex-end;flex-direction:row-reverse;margin-left:auto}
        .thread-msg.admin{align-self:flex-start;flex-direction:row}
        .thread-msg-bubble{padding:12px 16px;border-radius:18px;font-size:14px;line-height:1.55;word-break:break-word}
        .thread-msg.user .thread-msg-bubble{border-bottom-right-radius:4px;background:linear-gradient(135deg,rgba(45,212,191,0.28),rgba(45,212,191,0.12));border:1px solid rgba(45,212,191,0.45);color:var(--text-primary)}
        .thread-msg.admin .thread-msg-bubble{border-bottom-left-radius:4px;background:linear-gradient(180deg,rgba(255,255,255,0.1),color-mix(in srgb, var(--text-primary) 6%, var(--bg-card)));border:1px solid rgba(255,255,255,0.12);color:var(--text-primary)}
        .thread-msg-meta{font-size:11px;color:var(--text-secondary);margin-top:6px;opacity:.9}
        .thread-reply-wrap{display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-top:12px}
        .thread-reply-wrap .ud-form-input{flex:1;min-width:0;min-height:52px;resize:none;border-radius:14px}
        .chat-send-btn{min-height:52px;padding:0 24px;border-radius:14px;font-weight:600;background:linear-gradient(135deg,var(--accent-light),var(--accent));color:#0f0f0f;border:none;cursor:pointer;font-family:'Outfit',sans-serif}
        .progress-form-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:16px;margin-bottom:24px}
        .progress-form-grid .ud-form-group{min-width:0}
        .admin-cp-heading{font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:rgba(45,212,191,0.7);margin-bottom:12px;font-family:'Outfit',sans-serif}
        .progress-logs-list{background:color-mix(in srgb, var(--text-primary) 5%, var(--bg-primary));border:1px solid var(--border);border-radius:8px;overflow-x:auto}
        .progress-logs-list table{width:100%;min-width:320px;border-collapse:collapse;font-size:13px}
        .progress-logs-list th{text-align:left;padding:10px 12px;color:var(--accent);font-weight:600;border-bottom:1px solid var(--border);background:rgba(45,212,191,0.06)}
        .progress-logs-list td{padding:10px 12px;color:var(--text-secondary);border-bottom:1px solid rgba(255,255,255,0.04)}
        .progress-logs-list tr:last-child td{border-bottom:none}
        .admin-cp-placeholder{color:var(--text-secondary);padding:16px;text-align:center;font-size:14px;margin:0}
        .form-success{display:none}
        .form-success.show{display:block;color:var(--green);text-align:center;margin-top:16px}
      `}</style>
      <header
        className="bb-dash-header"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          borderBottom: `1px solid ${s.line}`,
          background: "rgba(0,0,0,.94)",
          backdropFilter: "blur(8px)"
        }}
      >
        <img src={`${apiBase}/img/Fitbase_logo2.png`} alt="FitBase" style={{ height: 52, width: "auto", objectFit: "contain" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="bb-header-btn" aria-label="Notifications">
            🔔
            <span className="bb-header-badge">99+</span>
          </button>
          <button
            className="bb-header-btn"
            aria-label="Refresh"
            disabled={role === "superadmin" && superadminSync.loading}
            onClick={() => {
              if (role === "superadmin") void loadSuperadminDashboard();
              else window.location.reload();
            }}
          >
            ↻
          </button>
          <button
            onClick={() => {
              localStorage.removeItem(FITBASE_SESSION_KEY);
              window.location.replace("/login");
            }}
            style={{
              border: `1px solid var(--red)`,
              background: "transparent",
              color: "var(--red)",
              borderRadius: 8,
              padding: "9px 14px",
              fontWeight: 700,
              cursor: "pointer"
            }}
          >
            LOGOUT
          </button>
        </div>
      </header>

      <section className="bb-dash-main">
        <h1 className={`bb-dashboard-title${activeTab === "home" ? "" : " bb-admin-section-page-title"}`}>
          {role === "user"
            ? userPageTitle[activeTab]
            : activeTab === "home"
              ? role === "superadmin"
                ? "SUPER ADMIN"
                : "DASHBOARD"
              : activeTab === "forms"
                ? "FORMS"
                : activeTab.toUpperCase()}
        </h1>
        {activeTab !== "home" && !hideTrainerHubWelcome ? (
          <div className="bb-admin-welcome-card" style={{ marginBottom: 14 }}>
            <h2 className="bb-admin-welcome-title" style={{ marginBottom: 4 }}>
              Welcome back <span className="bb-admin-welcome-role">&ldquo;{displayName}&rdquo;</span>
            </h2>
            <p className="bb-admin-welcome-date" suppressHydrationWarning>
              {todayLabel || "\u00a0"}
            </p>
          </div>
        ) : null}

        {error ? <p style={{ color: "var(--red)", marginTop: 12 }}>{error}</p> : null}

        {activeTab === "home" ? (
          <>
            {role === "user" ? (
              <div id="usec-home" style={{ marginTop: 8 }}>
                <div className="user-welcome">
                  <div className="user-welcome-avatar-placeholder" aria-hidden>
                    <svg viewBox="0 0 24 24">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </div>
                  <h1>
                    <span className="welcome-label">Welcome</span>
                    <span className="welcome-name">{displayName}</span>
                  </h1>
                  <p className="user-welcome-tag">Tribe Elite Member</p>

                  <div className="today-dash">
                    <div className="today-row">
                      <div
                        role="button"
                        tabIndex={0}
                        className="today-card action"
                        onClick={() => goTab("messages")}
                        onKeyDown={(e) => e.key === "Enter" && goTab("messages")}
                      >
                        <h3>Last message</h3>
                        <p className={`val${userLastMsgPreview === "—" ? " empty" : ""}`}>{userLastMsgPreview}</p>
                      </div>
                      <div
                        role="button"
                        tabIndex={0}
                        className="today-card action"
                        onClick={() => goTab("contact")}
                        onKeyDown={(e) => e.key === "Enter" && goTab("contact")}
                      >
                        <h3>Next call</h3>
                        <p className="val">{userNextCallLabel}</p>
                      </div>
                      {userToday?.pendingSundayCheckin ? (
                        <div
                          role="button"
                          tabIndex={0}
                          className="today-card action"
                          onClick={() => {
                            goTab("forms");
                            setUserCheckinView("sunday");
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              goTab("forms");
                              setUserCheckinView("sunday");
                            }
                          }}
                        >
                          <h3>Pending</h3>
                          <p className="val" style={{ color: "var(--accent)" }}>
                            Sunday check-in due
                          </p>
                        </div>
                      ) : null}
                    </div>

                    <div className="micro-goals-wrap">
                      {userStreakBadge.atRisk && userStreak && (userStreak.streak || 0) > 0 ? (
                        <div className="streak-at-risk-banner">
                          <span className="text">Save today&apos;s check-in to keep your streak!</span>
                        </div>
                      ) : null}
                      <h3>
                        Daily check-in{" "}
                        <span
                          className="streak-badge"
                          data-tier={userStreakBadge.tier}
                          data-at-risk={userStreakBadge.atRisk ? "true" : "false"}
                        >
                          {userStreakBadge.text}
                        </span>
                      </h3>
                      <form onSubmit={submitUserMicroGoals}>
                        <div className="micro-goals-grid">
                          <div className="micro-goal-field">
                            <label>Steps</label>
                            <input
                              type="number"
                              placeholder="e.g. 8000"
                              min={0}
                              value={microSteps}
                              onChange={(e) => setMicroSteps(e.target.value)}
                              disabled={microAlreadyFilled}
                            />
                          </div>
                          <div className="micro-goal-field">
                            <label>Water (ml)</label>
                            <input
                              type="number"
                              placeholder="e.g. 2000"
                              min={0}
                              value={microWater}
                              onChange={(e) => setMicroWater(e.target.value)}
                              disabled={microAlreadyFilled}
                            />
                          </div>
                          <div className="micro-goal-field">
                            <label>Protein (g)</label>
                            <input
                              type="number"
                              placeholder="e.g. 120"
                              min={0}
                              value={microProtein}
                              onChange={(e) => setMicroProtein(e.target.value)}
                              disabled={microAlreadyFilled}
                            />
                          </div>
                          <div className="micro-goal-field">
                            <label>Sleep (hrs)</label>
                            <input
                              type="number"
                              placeholder="e.g. 7.5"
                              min={0}
                              step={0.5}
                              value={microSleep}
                              onChange={(e) => setMicroSleep(e.target.value)}
                              disabled={microAlreadyFilled}
                            />
                          </div>
                        </div>
                        <button type="submit" className="micro-goals-submit" disabled={microAlreadyFilled || microSaving}>
                          {microAlreadyFilled ? "Already checked in today" : microSaving ? "Saving…" : "Save today"}
                        </button>
                      </form>
                      <div className="weekly-recap">
                        <div className="weekly-recap-item">
                          <span className="lbl">Avg steps</span>
                          <span className="num">{weeklyRecap.avgSteps != null ? String(weeklyRecap.avgSteps) : "—"}</span>
                        </div>
                        <div className="weekly-recap-item">
                          <span className="lbl">Avg water</span>
                          <span className="num">{weeklyRecap.avgWater != null ? String(weeklyRecap.avgWater) : "—"}</span>
                        </div>
                        <div className="weekly-recap-item">
                          <span className="lbl">Avg protein</span>
                          <span className="num">{weeklyRecap.avgProtein != null ? String(weeklyRecap.avgProtein) : "—"}</span>
                        </div>
                        <div className="weekly-recap-item">
                          <span className="lbl">Avg sleep</span>
                          <span className="num">{weeklyRecap.avgSleep != null ? String(weeklyRecap.avgSleep) : "—"}</span>
                        </div>
                      </div>
                      <div className="push-enable-wrap">
                        <p>Get workout &amp; check-in reminders, and know when your Lifestyle Manager replies.</p>
                        <button
                          type="button"
                          className="push-enable-btn"
                          onClick={() => {
                            if (typeof Notification !== "undefined") Notification.requestPermission().catch(() => {});
                          }}
                        >
                          Enable notifications
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="welcome-cards">
                    <button type="button" className="welcome-card" onClick={() => goTab("clients")}>
                      <div className="wc-icon-wrap">
                        <svg viewBox="0 0 24 24">
                          <path d="M2 12h4V8H2v4zM18 12h4V8h-4v4zM6 12h12" />
                        </svg>
                      </div>
                      <div className="wc-copy">
                        <div className="wc-title">My Workout</div>
                        <div className="wc-desc">Log your training sessions</div>
                      </div>
                    </button>
                    <button type="button" className="welcome-card" onClick={() => goTab("progress")}>
                      <div className="wc-icon-wrap">
                        <svg viewBox="0 0 24 24">
                          <path d="M3 3v18h18" />
                          <path d="M18 17V9" />
                          <path d="M13 17V5" />
                          <path d="M8 17v-3" />
                        </svg>
                      </div>
                      <div className="wc-copy">
                        <div className="wc-title">My Progress</div>
                        <div className="wc-desc">Log daily metrics and view analytics</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      className="welcome-card"
                      onClick={() => {
                        goTab("forms");
                        setUserCheckinView("sunday");
                      }}
                    >
                      <div className="wc-icon-wrap">
                        <svg viewBox="0 0 24 24">
                          <path d="M9 11l3 3L22 4" />
                          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                        </svg>
                      </div>
                      <div className="wc-copy">
                        <div className="wc-title sc-style">
                          Sunday Check-in<span className="req">*</span>
                        </div>
                        <div className="wc-desc">Complete your weekly check-in form</div>
                      </div>
                    </button>
                    <button type="button" className="welcome-card" onClick={() => goTab("messages")}>
                      <div className="wc-icon-wrap">
                        <svg viewBox="0 0 24 24">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                      </div>
                      <div className="wc-copy">
                        <div className="wc-title">Messages</div>
                        <div className="wc-desc">Chat with your Lifestyle Manager</div>
                      </div>
                    </button>
                    <button type="button" className="welcome-card" onClick={() => goTab("profile")}>
                      <div className="wc-icon-wrap">
                        <svg viewBox="0 0 24 24">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                      </div>
                      <div className="wc-copy">
                        <div className="wc-title">My Profile</div>
                        <div className="wc-desc">View and update your information</div>
                      </div>
                    </button>
                    <button type="button" className="welcome-card" onClick={() => goTab("contact")}>
                      <div className="wc-icon-wrap">
                        <svg viewBox="0 0 24 24">
                          <path d="M3 3h18v18H3V3zm2 2v14h14V5H5zm2 2h10v2H7V7zm0 4h10v2H7v-2zm0 4h6v2H7v-2z" />
                        </svg>
                      </div>
                      <div className="wc-copy">
                        <div className="wc-title">Contact Us</div>
                        <div className="wc-desc">Send a one-off message</div>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            ) : role === "superadmin" ? (
              <>
                <div className="bb-admin-welcome-card" style={{ marginTop: 12 }}>
                  <h2 className="bb-admin-welcome-title">
                    Super admin · <span className="bb-admin-welcome-role">&ldquo;{displayName}&rdquo;</span>
                  </h2>
                  <p className="bb-admin-welcome-date">Platform overview — trainers, clients, and requests</p>
                  <p className="bb-admin-welcome-date" suppressHydrationWarning>
                    {todayLabel || "\u00a0"}
                  </p>
                </div>
                <div className="bb-admin-summary-cards">
                  <button
                    type="button"
                    className="bb-admin-summary-card"
                    onClick={() => {
                      goTab("clients");
                      setTrainerClientsView("progress");
                    }}
                  >
                    <span className="bb-admin-summary-lbl">MEMBERS</span>
                    <span className="bb-admin-summary-num num-gold">
                      {Number(superadminSnapshot?.stats?.approved_users ?? stats?.active_members ?? 0)}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="bb-admin-summary-card"
                    onClick={() => {
                      goTab("clients");
                      setTrainerClientsView("pending");
                    }}
                  >
                    <span className="bb-admin-summary-lbl">PENDING SIGN-UPS</span>
                    <span className="bb-admin-summary-num num-orange">{Number(stats?.pending_signups ?? pendingUsers.length ?? 0)}</span>
                  </button>
                  <button type="button" className="bb-admin-summary-card" onClick={() => goTab("home")}>
                    <span className="bb-admin-summary-lbl">TRAINER APPS</span>
                    <span className="bb-admin-summary-num num-green">
                      {trainerRequests.filter((r: any) => String(r.status) === "pending").length}
                    </span>
                  </button>
                  <button type="button" className="bb-admin-summary-card" onClick={() => goTab("home")}>
                    <span className="bb-admin-summary-lbl">CLIENT REQUESTS</span>
                    <span className="bb-admin-summary-num num-green">
                      {clientLeadRequests.filter((c: any) => String(c.status) === "pending").length}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="bb-admin-summary-card"
                    onClick={() => {
                      goTab("forms");
                      setTrainerFormsView("audits");
                    }}
                  >
                    <span className="bb-admin-summary-lbl">AUDITS PENDING</span>
                    <span className="bb-admin-summary-num num-gold">
                      {Number(superadminSnapshot?.stats?.pending_requests ?? 0)}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="bb-admin-summary-card"
                    onClick={() => {
                      goTab("messages");
                      setTrainerMessagesView("threads");
                    }}
                  >
                    <span className="bb-admin-summary-lbl">MESSAGES</span>
                    <span className="bb-admin-summary-num num-pink">{Number(stats?.messages ?? threads.length ?? 0)}</span>
                  </button>
                </div>
                <div
                  className="bb-panel"
                  style={{
                    marginTop: 8,
                    marginBottom: 16,
                    padding: 14,
                    border: `1px solid ${superadminSync.issues.length ? "var(--red)" : "var(--border)"}`,
                    background: "var(--bg-card)"
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: 12
                    }}
                  >
                    <div>
                      <p className="bb-inline-label" style={{ marginTop: 0 }}>
                        API &amp; data sync
                      </p>
                      <p className="bb-list-row-sub" style={{ marginTop: 4, wordBreak: "break-word" }}>
                        Using <strong>{apiBase}</strong>
                      </p>
                      {superadminSync.lastLoadedLabel ? (
                        <p className="bb-list-row-sub" style={{ marginTop: 6 }}>
                          Last loaded: {superadminSync.lastLoadedLabel}
                          {superadminSync.loading ? " · refreshing…" : ""}
                        </p>
                      ) : superadminSync.loading ? (
                        <p className="bb-list-row-sub" style={{ marginTop: 6 }}>
                          Loading platform data…
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      disabled={superadminSync.loading}
                      onClick={() => void loadSuperadminDashboard()}
                      style={{
                        border: "1px solid var(--accent)",
                        background: "transparent",
                        color: "var(--accent)",
                        borderRadius: 8,
                        padding: "8px 14px",
                        fontWeight: 700,
                        cursor: superadminSync.loading ? "wait" : "pointer",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {superadminSync.loading ? "Loading…" : "Reload all data"}
                    </button>
                  </div>
                  {!superadminSync.issues.length ? (
                    <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--green)" }}>
                      All super admin endpoints responded OK. If trainer or client application counts stay at zero, the public
                      forms must be submitted on this same site URL (check the address bar).
                    </p>
                  ) : (
                    <ul style={{ margin: "10px 0 0", paddingLeft: 18, color: "var(--red)", fontSize: 13, lineHeight: 1.55 }}>
                      {superadminSync.issues.map((msg, i) => (
                        <li key={i}>{msg}</li>
                      ))}
                    </ul>
                  )}
                </div>
                    <h3 className="bb-admin-qa-title" style={{ marginTop: 4 }}>
                      TRAINER ACCESS REQUESTS ·{" "}
                      <strong style={{ color: "var(--accent)" }}>
                        {trainerRequests.filter((r: any) => String(r.status) === "pending").length}
                      </strong>
                      <span style={{ fontWeight: 400, color: "var(--text-secondary)", fontSize: 12, marginLeft: 8 }}>
                        ({trainerRequests.length} total on file)
                      </span>
                    </h3>
                    <div className="bb-panel" style={{ marginBottom: 20 }}>
                      {trainerRequests.filter((r: any) => String(r.status) === "pending").length ? (
                        <ul className="bb-list-rows">
                          {trainerRequests
                            .filter((req: any) => String(req.status) === "pending")
                            .map((req: any) => {
                              const rid = String(req.id || "");
                              const busyTa = superadminQueueBusy === `${rid}-ta`;
                              const busyTr = superadminQueueBusy === `${rid}-tr`;
                              const busy = busyTa || busyTr;
                              return (
                                <li key={rid || req.email} className="bb-list-row bb-list-row-static" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
                                  <div>
                                    <div className="bb-list-row-title">{req.full_name || "Trainer applicant"}</div>
                                    <p className="bb-list-row-sub">{req.email}</p>
                                    <p className="bb-list-row-sub" style={{ marginTop: 6 }}>
                                      {[req.phone && `Phone: ${req.phone}`, req.gym_name && `Gym: ${req.gym_name}`, req.city && `City: ${req.city}`]
                                        .filter(Boolean)
                                        .join(" · ") || "—"}
                                    </p>
                                    {req.message ? (
                                      <p className="bb-list-row-sub" style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                                        {req.message}
                                      </p>
                                    ) : null}
                                  </div>
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                                    <button
                                      type="button"
                                      onClick={() => void superadminApproveTrainerRequestRow(rid)}
                                      disabled={busy}
                                      style={{
                                        border: "none",
                                        background: "var(--green)",
                                        color: "#0f0f0f",
                                        borderRadius: 8,
                                        padding: "8px 12px",
                                        fontWeight: 700,
                                        cursor: busy ? "wait" : "pointer"
                                      }}
                                    >
                                      {busyTa ? "…" : "Approve & create login"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void superadminRejectTrainerRequestRow(rid)}
                                      disabled={busy}
                                      style={{
                                        border: "none",
                                        background: "var(--red)",
                                        color: "#0f0f0f",
                                        borderRadius: 8,
                                        padding: "8px 12px",
                                        fontWeight: 700,
                                        cursor: busy ? "wait" : "pointer"
                                      }}
                                    >
                                      {busyTr ? "…" : "Reject"}
                                    </button>
                                  </div>
                                </li>
                              );
                            })}
                        </ul>
                      ) : (
                        <p className="bb-live-empty">No pending trainer applications.</p>
                      )}
                      {trainerRequests.some((r: any) => String(r.status) !== "pending") ? (
                        <>
                          <p className="bb-inline-label" style={{ marginTop: 16 }}>
                            Recent decisions (trainer applications)
                          </p>
                          <ul className="bb-list-rows">
                            {trainerRequests
                              .filter((r: any) => String(r.status) !== "pending")
                              .slice(0, 25)
                              .map((req: any) => (
                                <li key={String(req.id)} className="bb-list-row bb-list-row-static">
                                  <div className="bb-list-row-title">{req.full_name || req.email}</div>
                                  <p className="bb-list-row-sub">
                                    {req.email} · <span style={{ color: "var(--accent)" }}>{req.status}</span>
                                    {req.created_at ? ` · ${String(req.created_at).slice(0, 10)}` : ""}
                                  </p>
                                </li>
                              ))}
                          </ul>
                        </>
                      ) : null}
                    </div>

                    <h3 className="bb-admin-qa-title">
                      CLIENT COACHING REQUESTS ·{" "}
                      <strong style={{ color: "var(--accent)" }}>
                        {clientLeadRequests.filter((c: any) => String(c.status) === "pending").length}
                      </strong>
                      <span style={{ fontWeight: 400, color: "var(--text-secondary)", fontSize: 12, marginLeft: 8 }}>
                        (showing recent {Math.min(clientLeadRequests.length, 50)} records)
                      </span>
                    </h3>
                    <div className="bb-panel" style={{ marginBottom: 20 }}>
                      {clientLeadRequests.length ? (
                        <ul className="bb-list-rows">
                          {[...clientLeadRequests]
                            .sort((a: any, b: any) => {
                              const pa = String(a.status) === "pending" ? 0 : 1;
                              const pb = String(b.status) === "pending" ? 0 : 1;
                              if (pa !== pb) return pa - pb;
                              return String(b.created_at || "").localeCompare(String(a.created_at || ""));
                            })
                            .slice(0, 50)
                            .map((c: any) => {
                              const cid = String(c.id || "");
                              const pending = String(c.status) === "pending";
                              const busyCa = superadminQueueBusy === `${cid}-ca`;
                              const busyCr = superadminQueueBusy === `${cid}-cr`;
                              const busy = busyCa || busyCr;
                              const pick = assignTrainerForClient[cid] || "";
                              return (
                                <li key={cid || c.email} className="bb-list-row bb-list-row-static" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
                                  <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8 }}>
                                    <div>
                                      <div className="bb-list-row-title">{c.full_name || "Client"}</div>
                                      <p className="bb-list-row-sub">{c.email}</p>
                                    </div>
                                    <span
                                      style={{
                                        fontSize: 11,
                                        fontWeight: 700,
                                        letterSpacing: 1,
                                        textTransform: "uppercase",
                                        color:
                                          c.status === "approved" ? "var(--green)" : c.status === "rejected" ? "var(--red)" : "var(--accent)"
                                      }}
                                    >
                                      {c.status || "pending"}
                                    </span>
                                  </div>
                                  <p className="bb-list-row-sub">
                                    {[c.phone && `Phone: ${c.phone}`, c.city && `City: ${c.city}`, c.goal_focus && `Goal: ${c.goal_focus}`]
                                      .filter(Boolean)
                                      .join(" · ") || "—"}
                                  </p>
                                  {c.message ? (
                                    <p className="bb-list-row-sub" style={{ whiteSpace: "pre-wrap" }}>
                                      {c.message}
                                    </p>
                                  ) : null}
                                  {c.heard_about ? <p className="bb-list-row-sub">Heard about: {c.heard_about}</p> : null}
                                  {!pending && c.trainer_email ? (
                                    <p className="bb-list-row-sub" style={{ marginTop: 4 }}>
                                      Assigned coach: {[c.trainer_first_name, c.trainer_last_name].filter(Boolean).join(" ") || c.trainer_email}
                                    </p>
                                  ) : null}
                                  {pending ? (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                      <label className="bb-list-row-sub" style={{ margin: 0 }}>
                                        Assign trainer
                                      </label>
                                      <select
                                        value={pick}
                                        onChange={(e) => setAssignTrainerForClient((p) => ({ ...p, [cid]: e.target.value }))}
                                        style={{
                                          padding: 10,
                                          borderRadius: 8,
                                          border: "1px solid var(--border)",
                                          background: "var(--bg-card)",
                                          color: "var(--text-primary)",
                                          maxWidth: 400
                                        }}
                                      >
                                        <option value="">Choose trainer…</option>
                                        {superadminTrainers.map((t: any) => (
                                          <option key={t.id} value={t.id}>
                                            {[t.first_name, t.last_name].filter(Boolean).join(" ") || t.email}
                                            {t.suspended ? " (suspended)" : ""}
                                          </option>
                                        ))}
                                      </select>
                                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                                        <button
                                          type="button"
                                          onClick={() => void superadminApproveClientRequestRow(cid, pick)}
                                          disabled={busy}
                                          style={{
                                            border: "none",
                                            background: "var(--green)",
                                            color: "#0f0f0f",
                                            borderRadius: 8,
                                            padding: "8px 12px",
                                            fontWeight: 700,
                                            cursor: busy ? "wait" : "pointer"
                                          }}
                                        >
                                          {busyCa ? "…" : "Approve & get invite link"}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => void superadminRejectClientRequestRow(cid)}
                                          disabled={busy}
                                          style={{
                                            border: "none",
                                            background: "var(--red)",
                                            color: "#0f0f0f",
                                            borderRadius: 8,
                                            padding: "8px 12px",
                                            fontWeight: 700,
                                            cursor: busy ? "wait" : "pointer"
                                          }}
                                        >
                                          {busyCr ? "…" : "Reject"}
                                        </button>
                                      </div>
                                    </div>
                                  ) : null}
                                </li>
                              );
                            })}
                        </ul>
                      ) : (
                        <p className="bb-live-empty">No client coaching requests yet.</p>
                      )}
                    </div>

                    <h3 className="bb-admin-qa-title">ROSTER · TRAINERS &amp; CLIENTS</h3>
                    <div className="bb-panel" style={{ marginBottom: 20 }}>
                      {trainerClientOverview.length ? (
                        <ul className="bb-list-rows">
                          {trainerClientOverview.map((row: any) => {
                            let clients: any[] = [];
                            try {
                              const raw = row.clients;
                              if (Array.isArray(raw)) clients = raw;
                              else if (typeof raw === "string") clients = JSON.parse(raw || "[]");
                            } catch {
                              clients = [];
                            }
                            const tname = [row.first_name, row.last_name].filter(Boolean).join(" ") || row.email || "Trainer";
                            return (
                              <li key={String(row.id)} className="bb-list-row bb-list-row-static" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
                                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8 }}>
                                  <div className="bb-list-row-title">{tname}</div>
                                  <span style={{ fontSize: 11, color: row.suspended ? "var(--red)" : "var(--text-secondary)" }}>
                                    {row.suspended ? "Suspended" : "Active"}
                                    {row.referral_code ? ` · code ${row.referral_code}` : ""}
                                  </span>
                                </div>
                                <p className="bb-list-row-sub">{row.email}</p>
                                <p className="bb-list-row-sub" style={{ marginTop: 4 }}>
                                  Clients: {clients.length}
                                  {clients.length
                                    ? ` · ${clients.filter((u: any) => String(u.approval_status).toLowerCase() === "pending").length} pending approval`
                                    : ""}
                                </p>
                                {clients.length ? (
                                  <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 12, color: "var(--text-secondary)" }}>
                                    {clients.slice(0, 12).map((u: any) => (
                                      <li key={String(u.id)}>
                                        {[u.first_name, u.last_name].filter(Boolean).join(" ") || u.email} ({u.email}) — {u.approval_status || "—"}
                                      </li>
                                    ))}
                                    {clients.length > 12 ? <li>…and {clients.length - 12} more</li> : null}
                                  </ul>
                                ) : (
                                  <p className="bb-list-row-sub">No clients linked yet.</p>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <p className="bb-live-empty">No trainers yet. Approve trainer requests to build your roster.</p>
                      )}
                    </div>
                <h3 className="bb-admin-qa-title">QUICK ACCESS</h3>
                <div className="bb-admin-qa-grid">
                  {[
                    {
                      label: "Sign-ups",
                      icon: String.fromCodePoint(0x1f464),
                      onClick: () => {
                        goTab("clients");
                        setTrainerClientsView("pending");
                      }
                    },
                    {
                      label: "Check-Ins",
                      icon: String.fromCodePoint(0x1f4c5),
                      onClick: () => {
                        goTab("forms");
                        setTrainerFormsView("sunday");
                      }
                    },
                    {
                      label: "Workouts",
                      icon: String.fromCodePoint(0x1f3c3),
                      onClick: () => {
                        goTab("home");
                        setStaffOverlay("workouts");
                      }
                    },
                    {
                      label: "Audits",
                      icon: String.fromCodePoint(0x1f4d1),
                      onClick: () => {
                        goTab("forms");
                        setTrainerFormsView("audits");
                      }
                    },
                    {
                      label: "Programs",
                      icon: String.fromCodePoint(0x1f3af),
                      onClick: () => {
                        goTab("home");
                        setStaffOverlay("programs");
                      }
                    },
                    {
                      label: "Analytics",
                      icon: String.fromCodePoint(0x1f4ca),
                      onClick: () => {
                        goTab("home");
                        setStaffOverlay("analytics");
                      }
                    }
                  ].map((x) => (
                    <button key={x.label} type="button" className="bb-admin-qa-btn" onClick={x.onClick}>
                      <span className="bb-admin-qa-ic">{x.icon}</span>
                      <span>{x.label}</span>
                    </button>
                  ))}
                </div>

                <h3 className="bb-admin-la-title">LIVE ACTIVITY</h3>
                <div className="bb-admin-la-list-wrap">
                  {activity.length ? (
                    <ul className="bb-live-list">
                      {activity.slice(0, 6).map((a, i) => {
                        const type = String(a?.type || "").toLowerCase();
                        const status = type.includes("workout") ? "DONE" : type.includes("check") ? "NEW" : "LIVE";
                        const text = `${a?.name || a?.user_name || "User"} — ${a?.type || "Update"}`;
                        return (
                          <li key={i} className="bb-live-row" style={{ borderBottom: i === 5 ? "none" : undefined }}>
                            <span className="bb-live-dot" />
                            <span>{text}</span>
                            <span className="bb-live-pill">{status}</span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="bb-live-empty">No recent activity</p>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="bb-admin-welcome-card" style={{ marginTop: 12 }}>
                  <h2 className="bb-admin-welcome-title">
                    Welcome back <span className="bb-admin-welcome-role">&ldquo;Lifestyle Manager&rdquo;</span>
                  </h2>
                  <p className="bb-admin-welcome-date" suppressHydrationWarning>
                    {todayLabel || "\u00a0"}
                  </p>
                </div>
                <div className="bb-admin-summary-cards">
                  <button
                    type="button"
                    className="bb-admin-summary-card"
                    onClick={() => {
                      goTab("clients");
                      setTrainerClientsView("progress");
                    }}
                  >
                    <span className="bb-admin-summary-lbl">MEMBERS</span>
                    <span className="bb-admin-summary-num num-gold">{Number(stats?.active_members ?? 0)}</span>
                  </button>
                  <button
                    type="button"
                    className="bb-admin-summary-card"
                    onClick={() => {
                      goTab("forms");
                      setTrainerFormsView("daily");
                    }}
                  >
                    <span className="bb-admin-summary-lbl">DAILY CHECK-IN</span>
                    <span className="bb-admin-summary-num num-green">{Number(stats?.daily_checkins ?? 0)}</span>
                  </button>
                  <button
                    type="button"
                    className="bb-admin-summary-card"
                    onClick={() => {
                      goTab("clients");
                      setTrainerClientsView("pending");
                    }}
                  >
                    <span className="bb-admin-summary-lbl">PENDING</span>
                    <span className="bb-admin-summary-num num-orange">{Number(stats?.pending_signups ?? pendingUsers.length ?? 0)}</span>
                  </button>
                  <button
                    type="button"
                    className="bb-admin-summary-card"
                    onClick={() => {
                      goTab("messages");
                      setTrainerMessagesView("threads");
                    }}
                  >
                    <span className="bb-admin-summary-lbl">MESSAGES</span>
                    <span className="bb-admin-summary-num num-pink">{Number(stats?.messages ?? threads.length ?? 0)}</span>
                  </button>
                </div>
                <h3 className="bb-admin-qa-title">QUICK ACCESS</h3>
                <div className="bb-admin-qa-grid">
                  {[
                    {
                      label: "Sign-ups",
                      icon: String.fromCodePoint(0x1f464),
                      onClick: () => {
                        goTab("clients");
                        setTrainerClientsView("pending");
                      }
                    },
                    {
                      label: "Check-Ins",
                      icon: String.fromCodePoint(0x1f4c5),
                      onClick: () => {
                        goTab("forms");
                        setTrainerFormsView("sunday");
                      }
                    },
                    {
                      label: "Workouts",
                      icon: String.fromCodePoint(0x1f3c3),
                      onClick: () => {
                        goTab("home");
                        setStaffOverlay("workouts");
                      }
                    },
                    {
                      label: "Audits",
                      icon: String.fromCodePoint(0x1f4d1),
                      onClick: () => {
                        goTab("forms");
                        setTrainerFormsView("audits");
                      }
                    },
                    {
                      label: "Programs",
                      icon: String.fromCodePoint(0x1f3af),
                      onClick: () => {
                        goTab("home");
                        setStaffOverlay("programs");
                      }
                    },
                    {
                      label: "Analytics",
                      icon: String.fromCodePoint(0x1f4ca),
                      onClick: () => {
                        goTab("home");
                        setStaffOverlay("analytics");
                      }
                    }
                  ].map((x) => (
                    <button key={x.label} type="button" className="bb-admin-qa-btn" onClick={x.onClick}>
                      <span className="bb-admin-qa-ic">{x.icon}</span>
                      <span>{x.label}</span>
                    </button>
                  ))}
                </div>

                <h3 className="bb-admin-la-title">LIVE ACTIVITY</h3>
                <div className="bb-admin-la-list-wrap">
                  {activity.length ? (
                    <ul className="bb-live-list">
                      {activity.slice(0, 6).map((a, i) => {
                        const type = String(a?.type || "").toLowerCase();
                        const status = type.includes("workout") ? "DONE" : type.includes("check") ? "NEW" : "LIVE";
                        const text = `${a?.name || a?.user_name || "User"} — ${a?.type || "Update"}`;
                        return (
                          <li key={i} className="bb-live-row" style={{ borderBottom: i === 5 ? "none" : undefined }}>
                            <span className="bb-live-dot" />
                            <span>{text}</span>
                            <span className="bb-live-pill">{status}</span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="bb-live-empty">No recent activity</p>
                  )}
                </div>
              </>
            )}
          </>
        ) : null}

        {activeTab === "clients" ? (
          <div className="bb-section-page">
            {role === "user" ? (
              <>
                <div className="ud-user-back">
                  <button type="button" className="ud-back-btn" onClick={() => goTab("home")}>
                    ← Back
                  </button>
                </div>
                <div className="ud-form-section-title">Log your session</div>
                <div className="ud-form-group">
                  <label>
                    Workout Name <span className="req">*</span>
                  </label>
                  <input
                    className="ud-form-input"
                    value={wkName}
                    onChange={(e) => setWkName(e.target.value)}
                    placeholder="e.g. Upper body, Cardio"
                  />
                  <span className="ud-form-hint-sm">Name this training session</span>
                </div>
                <div className="timer-display">
                  <div className="timer-digits">
                    <span>{timerHr}</span>
                    <span className="timer-sep">:</span>
                    <span>{timerMin}</span>
                    <span className="timer-sep">:</span>
                    <span>{timerSec}</span>
                  </div>
                </div>
                <button type="button" className="timer-btn" onClick={toggleUserTimer}>
                  {timerRunning ? "❚❚" : "▶"}
                </button>
                <button type="button" className="timer-reset" onClick={resetUserTimer}>
                  Reset Timer
                </button>
                <div className="ud-form-divider" />
                <div className="ud-form-group">
                  <label>
                    Feedback <span className="req">*</span>
                  </label>
                  <textarea
                    className="ud-form-input"
                    value={wkFeedback}
                    onChange={(e) => setWkFeedback(e.target.value)}
                    placeholder="How did it go? Notes on intensity, sets, reps..."
                    rows={4}
                  />
                  <span className="ud-form-hint-sm">Brief notes help track progress</span>
                </div>
                <button type="button" className="ud-form-submit" onClick={() => void submitUserWorkout()} disabled={wkSubmitting}>
                  {wkSubmitting ? "Submitting…" : "Submit"}
                </button>
                <div className="workout-programs-box">
                  <button
                    type="button"
                    className="welcome-card"
                    onClick={() => goTab("programs")}
                    style={{ width: "100%" }}
                  >
                    <div className="wc-icon-wrap">
                      <svg viewBox="0 0 24 24">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <path d="M14 2v6h6" />
                        <path d="M16 13H8" />
                        <path d="M16 17H8" />
                        <path d="M10 9H8" />
                      </svg>
                    </div>
                    <div className="wc-copy">
                      <div className="wc-title">My Programs</div>
                      <div className="wc-desc">Programs assigned by your lifestyle manager. View the PDF and click the video link to watch and perform.</div>
                    </div>
                  </button>
                </div>
                <div className="ud-form-divider" />
                <div className="ud-form-section-title">Recent sessions</div>
                {workouts.length ? (
                  <ul className="bb-list-rows">
                    {workouts.slice(0, 20).map((w: any) => (
                      <li key={String(w.id || `${w.workout_name}-${w.created_at}`)} className="bb-list-row bb-list-row-static">
                        <div className="bb-list-row-title">{w.workout_name || "Workout"}</div>
                        <p className="bb-list-row-sub">
                          {Math.floor((Number(w.duration_seconds) || 0) / 60)} min · {w.created_at ? new Date(w.created_at).toLocaleString() : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="bb-live-empty">No workouts yet.</p>
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="bb-back-btn"
                  onClick={() => (trainerClientsView === "hub" ? setActiveTab("home") : setTrainerClientsView("hub"))}
                >
                  ← Back
                </button>
                {trainerClientsView === "hub" ? (
                  <div className="bb-admin-hub-cards">
                    {role === "admin" && trainerReferral ? (
                      <div className="bb-panel" style={{ gridColumn: "1 / -1", marginBottom: 4 }}>
                        <span className="bb-inline-label">CLIENT INVITE LINK</span>
                        <p style={{ margin: "8px 0 10px", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                          Clients use this link to submit their details. Approve them under Pending Sign-ups.
                        </p>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "stretch" }}>
                          <code
                            style={{
                              flex: "1 1 220px",
                              padding: "10px 12px",
                              background: "var(--bg-card)",
                              border: "1px solid var(--border)",
                              borderRadius: 8,
                              wordBreak: "break-all",
                              fontSize: 12,
                              color: "var(--text-primary)"
                            }}
                          >
                            {typeof window !== "undefined"
                              ? `${window.location.origin}${trainerReferral.join_path}`
                              : trainerReferral.join_path}
                          </code>
                          <button
                            type="button"
                            className="bb-btn-primary"
                            style={{ alignSelf: "center" }}
                            onClick={() => {
                              const url =
                                typeof window !== "undefined"
                                  ? `${window.location.origin}${trainerReferral.join_path}`
                                  : "";
                              if (url) void navigator.clipboard.writeText(url);
                            }}
                          >
                            Copy link
                          </button>
                        </div>
                      </div>
                    ) : null}
                    <HubCard
                      icon={String.fromCodePoint(0x1f4e7)}
                      title="Pending Sign-ups"
                      desc="Review and approve new client registrations"
                      onClick={() => setTrainerClientsView("pending")}
                    />
                    <HubCard
                      icon={String.fromCodePoint(0x1f465)}
                      title="Tribe"
                      desc="Manage active tribe members"
                      onClick={() => setTrainerClientsView("tribe")}
                    />
                    <HubCard
                      icon={String.fromCodePoint(0x1f4c8)}
                      title="Client Progress"
                      desc="View progress reports and share links"
                      onClick={() => setTrainerClientsView("progress")}
                    />
                  </div>
                ) : null}
                {trainerClientsView === "pending" ? (
                  <div className="bb-panel">
                    <span className="bb-inline-label">
                      PENDING · <strong style={{ color: "var(--accent)" }}>{pendingUsers.length}</strong>
                    </span>
                    {pendingUsers.length ? (
                      <ul className="bb-list-rows">
                        {pendingUsers.slice(0, 25).map((u: any) => {
                          const id = String(u.id || "");
                          const approveBusy = isUserActionBusy === id + "approve";
                          const rejectBusy = isUserActionBusy === id + "reject";
                          return (
                            <li key={id} className="bb-list-row bb-list-row-static">
                              <div className="bb-list-row-title">{[u.first_name, u.last_name].filter(Boolean).join(" ") || u.email || "User"}</div>
                              <p className="bb-list-row-sub">{u.email || "No email"}</p>
                              {u.city || u.date_of_birth || u.gender || u.whatsapp ? (
                                <p className="bb-list-row-sub" style={{ marginTop: 6, fontSize: 12, lineHeight: 1.45 }}>
                                  {[u.city && `City: ${u.city}`, u.date_of_birth && `DOB: ${u.date_of_birth}`, u.gender && `Gender: ${u.gender}`, u.whatsapp && `WhatsApp: ${u.whatsapp}`]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </p>
                              ) : null}
                              {role === "admin" || role === "superadmin" ? (
                                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                                  <button
                                    type="button"
                                    onClick={() => updatePendingUser(id, "approve")}
                                    disabled={approveBusy || rejectBusy}
                                    style={{ border: "none", background: "var(--green)", color: "#0f0f0f", borderRadius: 8, padding: "8px 10px", fontWeight: 700, cursor: "pointer" }}
                                  >
                                    {approveBusy ? "..." : "Approve"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => updatePendingUser(id, "reject")}
                                    disabled={approveBusy || rejectBusy}
                                    style={{ border: "none", background: "var(--red)", color: "#0f0f0f", borderRadius: 8, padding: "8px 10px", fontWeight: 700, cursor: "pointer" }}
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
                      <p className="bb-live-empty">No pending sign-ups.</p>
                    )}
                  </div>
                ) : null}
                {trainerClientsView === "tribe" ? (
                  <>
                    {role === "admin" ? (
                      <div className="bb-panel" style={{ marginBottom: 12 }}>
                        <span className="bb-inline-label">ADD NEW CLIENT</span>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <input
                            className="bb-input"
                            value={newClient.first_name}
                            onChange={(e) => setNewClient((p) => ({ ...p, first_name: e.target.value }))}
                            placeholder="First name"
                          />
                          <input
                            className="bb-input"
                            value={newClient.last_name}
                            onChange={(e) => setNewClient((p) => ({ ...p, last_name: e.target.value }))}
                            placeholder="Last name"
                          />
                          <input
                            className="bb-input"
                            value={newClient.email}
                            onChange={(e) => setNewClient((p) => ({ ...p, email: e.target.value }))}
                            placeholder="Email"
                          />
                          <input
                            className="bb-input"
                            value={newClient.phone}
                            onChange={(e) => setNewClient((p) => ({ ...p, phone: e.target.value }))}
                            placeholder="Mobile / phone"
                          />
                          <input
                            className="bb-input"
                            value={newClient.city}
                            onChange={(e) => setNewClient((p) => ({ ...p, city: e.target.value }))}
                            placeholder="City"
                            style={{ gridColumn: "1 / -1" }}
                          />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginTop: 8 }}>
                          <input
                            className="bb-input"
                            value={newClient.password}
                            onChange={(e) => setNewClient((p) => ({ ...p, password: e.target.value }))}
                            placeholder="Temporary password"
                          />
                          <button type="button" className="bb-btn-primary" onClick={createClient} disabled={isCreatingClient}>
                            {isCreatingClient ? "..." : "Add"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                    <div className="bb-panel">
                      <span className="bb-inline-label">
                        TRIBE · <strong style={{ color: "var(--accent)" }}>{tribeMembers.length}</strong>
                      </span>
                      {tribeMembers.length ? (
                        <ul className="bb-list-rows">
                          {tribeMembers.slice(0, 40).map((u: any) => (
                            <li key={u.id} className="bb-list-row" onClick={() => openClientDetail(u)} role="presentation">
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                                <div>
                                  <div className="bb-list-row-title">{[u.first_name, u.last_name].filter(Boolean).join(" ") || u.email}</div>
                                  <p className="bb-list-row-sub">{u.email}</p>
                                </div>
                                <span style={{ color: "var(--accent)", fontWeight: 700, fontSize: 12 }}>VIEW</span>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="bb-live-empty">No active members yet.</p>
                      )}
                    </div>
                  </>
                ) : null}
                {trainerClientsView === "progress" ? (
                  <div className="bb-panel">
                    <span className="bb-inline-label">
                      CLIENTS · <strong style={{ color: "var(--accent)" }}>{tribeMembers.length}</strong>
                    </span>
                    {tribeMembers.length ? (
                      <ul className="bb-list-rows">
                        {tribeMembers.slice(0, 40).map((u: any) => (
                          <li key={u.id} className="bb-list-row" onClick={() => openClientDetail(u)} role="presentation">
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                              <div>
                                <div className="bb-list-row-title">{[u.first_name, u.last_name].filter(Boolean).join(" ") || u.email}</div>
                                <p className="bb-list-row-sub">Open for progress report and share link</p>
                              </div>
                              <span style={{ color: "var(--accent)", fontWeight: 700, fontSize: 12 }}>VIEW</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="bb-live-empty">No clients to show.</p>
                    )}
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        {activeTab === "forms" ? (
          <div className="bb-section-page">
            {role === "user" ? (
              <>
                {userCheckinView === "hub" ? (
                  <div className="checkin-hub">
                    <div className="checkin-hub-back">
                      <button type="button" className="checkin-back-btn" onClick={() => goTab("home")}>
                        ← Back
                      </button>
                    </div>
                    <p className="form-hint" style={{ marginBottom: 20 }}>
                      Choose what you want to do:
                    </p>
                    <div className="checkin-hub-cards">
                      <button type="button" className="checkin-option-card" onClick={() => setUserCheckinView("daily")}>
                        <div className="checkin-card-icon">
                          <svg viewBox="0 0 24 24">
                            <path d="M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
                            <path d="M16 2v4" />
                            <path d="M8 2v4" />
                            <path d="M3 10h18" />
                          </svg>
                        </div>
                        <div className="checkin-card-title">Daily Check-in</div>
                        <div className="checkin-card-desc">Log steps, water, protein & sleep for today</div>
                      </button>
                      <button type="button" className="checkin-option-card" onClick={() => setUserCheckinView("sunday")}>
                        <div className="checkin-card-icon">
                          <svg viewBox="0 0 24 24">
                            <path d="M9 11l3 3L22 4" />
                            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                          </svg>
                        </div>
                        <div className="checkin-card-title">Sunday Check-in</div>
                        <div className="checkin-card-desc">Complete your weekly review form</div>
                      </button>
                      <button type="button" className="checkin-option-card" onClick={() => setUserCheckinView("progress")}>
                        <div className="checkin-card-icon">
                          <svg viewBox="0 0 24 24">
                            <path d="M3 3v18h18" />
                            <path d="M18 17V9" />
                            <path d="M13 17V5" />
                            <path d="M8 17v-3" />
                          </svg>
                        </div>
                        <div className="checkin-card-title">My Progress</div>
                        <div className="checkin-card-desc">Log metrics by date and view your analytics</div>
                      </button>
                    </div>
                  </div>
                ) : null}
                {userCheckinView === "daily" ? (
                  <div>
                    <div className="ud-user-back">
                      <button type="button" className="ud-back-btn" onClick={() => setUserCheckinView("hub")}>
                        ← Back
                      </button>
                    </div>
                    <div className="micro-goals-wrap">
                      <h3>
                        Daily check-in{" "}
                        <span
                          className="streak-badge"
                          data-tier={userStreakBadge.tier}
                          data-at-risk={userStreakBadge.atRisk ? "true" : "false"}
                        >
                          {userStreakBadge.text}
                        </span>
                      </h3>
                      <form onSubmit={submitUserMicroGoals}>
                        <div className="micro-goals-grid">
                          <div className="micro-goal-field">
                            <label>Steps</label>
                            <input
                              type="number"
                              placeholder="e.g. 8000"
                              min={0}
                              value={microSteps}
                              onChange={(e) => setMicroSteps(e.target.value)}
                              disabled={microAlreadyFilled}
                            />
                          </div>
                          <div className="micro-goal-field">
                            <label>Water (ml)</label>
                            <input
                              type="number"
                              placeholder="e.g. 2000"
                              min={0}
                              value={microWater}
                              onChange={(e) => setMicroWater(e.target.value)}
                              disabled={microAlreadyFilled}
                            />
                          </div>
                          <div className="micro-goal-field">
                            <label>Protein (g)</label>
                            <input
                              type="number"
                              placeholder="e.g. 120"
                              min={0}
                              value={microProtein}
                              onChange={(e) => setMicroProtein(e.target.value)}
                              disabled={microAlreadyFilled}
                            />
                          </div>
                          <div className="micro-goal-field">
                            <label>Sleep (hrs)</label>
                            <input
                              type="number"
                              placeholder="e.g. 7.5"
                              min={0}
                              step={0.5}
                              value={microSleep}
                              onChange={(e) => setMicroSleep(e.target.value)}
                              disabled={microAlreadyFilled}
                            />
                          </div>
                        </div>
                        <button type="submit" className="micro-goals-submit" disabled={microAlreadyFilled || microSaving}>
                          {microAlreadyFilled ? "Already checked in today" : microSaving ? "Saving…" : "Save today"}
                        </button>
                      </form>
                    </div>
                  </div>
                ) : null}
                {userCheckinView === "sunday" ? (
                  <div>
                    <div className="ud-user-back">
                      <button type="button" className="ud-back-btn" onClick={() => setUserCheckinView("hub")}>
                        ← Back
                      </button>
                    </div>
                    <p className="form-hint" style={{ marginBottom: 20 }}>
                      All fields are mandatory. Please provide detailed answers where requested.
                    </p>
                    <form onSubmit={submitSundayCheckinUser}>
                      {(
                        [
                          ["full_name", "Full Name", "text", "Your full name", true],
                          ["plan", "State the plan you're on", "text", "e.g. 12 week fat loss", true],
                          [
                            "current_weight_waist_week",
                            "Current weight (lbs), waist measurement and week of training you've just completed",
                            "textarea",
                            "e.g. week 1, 180 lbs, 34 in waist",
                            true
                          ],
                          ["last_week_weight_waist", "Last week's weight (lbs) and waist measurement", "textarea", "e.g. 182 lbs, 35 in", true],
                          ["total_weight_loss", "What is your total weight loss? (Or gain if on a muscle building plan)", "textarea", "", true],
                          [
                            "training_go",
                            "How did your training go? Did you complete all scheduled sessions including cardio? (detailed answer please)",
                            "textarea",
                            "Describe your training week in detail",
                            true
                          ],
                          [
                            "nutrition_go",
                            "How did your nutrition go? Did you follow the meal plan exactly and take all supplements as specified? (detailed answer please)",
                            "textarea",
                            "Describe your nutrition adherence",
                            true
                          ],
                          [
                            "sleep",
                            "What time did you go to bed/wake up on average? Did you get 8 hours sleep? Were there any difficulties sleeping? (detailed answer please)",
                            "textarea",
                            "",
                            true
                          ],
                          [
                            "occupation_stress",
                            "What's your occupation and how much stress did this give you last week?",
                            "textarea",
                            "",
                            true
                          ],
                          [
                            "other_stress",
                            "Have you had any other noticeable stress this past week? If so can you pinpoint the cause? (detailed answer please)",
                            "textarea",
                            "",
                            true
                          ],
                          [
                            "differences_felt",
                            "What differences have you seen and felt both physically and mentally? (detailed answer please)",
                            "textarea",
                            "",
                            true
                          ],
                          ["achievements", "Biggest achievements this week? (detailed answer please)", "textarea", "", true],
                          ["improve_next_week", "What do you think you could do to improve for the coming week?", "textarea", "", true]
                        ] as const
                      ).map(([key, label, kind, ph, req]) => (
                        <div key={key} className="ud-form-group">
                          <label>
                            {label} {req ? <span className="req">*</span> : null}
                          </label>
                          {kind === "textarea" ? (
                            <textarea
                              className="ud-form-input"
                              required={req}
                              placeholder={ph}
                              rows={key === "training_go" || key === "nutrition_go" ? 6 : 4}
                              value={sundayForm[key as keyof typeof sundayForm]}
                              onChange={(e) => setSundayForm((p) => ({ ...p, [key]: e.target.value }))}
                            />
                          ) : (
                            <input
                              className="ud-form-input"
                              required={req}
                              placeholder={ph}
                              value={sundayForm[key as keyof typeof sundayForm]}
                              onChange={(e) => setSundayForm((p) => ({ ...p, [key]: e.target.value }))}
                            />
                          )}
                        </div>
                      ))}
                      <div className="ud-form-group">
                        <label>Questions?</label>
                        <textarea
                          className="ud-form-input"
                          placeholder="Any questions or notes (optional)"
                          rows={4}
                          value={sundayForm.questions}
                          onChange={(e) => setSundayForm((p) => ({ ...p, questions: e.target.value }))}
                        />
                      </div>
                      <button type="submit" className="ud-form-submit" disabled={sundaySubmitting}>
                        {sundaySubmitting ? "Submitting…" : "Submit Check-in"}
                      </button>
                    </form>
                  </div>
                ) : null}
                {userCheckinView === "progress" ? (
                  <div>
                    <div className="ud-user-back">
                      <button type="button" className="ud-back-btn" onClick={() => setUserCheckinView("hub")}>
                        ← Back
                      </button>
                    </div>
                    <p className="form-hint" style={{ marginBottom: 16 }}>
                      Log your metrics for a specific date. Your Lifestyle Manager can share a link with you to view your progress and graphs.
                    </p>
                    <form onSubmit={submitProgressFormUser} className="progress-form-grid">
                      <div className="ud-form-group" style={{ gridColumn: "1 / -1" }}>
                        <label>
                          Date <span className="req">*</span>
                        </label>
                        <input
                          type="date"
                          className="ud-form-input"
                          required
                          value={progressForm.log_date}
                          onChange={(e) => setProgressForm((p) => ({ ...p, log_date: e.target.value }))}
                        />
                      </div>
                      <div className="ud-form-group">
                        <label>Weight (kg)</label>
                        <input
                          type="number"
                          step={0.1}
                          className="ud-form-input"
                          placeholder="e.g. 72.5"
                          value={progressForm.weight}
                          onChange={(e) => setProgressForm((p) => ({ ...p, weight: e.target.value }))}
                        />
                      </div>
                      <div className="ud-form-group">
                        <label>Body fat %</label>
                        <input
                          type="number"
                          step={0.1}
                          className="ud-form-input"
                          placeholder="e.g. 18"
                          value={progressForm.body_fat}
                          onChange={(e) => setProgressForm((p) => ({ ...p, body_fat: e.target.value }))}
                        />
                      </div>
                      <div className="ud-form-group">
                        <label>Calories intake</label>
                        <input
                          type="number"
                          className="ud-form-input"
                          placeholder="e.g. 2000"
                          value={progressForm.calories_intake}
                          onChange={(e) => setProgressForm((p) => ({ ...p, calories_intake: e.target.value }))}
                        />
                      </div>
                      <div className="ud-form-group">
                        <label>Protein (g)</label>
                        <input
                          type="number"
                          className="ud-form-input"
                          placeholder="e.g. 120"
                          value={progressForm.protein_intake}
                          onChange={(e) => setProgressForm((p) => ({ ...p, protein_intake: e.target.value }))}
                        />
                      </div>
                      <div className="ud-form-group">
                        <label>Workout completed</label>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={progressForm.workout_completed}
                            onChange={(e) => setProgressForm((p) => ({ ...p, workout_completed: e.target.checked }))}
                          />
                          <span style={{ fontSize: 13, color: "var(--text-primary)" }}>Yes</span>
                        </label>
                      </div>
                      <div className="ud-form-group">
                        <label>Workout type</label>
                        <input
                          className="ud-form-input"
                          placeholder="e.g. Upper body"
                          value={progressForm.workout_type}
                          onChange={(e) => setProgressForm((p) => ({ ...p, workout_type: e.target.value }))}
                        />
                      </div>
                      <div className="ud-form-group">
                        <label>Bench (kg)</label>
                        <input
                          type="number"
                          step={0.1}
                          className="ud-form-input"
                          value={progressForm.strength_bench}
                          onChange={(e) => setProgressForm((p) => ({ ...p, strength_bench: e.target.value }))}
                        />
                      </div>
                      <div className="ud-form-group">
                        <label>Squat (kg)</label>
                        <input
                          type="number"
                          step={0.1}
                          className="ud-form-input"
                          value={progressForm.strength_squat}
                          onChange={(e) => setProgressForm((p) => ({ ...p, strength_squat: e.target.value }))}
                        />
                      </div>
                      <div className="ud-form-group">
                        <label>Deadlift (kg)</label>
                        <input
                          type="number"
                          step={0.1}
                          className="ud-form-input"
                          value={progressForm.strength_deadlift}
                          onChange={(e) => setProgressForm((p) => ({ ...p, strength_deadlift: e.target.value }))}
                        />
                      </div>
                      <div className="ud-form-group">
                        <label>Sleep (hours)</label>
                        <input
                          type="number"
                          step={0.1}
                          className="ud-form-input"
                          placeholder="e.g. 7.5"
                          value={progressForm.sleep_hours}
                          onChange={(e) => setProgressForm((p) => ({ ...p, sleep_hours: e.target.value }))}
                        />
                      </div>
                      <div className="ud-form-group">
                        <label>Water (L)</label>
                        <input
                          type="number"
                          step={0.1}
                          className="ud-form-input"
                          placeholder="e.g. 2.5"
                          value={progressForm.water_intake}
                          onChange={(e) => setProgressForm((p) => ({ ...p, water_intake: e.target.value }))}
                        />
                      </div>
                      <div className="ud-form-group" style={{ gridColumn: "1 / -1" }}>
                        <button type="submit" className="ud-form-submit" disabled={progressSaving}>
                          {progressSaving ? "Saving…" : "Save for this date"}
                        </button>
                      </div>
                    </form>
                    <p className={`form-success${progressSuccess ? " show" : ""}`}>
                      Saved. Your Lifestyle Manager can share your progress report with you.
                    </p>
                    <div style={{ marginTop: 28 }}>
                      <h3 className="admin-cp-heading">Submission logs</h3>
                      <div className="progress-logs-list">
                        {userProgressLogs.length ? (
                          <table>
                            <thead>
                              <tr>
                                <th>Date</th>
                                <th>Weight</th>
                                <th>Workout</th>
                              </tr>
                            </thead>
                            <tbody>
                              {userProgressLogs.slice(0, 30).map((log: any) => (
                                <tr key={String(log.id || log.created_at)}>
                                  <td>{log.created_at ? String(log.created_at).slice(0, 10) : "—"}</td>
                                  <td>{log.weight != null ? String(log.weight) : "—"}</td>
                                  <td>{log.workout_completed ? "Yes" : "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <p className="admin-cp-placeholder">No entries yet. Save a log above to see them here.</p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="bb-back-btn"
                  onClick={() => (trainerFormsView === "hub" ? setActiveTab("home") : setTrainerFormsView("hub"))}
                >
                  ← Back
                </button>
                {trainerFormsView === "hub" ? (
                  <div className="bb-admin-hub-cards">
                    <HubCard
                      icon={String.fromCodePoint(0x1f4cb)}
                      title="Audit Forms"
                      desc="Create and review client audits"
                      onClick={() => setTrainerFormsView("audits")}
                    />
                    <HubCard
                      icon={String.fromCodePoint(0x1f4dd)}
                      title="Part-2 Form"
                      desc="Client questionnaire form"
                      onClick={() => setTrainerFormsView("part2")}
                    />
                    <HubCard
                      icon={String.fromCodePoint(0x1f4c5)}
                      title="Sunday Check-In"
                      desc="Weekly client progress check-in"
                      onClick={() => setTrainerFormsView("sunday")}
                    />
                    <HubCard
                      icon={String.fromCodePoint(0x1f4cc)}
                      title="Daily Check-In"
                      desc="Daily steps, water, protein and sleep logs"
                      onClick={() => setTrainerFormsView("daily")}
                    />
                  </div>
                ) : null}
                {trainerFormsView === "audits" ? (
                  <div className="bb-panel">
                    <span className="bb-inline-label">
                      AUDITS · <strong style={{ color: "var(--accent)" }}>{forms.length}</strong>
                    </span>
                    {forms.length ? (
                      <ul className="bb-list-rows">
                        {forms.slice(0, 30).map((f: any) => (
                          <li
                            key={f.id || `${f.email}-${f.created_at}`}
                            className="bb-list-row"
                            onClick={() => setSelectedForm(f)}
                            role="presentation"
                          >
                            <div className="bb-list-row-title">{[f.first_name, f.last_name].filter(Boolean).join(" ") || f.email || "Request"}</div>
                            <p className="bb-list-row-sub">
                              {f.city || "City not provided"} · {f.status || "pending"}
                            </p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="bb-live-empty">No audit forms found.</p>
                    )}
                  </div>
                ) : null}
                {trainerFormsView === "part2" ? (
                  <div className="bb-panel">
                    <span className="bb-inline-label">
                      PART-2 SUBMISSIONS · <strong style={{ color: "var(--accent)" }}>{part2Submissions.length}</strong>
                    </span>
                    {part2Submissions.length ? (
                      <ul className="bb-list-rows">
                        {part2Submissions.slice(0, 40).map((p: any) => (
                          <li
                            key={p.id}
                            className="bb-list-row"
                            onClick={() => setSelectedPart2(p)}
                            role="presentation"
                          >
                            <div className="bb-list-row-title">{p.name || p.email || "Submission"}</div>
                            <p className="bb-list-row-sub">
                              {p.email || "—"} · {p.activity_level || "—"} · {p.created_at ? new Date(p.created_at).toLocaleString() : ""}
                            </p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="bb-live-empty">No Part-2 submissions yet.</p>
                    )}
                  </div>
                ) : null}
                {trainerFormsView === "sunday" ? (
                  <div className="bb-panel">
                    <span className="bb-inline-label">
                      SUNDAY CHECK-INS · <strong style={{ color: "var(--accent)" }}>{sundayCheckinsApi.length}</strong>
                    </span>
                    {sundayCheckinsApi.length ? (
                      <ul className="bb-list-rows">
                        {sundayCheckinsApi.slice(0, 40).map((c: any) => (
                          <li
                            key={c.id}
                            className="bb-list-row"
                            onClick={() => setSelectedSunday(c)}
                            role="presentation"
                          >
                            <div className="bb-list-row-title">{c.full_name || c.reply_email || "Member"}</div>
                            <p className="bb-list-row-sub">
                              {c.total_weight_loss != null ? `Weight loss: ${c.total_weight_loss} · ` : ""}
                              {c.created_at ? new Date(c.created_at).toLocaleString() : ""}
                            </p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="bb-live-empty">No Sunday check-ins yet.</p>
                    )}
                  </div>
                ) : null}
                {trainerFormsView === "daily" ? (
                  <div className="bb-panel">
                    <span className="bb-inline-label">
                      DAILY LOGS · <strong style={{ color: "var(--accent)" }}>{dailyCheckins.length}</strong>
                    </span>
                    {dailyCheckins.length ? (
                      <ul className="bb-list-rows">
                        {dailyCheckins.slice(0, 50).map((c: any) => (
                          <li
                            key={c.id}
                            className="bb-list-row"
                            onClick={() => openCheckinDetail(c)}
                            role="presentation"
                          >
                            <div className="bb-list-row-title">
                              {[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || "Member"}
                            </div>
                            <p className="bb-list-row-sub">
                              {c.checkin_date || "—"} · Steps {c.steps ?? "—"} · Protein {c.protein_g ?? "—"} g · Sleep {c.sleep_hours ?? "—"} h
                            </p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="bb-live-empty">No daily check-ins yet.</p>
                    )}
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        {role === "user" && activeTab === "programs" ? (
          <div className="bb-section-page">
            <div className="ud-user-back">
              <button type="button" className="ud-back-btn" onClick={() => goTab("home")}>
                ← Back
              </button>
            </div>
            <div className="ud-form-section-title">My Programs</div>
            <div style={{ marginBottom: 16 }}>
              <button type="button" className="checkin-back-btn" onClick={() => goTab("clients")}>
                ← Back to Workout
              </button>
            </div>
            <div className="user-programs-grid">
              {userPrograms.length ? (
                userPrograms.map((p: any) => (
                  <div key={String(p.id || p.program_id)} className="prog-card">
                    <div className="prog-meta">
                      <div className="prog-title">{p.name || "Program"}</div>
                      <div className="prog-sub">Assigned {p.assigned_at ? new Date(p.assigned_at).toLocaleDateString() : ""}</div>
                    </div>
                    <div className="prog-actions">
                      {p.pdf_url ? (
                        <a href={p.pdf_url.startsWith("http") ? p.pdf_url : `${apiBase}${p.pdf_url}`} target="_blank" rel="noreferrer">
                          Open PDF
                        </a>
                      ) : null}
                      {p.youtube_url ? (
                        <a href={p.youtube_url} target="_blank" rel="noreferrer">
                          Watch video
                        </a>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <p className="form-hint" style={{ padding: 24, textAlign: "center" }}>
                  No programs assigned yet.
                </p>
              )}
            </div>
          </div>
        ) : null}

        {role === "user" && activeTab === "contact" ? (
          <div className="bb-section-page">
            <div className="ud-user-back">
              <button type="button" className="ud-back-btn" onClick={() => goTab("home")}>
                ← Back
              </button>
            </div>
            <div className="ud-form-section-title">Schedule a meeting</div>
            <div className="schedule-call-block">
              <div className="ud-form-row">
                <div className="ud-form-group">
                  <label>
                    Date <span className="req">*</span>
                  </label>
                  <input
                    type="date"
                    className="ud-form-input"
                    min={new Date().toISOString().slice(0, 10)}
                    value={meetingDate}
                    onChange={(e) => setMeetingDate(e.target.value)}
                  />
                </div>
                <div className="ud-form-group">
                  <label>
                    Time Slot <span className="req">*</span>
                  </label>
                  <select className="ud-form-input" value={meetingTime} onChange={(e) => setMeetingTime(e.target.value)}>
                    <option value="">Select time</option>
                    {["9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM", "6:00 PM"].map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <button type="button" className="ud-form-submit" onClick={() => void submitUserMeeting()} disabled={meetingSubmitting}>
                {meetingSubmitting ? "…" : "Schedule Call"}
              </button>
            </div>
            <div className="my-meetings">
              {activity.length ? (
                activity.slice(0, 20).map((m: any) => (
                  <div key={String(m.id || `${m.meeting_date}-${m.time_slot}`)} className="my-meeting-item">
                    <div className="m-info">
                      <span className="m-date">
                        {m.meeting_date || "—"} {m.time_slot || ""}
                      </span>
                      <div>{m.status || "scheduled"}</div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="admin-cp-placeholder">No meetings scheduled yet.</p>
              )}
            </div>
          </div>
        ) : null}

        {role === "user" && activeTab === "profile" ? (
          <div className="bb-section-page">
            <div className="ud-user-back">
              <button type="button" className="ud-back-btn" onClick={() => goTab("home")}>
                ← Back
              </button>
            </div>
            <div className="ud-form-section-title">My Profile</div>
            <p className="form-hint">View your account details. Profile photo and edits match the BodyBank member profile flow.</p>
            <div className="schedule-call-block">
              <div className="ud-form-group">
                <label>Name</label>
                <div className="ud-form-input" style={{ opacity: 0.9 }}>
                  {displayName}
                </div>
              </div>
              <div className="ud-form-group">
                <label>Email</label>
                <div className="ud-form-input" style={{ opacity: 0.9 }}>
                  {session?.user?.email || "—"}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {role === "user" && activeTab === "progress" ? (
          <div className="bb-section-page">
            <div className="ud-user-back">
              <button type="button" className="ud-back-btn" onClick={() => goTab("home")}>
                ← Back
              </button>
            </div>
            <p className="form-hint" style={{ marginBottom: 16 }}>
              Log your metrics for a specific date. Your Lifestyle Manager can share a link with you to view your progress and graphs.
            </p>
            <form onSubmit={submitProgressFormUser} className="progress-form-grid">
              <div className="ud-form-group" style={{ gridColumn: "1 / -1" }}>
                <label>
                  Date <span className="req">*</span>
                </label>
                <input
                  type="date"
                  className="ud-form-input"
                  required
                  value={progressForm.log_date}
                  onChange={(e) => setProgressForm((p) => ({ ...p, log_date: e.target.value }))}
                />
              </div>
              <div className="ud-form-group">
                <label>Weight (kg)</label>
                <input
                  type="number"
                  step={0.1}
                  className="ud-form-input"
                  placeholder="e.g. 72.5"
                  value={progressForm.weight}
                  onChange={(e) => setProgressForm((p) => ({ ...p, weight: e.target.value }))}
                />
              </div>
              <div className="ud-form-group">
                <label>Body fat %</label>
                <input
                  type="number"
                  step={0.1}
                  className="ud-form-input"
                  placeholder="e.g. 18"
                  value={progressForm.body_fat}
                  onChange={(e) => setProgressForm((p) => ({ ...p, body_fat: e.target.value }))}
                />
              </div>
              <div className="ud-form-group">
                <label>Calories intake</label>
                <input
                  type="number"
                  className="ud-form-input"
                  placeholder="e.g. 2000"
                  value={progressForm.calories_intake}
                  onChange={(e) => setProgressForm((p) => ({ ...p, calories_intake: e.target.value }))}
                />
              </div>
              <div className="ud-form-group">
                <label>Protein (g)</label>
                <input
                  type="number"
                  className="ud-form-input"
                  placeholder="e.g. 120"
                  value={progressForm.protein_intake}
                  onChange={(e) => setProgressForm((p) => ({ ...p, protein_intake: e.target.value }))}
                />
              </div>
              <div className="ud-form-group">
                <label>Workout completed</label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={progressForm.workout_completed}
                    onChange={(e) => setProgressForm((p) => ({ ...p, workout_completed: e.target.checked }))}
                  />
                  <span style={{ fontSize: 13, color: "var(--text-primary)" }}>Yes</span>
                </label>
              </div>
              <div className="ud-form-group">
                <label>Workout type</label>
                <input
                  className="ud-form-input"
                  placeholder="e.g. Upper body"
                  value={progressForm.workout_type}
                  onChange={(e) => setProgressForm((p) => ({ ...p, workout_type: e.target.value }))}
                />
              </div>
              <div className="ud-form-group">
                <label>Bench (kg)</label>
                <input
                  type="number"
                  step={0.1}
                  className="ud-form-input"
                  value={progressForm.strength_bench}
                  onChange={(e) => setProgressForm((p) => ({ ...p, strength_bench: e.target.value }))}
                />
              </div>
              <div className="ud-form-group">
                <label>Squat (kg)</label>
                <input
                  type="number"
                  step={0.1}
                  className="ud-form-input"
                  value={progressForm.strength_squat}
                  onChange={(e) => setProgressForm((p) => ({ ...p, strength_squat: e.target.value }))}
                />
              </div>
              <div className="ud-form-group">
                <label>Deadlift (kg)</label>
                <input
                  type="number"
                  step={0.1}
                  className="ud-form-input"
                  value={progressForm.strength_deadlift}
                  onChange={(e) => setProgressForm((p) => ({ ...p, strength_deadlift: e.target.value }))}
                />
              </div>
              <div className="ud-form-group">
                <label>Sleep (hours)</label>
                <input
                  type="number"
                  step={0.1}
                  className="ud-form-input"
                  placeholder="e.g. 7.5"
                  value={progressForm.sleep_hours}
                  onChange={(e) => setProgressForm((p) => ({ ...p, sleep_hours: e.target.value }))}
                />
              </div>
              <div className="ud-form-group">
                <label>Water (L)</label>
                <input
                  type="number"
                  step={0.1}
                  className="ud-form-input"
                  placeholder="e.g. 2.5"
                  value={progressForm.water_intake}
                  onChange={(e) => setProgressForm((p) => ({ ...p, water_intake: e.target.value }))}
                />
              </div>
              <div className="ud-form-group" style={{ gridColumn: "1 / -1" }}>
                <button type="submit" className="ud-form-submit" disabled={progressSaving}>
                  {progressSaving ? "Saving…" : "Save for this date"}
                </button>
              </div>
            </form>
            <p className={`form-success${progressSuccess ? " show" : ""}`}>
              Saved. Your Lifestyle Manager can share your progress report with you.
            </p>
            <div style={{ marginTop: 28 }}>
              <h3 className="admin-cp-heading">Submission logs</h3>
              <div className="progress-logs-list">
                {userProgressLogs.length ? (
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Weight</th>
                        <th>Workout</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userProgressLogs.slice(0, 30).map((log: any) => (
                        <tr key={String(log.id || log.created_at)}>
                          <td>{log.created_at ? String(log.created_at).slice(0, 10) : "—"}</td>
                          <td>{log.weight != null ? String(log.weight) : "—"}</td>
                          <td>{log.workout_completed ? "Yes" : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="admin-cp-placeholder">No entries yet. Save a log above to see it here.</p>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {activeTab === "messages" ? (
          <div className="bb-section-page">
            {isStaff ? (
              <>
                <button
                  type="button"
                  className="bb-back-btn"
                  onClick={() => (trainerMessagesView === "hub" ? setActiveTab("home") : setTrainerMessagesView("hub"))}
                >
                  ← Back
                </button>
                {trainerMessagesView === "hub" ? (
                  <div className="bb-admin-hub-cards">
                    <HubCard
                      icon={String.fromCodePoint(0x1f4ac)}
                      title="Messages & Meetings"
                      desc="Contact messages and meeting requests"
                      onClick={() => setTrainerMessagesView("threads")}
                    />
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    <div className="bb-panel">
                      <span className="bb-inline-label">THREADS</span>
                      {threads.length ? (
                        <ul className="bb-list-rows">
                          {threads.slice(0, 20).map((t: any) => {
                            const id = String(t.id || "");
                            const active = selectedThreadId === id;
                            return (
                              <li
                                key={id}
                                className={`bb-list-row${active ? " bb-list-row-active" : ""}`}
                                onClick={() => setSelectedThreadId(id)}
                                role="presentation"
                              >
                                <div className="bb-list-row-title">{[t.first_name, t.last_name].filter(Boolean).join(" ") || t.email || "Client"}</div>
                                <p className="bb-list-row-sub">{String(t.last_message || "No messages yet").slice(0, 80)}</p>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <p className="bb-live-empty">No message threads yet.</p>
                      )}
                    </div>

                    <div className="bb-panel">
                      <span className="bb-inline-label">CONVERSATION</span>
                      {!selectedThreadId ? (
                        <p className="bb-live-empty">Select a thread to view the conversation.</p>
                      ) : (
                        <>
                          <div className="bb-msg-scroll">
                            {threadMessages.length ? (
                              threadMessages.map((m: any) => {
                                const staffSide = m.sender_role === "admin" || m.sender_role === "superadmin";
                                const mine = staffSide;
                                const label = staffSide ? "You" : "Client";
                                return (
                                  <div key={m.id} className={mine ? "bb-msg-bubble-user" : "bb-msg-bubble-client"} style={{ justifySelf: mine ? "end" : "start" }}>
                                    <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{m.body}</div>
                                    <div className="bb-msg-meta">
                                      {label} · {m.created_at ? new Date(m.created_at).toLocaleString() : ""}
                                    </div>
                                  </div>
                                );
                              })
                            ) : (
                              <p className="bb-live-empty">No messages yet.</p>
                            )}
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginTop: 10 }}>
                            <input
                              className="bb-input"
                              value={replyText}
                              onChange={(e) => setReplyText(e.target.value)}
                              placeholder="Type your reply..."
                            />
                            <button type="button" className="bb-btn-primary" onClick={sendReply} disabled={isReplying}>
                              {isReplying ? "..." : "Send"}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="ud-user-back">
                  <button type="button" className="ud-back-btn" onClick={() => goTab("home")}>
                    ← Back
                  </button>
                </div>
                <div className="chat-header-strip">
                  <p className="chat-header-desc">Chat with your Lifestyle Manager. Just type and send.</p>
                </div>
                <div className="chat-container">
                  <div className="thread-messages-box">
                    {!selectedThreadId ? (
                      <p className="form-hint" style={{ textAlign: "center", padding: "32px 16px", margin: 0 }}>
                        No messages yet. Type below and send to start the conversation.
                      </p>
                    ) : threadMessages.length ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {threadMessages.map((m: any) => {
                          const staffSide = m.sender_role === "admin" || m.sender_role === "superadmin";
                          const mine = !staffSide;
                          return (
                            <div key={m.id} className={`thread-msg${mine ? " user" : " admin"}`}>
                              <div className="thread-msg-bubble">{m.body}</div>
                              <div className="thread-msg-meta">
                                {staffSide ? "Lifestyle Manager" : "You"} · {m.created_at ? new Date(m.created_at).toLocaleString() : ""}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="form-hint" style={{ textAlign: "center", padding: "32px 16px", margin: 0 }}>
                        No messages yet.
                      </p>
                    )}
                  </div>
                  <div className="thread-reply-wrap">
                    <textarea
                      className="ud-form-input"
                      placeholder="Type your message…"
                      rows={2}
                      maxLength={5000}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                    />
                    <button type="button" className="chat-send-btn" onClick={() => void sendReply()} disabled={isReplying}>
                      {isReplying ? "…" : "Send"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : null}

        {isStaff && staffOverlay ? (
          <div className="bb-staff-overlay" role="dialog" aria-modal="true">
            <button
              type="button"
              className="bb-back-btn"
              onClick={() => {
                if (staffOverlay === "insights" || staffOverlay === "campaigns") setStaffOverlay("analytics");
                else setStaffOverlay(null);
              }}
            >
              ← Back
            </button>
            <h2 className="bb-section-h2">
              {staffOverlay === "workouts" && "WORKOUTS"}
              {staffOverlay === "programs" && "PROGRAMS"}
              {staffOverlay === "analytics" && "ANALYTICS"}
              {staffOverlay === "insights" && "PERFORMANCE INSIGHTS"}
              {staffOverlay === "campaigns" && "CAMPAIGNS"}
            </h2>

            {staffOverlay === "workouts" ? (
              <div className="bb-panel">
                <span className="bb-inline-label">RECENT WORKOUT LOGS · {workouts.length}</span>
                {workouts.length ? (
                  <ul className="bb-list-rows">
                    {workouts.slice(0, 60).map((w: any) => (
                      <li key={w.id} className="bb-list-row" onClick={() => openWorkoutDetail(w)} role="presentation">
                        <div className="bb-list-row-title">{w.workout_name || "Workout"}</div>
                        <p className="bb-list-row-sub">
                          {[w.first_name, w.last_name].filter(Boolean).join(" ") || w.email || "—"} ·{" "}
                          {Math.floor((Number(w.duration_seconds) || 0) / 60)} min ·{" "}
                          {w.created_at ? new Date(w.created_at).toLocaleString() : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="bb-live-empty">No workouts logged yet.</p>
                )}
              </div>
            ) : null}

            {staffOverlay === "programs" ? (
              <div style={{ display: "grid", gap: 12 }}>
                <div className="bb-panel">
                  <span className="bb-inline-label">ASSIGN PROGRAM (MAX 4 PER CLIENT)</span>
                  <div style={{ display: "grid", gap: 8 }}>
                    <select className="bb-input" value={assignUserId} onChange={(e) => setAssignUserId(e.target.value)} style={{ cursor: "pointer" }}>
                      <option value="">Select client</option>
                      {tribeMembers.map((u: any) => (
                        <option key={u.id} value={u.id}>
                          {[u.first_name, u.last_name].filter(Boolean).join(" ") || u.email}
                        </option>
                      ))}
                    </select>
                    <select className="bb-input" value={assignProgramId} onChange={(e) => setAssignProgramId(e.target.value)} style={{ cursor: "pointer" }}>
                      <option value="">Select program</option>
                      {programCatalog.map((p: any) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="bb-btn-primary" onClick={assignProgramToUser} disabled={isAssigningProgram}>
                      {isAssigningProgram ? "..." : "Assign"}
                    </button>
                  </div>
                </div>
                <div className="bb-panel">
                  <span className="bb-inline-label">CATALOG · {programCatalog.length}</span>
                  {programCatalog.length ? (
                    <ul className="bb-list-rows">
                      {programCatalog.map((p: any) => (
                        <li key={p.id} className="bb-list-row bb-list-row-static">
                          <div className="bb-list-row-title">{p.name}</div>
                          {p.pdf_url ? (
                            <a href={p.pdf_url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", fontSize: 12 }}>
                              PDF
                            </a>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="bb-live-empty">Loading programs…</p>
                  )}
                </div>
              </div>
            ) : null}

            {staffOverlay === "analytics" ? (
              <div className="bb-admin-hub-cards">
                <HubCard
                  icon={String.fromCodePoint(0x1f4ca)}
                  title="Performance Insights"
                  desc="Filters, charts, and CSV export"
                  onClick={() => setStaffOverlay("insights")}
                />
                <HubCard
                  icon={String.fromCodePoint(0x1f4e4)}
                  title="Campaigns"
                  desc="Scheduled broadcast messages to all users"
                  onClick={() => setStaffOverlay("campaigns")}
                />
              </div>
            ) : null}

            {staffOverlay === "insights" ? (
              <div className="bb-panel">
                {perfInsightsLoading ? (
                  <p className="bb-live-empty">Loading insights…</p>
                ) : perfInsights?.summary ? (
                  <ul className="bb-list-rows">
                    {Object.entries(perfInsights.summary).map(([k, v]) => (
                      <li key={k} className="bb-list-row bb-list-row-static">
                        <div className="bb-list-row-title">{k.replace(/_/g, " ")}</div>
                        <p className="bb-list-row-sub">{String(v)}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="bb-live-empty">No insight data available.</p>
                )}
              </div>
            ) : null}

            {staffOverlay === "campaigns" ? (
              <div className="bb-panel">
                <span className="bb-inline-label">BROADCAST CAMPAIGNS</span>
                <p className="bb-live-empty" style={{ marginTop: 8 }}>
                  Campaign scheduling matches BodyBank&rsquo;s broadcast tool. Wire this view to your notifications/campaign API when it is available, or contact support for help.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {(selectedClient ||
          selectedForm ||
          selectedCheckin ||
          selectedWorkout ||
          selectedMeeting ||
          selectedSunday ||
          selectedPart2) ? (
          <div className="bb-panel bb-detail-panel" style={{ marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 12, alignItems: "center" }}>
              <span className="bb-section-h2" style={{ fontSize: 20, margin: 0 }}>
                DETAIL
              </span>
              <button
                type="button"
                className="bb-back-btn"
                style={{ marginBottom: 0, minHeight: 36, padding: "6px 12px" }}
                onClick={() => {
                  setSelectedClient(null);
                  setSelectedForm(null);
                  setSelectedCheckin(null);
                  setSelectedWorkout(null);
                  setSelectedMeeting(null);
                  setSelectedSunday(null);
                  setSelectedPart2(null);
                  setClientProgress(null);
                  setClientProgressLink("");
                }}
              >
                Close
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
                <div><strong>Steps:</strong> {selectedCheckin.steps ?? "-"}</div>
                <div><strong>Water (ml):</strong> {selectedCheckin.water_ml ?? "-"}</div>
                <div><strong>Protein (g):</strong> {selectedCheckin.protein_g ?? "-"}</div>
                <div><strong>Sleep (h):</strong> {selectedCheckin.sleep_hours ?? "-"}</div>
              </div>
            ) : null}
            {selectedSunday ? (
              <div style={{ display: "grid", gap: 6 }}>
                <div><strong>Name:</strong> {selectedSunday.full_name || "-"}</div>
                <div><strong>Email:</strong> {selectedSunday.reply_email || "-"}</div>
                <div><strong>Weight loss:</strong> {selectedSunday.total_weight_loss ?? "-"}</div>
                <div><strong>Achievements:</strong> {selectedSunday.achievements || "-"}</div>
                <div><strong>Submitted:</strong> {selectedSunday.created_at ? new Date(selectedSunday.created_at).toLocaleString() : "-"}</div>
              </div>
            ) : null}
            {selectedPart2 ? (
              <div style={{ display: "grid", gap: 6 }}>
                <div><strong>Name:</strong> {selectedPart2.name || "-"}</div>
                <div><strong>Email:</strong> {selectedPart2.email || "-"}</div>
                <div><strong>Mobile:</strong> {selectedPart2.mobile || "-"}</div>
                <div><strong>Activity:</strong> {selectedPart2.activity_level || "-"}</div>
                <div><strong>Submitted:</strong> {selectedPart2.created_at ? new Date(selectedPart2.created_at).toLocaleString() : "-"}</div>
              </div>
            ) : null}
            {selectedWorkout ? (
              <div style={{ display: "grid", gap: 6 }}>
                <div><strong>Workout:</strong> {selectedWorkout.workout_name || "-"}</div>
                <div><strong>Duration:</strong> {Math.floor((Number(selectedWorkout.duration_seconds) || 0) / 60)} min</div>
                <div><strong>Created:</strong> {selectedWorkout.created_at ? new Date(selectedWorkout.created_at).toLocaleString() : "-"}</div>
                <div><strong>Feedback:</strong> {selectedWorkout.feedback || selectedWorkout.notes || "-"}</div>
              </div>
            ) : null}
            {selectedMeeting ? (
              <div style={{ display: "grid", gap: 6 }}>
                <div><strong>Meeting date:</strong> {selectedMeeting.meeting_date || "-"}</div>
                <div><strong>Slot:</strong> {selectedMeeting.time_slot || "-"}</div>
                <div><strong>Status:</strong> {selectedMeeting.status || "-"}</div>
                <div><strong>Message:</strong> {selectedMeeting.message || "-"}</div>
                {role === "user" || role === "admin" || role === "superadmin" ? (
                  <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                    <button
                      onClick={() => updateMeetingStatus("scheduled")}
                      disabled={isMeetingUpdating}
                      style={{ border: "none", background: "var(--green)", color: "#0f0f0f", borderRadius: 8, padding: "7px 10px", fontWeight: 700 }}
                    >
                      {isMeetingUpdating ? "..." : "Mark Scheduled"}
                    </button>
                    <button
                      onClick={() => updateMeetingStatus("completed")}
                      disabled={isMeetingUpdating}
                      style={{ border: "none", background: "var(--accent-light)", color: "#0f0f0f", borderRadius: 8, padding: "7px 10px", fontWeight: 700 }}
                    >
                      {isMeetingUpdating ? "..." : "Mark Completed"}
                    </button>
                    <button
                      onClick={() => updateMeetingStatus("cancelled")}
                      disabled={isMeetingUpdating}
                      style={{ border: "none", background: "var(--red)", color: "#0f0f0f", borderRadius: 8, padding: "7px 10px", fontWeight: 700 }}
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

      {isStaff ? (
        <div className="bb-ai-assist-panel" style={{ display: staffAiOpen ? "flex" : "none" }} role="dialog" aria-label="AI Assist">
          <div className="bb-ai-assist-head">
            <strong>AI Assist</strong>
            <button type="button" className="bb-ai-assist-x" onClick={() => setStaffAiOpen(false)} aria-label="Close">
              ×
            </button>
          </div>
          <div className="bb-ai-assist-body">
            <p style={{ margin: 0 }}>
              Ask about pending audits, check-ins, or clients. Try &ldquo;Quick summary&rdquo; or &ldquo;How many pending audit forms?&rdquo;
            </p>
          </div>
          <div className="bb-ai-assist-foot">
            <textarea
              className="bb-textarea"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Type your question…"
              rows={3}
              style={{ minHeight: 72, resize: "vertical" }}
            />
            <button type="button" className="bb-btn-primary" onClick={sendAi} disabled={isAiLoading}>
              {isAiLoading ? "Sending…" : "Send"}
            </button>
            <p className="bb-list-row-sub" style={{ margin: 0, whiteSpace: "pre-wrap", maxHeight: 120, overflowY: "auto" }}>
              {aiReply || ""}
            </p>
            <button type="button" className="bb-back-btn" style={{ marginBottom: 0, width: "100%", justifyContent: "center" }} onClick={() => setStaffAiOpen(false)}>
              Close AI Assist
            </button>
          </div>
        </div>
      ) : null}

      <nav className="bb-nav-dock">
        <div className="bb-nav-inner">
          {role === "user" ? (
            <>
              {tabButton("home", "Home", "\u2605")}
              {tabButton("clients", "Workout", "\uD83D\uDCAA")}
              {tabButton("programs", "Programs", "\uD83C\uDFAF")}
              {tabButton("forms", "Check-in", "\u2705")}
              {tabButton("messages", "Messages", "\uD83D\uDCAC")}
            </>
          ) : (
            <>
              {tabButton("home", "Home", "\u2605")}
              {tabButton("clients", "Clients", String.fromCodePoint(0x1f46a))}
              {tabButton("forms", "Forms", String.fromCodePoint(0x1f4cb))}
              {tabButton("messages", "Messages", String.fromCodePoint(0x1f4ac))}
              {tabButton("ai", "AI", String.fromCodePoint(0x1f4a1))}
            </>
          )}
        </div>
      </nav>
    </main>
  );
}

