"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode
} from "react";
import { getApiSiteBase } from "../../lib/site-url";
import {
  clearFitbaseSessionStorage,
  loadFitbaseSessionFromBrowser,
  normalizeFitbaseSession,
  readFitbaseSessionString,
  writeFitbaseSessionObject,
  type FitbaseSession
} from "../../lib/fitbase-session";
import { clearPwaAppBadge, subscribeFitbasePush, syncPwaAppBadge } from "../../lib/pwa-push";
import { UserMemberDesktopDashboard, type UserDesktopNavTarget } from "./user-member-desktop-dashboard";

type DashboardTab =
  | "home"
  | "clients"
  | "forms"
  | "messages"
  | "ai"
  | "programs"
  | "contact"
  | "profile"
  | "progress"
  | "training"
  | "analytics";

type AdminListFilter = { from: string; to: string; search: string };
type AdminListFilterKey = "part2" | "sunday" | "daily" | "workouts";

type InboxNotification = {
  id?: string;
  title?: string;
  desc?: string;
  time?: string;
  link?: string | null;
};

type Session = FitbaseSession;

const ClientProgressCharts = dynamic(
  () => import("./client-progress-charts").then((m) => ({ default: m.ClientProgressCharts })),
  { ssr: false, loading: () => <p className="bb-list-row-sub" style={{ marginTop: 8 }}>Loading charts…</p> }
);

function escapeCsvCell(val: unknown): string {
  const s = val == null ? "" : String(val);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Display name for the member's assigned trainer (from thread list join). */
function trainerChatDisplayNameFromThreadRow(t: unknown): string {
  if (!t || typeof t !== "object") return "";
  const row = t as {
    trainer_first_name?: string;
    trainer_last_name?: string;
    trainer_email?: string;
  };
  const name = [row.trainer_first_name, row.trainer_last_name].filter(Boolean).join(" ").trim();
  if (name) return name;
  const em = String(row.trainer_email || "").trim();
  if (em) {
    const local = em.split("@")[0];
    return local ? local.replace(/[._]+/g, " ").trim() : em;
  }
  return "";
}

/** Sidebar label for staff thread list (client chat vs trainer ↔ super admin). */
function staffThreadListTitle(t: unknown, viewerRole: string): string {
  if (!t || typeof t !== "object") return "Chat";
  const row = t as { thread_kind?: string; first_name?: string; last_name?: string; email?: string };
  if (String(row.thread_kind) === "ops") {
    if (viewerRole === "admin") return "Super Admin";
    const n = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
    return n || String(row.email || "").trim() || "Trainer";
  }
  return [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || String(row.email || "").trim() || "Client";
}

function adminDetailText(v: unknown): ReactNode {
  if (v == null || v === "") return "—";
  return String(v);
}

function AdminDetailRow({ label, children }: { label: string; children: ReactNode }) {
  const show = children == null || children === "" ? "—" : children;
  return (
    <div className="bb-form-view-row">
      <span className="bb-fv-lbl">{label}</span>
      <span className="bb-fv-val">{show}</span>
    </div>
  );
}

function AdminDetailBlock({ label, value }: { label: string; value: unknown }) {
  const v = value == null || String(value).trim() === "" ? "—" : String(value);
  return (
    <div className="bb-form-view-block">
      <div className="bb-fv-lbl">{label}</div>
      <div className="bb-fv-blk">{v}</div>
    </div>
  );
}

function formatAdminCheckinDate(d: unknown): string {
  if (d == null || d === "") return "—";
  try {
    const dt = new Date(String(d));
    if (Number.isNaN(dt.getTime())) return String(d);
    return dt.toLocaleDateString(undefined, { dateStyle: "full" });
  } catch {
    return "—";
  }
}

function rosterClientMonogram(client: { first_name?: string; last_name?: string; email?: string }): string {
  const a = String(client.first_name || "").trim();
  const b = String(client.last_name || "").trim();
  const ai = a[0];
  const bi = b[0];
  if (ai && bi) return (ai + bi).toUpperCase();
  if (ai) return ai.toUpperCase();
  const em = String(client.email || "").trim();
  return em[0] ? em[0].toUpperCase() : "·";
}

function superadminRosterStatusClass(approvalStatus: unknown): string {
  const s = String(approvalStatus || "").trim().toLowerCase();
  if (s === "approved") return "bb-sa-slim-pill bb-sa-slim-pill-active";
  if (s === "pending") return "bb-sa-slim-pill bb-sa-slim-pill-pending";
  if (s === "rejected" || s === "denied") return "bb-sa-slim-pill bb-sa-slim-pill-rejected";
  if (s === "suspended") return "bb-sa-slim-pill bb-sa-slim-pill-suspended";
  return "bb-sa-slim-pill";
}

function superadminFormatShortDate(iso: string | null | undefined): string {
  if (iso == null || String(iso).trim() === "") return "—";
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Calendar weeks since join (minimum 1). */
function superadminWeeksOnPlatform(iso: string | null | undefined): number {
  const d = new Date(String(iso || ""));
  if (Number.isNaN(d.getTime())) return 0;
  const ms = Date.now() - d.getTime();
  if (ms < 0) return 1;
  return Math.max(1, Math.floor(ms / (7 * 24 * 60 * 60 * 1000)) + 1);
}

const PERF_INSIGHT_LABELS: Record<string, string> = {
  users_approved: "Approved users",
  pending_requests: "Pending audits",
  daily_checkins: "Daily check-ins",
  workouts: "Workouts",
  sunday_checkin: "Sunday check-in",
  audit: "Body Audit",
  part2: "Part-2",
  meetings: "Meetings",
  messages: "Messages"
};

function perfInsightsOverviewDetail(r: any): string {
  const s = r._source || r.source;
  if (s === "workouts")
    return `${[r.first_name, r.last_name].filter(Boolean).join(" ").trim()} — ${r.workout_name || ""} (${r.duration_seconds != null ? Math.round(Number(r.duration_seconds) / 60) + " min" : "—"})`;
  if (s === "sunday_checkin") return `${r.full_name || ""} — ${r.reply_email || ""}`;
  if (s === "audit") return `${[r.first_name, r.last_name].filter(Boolean).join(" ").trim()} — ${r.email || ""}`;
  if (s === "part2") return `${r.name || ""} — ${r.email || ""}`;
  if (s === "meetings") return `${r.user_name || r.user_email || ""} — ${r.meeting_date || ""} ${r.time_slot || ""}`;
  if (s === "messages")
    return `${r.name || ""} — ${String(r.message || "").slice(0, 40)}${String(r.message || "").length > 40 ? "…" : ""}`;
  return "";
}

const PERF_INSIGHT_TYPE_LABELS: Record<string, string> = {
  workouts: "Workout",
  sunday_checkin: "Sunday Check-in",
  audit: "Body Audit",
  part2: "Part-2",
  meetings: "Meeting",
  messages: "Message"
};

/** FitBase admin insights tab: same card order as `loadPerformanceInsights` in public/index.html */
const BB_PERF_INSIGHT_CARD_KEYS = [
  "users_approved",
  "workouts",
  "sunday_checkin",
  "audit",
  "part2",
  "meetings",
  "messages"
] as const;

const CAMP_DAYS_ORDER = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "daily"] as const;

function renderPerfInsightsTableBody(
  source: string,
  data: any[]
): { head: string[]; rows: string[][] } {
  const src = source.toLowerCase();
  if (src === "all" || src === "overview") {
    return {
      head: ["Type", "Details", "Date"],
      rows: data.map((r) => [
        PERF_INSIGHT_TYPE_LABELS[r._source] || r._source || "—",
        perfInsightsOverviewDetail(r) || "—",
        (r._date || r.created_at) ? new Date(String(r._date || r.created_at)).toLocaleString() : "—"
      ])
    };
  }
  if (src === "workouts") {
    return {
      head: ["User", "Workout", "Duration", "Date"],
      rows: data.map((r) => [
        `${r.first_name || ""} ${r.last_name || ""}`.trim() || "—",
        r.workout_name || "—",
        r.duration_seconds != null ? `${Math.round(Number(r.duration_seconds) / 60)} min` : "—",
        r.created_at ? new Date(String(r.created_at)).toLocaleString() : "—"
      ])
    };
  }
  if (src === "sunday_checkin") {
    return {
      head: ["Name", "Reply Email", "Plan", "Date"],
      rows: data.map((r) => [
        r.full_name || "—",
        r.reply_email || "—",
        r.plan || "—",
        r.created_at ? new Date(String(r.created_at)).toLocaleString() : "—"
      ])
    };
  }
  if (src === "audit") {
    return {
      head: ["Name", "Email", "City", "Goals", "Date"],
      rows: data.map((r) => [
        `${r.first_name || ""} ${r.last_name || ""}`.trim() || "—",
        r.email || "—",
        r.city || "—",
        String(r.goals || "").slice(0, 50),
        r.created_at ? new Date(String(r.created_at)).toLocaleString() : "—"
      ])
    };
  }
  if (src === "part2") {
    return {
      head: ["Name", "Email", "Activity", "Date"],
      rows: data.map((r) => [
        r.name || "—",
        r.email || "—",
        r.activity_level || "—",
        r.created_at ? new Date(String(r.created_at)).toLocaleString() : "—"
      ])
    };
  }
  if (src === "meetings") {
    return {
      head: ["User", "Email", "Date", "Time"],
      rows: data.map((r) => [
        r.user_name || "—",
        r.user_email || "—",
        r.meeting_date || "—",
        r.time_slot || "—"
      ])
    };
  }
  if (src === "messages") {
    return {
      head: ["Name", "Email", "Message", "Date"],
      rows: data.map((r) => {
        const msg = String(r.message || "");
        return [
          r.name || "—",
          r.email || "—",
          msg.slice(0, 80) + (msg.length > 80 ? "…" : ""),
          r.created_at ? new Date(String(r.created_at)).toLocaleString() : "—"
        ];
      })
    };
  }
  return { head: ["Type", "Details", "Date"], rows: [] };
}

function downloadCsvFile(filename: string, columns: { key: string; header: string }[], rows: Record<string, unknown>[]) {
  const header = columns.map((c) => escapeCsvCell(c.header)).join(",");
  const lines = rows.map((row) => columns.map((c) => escapeCsvCell((row as any)[c.key])).join(","));
  const csv = "\uFEFF" + [header, ...lines].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const s = loadFitbaseSessionFromBrowser();
    if (!s) return null;
    const normalized = JSON.stringify(s);
    const raw = readFitbaseSessionString();
    if (normalized !== raw) {
      writeFitbaseSessionObject(s);
    }
    return s;
  } catch {
    return null;
  }
}

const FITBASE_INBOX_FLOOR_PREFIX = "fitbase_inbox_floor_";

function readInboxShowAfterMs(userId: string): number {
  if (typeof window === "undefined" || !userId) return 0;
  try {
    const v = localStorage.getItem(FITBASE_INBOX_FLOOR_PREFIX + userId);
    const n = v ? parseInt(v, 10) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeInboxShowAfterMs(userId: string, ms: number) {
  if (typeof window === "undefined" || !userId) return;
  try {
    localStorage.setItem(FITBASE_INBOX_FLOOR_PREFIX + userId, String(ms));
  } catch {
    /* ignore */
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
  const [session, setSession] = useState<Session | null>(() =>
    typeof window !== "undefined" ? getSession() : null
  );
  const role = String(session?.user?.role || "")
    .trim()
    .toLowerCase();
  const apiBase = useMemo(() => getApiSiteBase(), []);
  const [stats, setStats] = useState<any>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [staffMeetings, setStaffMeetings] = useState<any[]>([]);
  const [threads, setThreads] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [dailyCheckins, setDailyCheckins] = useState<any[]>([]);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [pendingUsers, setPendingUsers] = useState<any[]>([]);
  const [isUserActionBusy, setIsUserActionBusy] = useState<string>("");
  const [selectedThreadId, setSelectedThreadId] = useState<string>("");
  const [threadMessages, setThreadMessages] = useState<any[]>([]);
  const [replyText, setReplyText] = useState("");
  const [isReplying, setIsReplying] = useState(false);
  const [opsThreadOpening, setOpsThreadOpening] = useState<string>("");
  const [pushEnableBusy, setPushEnableBusy] = useState(false);
  const [pushFeedback, setPushFeedback] = useState<string>("");
  const notifBaselineReadyRef = useRef(false);
  const notifSeenIdsRef = useRef<Set<string>>(new Set());
  const lastBannerAtRef = useRef(0);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiReply, setAiReply] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<DashboardTab>("home");
  const [error, setError] = useState("");
  const [selectedClient, setSelectedClient] = useState<any | null>(null);
  const [selectedCheckin, setSelectedCheckin] = useState<any | null>(null);
  const [selectedWorkout, setSelectedWorkout] = useState<any | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<any | null>(null);
  const [clientProgress, setClientProgress] = useState<any | null>(null);
  const [clientProgressShareUrl, setClientProgressShareUrl] = useState("");
  const [clientProgressShareBusy, setClientProgressShareBusy] = useState(false);
  const [clientProgressUserBusy, setClientProgressUserBusy] = useState(false);
  const [newClient, setNewClient] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    city: "",
    country: "",
    timezone: "",
    password: ""
  });
  const [trainerReferral, setTrainerReferral] = useState<{ code: string; join_path: string } | null>(null);
  const [isCreatingClient, setIsCreatingClient] = useState(false);
  const [isMeetingUpdating, setIsMeetingUpdating] = useState(false);
  const [todayLabel, setTodayLabel] = useState("");
  const [trainerClientsView, setTrainerClientsView] = useState<
    "hub" | "roster" | "pending" | "progress" | "addClient" | "coachPortfolio"
  >("hub");
  const [superadminPortfolioTrainerId, setSuperadminPortfolioTrainerId] = useState<string | null>(null);
  const [saTab, setSaTab] = useState<"overview" | "applications" | "trainers" | "members" | "enterprise">("overview");
  const [trainerFormsView, setTrainerFormsView] = useState<"hub" | "part2" | "sunday" | "daily">("hub");
  const [trainerMessagesView, setTrainerMessagesView] = useState<"hub" | "threads" | "meetings">("hub");
  const [sundayCheckinsApi, setSundayCheckinsApi] = useState<any[]>([]);
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
  const [superadminSyncOpen, setSuperadminSyncOpen] = useState(false);
  const [superadminRosterQ, setSuperadminRosterQ] = useState("");
  const [superadminTrainersQ, setSuperadminTrainersQ] = useState("");
  const [superadminTrainerCredModal, setSuperadminTrainerCredModal] = useState<{
    full_name: string;
    email: string;
    temp_password: string;
    trainer_code: string;
    login_url: string;
  } | null>(null);
  const [superadminRequestDetailModal, setSuperadminRequestDetailModal] = useState<{
    kind: "trainer" | "client";
    data: any;
  } | null>(null);
  const [assignTrainerForClient, setAssignTrainerForClient] = useState<Record<string, string>>({});
  type StaffOverlay = null | "workouts" | "programs" | "analytics" | "insights" | "campaigns";
  const [staffOverlay, setStaffOverlay] = useState<StaffOverlay>(null);
  const [trainerAnalyticsSub, setTrainerAnalyticsSub] = useState<null | "insights" | "campaigns">(null);
  const [trainerNavOpen, setTrainerNavOpen] = useState(false);
  const [trainerScheduleUserId, setTrainerScheduleUserId] = useState("");
  const [trainerMeetingDate, setTrainerMeetingDate] = useState("");
  const [trainerMeetingTime, setTrainerMeetingTime] = useState("");
  const [trainerMeetingSubmitting, setTrainerMeetingSubmitting] = useState(false);
  const [staffAiOpen, setStaffAiOpen] = useState(false);
  const [perfInsights, setPerfInsights] = useState<{ summary?: Record<string, number>; data?: any[]; source?: string } | null>(null);
  const [perfInsightsLoading, setPerfInsightsLoading] = useState(false);
  const [perfInSource, setPerfInSource] = useState("all");
  const [perfInFrom, setPerfInFrom] = useState("");
  const [perfInTo, setPerfInTo] = useState("");
  const [perfInUserId, setPerfInUserId] = useState("");
  const [perfInsightsApplyTick, setPerfInsightsApplyTick] = useState(0);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [campaignsErr, setCampaignsErr] = useState("");
  const [campMsg, setCampMsg] = useState("");
  const [campNewMessage, setCampNewMessage] = useState("");
  const [campNewDay, setCampNewDay] = useState("");
  const [campNewTime, setCampNewTime] = useState("");
  const [campBroadcastMsg, setCampBroadcastMsg] = useState("");
  const [campAiInput, setCampAiInput] = useState("");
  const [campAiReply, setCampAiReply] = useState("");
  const [campAiSending, setCampAiSending] = useState(false);
  const [campBusyId, setCampBusyId] = useState("");
  const [campAdding, setCampAdding] = useState(false);
  const [campBroadcasting, setCampBroadcasting] = useState(false);
  const [programCatalog, setProgramCatalog] = useState<any[]>([]);
  const [assignUserId, setAssignUserId] = useState("");
  const [assignProgramId, setAssignProgramId] = useState("");
  const [isAssigningProgram, setIsAssigningProgram] = useState(false);
  const [selectedSunday, setSelectedSunday] = useState<any | null>(null);
  const [part2Submissions, setPart2Submissions] = useState<any[]>([]);
  const [selectedPart2, setSelectedPart2] = useState<any | null>(null);
  const [userCheckinView, setUserCheckinView] = useState<"hub" | "daily" | "sunday" | "progress">("hub");
  const [userWide768, setUserWide768] = useState(false);
  const deferredPwaRef = useRef<any>(null);
  const dashMainRef = useRef<HTMLElement | null>(null);
  const [userShowPwaRow, setUserShowPwaRow] = useState(true);
  const [remoteProfile, setRemoteProfile] = useState<{
    phone?: string;
    email?: string;
    first_name?: string;
    last_name?: string;
    profile_picture?: string;
    country?: string;
    timezone?: string;
  } | null>(null);
  const [profPhone, setProfPhone] = useState("");
  const [profEmail, setProfEmail] = useState("");
  const [trainerProfCountry, setTrainerProfCountry] = useState("");
  const [trainerProfTimezone, setTrainerProfTimezone] = useState("");
  const [profEmailErr, setProfEmailErr] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaveOk, setProfileSaveOk] = useState(false);
  const [pendingAvatar, setPendingAvatar] = useState<string | null>(null);
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
  const [trainerListFilters, setTrainerListFilters] = useState<Record<AdminListFilterKey, AdminListFilter>>({
    part2: { from: "", to: "", search: "" },
    sunday: { from: "", to: "", search: "" },
    daily: { from: "", to: "", search: "" },
    workouts: { from: "", to: "", search: "" }
  });
  const [clientProgressFilterDraft, setClientProgressFilterDraft] = useState<AdminListFilter>({
    from: "",
    to: "",
    search: ""
  });
  const [clientProgressFilterApplied, setClientProgressFilterApplied] = useState<AdminListFilter>({
    from: "",
    to: "",
    search: ""
  });
  const [inboxItems, setInboxItems] = useState<InboxNotification[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifWrapRef = useRef<HTMLDivElement | null>(null);

  const displayName = useMemo(() => {
    const u = session?.user;
    if (!u) {
      if (role === "user") return "Member";
      return "Trainer";
    }
    const name = [u.first_name || "", u.last_name || ""].join(" ").trim();
    if (name) return name;
    const email = String(u.email || "");
    if (email) return email.split("@")[0];
    return role === "user" ? "Member" : "Trainer";
  }, [session, role]);

  const isStaff = role !== "user";
  const isTrainer = role === "admin";
  const isSuperadminViewer = role === "superadmin";

  const selectedThreadRow = useMemo(
    () => threads.find((t: any) => String(t?.id || "") === String(selectedThreadId)),
    [threads, selectedThreadId]
  );

  /** When this string changes, reset window scroll so each section/form starts at the top. */
  const dashboardScrollSnapKey = useMemo(() => {
    const parts: string[] = [activeTab];
    if (role === "user") parts.push(userCheckinView);
    if (isStaff) {
      parts.push(
        trainerClientsView,
        trainerFormsView,
        trainerMessagesView,
        String(trainerAnalyticsSub ?? ""),
        String(staffOverlay ?? ""),
        String(superadminPortfolioTrainerId ?? "")
      );
    }
    return parts.join("|");
  }, [
    activeTab,
    role,
    userCheckinView,
    isStaff,
    trainerClientsView,
    trainerFormsView,
    trainerMessagesView,
    trainerAnalyticsSub,
    staffOverlay,
    superadminPortfolioTrainerId
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      const mainEl = dashMainRef.current;
      if (mainEl && mainEl.scrollTop > 0) mainEl.scrollTo({ top: 0, behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [dashboardScrollSnapKey]);

  const part2ClientFormUrl = useMemo(() => `${String(apiBase).replace(/\/+$/, "")}/part2-form.html`, [apiBase]);
  const [part2LinkCopied, setPart2LinkCopied] = useState(false);
  const copyPart2ClientLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(part2ClientFormUrl);
      setPart2LinkCopied(true);
      window.setTimeout(() => setPart2LinkCopied(false), 2000);
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = part2ClientFormUrl;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setPart2LinkCopied(true);
        window.setTimeout(() => setPart2LinkCopied(false), 2000);
      } catch {
        /* ignore */
      }
    }
  }, [part2ClientFormUrl]);

  const activeClients = useMemo(() => {
    return clients.filter((u: any) => String(u.approval_status || "").toLowerCase() !== "pending");
  }, [clients]);

  const clientProgressFiltered = useMemo(() => {
    let list = activeClients;
    const f = clientProgressFilterApplied;
    const q = f.search.trim().toLowerCase();
    if (q) {
      list = list.filter((u: any) => {
        const name = [u.first_name, u.last_name].filter(Boolean).join(" ").toLowerCase();
        const em = String(u.email || "").toLowerCase();
        const phone = String(u.phone || "").toLowerCase();
        const city = String(u.city || "").toLowerCase();
        return name.includes(q) || em.includes(q) || phone.includes(q) || city.includes(q);
      });
    }
    const fromD = f.from.trim();
    const toD = f.to.trim();
    if (fromD || toD) {
      const fromMs = fromD ? new Date(fromD + "T00:00:00").getTime() : -Infinity;
      const toMs = toD ? new Date(toD + "T23:59:59.999").getTime() : Infinity;
      list = list.filter((u: any) => {
        const raw = u.created_at;
        if (!raw) return false;
        const t = new Date(String(raw)).getTime();
        if (!Number.isFinite(t)) return false;
        return t >= fromMs && t <= toMs;
      });
    }
    return list;
  }, [activeClients, clientProgressFilterApplied]);

  const superadminRosterRows = useMemo(() => {
    const rows: { client: any; trainer: any }[] = [];
    for (const row of trainerClientOverview) {
      let clientsNested: any[] = [];
      try {
        const raw = row.clients;
        if (Array.isArray(raw)) clientsNested = raw;
        else if (typeof raw === "string") clientsNested = JSON.parse(raw || "[]");
      } catch {
        clientsNested = [];
      }
      const trainer = {
        id: row.id,
        first_name: row.first_name,
        last_name: row.last_name,
        email: row.email,
        suspended: row.suspended,
        referral_code: row.referral_code
      };
      const tname = [row.first_name, row.last_name].filter(Boolean).join(" ") || row.email || "Coach";
      for (const c of clientsNested) {
        if (!c || c.id == null) continue;
        rows.push({
          trainer,
          client: {
            ...c,
            _coachName: tname,
            _coachEmail: row.email || ""
          }
        });
      }
    }
    return rows;
  }, [trainerClientOverview]);

  const superadminRosterFiltered = useMemo(() => {
    const q = superadminRosterQ.trim().toLowerCase();
    if (!q) return superadminRosterRows;
    return superadminRosterRows.filter(({ client: c, trainer: t }) => {
      const cn = [c.first_name, c.last_name].filter(Boolean).join(" ").toLowerCase();
      const ce = String(c.email || "").toLowerCase();
      const tn = [t.first_name, t.last_name].filter(Boolean).join(" ").toLowerCase();
      const te = String(t.email || "").toLowerCase();
      return cn.includes(q) || ce.includes(q) || tn.includes(q) || te.includes(q);
    });
  }, [superadminRosterRows, superadminRosterQ]);

  const superadminEnterpriseRequests = useMemo(() => {
    return trainerRequests.filter((r: any) => {
      const rt = String(r?.request_type || "").trim().toLowerCase();
      if (rt === "enterprise") return true;
      const msg = String(r?.message || "").toLowerCase();
      return (
        msg.includes("enterprise / business request") ||
        msg.includes("business type:") ||
        msg.includes("need white-labeling") ||
        msg.includes("need custom integrations")
      );
    });
  }, [trainerRequests]);

  const superadminTrainersFiltered = useMemo(() => {
    const q = superadminTrainersQ.trim().toLowerCase();
    if (!q) return superadminTrainers;
    return superadminTrainers.filter((t: any) => {
      const n = [t.first_name, t.last_name].filter(Boolean).join(" ").toLowerCase();
      const e = String(t.email || "").toLowerCase();
      return n.includes(q) || e.includes(q);
    });
  }, [superadminTrainers, superadminTrainersQ]);

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

  const userTrainerChatDisplayName = useMemo(
    () => (role === "user" ? trainerChatDisplayNameFromThreadRow(threads[0]) : ""),
    [role, threads]
  );

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

    let snapshotDailyFallback: any[] = [];
    let snapshotPendingFallback: any[] = [];

    try {
      const [dash, reqsRes, clientRes, overviewRes, trainersRes, threadRes, sunRes, p2Res, recentActRes, dailyRes, pendingRes] =
        await Promise.all([
          fetchFitbaseJson(apiBase, "/api/superadmin/dashboard", headers, "Platform overview"),
          fetchFitbaseJson(apiBase, "/api/superadmin/trainer-requests?status=all", headers, "Trainer applications"),
          fetchFitbaseJson(apiBase, "/api/superadmin/client-requests?status=all", headers, "Client coaching requests"),
          fetchFitbaseJson(apiBase, "/api/superadmin/trainer-client-overview", headers, "Roster overview"),
          fetchFitbaseJson(apiBase, "/api/superadmin/trainers", headers, "Trainers list"),
          fetchFitbaseJson(apiBase, "/api/threads", headers, "Message threads"),
          fetchFitbaseJson(apiBase, "/api/admin/sunday-checkins", headers, "Sunday check-ins"),
          fetchFitbaseJson(apiBase, "/api/admin/part2-submissions", headers, "Part 2 submissions"),
          fetchFitbaseJson(apiBase, "/api/admin/recent-activity", headers, "Recent activity"),
          fetchFitbaseJson(apiBase, "/api/admin/daily-checkins", headers, "Daily check-ins"),
          fetchFitbaseJson(apiBase, "/api/admin/pending-signups", headers, "Pending sign-ups")
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
        const fromRecent =
          recentActRes.ok && Array.isArray(recentActRes.data) ? (recentActRes.data as any[]) : [];
        const fromMeetings = (Array.isArray(s?.meetings) ? s.meetings : []).map((m: any) => ({
          name: m.user_name || m.user_email || "Client",
          type: "Meeting scheduled",
          status: "LIVE",
          created_at: m.created_at || m.meeting_date
        }));
        setActivity(fromRecent.length ? fromRecent.slice(0, 24) : fromMeetings.slice(0, 12));
        setClients(Array.isArray(s?.users) ? s.users : []);
        snapshotDailyFallback = Array.isArray(s?.daily_checkins) ? s.daily_checkins : [];
        setWorkouts(Array.isArray(s?.workouts) ? s.workouts : []);
        snapshotPendingFallback = Array.isArray(s?.users)
          ? s.users.filter((u: any) => String(u.approval_status || "").toLowerCase() === "pending")
          : [];
      } else {
        issues.push("Platform overview: empty response");
        setSuperadminSnapshot(null);
      }

      const dashOk =
        dash.ok &&
        dash.data &&
        typeof dash.data === "object" &&
        !(dash.data as { error?: string }).error;
      if (!dashOk) {
        if (recentActRes.ok && Array.isArray(recentActRes.data) && recentActRes.data.length > 0) {
          setActivity((recentActRes.data as any[]).slice(0, 24));
        } else {
          setActivity([]);
        }
      }

      setTrainerRequests(listFrom(reqsRes, "Trainer applications"));
      setClientLeadRequests(listFrom(clientRes, "Client coaching requests"));
      setTrainerClientOverview(listFrom(overviewRes, "Roster overview"));
      setSuperadminTrainers(listFrom(trainersRes, "Trainers list"));
      setThreads(listFrom(threadRes, "Message threads"));
      setSundayCheckinsApi(listFrom(sunRes, "Sunday check-ins"));
      setPart2Submissions(listFrom(p2Res, "Part 2 submissions"));

      if (dailyRes.ok && Array.isArray(dailyRes.data)) {
        setDailyCheckins(dailyRes.data);
      } else {
        setDailyCheckins(snapshotDailyFallback);
      }
      if (pendingRes.ok && Array.isArray(pendingRes.data)) {
        setPendingUsers(pendingRes.data);
      } else {
        setPendingUsers(snapshotPendingFallback);
      }

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

  const loadInbox = useCallback(async () => {
    if (!session?.token) return;
    const uid = String(session?.user?.id ?? "").trim();
    setInboxLoading(true);
    try {
      const r = await fetch(`${apiBase}/api/notifications`, {
        headers: { Authorization: `Bearer ${session.token}` }
      });
      const data = await r.json().catch(() => []);
      const list = Array.isArray(data) ? data : [];
      const floor = uid ? readInboxShowAfterMs(uid) : 0;
      const filtered =
        floor > 0
          ? list.filter((n: InboxNotification) => {
              const t = new Date(String(n.time ?? "")).getTime();
              if (!Number.isFinite(t)) return true;
              return t > floor;
            })
          : list;
      setInboxItems(filtered);
    } catch {
      setInboxItems([]);
    } finally {
      setInboxLoading(false);
    }
  }, [session?.token, session?.user?.id, apiBase]);

  const clearInboxNotifications = useCallback(async () => {
    if (!session?.token) return;
    const uid = String(session?.user?.id ?? "").trim();
    if (!uid) return;
    const snapshot = inboxItems.slice();
    let floor = Date.now();
    for (const n of snapshot) {
      const t = new Date(String(n.time ?? "")).getTime();
      if (Number.isFinite(t)) floor = Math.max(floor, t);
    }
    writeInboxShowAfterMs(uid, floor);
    setInboxItems([]);
    notifSeenIdsRef.current.clear();
    notifBaselineReadyRef.current = false;
    clearPwaAppBadge();

    if (role === "user") {
      const headers = { Authorization: `Bearer ${session.token}` };
      try {
        await fetch(`${apiBase}/api/inbox`, { method: "DELETE", headers });
      } catch {
        /* ignore */
      }
      const programIds = snapshot
        .map((n) => String(n.id || ""))
        .filter((id) => id.startsWith("program-"))
        .map((id) => id.slice("program-".length))
        .filter(Boolean);
      await Promise.all(
        programIds.map((rawId) =>
          fetch(`${apiBase}/api/me/program-assignments/${encodeURIComponent(rawId)}/seen`, {
            method: "POST",
            headers
          }).catch(() => null)
        )
      );
    }
  }, [session?.token, session?.user?.id, apiBase, role, inboxItems]);

  const loadCampaigns = useCallback(async () => {
    if (!session?.token) return;
    const headers = { Authorization: `Bearer ${session.token}` };
    setCampaignsLoading(true);
    setCampaignsErr("");
    try {
      const r = await fetch(`${apiBase}/api/campaigns`, { headers });
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        setCampaignsErr(typeof d?.error === "string" ? d.error : "Failed to load campaigns");
        setCampaigns([]);
        return;
      }
      setCampaigns(Array.isArray(d) ? d : []);
    } catch {
      setCampaignsErr("Failed to load campaigns");
      setCampaigns([]);
    } finally {
      setCampaignsLoading(false);
    }
  }, [session?.token, apiBase]);

  useEffect(() => {
    const wantCampaigns =
      (isTrainer && activeTab === "analytics" && trainerAnalyticsSub === "campaigns") ||
      (isStaff && staffOverlay === "campaigns");
    if (!session?.token || !wantCampaigns || !isStaff) return;
    void loadCampaigns();
  }, [
    session?.token,
    isStaff,
    isTrainer,
    activeTab,
    trainerAnalyticsSub,
    staffOverlay,
    loadCampaigns
  ]);

  useEffect(() => {
    if (!session?.token) {
      notifBaselineReadyRef.current = false;
      notifSeenIdsRef.current.clear();
      return;
    }
    void loadInbox();
    const id = window.setInterval(() => void loadInbox(), 90000);
    return () => window.clearInterval(id);
  }, [session?.token, loadInbox]);

  useEffect(() => {
    syncPwaAppBadge(inboxItems.length);
  }, [inboxItems.length]);

  useEffect(() => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (!inboxItems.length) return;
    const ids = inboxItems.map((n) => String(n.id ?? ""));
    if (!notifBaselineReadyRef.current) {
      notifBaselineReadyRef.current = true;
      ids.forEach((id) => {
        if (id) notifSeenIdsRef.current.add(id);
      });
      return;
    }
    const fresh = inboxItems.filter((n) => {
      const id = String(n.id ?? "");
      return id && !notifSeenIdsRef.current.has(id);
    });
    if (!fresh.length) return;
    const now = Date.now();
    if (now - lastBannerAtRef.current < 5000) {
      fresh.forEach((n) => notifSeenIdsRef.current.add(String(n.id ?? "")));
      return;
    }
    lastBannerAtRef.current = now;
    const n = fresh[0];
    const nid = String(n.id ?? "");
    if (nid) notifSeenIdsRef.current.add(nid);
    try {
      new Notification(n.title || "FitBase", {
        body: String(n.desc || "").slice(0, 180),
        icon: "/img/Fitbase_logo_PWA2.png",
        tag: nid || "fitbase-notify"
      });
    } catch {
      /* ignore */
    }
  }, [inboxItems]);

  useEffect(() => {
    if (!notifOpen) return;
    void loadInbox();
  }, [notifOpen, loadInbox]);

  useEffect(() => {
    if (!notifOpen) return;
    const close = (e: MouseEvent) => {
      const w = notifWrapRef.current;
      if (w && !w.contains(e.target as Node)) setNotifOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [notifOpen]);

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

  const reloadMainDashboardData = useCallback(() => {
    const token = session?.token;
    const r = String(role || "").toLowerCase();
    if (!token || r === "superadmin") return;

    const headers = { Authorization: `Bearer ${token}` };
    if (r === "user") {
      const userId = String(session?.user?.id || "");
      Promise.all([
        fetch(`${apiBase}/api/workouts/${encodeURIComponent(userId)}`, { headers }).then((res) => res.json()).catch(() => []),
        fetch(`${apiBase}/api/meetings/user/${encodeURIComponent(userId)}`, { headers }).then((res) => res.json()).catch(() => []),
        fetch(`${apiBase}/api/threads`, { headers }).then((res) => res.json()).catch(() => []),
        fetch(`${apiBase}/api/today`, { headers }).then((res) => res.json()).catch(() => null),
        fetch(`${apiBase}/api/daily-checkin/streak`, { headers }).then((res) => res.json()).catch(() => null)
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
          setDailyCheckins([]);
          setPendingUsers([]);
          if (todayData && !todayData.error) setUserToday(todayData);
          if (streakData && !streakData.error) setUserStreak(streakData);
        })
        .catch(() => setError("Failed to load dashboard data."));
      return;
    }

    Promise.all([
      fetch(`${apiBase}/api/stats`, { headers }).then((res) => res.json()).catch(() => null),
      fetch(`${apiBase}/api/admin/recent-activity`, { headers }).then((res) => res.json()).catch(() => []),
      fetch(`${apiBase}/api/threads`, { headers }).then((res) => res.json()).catch(() => []),
      fetch(`${apiBase}/api/admin/users`, { headers }).then((res) => res.json()).catch(() => []),
      fetch(`${apiBase}/api/admin/daily-checkins`, { headers }).then((res) => res.json()).catch(() => []),
      fetch(`${apiBase}/api/admin/workouts`, { headers }).then((res) => res.json()).catch(() => []),
      fetch(`${apiBase}/api/admin/pending-signups`, { headers }).then((res) => res.json()).catch(() => []),
      fetch(`${apiBase}/api/admin/sunday-checkins`, { headers }).then((res) => res.json()).catch(() => []),
      fetch(`${apiBase}/api/admin/part2-submissions`, { headers }).then((res) => res.json()).catch(() => []),
      fetch(`${apiBase}/api/meetings`, { headers }).then((res) => res.json()).catch(() => [])
    ])
      .then(([s, a, t, u, d, w, p, sun, p2, mt]) => {
        if (s?.error) setError(s.error);
        else setError("");
        setStats(s || null);
        setActivity(Array.isArray(a) ? a : []);
        setThreads(Array.isArray(t) ? t : []);
        setClients(Array.isArray(u) ? u : []);
        setDailyCheckins(Array.isArray(d) ? d : []);
        setWorkouts(Array.isArray(w) ? w : []);
        setPendingUsers(Array.isArray(p) ? p : []);
        setSundayCheckinsApi(Array.isArray(sun) ? sun : []);
        setPart2Submissions(Array.isArray(p2) ? p2 : []);
        setStaffMeetings(Array.isArray(mt) ? mt : []);
      })
      .catch(() => setError("Failed to load dashboard data."));
  }, [session?.token, session?.user?.id, role, apiBase]);

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
    const resync = () => {
      const s = getSession();
      if (s?.token) setSession(s);
    };
    const onVis = () => {
      if (document.visibilityState === "visible") resync();
    };
    window.addEventListener("pageshow", resync);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("storage", resync);
    return () => {
      window.removeEventListener("pageshow", resync);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("storage", resync);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !session?.token) return;
    const userRole = String(session.user.role || "").toLowerCase();
    if (userRole !== "admin") return;
    if (session.user.must_change_password === true) {
      window.location.replace("/change-password");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch(`${apiBase}/api/auth/me`, {
          headers: { Authorization: `Bearer ${session.token}` }
        });
        const d = await r.json();
        if (cancelled || !d || (d as { error?: string }).error) return;
        if ((d as { must_change_password?: boolean }).must_change_password === true) {
          const upd = normalizeFitbaseSession({
            token: session.token,
            id: session.user.id,
            email: session.user.email,
            role: session.user.role,
            first_name: session.user.first_name,
            last_name: session.user.last_name,
            profile_picture: session.user.profile_picture,
            trainer_id: session.user.trainer_id,
            country: session.user.country,
            timezone: session.user.timezone,
            must_change_password: true
          });
          if (upd) {
            writeFitbaseSessionObject(upd);
          }
          window.location.replace("/change-password");
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.token, session?.user?.role, session?.user?.must_change_password, apiBase]);

  useEffect(() => {
    const d = new Date();
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    setTodayLabel(`${days[d.getDay()]} · ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width:768px)");
    const fn = () => setUserWide768(mq.matches);
    fn();
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || role !== "user") return;
    const onBip = (e: Event) => {
      e.preventDefault();
      deferredPwaRef.current = e;
    };
    window.addEventListener("beforeinstallprompt", onBip);
    const mq = window.matchMedia("(display-mode: standalone)");
    const syncStandalone = () => {
      const iosStandalone = Boolean((navigator as unknown as { standalone?: boolean }).standalone);
      setUserShowPwaRow(!mq.matches && !iosStandalone);
    };
    syncStandalone();
    mq.addEventListener("change", syncStandalone);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      mq.removeEventListener("change", syncStandalone);
    };
  }, [role]);

  useEffect(() => {
    if (!session?.token || role !== "user") return;
    const uid = String(session.user?.id || "");
    if (!uid) return;
    const headers = { Authorization: `Bearer ${session.token}` };
    fetch(`${apiBase}/api/profile/${encodeURIComponent(uid)}`, { headers })
      .then((r) => r.json())
      .then((d) => {
        if (!d || d.error) return;
        setRemoteProfile(d);
        setProfPhone(String(d.phone || ""));
        setProfEmail(String(d.email || ""));
      })
      .catch(() => {});
  }, [session?.token, role, apiBase, session?.user?.id]);

  useEffect(() => {
    if (!session?.token || role !== "superadmin") return;
    void loadSuperadminDashboard();
  }, [session?.token, role, apiBase, loadSuperadminDashboard]);

  useEffect(() => {
    void reloadMainDashboardData();
  }, [reloadMainDashboardData]);

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
  }, [session?.token, role, apiBase]);

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
    const wantInsights =
      staffOverlay === "insights" ||
      (isTrainer && activeTab === "analytics" && trainerAnalyticsSub === "insights");
    if (!session?.token || !wantInsights || !isStaff) return;
    const headers = { Authorization: `Bearer ${session.token}` };
    const params = new URLSearchParams();
    params.set("source", perfInSource);
    if (perfInFrom) params.set("from", perfInFrom);
    if (perfInTo) params.set("to", perfInTo);
    if (perfInUserId) params.set("user_id", perfInUserId);
    setPerfInsightsLoading(true);
    fetch(`${apiBase}/api/admin/performance-insights?${params.toString()}`, { headers })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok || (d && typeof d === "object" && (d as { error?: string }).error)) {
          setPerfInsights(null);
          return;
        }
        setPerfInsights({
          summary: (d as { summary?: Record<string, number> }).summary || {},
          data: Array.isArray((d as { data?: unknown }).data) ? (d as { data: any[] }).data : [],
          source: String((d as { filters?: { source?: string } }).filters?.source || perfInSource || "all")
        });
      })
      .catch(() => setPerfInsights(null))
      .finally(() => setPerfInsightsLoading(false));
  }, [
    session,
    staffOverlay,
    isStaff,
    isTrainer,
    activeTab,
    trainerAnalyticsSub,
    apiBase,
    perfInSource,
    perfInFrom,
    perfInTo,
    perfInUserId,
    perfInsightsApplyTick
  ]);

  useEffect(() => {
    const wantCatalog = staffOverlay === "programs" || (isTrainer && activeTab === "programs");
    if (!session?.token || !wantCatalog || !isStaff) return;
    const headers = { Authorization: `Bearer ${session.token}` };
    fetch(`${apiBase}/api/admin/program-catalog`, { headers })
      .then((r) => r.json())
      .then((rows) => setProgramCatalog(Array.isArray(rows) ? rows : []))
      .catch(() => setProgramCatalog([]));
  }, [session, staffOverlay, isStaff, isTrainer, activeTab, apiBase]);

  async function selectStaffThreadRow(t: any) {
    const existingId = t?.id != null && String(t.id) !== "" ? String(t.id) : "";
    if (existingId) {
      setSelectedThreadId(existingId);
      return;
    }
    const trId = String(t?.trainer_user_id || t?.user_id || "").trim();
    if (!trId || !isSuperadminViewer || !session?.token) return;
    setOpsThreadOpening(trId);
    try {
      const r = await fetch(`${apiBase}/api/threads/ops/open`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.token}`
        },
        body: JSON.stringify({ trainer_user_id: trId })
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.id) return;
      setThreads((prev) =>
        prev.map((row: any) => {
          const ru = String(row.trainer_user_id || row.user_id || "");
          if (ru !== trId) return row;
          return {
            ...row,
            id: j.id,
            last_message: j.last_message ?? row.last_message,
            thread_kind: j.thread_kind || row.thread_kind || "ops"
          };
        })
      );
      setSelectedThreadId(String(j.id));
    } finally {
      setOpsThreadOpening("");
    }
  }

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
    setClientProgressShareUrl("");
    if (!session?.token || !user?.id || role === "user") return;
    const headers = { Authorization: `Bearer ${session.token}` };
    try {
      const r = await fetch(`${apiBase}/api/admin/user-progress/${encodeURIComponent(String(user.id))}`, { headers });
      const progress = await r.json().catch(() => ({}));
      if (!r.ok) {
        const err =
          typeof progress === "object" && progress != null
            ? String((progress as { error?: string; message?: string }).error || (progress as { message?: string }).message || "")
            : "";
        setClientProgress({ error: err || `Failed to load progress (${r.status})` });
        return;
      }
      if (typeof progress === "object" && progress != null && (progress as { error?: string }).error) {
        setClientProgress({ error: String((progress as { error?: string }).error) });
        return;
      }
      setClientProgress(typeof progress === "object" && progress != null ? progress : { error: "No data returned." });
    } catch {
      setClientProgress({ error: "Network error. Please try again." });
    }
  }

  async function generateClientProgressShareLink() {
    if (!session?.token || !selectedClient?.id) return;
    setClientProgressShareBusy(true);
    setClientProgressShareUrl("");
    try {
      const r = await fetch(`${apiBase}/api/admin/progress-report-link/${encodeURIComponent(String(selectedClient.id))}`, {
        headers: { Authorization: `Bearer ${session.token}` }
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || (data && typeof data === "object" && (data as { error?: string }).error)) {
        setError((data as { error?: string })?.error || "Could not create share link.");
        return;
      }
      const url =
        data && typeof data === "object"
          ? String((data as { url?: string; link?: string }).url || (data as { link?: string }).link || "")
          : "";
      setClientProgressShareUrl(url);
    } catch {
      setError("Could not create share link.");
    } finally {
      setClientProgressShareBusy(false);
    }
  }

  async function copyClientProgressShareUrl() {
    if (!clientProgressShareUrl) return;
    try {
      await navigator.clipboard.writeText(clientProgressShareUrl);
      setError("");
    } catch {
      setError("Could not copy to clipboard.");
    }
  }

  async function suspendSelectedClient() {
    if (!session?.token || !selectedClient?.id) return;
    setClientProgressUserBusy(true);
    try {
      const r = await fetch(`${apiBase}/api/admin/users/${encodeURIComponent(String(selectedClient.id))}/suspend`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.token}` }
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || (data as { error?: string }).error) throw new Error((data as { error?: string }).error || "Failed");
      setSelectedClient((c: any) => (c ? { ...c, suspended: true } : c));
      setClientProgress((p: any) => (p && typeof p === "object" ? { ...p, suspended: true } : p));
    } catch (e: any) {
      setError(e?.message || "Failed to suspend user.");
    } finally {
      setClientProgressUserBusy(false);
    }
  }

  async function reactivateSelectedClient() {
    if (!session?.token || !selectedClient?.id) return;
    setClientProgressUserBusy(true);
    try {
      const r = await fetch(`${apiBase}/api/admin/users/${encodeURIComponent(String(selectedClient.id))}/reactivate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.token}` }
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || (data as { error?: string }).error) throw new Error((data as { error?: string }).error || "Failed");
      setSelectedClient((c: any) => (c ? { ...c, suspended: false } : c));
      setClientProgress((p: any) => (p && typeof p === "object" ? { ...p, suspended: false } : p));
    } catch (e: any) {
      setError(e?.message || "Failed to re-activate user.");
    } finally {
      setClientProgressUserBusy(false);
    }
  }

  async function openCheckinDetail(checkin: any) {
    setSelectedCheckin(checkin || null);
    setSelectedSunday(null);
    setSelectedPart2(null);
    if (!session?.token || !checkin?.id || role === "user") return;
    const headers = { Authorization: `Bearer ${session.token}` };
    const data = await fetch(`${apiBase}/api/admin/daily-checkins/${encodeURIComponent(String(checkin.id))}`, { headers }).then((r) => r.json()).catch(() => null);
    if (data && !data.error) setSelectedCheckin(data);
  }

  async function openSundayDetail(row: any) {
    setSelectedSunday(row || null);
    setSelectedCheckin(null);
    setSelectedPart2(null);
    if (!session?.token || !row?.id || role === "user") return;
    const headers = { Authorization: `Bearer ${session.token}` };
    const data = await fetch(`${apiBase}/api/admin/sunday-checkins/${encodeURIComponent(String(row.id))}`, { headers }).then((r) => r.json()).catch(() => null);
    if (data && !(data as { error?: string }).error) setSelectedSunday(data);
    else if ((data as { error?: string })?.error) setError(String((data as { error?: string }).error));
  }

  async function openPart2Detail(row: any) {
    setSelectedPart2(row || null);
    setSelectedCheckin(null);
    setSelectedSunday(null);
    if (!session?.token || !row?.id || role === "user") return;
    const headers = { Authorization: `Bearer ${session.token}` };
    const data = await fetch(`${apiBase}/api/admin/part2-submissions/${encodeURIComponent(String(row.id))}`, { headers }).then((r) => r.json()).catch(() => null);
    if (data && !(data as { error?: string }).error) setSelectedPart2(data);
    else if ((data as { error?: string })?.error) setError(String((data as { error?: string }).error));
  }

  async function openWorkoutDetail(workout: any) {
    setSelectedWorkout(workout || null);
    if (!session?.token || !workout?.id || role === "user") return;
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
          city: newClient.city.trim(),
          country: newClient.country.trim(),
          timezone: newClient.timezone.trim()
        })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data?.error) throw new Error(data?.error || "Failed to create client.");
      setClients((prev) => [data, ...prev]);
      setNewClient({
        first_name: "",
        last_name: "",
        email: "",
        phone: "",
        city: "",
        country: "",
        timezone: "",
        password: ""
      });
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

  async function submitTrainerMeeting() {
    if (!session?.token || role === "user") return;
    const uid = trainerScheduleUserId.trim();
    if (!uid || !trainerMeetingDate || !trainerMeetingTime) {
      setError("Select a client, date, and time.");
      return;
    }
    const client = activeClients.find((x: any) => String(x.id) === uid) || clients.find((x: any) => String(x.id) === uid);
    const user_name = [client?.first_name, client?.last_name].filter(Boolean).join(" ").trim();
    setTrainerMeetingSubmitting(true);
    setError("");
    try {
      const r = await fetch(`${apiBase}/api/meetings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({
          user_id: uid,
          user_name,
          user_email: client?.email || "",
          user_phone: client?.phone || "",
          meeting_date: trainerMeetingDate,
          time_slot: trainerMeetingTime
        })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data?.error) throw new Error(data?.error || "Failed to schedule.");
      const rows = await fetch(`${apiBase}/api/meetings`, { headers: { Authorization: `Bearer ${session.token}` } })
        .then((res) => res.json())
        .catch(() => []);
      setStaffMeetings(Array.isArray(rows) ? rows : []);
      setTrainerMeetingDate("");
      setTrainerMeetingTime("");
    } catch (e: any) {
      setError(e?.message || "Failed to schedule meeting.");
    } finally {
      setTrainerMeetingSubmitting(false);
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
      if (session?.token && isStaff) {
        const rows = await fetch(`${apiBase}/api/meetings`, { headers: { Authorization: `Bearer ${session.token}` } })
          .then((r) => r.json())
          .catch(() => []);
        setStaffMeetings(Array.isArray(rows) ? rows : []);
      }
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
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.token}`
        },
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
      const rows = await fetch(`${apiBase}/api/workouts/${encodeURIComponent(String(uid))}`, {
        headers: { Authorization: `Bearer ${session.token}` }
      })
        .then((x) => x.json())
        .catch(() => []);
      setWorkouts(Array.isArray(rows) ? rows : []);
      refreshUserTodayAndStreak();
    } catch (e2: any) {
      setError(e2?.message || "Failed to log workout.");
    } finally {
      setWkSubmitting(false);
    }
  }

  async function loadUserProfileFromApi() {
    const uid = session?.user?.id;
    if (!session?.token || !uid || role !== "user") return;
    setProfEmailErr("");
    setProfileSaveOk(false);
    const r = await fetch(`${apiBase}/api/profile/${encodeURIComponent(String(uid))}`, {
      headers: { Authorization: `Bearer ${session.token}` }
    });
    const d = await r.json().catch(() => null);
    if (d && !d.error) {
      setRemoteProfile(d);
      setProfPhone(String(d.phone || ""));
      setProfEmail(String(d.email || ""));
    }
    setPendingAvatar(null);
  }

  async function loadTrainerProfileFromApi() {
    const uid = session?.user?.id;
    if (!session?.token || !uid || role !== "admin") return;
    setProfEmailErr("");
    setProfileSaveOk(false);
    const r = await fetch(`${apiBase}/api/profile/${encodeURIComponent(String(uid))}`, {
      headers: { Authorization: `Bearer ${session.token}` }
    });
    const d = await r.json().catch(() => null);
    if (d && !d.error) {
      setRemoteProfile(d);
      setProfPhone(String(d.phone || ""));
      setProfEmail(String(d.email || ""));
      setTrainerProfCountry(String(d.country || ""));
      setTrainerProfTimezone(String(d.timezone || ""));
    }
    setPendingAvatar(null);
  }

  async function saveUserProfile() {
    const uid = session?.user?.id;
    if (!session?.token || !uid || role !== "user") return;
    setProfEmailErr("");
    setProfileSaveOk(false);
    const emailVal = profEmail.trim();
    if (emailVal && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
      setProfEmailErr("Please enter a valid email address");
      return;
    }
    setProfileSaving(true);
    const body: Record<string, string> = {
      first_name: String(remoteProfile?.first_name ?? session?.user?.first_name ?? ""),
      last_name: String(remoteProfile?.last_name ?? session?.user?.last_name ?? ""),
      phone: profPhone.trim(),
      email: emailVal
    };
    if (pendingAvatar) body.profile_picture = pendingAvatar;
    try {
      const r = await fetch(`${apiBase}/api/profile/${encodeURIComponent(String(uid))}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.token}`
        },
        body: JSON.stringify(body)
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setProfEmailErr(String(data?.error || data?.message || "Update failed"));
        return;
      }
      const pic = pendingAvatar || remoteProfile?.profile_picture || session?.user?.profile_picture || "";
      setPendingAvatar(null);
      setProfileSaveOk(true);
      setSession((prev) => {
        if (!prev) return prev;
        const next: Session = {
          ...prev,
          user: {
            ...prev.user,
            email: emailVal || prev.user.email,
            first_name: body.first_name,
            last_name: body.last_name,
            ...(pic ? { profile_picture: String(pic) } : {})
          }
        };
        writeFitbaseSessionObject(next);
        return next;
      });
      setRemoteProfile((p) => ({ ...(p || {}), ...body, profile_picture: String(pic || p?.profile_picture || "") }));
    } finally {
      setProfileSaving(false);
    }
  }

  async function saveTrainerProfile() {
    const uid = session?.user?.id;
    if (!session?.token || !uid || role !== "admin") return;
    setProfEmailErr("");
    setProfileSaveOk(false);
    const emailVal = profEmail.trim();
    if (emailVal && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
      setProfEmailErr("Please enter a valid email address");
      return;
    }
    setProfileSaving(true);
    const body: Record<string, string> = {
      phone: profPhone.trim(),
      email: emailVal,
      country: trainerProfCountry.trim(),
      timezone: trainerProfTimezone.trim()
    };
    if (pendingAvatar) body.profile_picture = pendingAvatar;
    try {
      const r = await fetch(`${apiBase}/api/profile/${encodeURIComponent(String(uid))}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.token}`
        },
        body: JSON.stringify(body)
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setProfEmailErr(String(data?.error || data?.message || "Update failed"));
        return;
      }
      const pic = pendingAvatar || remoteProfile?.profile_picture || session?.user?.profile_picture || "";
      setPendingAvatar(null);
      setProfileSaveOk(true);
      setSession((prev) => {
        if (!prev) return prev;
        const next: Session = {
          ...prev,
          user: {
            ...prev.user,
            email: emailVal || prev.user.email,
            country: trainerProfCountry.trim(),
            timezone: trainerProfTimezone.trim(),
            ...(pic ? { profile_picture: String(pic) } : {})
          }
        };
        writeFitbaseSessionObject(next);
        return next;
      });
      setRemoteProfile((p) => ({
        ...(p || {}),
        phone: body.phone,
        email: emailVal,
        country: body.country,
        timezone: body.timezone,
        profile_picture: String(pic || p?.profile_picture || "")
      }));
    } finally {
      setProfileSaving(false);
    }
  }

  function handleProfileAvatarUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || activeTab !== "profile") return;
    if (role !== "user" && role !== "admin") return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const m = dataUrl.match(/^data:image\/[\w+.-]+;base64,(.+)$/);
      const b64 = m ? m[1] : "";
      const approx = b64 ? Math.floor((b64.length * 3) / 4) : 0;
      if (approx > 5 * 1024 * 1024) {
        setError("Profile photo must be 5 MB or smaller.");
        return;
      }
      setPendingAvatar(dataUrl);
      setError("");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  useEffect(() => {
    if (activeTab !== "profile" || !session?.token || !session?.user?.id) return;
    if (role === "user") void loadUserProfileFromApi();
    else if (role === "admin") void loadTrainerProfileFromApi();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load on tab + role only
  }, [activeTab, role, session?.token, session?.user?.id]);

  function handlePwaAddToHomescreenUser() {
    if (typeof window === "undefined") return;
    const iosStandalone = Boolean((navigator as unknown as { standalone?: boolean }).standalone);
    if (window.matchMedia("(display-mode: standalone)").matches || iosStandalone) return;
    const e = deferredPwaRef.current;
    if (e && typeof e.prompt === "function") {
      void e.prompt();
      if (e.userChoice) {
        void e.userChoice.then(() => {
          deferredPwaRef.current = null;
        });
      }
      return;
    }
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
      window.alert("On iPhone: tap Share, then Add to Home Screen.");
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
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.token}`
        },
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
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.token}`
        },
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
    if (!session?.token) return;
    setSuperadminQueueBusy(`${requestId}-ta`);
    setError("");
    try {
      const r = await fetch(`${apiBase}/api/admin/trainers/${encodeURIComponent(requestId)}/approve`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${session.token}` }
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || (data as { error?: string }).error) {
        throw new Error((data as { error?: string }).error || "Approve failed");
      }
      const tr = (data as { trainer?: Record<string, string> }).trainer;
      if (tr?.temp_password && tr?.trainer_code) {
        const loginUrl = String(tr.login_url || `${typeof window !== "undefined" ? window.location.origin : ""}/login`);
        setSuperadminTrainerCredModal({
          full_name: String(tr.full_name || ""),
          email: String(tr.email || ""),
          temp_password: String(tr.temp_password || ""),
          trainer_code: String(tr.trainer_code || ""),
          login_url: loginUrl
        });
      }
      await refreshSuperadminQueues();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setSuperadminQueueBusy("");
    }
  }

  async function superadminRejectTrainerRequestRow(requestId: string) {
    if (typeof window !== "undefined" && !window.confirm("Reject this trainer request?")) return;
    const reason =
      typeof window !== "undefined" ? window.prompt("Optional rejection reason (visible in admin tools):", "") : "";
    if (reason === null) return;
    if (!session?.token) return;
    setSuperadminQueueBusy(`${requestId}-tr`);
    setError("");
    try {
      const r = await fetch(`${apiBase}/api/admin/trainers/${encodeURIComponent(requestId)}/reject`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ reason: String(reason || "").trim() || undefined })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || (data as { error?: string }).error) {
        throw new Error((data as { error?: string }).error || "Reject failed");
      }
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
    line: "var(--border)",
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
    setTrainerAnalyticsSub(null);
    setTrainerNavOpen(false);
    if (id !== activeTab) {
      setTrainerMessagesView("hub");
      if (id === "clients") {
        setTrainerClientsView(role === "superadmin" ? "roster" : "hub");
        setSuperadminPortfolioTrainerId(null);
        setTrainerFormsView("hub");
      } else if (id === "forms") {
      setTrainerClientsView("hub");
        setSuperadminPortfolioTrainerId(null);
        setTrainerFormsView(role === "superadmin" ? "daily" : "hub");
      } else {
        setTrainerClientsView("hub");
        setSuperadminPortfolioTrainerId(null);
      setTrainerFormsView("hub");
    }
    }
    if (role === "user" && id === "forms") setUserCheckinView("hub");
    setActiveTab(id);
  }

  /** Navigate the Super Admin to a specific SA tab. */
  function goSaTab(tab: "overview" | "applications" | "trainers" | "members" | "enterprise") {
    setSaTab(tab);
    setStaffAiOpen(false);
    setStaffOverlay(null);
    setTrainerMessagesView("hub");
    if (tab === "trainers") {
      setActiveTab("clients");
      setTrainerClientsView("coachPortfolio");
      setSuperadminPortfolioTrainerId(null);
    } else if (tab === "members") {
      setActiveTab("clients");
      setTrainerClientsView("roster");
      setSuperadminPortfolioTrainerId(null);
    } else {
      setActiveTab("home");
      setTrainerClientsView("roster");
      setSuperadminPortfolioTrainerId(null);
    }
  }

  function userNavigateDesktop(target: UserDesktopNavTarget) {
    switch (target) {
      case "workout":
        goTab("clients");
        break;
      case "progress":
        goTab("progress");
        break;
      case "sunday":
        goTab("forms");
        setUserCheckinView("sunday");
        break;
      case "messages":
        goTab("messages");
        break;
      case "contact":
        goTab("contact");
        break;
      case "formsHub":
        goTab("forms");
        setUserCheckinView("hub");
        break;
      default:
        goTab("home");
    }
  }

  function applyInboxLink(link: string | null | undefined) {
    setNotifOpen(false);
    const l = String(link || "");
    if (!l) return;
    if (l === "messages") {
      goTab("messages");
      setTrainerMessagesView("threads");
      return;
    }
    if (l === "meetings") {
      goTab("messages");
      setTrainerMessagesView("meetings");
      return;
    }
    if (l === "messages-meetings") {
      goTab("messages");
      setTrainerMessagesView("hub");
      return;
    }
    if (l === "signups" || l === "requests") {
      goTab("clients");
      setTrainerClientsView("pending");
      return;
    }
    if (l === "sundaycheckin") {
      goTab("forms");
      setTrainerFormsView("sunday");
      return;
    }
    if (l === "dailycheckin") {
      goTab("forms");
      setTrainerFormsView("daily");
      return;
    }
    if (l === "clientprogress") {
      goTab("clients");
      setTrainerClientsView("progress");
      return;
    }
    if (l === "workouts") {
      if (role === "admin") goTab("training");
      else goTab("home");
      return;
    }
    if (l === "programs") {
      goTab("programs");
      return;
    }
    if (l === "part2") {
      goTab("forms");
      setTrainerFormsView("part2");
      return;
    }
    goTab("home");
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

  const timerHr = String(Math.floor(timerSeconds / 3600)).padStart(2, "0");
  const timerMin = String(Math.floor((timerSeconds % 3600) / 60)).padStart(2, "0");
  const timerSec = String(timerSeconds % 60).padStart(2, "0");
  const weeklyRecap = userStreak?.weekly || {};

  const { userSecTitle, userSecSub } = useMemo(() => {
    if (role !== "user") return { userSecTitle: "", userSecSub: "" };
    const SUB: Partial<Record<DashboardTab, string>> = {
      home: "Your dashboard and daily actions in one place.",
      clients: "Log sessions and review recent training history.",
      programs: "Programs assigned by your lifestyle manager.",
      progress: "Track body metrics and keep every entry visible.",
      forms: "Daily check-in, Sunday check-in, or My progress.",
      messages: userTrainerChatDisplayName
        ? `Chat with ${userTrainerChatDisplayName} in one thread.`
        : "Message your coach in one clean thread.",
      profile: "Keep your personal and contact details up to date.",
      contact: "Schedule calls or send support requests quickly."
    };
    const LAB: Partial<Record<DashboardTab, string>> = {
      home: "Home",
      clients: "My Workout",
      programs: "My Programs",
      progress: "My Progress",
      forms: "Check-in",
      messages: "Messages",
      profile: "My Profile",
      contact: "Contact Us"
    };
    if (activeTab === "forms" && userCheckinView === "daily") {
      return { userSecTitle: "Daily Check-in", userSecSub: "Log steps, water, protein & sleep for today" };
    }
    if (activeTab === "forms" && userCheckinView === "sunday") {
      return { userSecTitle: "Sunday Check-in", userSecSub: "Complete your weekly review form" };
    }
    if (activeTab === "forms" && userCheckinView === "progress") {
      return {
        userSecTitle: "My Progress",
        userSecSub: "Log metrics by date and view your analytics"
      };
    }
    return {
      userSecTitle: LAB[activeTab] || "Home",
      userSecSub: SUB[activeTab] || SUB.home || ""
    };
  }, [role, activeTab, userCheckinView, userTrainerChatDisplayName]);

  const userWelcomeAvatarSrc = useMemo(() => {
    const p = pendingAvatar || remoteProfile?.profile_picture || session?.user?.profile_picture || "";
    if (!p) return "";
    if (p.startsWith("data:") || p.startsWith("http://") || p.startsWith("https://")) return p;
    const base = String(apiBase).replace(/\/+$/, "");
    return `${base}${p.startsWith("/") ? p : `/${p}`}`;
  }, [pendingAvatar, remoteProfile?.profile_picture, session?.user?.profile_picture, apiBase]);

  async function refetchAdminList(path: string, f: AdminListFilter, setRows: (rows: any[]) => void) {
    if (!session?.token) return;
    const q = new URLSearchParams();
    if (f.from.trim()) q.set("from", f.from.trim());
    if (f.to.trim()) q.set("to", f.to.trim());
    if (f.search.trim()) q.set("search", f.search.trim());
    const url = `${apiBase}${path}${q.toString() ? `?${q.toString()}` : ""}`;
    const data = await fetch(url, { headers: { Authorization: `Bearer ${session.token}` } }).then((r) => r.json());
    setRows(Array.isArray(data) ? data : []);
  }

  function AdminListFiltersBar(props: {
    filter: AdminListFilter;
    onPatch: (p: Partial<AdminListFilter>) => void;
    onApply: () => void;
    onClear: () => void;
    onCsv?: () => void;
    searchPlaceholder: string;
  }) {
    const f = props.filter;
  return (
      <div
        className="bb-admin-filter-bar"
        style={{
          marginBottom: 14,
          padding: 12,
          border: "1px solid var(--border)",
          borderRadius: 12,
          background: "color-mix(in srgb, var(--text-primary) 4%, var(--bg-primary))"
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, alignItems: "end" }}>
          <div>
            <span className="bb-list-row-sub" style={{ display: "block", marginBottom: 4 }}>
              From
            </span>
            <input type="date" className="bb-input" value={f.from} onChange={(e) => props.onPatch({ from: e.target.value })} />
          </div>
          <div>
            <span className="bb-list-row-sub" style={{ display: "block", marginBottom: 4 }}>
              To
            </span>
            <input type="date" className="bb-input" value={f.to} onChange={(e) => props.onPatch({ to: e.target.value })} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <span className="bb-list-row-sub" style={{ display: "block", marginBottom: 4 }}>
              Search
            </span>
            <input
              type="search"
              className="bb-input"
              placeholder={props.searchPlaceholder}
              value={f.search}
              onChange={(e) => props.onPatch({ search: e.target.value })}
              autoComplete="off"
            />
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          <button type="button" className="bb-btn-primary" onClick={props.onApply}>
            Apply
          </button>
          <button type="button" className="bb-back-btn" style={{ marginBottom: 0 }} onClick={props.onClear}>
            Clear
          </button>
          {props.onCsv ? (
            <button type="button" className="bb-back-btn" style={{ marginBottom: 0 }} onClick={props.onCsv}>
              Download CSV
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  function downloadPerfInsightsCsv() {
    const day = new Date().toISOString().slice(0, 10);
    const source = String(perfInsights?.source || perfInSource || "all").toLowerCase();
    const data = Array.isArray(perfInsights?.data) ? perfInsights!.data! : [];
    if (!data.length) {
      if (perfInsights?.summary && Object.keys(perfInsights.summary).length) {
        downloadCsvFile(
          `performance-insights-summary-${day}.csv`,
          [
            { key: "metric", header: "Metric" },
            { key: "value", header: "Value" }
          ],
          Object.entries(perfInsights.summary).map(([metric, value]) => ({ metric, value: String(value) }))
        );
      }
      return;
    }
    let columns: { key: string; header: string }[] = [];
    let out: Record<string, unknown>[] = [];
    if (source === "all" || source === "overview") {
      columns = [
        { key: "type", header: "Type" },
        { key: "details", header: "Details" },
        { key: "date", header: "Date" }
      ];
      out = data.map((r: any) => ({
        type: PERF_INSIGHT_TYPE_LABELS[r._source] || r._source || "—",
        details: perfInsightsOverviewDetail(r) || "—",
        date: (r._date || r.created_at) ? new Date(String(r._date || r.created_at)).toLocaleString() : "—"
      }));
    } else if (source === "workouts") {
      columns = [
        { key: "user", header: "User" },
        { key: "workout", header: "Workout" },
        { key: "dur", header: "Duration (min)" },
        { key: "date", header: "Date" }
      ];
      out = data.map((r: any) => ({
        user: [r.first_name, r.last_name].filter(Boolean).join(" ").trim(),
        workout: r.workout_name || "",
        dur: r.duration_seconds != null ? Math.round(Number(r.duration_seconds) / 60) : "",
        date: r.created_at ? new Date(String(r.created_at)).toISOString() : ""
      }));
    } else if (source === "sunday_checkin") {
      columns = [
        { key: "name", header: "Name" },
        { key: "email", header: "Reply Email" },
        { key: "plan", header: "Plan" },
        { key: "loss", header: "Total Weight Loss" },
        { key: "date", header: "Date" }
      ];
      out = data.map((r: any) => ({
        name: r.full_name || "",
        email: r.reply_email || "",
        plan: r.plan || "",
        loss: r.total_weight_loss || "",
        date: r.created_at ? new Date(String(r.created_at)).toISOString() : ""
      }));
    } else if (source === "audit") {
      columns = [
        { key: "first_name", header: "First Name" },
        { key: "last_name", header: "Last Name" },
        { key: "email", header: "Email" },
        { key: "city", header: "City" },
        { key: "goals", header: "Goals" },
        { key: "status", header: "Status" },
        { key: "date", header: "Date" }
      ];
      out = data.map((r: any) => ({
        first_name: r.first_name || "",
        last_name: r.last_name || "",
        email: r.email || "",
        city: r.city || "",
        goals: String(r.goals || "").slice(0, 200),
        status: r.status || "",
        date: r.created_at ? new Date(String(r.created_at)).toISOString() : ""
      }));
    } else if (source === "part2") {
      columns = [
        { key: "name", header: "Name" },
        { key: "email", header: "Email" },
        { key: "mobile", header: "Mobile" },
        { key: "activity", header: "Activity Level" },
        { key: "date", header: "Date" }
      ];
      out = data.map((r: any) => ({
        name: r.name || "",
        email: r.email || "",
        mobile: r.mobile || "",
        activity: r.activity_level || "",
        date: r.created_at ? new Date(String(r.created_at)).toISOString() : ""
      }));
    } else if (source === "meetings") {
      columns = [
        { key: "user_name", header: "User Name" },
        { key: "user_email", header: "Email" },
        { key: "user_phone", header: "Phone" },
        { key: "meeting_date", header: "Meeting Date" },
        { key: "time_slot", header: "Time Slot" },
        { key: "date", header: "Date" }
      ];
      out = data.map((r: any) => ({
        user_name: r.user_name || "",
        user_email: r.user_email || "",
        user_phone: r.user_phone || "",
        meeting_date: r.meeting_date || "",
        time_slot: r.time_slot || "",
        date: r.created_at ? new Date(String(r.created_at)).toISOString() : ""
      }));
    } else if (source === "messages") {
      columns = [
        { key: "name", header: "Name" },
        { key: "email", header: "Email" },
        { key: "phone", header: "Phone" },
        { key: "message", header: "Message" },
        { key: "date", header: "Date" }
      ];
      out = data.map((r: any) => ({
        name: r.name || "",
        email: r.email || "",
        phone: r.phone || "",
        message: String(r.message || "").slice(0, 500),
        date: r.created_at ? new Date(String(r.created_at)).toISOString() : ""
      }));
    } else {
      const keys = Object.keys(data[0] as object);
      columns = keys.map((k) => ({ key: k, header: k }));
      out = data as Record<string, unknown>[];
    }
    const slug = source === "all" || source === "overview" ? "overview" : source;
    downloadCsvFile(`performance-insights-${slug}-${day}.csv`, columns, out);
  }

  const perfInsightData = Array.isArray(perfInsights?.data) ? perfInsights.data : [];
  const perfInsightSummary = perfInsights?.summary || {};
  const { head: perfTableHead, rows: perfTableRows } = renderPerfInsightsTableBody(perfInSource, perfInsightData);

  const performanceInsightsPanel = (
    <div className="bb-panel bb-insights-panel">
      <div className="bb-insights-filters">
        <div className="bb-insights-field" style={{ flex: "1 1 160px" }}>
          <label className="bb-insights-label" htmlFor="perf-in-source">
            Data source
          </label>
          <select
            id="perf-in-source"
            className="bb-input"
            value={perfInSource}
            onChange={(e) => setPerfInSource(e.target.value)}
            style={{ cursor: "pointer" }}
          >
            <option value="all">All (Overview)</option>
            <option value="workouts">Workouts</option>
            <option value="sunday_checkin">Sunday Check-in</option>
            <option value="audit">Body Audit</option>
            <option value="part2">Part-2 Form</option>
            <option value="meetings">Meetings</option>
            <option value="messages">Messages</option>
          </select>
        </div>
        <div className="bb-insights-field" style={{ flex: "0 1 140px" }}>
          <label className="bb-insights-label" htmlFor="perf-in-from">
            From
          </label>
          <input id="perf-in-from" type="date" className="bb-input" value={perfInFrom} onChange={(e) => setPerfInFrom(e.target.value)} />
        </div>
        <div className="bb-insights-field" style={{ flex: "0 1 140px" }}>
          <label className="bb-insights-label" htmlFor="perf-in-to">
            To
          </label>
          <input id="perf-in-to" type="date" className="bb-input" value={perfInTo} onChange={(e) => setPerfInTo(e.target.value)} />
        </div>
        <div className="bb-insights-field" style={{ flex: "1 1 200px" }}>
          <label className="bb-insights-label" htmlFor="perf-in-user">
            User
          </label>
          <select
            id="perf-in-user"
            className="bb-input"
            value={perfInUserId}
            onChange={(e) => setPerfInUserId(e.target.value)}
            style={{ cursor: "pointer" }}
          >
            <option value="">All users</option>
            {activeClients.map((u: any) => (
              <option key={String(u.id)} value={String(u.id)}>
                {[u.first_name, u.last_name].filter(Boolean).join(" ").trim() || "—"} — {u.email || ""}
              </option>
            ))}
          </select>
        </div>
        <div className="bb-insights-actions">
          <button type="button" className="bb-btn-primary" onClick={() => setPerfInsightsApplyTick((t) => t + 1)}>
            Apply
          </button>
          <button type="button" className="bb-back-btn" style={{ marginBottom: 0 }} onClick={() => downloadPerfInsightsCsv()}>
            Download CSV
          </button>
        </div>
      </div>
      <div className="bb-insights-cards">
        {BB_PERF_INSIGHT_CARD_KEYS.map((key) => (
          <div key={key} className="bb-insights-card">
            <div className="bb-insights-card-num">{perfInsightSummary[key as string] ?? 0}</div>
            <div className="bb-insights-card-lbl">{PERF_INSIGHT_LABELS[key as string] || String(key).replace(/_/g, " ")}</div>
          </div>
        ))}
      </div>
      {perfInsightsLoading ? (
        <p className="bb-live-empty">Loading insights…</p>
      ) : perfInsights == null ? (
        <p className="bb-live-empty" style={{ color: "var(--red)" }}>
          Failed to load insights.
        </p>
      ) : (
        <div className="bb-admin-table-wrap">
          <table className="bb-admin-table">
            <thead>
              <tr>
                {perfTableHead.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {perfTableRows.length ? (
                perfTableRows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci}>{cell}</td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={Math.max(perfTableHead.length, 1)} style={{ textAlign: "center", padding: 24, color: "var(--text-secondary)" }}>
                    No data for the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const campGrouped: Record<string, any[]> = {};
  for (const c of campaigns) {
    const d = String(c.day_of_week || "other");
    if (!campGrouped[d]) campGrouped[d] = [];
    campGrouped[d].push(c);
  }
  const campTotal = campaigns.length;
  const campActive = campaigns.filter((c: any) => c.is_active).length;

  const campaignsPanel = (
    <div className="bb-panel bb-campaigns-panel">
      <h3 className="bb-campaigns-h3">Campaign Scheduler</h3>
      <p className="bb-list-row-sub" style={{ marginBottom: 16, lineHeight: 1.5 }}>
        Automated weekly broadcast messages sent to all active users via inbox (and chat). Timezone: <strong>IST (Asia/Kolkata)</strong>.
      </p>
      {campMsg ? (
        <p className="bb-list-row-sub" style={{ marginBottom: 12, color: "var(--green)", fontWeight: 600 }}>
          {campMsg}
        </p>
      ) : null}
      {campaignsErr ? (
        <p className="bb-list-row-sub" style={{ marginBottom: 12, color: "var(--red)" }}>
          {campaignsErr}
        </p>
      ) : null}

      <div className="bb-campaign-ai-box">
        <div className="bb-campaign-ai-title">{String.fromCodePoint(0x1f916)} AI Campaign Command</div>
        <div className="bb-campaign-ai-row">
          <textarea
            className="bb-input bb-campaign-ai-textarea"
            rows={2}
            placeholder='Try: "Create reminder campaign: Hydrate well every monday at 2 PM" or "List campaigns"'
            value={campAiInput}
            onChange={(e) => setCampAiInput(e.target.value)}
          />
          <button
            type="button"
            className="bb-btn-primary"
            disabled={campAiSending || !session?.token}
            onClick={() => {
              const text = campAiInput.trim();
              if (!text || !session?.token) return;
              setCampAiSending(true);
              setCampAiReply("");
              void (async () => {
                try {
                  const r = await fetch(`${apiBase}/api/admin/ai-assist`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ message: text })
                  });
                  const d = await r.json().catch(() => ({}));
                  setCampAiReply(typeof d?.reply === "string" ? d.reply : "No response.");
                  setCampAiInput("");
                  if (/create|pause|resume|delete|list/i.test(text)) void loadCampaigns();
                } catch {
                  setCampAiReply("Error: Failed to send command.");
                } finally {
                  setCampAiSending(false);
                }
              })();
            }}
          >
            {campAiSending ? "…" : "Send"}
          </button>
        </div>
        {campAiReply ? <div className="bb-campaign-ai-reply">{campAiReply}</div> : null}
      </div>

      <div style={{ marginBottom: 24 }}>
        <div className="bb-campaigns-subtitle">Broadcast Now</div>
        <div className="bb-campaign-ai-row">
          <input
            type="text"
            className="bb-input"
            placeholder="Type an instant message to all active users…"
            value={campBroadcastMsg}
            onChange={(e) => setCampBroadcastMsg(e.target.value)}
          />
          <button
            type="button"
            className="bb-btn-primary"
            disabled={campBroadcasting || !session?.token}
            onClick={() => {
              const msg = campBroadcastMsg.trim();
              if (!msg || !session?.token) return;
              setCampBroadcasting(true);
              setCampaignsErr("");
              void (async () => {
                try {
                  const r = await fetch(`${apiBase}/api/campaigns/broadcast`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ message: msg })
                  });
                  const d = await r.json().catch(() => ({}));
                  if (d?.error) {
                    setCampaignsErr(String(d.error));
                    return;
                  }
                  setCampBroadcastMsg("");
                  setCampMsg(`Broadcast sent to ${Number(d?.sent ?? 0)} active user(s).`);
                  window.setTimeout(() => setCampMsg(""), 5000);
                } catch {
                  setCampaignsErr("Broadcast failed.");
                } finally {
                  setCampBroadcasting(false);
                }
              })();
            }}
          >
            {campBroadcasting ? "…" : "Broadcast"}
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div className="bb-campaigns-subtitle">Add Campaign</div>
        <div className="bb-campaign-add-row">
          <div className="bb-insights-field" style={{ flex: 2, minWidth: 160 }}>
            <label className="bb-insights-label" htmlFor="camp-msg">
              Message
            </label>
            <input
              id="camp-msg"
              type="text"
              className="bb-input"
              placeholder="e.g. Hydrate well! 💧"
              value={campNewMessage}
              onChange={(e) => setCampNewMessage(e.target.value)}
            />
          </div>
          <div className="bb-insights-field" style={{ flex: 1, minWidth: 120 }}>
            <label className="bb-insights-label" htmlFor="camp-day">
              Day
            </label>
            <select id="camp-day" className="bb-input" value={campNewDay} onChange={(e) => setCampNewDay(e.target.value)} style={{ cursor: "pointer" }}>
              <option value="">Select day</option>
              <option value="daily">Daily (every day)</option>
              <option value="sunday">Sunday</option>
              <option value="monday">Monday</option>
              <option value="tuesday">Tuesday</option>
              <option value="wednesday">Wednesday</option>
              <option value="thursday">Thursday</option>
              <option value="friday">Friday</option>
              <option value="saturday">Saturday</option>
            </select>
          </div>
          <div className="bb-insights-field" style={{ flex: 1, minWidth: 110 }}>
            <label className="bb-insights-label" htmlFor="camp-time">
              Time (IST)
            </label>
            <input id="camp-time" type="time" className="bb-input" value={campNewTime} onChange={(e) => setCampNewTime(e.target.value)} />
          </div>
          <button
            type="button"
            className="bb-btn-primary"
            style={{ alignSelf: "flex-end" }}
            disabled={campAdding || !session?.token}
            onClick={() => {
              if (!session?.token) return;
              if (!campNewMessage.trim() || !campNewDay || !campNewTime) {
                setCampaignsErr("Please fill in message, day, and time.");
                return;
              }
              setCampAdding(true);
              setCampaignsErr("");
              void (async () => {
                try {
                  const r = await fetch(`${apiBase}/api/campaigns`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" },
                    body: JSON.stringify({
                      message: campNewMessage.trim(),
                      day_of_week: campNewDay,
                      time_of_day: campNewTime
                    })
                  });
                  const d = await r.json().catch(() => ({}));
                  if (d?.error) {
                    setCampaignsErr(String(d.error));
                    return;
                  }
                  setCampNewMessage("");
                  setCampNewDay("");
                  setCampNewTime("");
                  setCampMsg("Campaign added. It will broadcast at the scheduled time (IST).");
                  window.setTimeout(() => setCampMsg(""), 4000);
                  await loadCampaigns();
                } catch {
                  setCampaignsErr("Failed to add campaign.");
                } finally {
                  setCampAdding(false);
                }
              })();
            }}
          >
            {campAdding ? "…" : "Add"}
          </button>
        </div>
      </div>

      <div className="bb-campaigns-subtitle">
        All Campaigns{" "}
        <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 400, letterSpacing: 0, textTransform: "none" }}>
          ({campTotal} total, {campActive} active)
        </span>
      </div>
      {campaignsLoading ? (
        <p className="bb-live-empty">Loading…</p>
      ) : campTotal === 0 ? (
        <p className="bb-live-empty">No campaigns yet. Use the form above to add one.</p>
      ) : (
        <div style={{ maxWidth: 760 }}>
          {CAMP_DAYS_ORDER.map((day) => {
            const items = campGrouped[day];
            if (!items?.length) return null;
            return (
              <div key={day} style={{ marginBottom: 18 }}>
                <div className="bb-campaign-day-h">
                  {day.charAt(0).toUpperCase() + day.slice(1)}
                </div>
                {items.map((c: any) => {
                  const active = !!c.is_active;
                  const busy = campBusyId === c.id;
                  return (
                    <div key={String(c.id)} className="bb-campaign-row">
                      <span style={{ fontSize: 18 }}>{active ? "🟢" : "🔴"}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)", minWidth: 44 }}>{c.time_of_day}</span>
                      <span style={{ flex: 1, fontSize: 14, color: "var(--text-primary)", wordBreak: "break-word" }}>{c.message}</span>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {active ? (
                          <button
                            type="button"
                            className="bb-back-btn"
                            style={{ marginBottom: 0, padding: "6px 12px", fontSize: 12 }}
                            disabled={busy}
                            onClick={() => {
                              if (!session?.token) return;
                              setCampBusyId(String(c.id));
                              void (async () => {
                                try {
                                  const r = await fetch(`${apiBase}/api/campaigns/${encodeURIComponent(String(c.id))}/pause`, {
                                    method: "POST",
                                    headers: { Authorization: `Bearer ${session.token}` }
                                  });
                                  const d = await r.json().catch(() => ({}));
                                  if (d?.error) setCampaignsErr(String(d.error));
                                  await loadCampaigns();
                                } catch {
                                  setCampaignsErr("Failed to pause.");
                                } finally {
                                  setCampBusyId("");
                                }
                              })();
                            }}
                          >
                            Pause
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="bb-btn-primary"
                            style={{ padding: "6px 12px", fontSize: 12 }}
                            disabled={busy}
                            onClick={() => {
                              if (!session?.token) return;
                              setCampBusyId(String(c.id));
                              void (async () => {
                                try {
                                  const r = await fetch(`${apiBase}/api/campaigns/${encodeURIComponent(String(c.id))}/resume`, {
                                    method: "POST",
                                    headers: { Authorization: `Bearer ${session.token}` }
                                  });
                                  const d = await r.json().catch(() => ({}));
                                  if (d?.error) setCampaignsErr(String(d.error));
                                  await loadCampaigns();
                                } catch {
                                  setCampaignsErr("Failed to resume.");
                                } finally {
                                  setCampBusyId("");
                                }
                              })();
                            }}
                          >
                            Resume
                          </button>
                        )}
                        <button
                          type="button"
                          className="bb-back-btn"
                          style={{
                            marginBottom: 0,
                            padding: "6px 12px",
                            fontSize: 12,
                            borderColor: "var(--red)",
                            color: "var(--red)"
                          }}
                          disabled={busy}
                          onClick={() => {
                            if (!confirm("Delete this campaign? This cannot be undone.")) return;
                            if (!session?.token) return;
                            setCampBusyId(String(c.id));
                            void (async () => {
                              try {
                                const r = await fetch(`${apiBase}/api/campaigns/${encodeURIComponent(String(c.id))}`, {
                                  method: "DELETE",
                                  headers: { Authorization: `Bearer ${session.token}` }
                                });
                                const d = await r.json().catch(() => ({}));
                                if (d?.error) setCampaignsErr(String(d.error));
                                await loadCampaigns();
                              } catch {
                                setCampaignsErr("Failed to delete.");
                              } finally {
                                setCampBusyId("");
                              }
                            })();
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const trainerNavDefs: { t: DashboardTab; label: string; ic: string }[] = [
    { t: "home", label: "Dashboard", ic: String.fromCodePoint(0x1f4ca) },
    { t: "profile", label: "Profile", ic: String.fromCodePoint(0x1f464) },
    { t: "clients", label: "Clients", ic: String.fromCodePoint(0x1f465) },
    { t: "training", label: "Training", ic: String.fromCodePoint(0x1f3cb) },
    { t: "programs", label: "Programs", ic: String.fromCodePoint(0x1f3af) },
    { t: "forms", label: "Forms", ic: String.fromCodePoint(0x1f4cb) },
    { t: "analytics", label: "Analytics", ic: String.fromCodePoint(0x1f4c8) },
    { t: "messages", label: "Messages", ic: String.fromCodePoint(0x1f4ac) }
  ];

  return (
    <main
      className={`bb-dash-root${isTrainer ? " bb-trainer-shell" : ""}${role === "user" ? " bb-user-shell" : ""}`}
      style={{ minHeight: "100dvh", background: s.bg, color: s.text, display: "flex", flexDirection: "column" }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Syne:wght@600;700;800&family=Outfit:wght@300;400;500;600;700&family=Cormorant+Garamond:wght@600&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;1,9..40,400&family=Rajdhani:wght@600;700&display=swap');
        .bb-dash-header{padding-top:max(12px, env(safe-area-inset-top, 0px));padding-left:max(14px, env(safe-area-inset-left, 0px));padding-right:max(14px, env(safe-area-inset-right, 0px));padding-bottom:12px}
        .bb-dash-main{padding-left:max(14px, env(safe-area-inset-left, 0px));padding-right:max(14px, env(safe-area-inset-right, 0px));padding-top:14px;padding-bottom:calc(96px + env(safe-area-inset-bottom, 0px))}
        .bb-header-btn{position:relative;width:42px;height:42px;border-radius:50%;border:1px solid var(--accent-border);background:transparent;color:var(--accent);display:grid;place-items:center;cursor:pointer;overflow:visible}
        .bb-staff-detail-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:stretch;margin-top:16px}
        .bb-staff-detail-btn{min-height:42px;padding:10px 18px;border-radius:10px;border:1px solid var(--accent-border);background:color-mix(in srgb,var(--accent) 10%,var(--bg-card));color:var(--accent);font-weight:600;font-size:13px;cursor:pointer;font:inherit;white-space:normal;line-height:1.3;text-align:center;box-sizing:border-box}
        .bb-staff-detail-btn:hover{filter:brightness(1.04);border-color:var(--accent)}
        .bb-staff-detail-btn:disabled{opacity:.55;cursor:not-allowed}
        .bb-staff-detail-btn--danger{border-color:rgba(200,80,80,0.45);color:var(--red);background:color-mix(in srgb,var(--red) 8%,var(--bg-card))}
        .bb-staff-detail-btn--danger:hover{border-color:var(--red)}
        .bb-header-badge{position:absolute;top:-4px;right:-4px;background:var(--red);color:var(--text-on-accent);border-radius:999px;padding:2px 6px;font-size:10px;font-weight:700;line-height:1.15;min-width:18px;box-sizing:border-box;text-align:center;display:inline-flex;align-items:center;justify-content:center}
        .bb-notif-wrap{position:relative}
        .bb-notif-panel{position:absolute;top:calc(100% + 8px);right:0;width:min(360px,calc(100vw - 28px));max-height:min(420px,70vh);overflow:auto;background:var(--bg-surface);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow-md);z-index:50;padding:0 0 10px}
        .bb-notif-panel-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px 10px;border-bottom:1px solid var(--border);font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-secondary)}
        .bb-notif-clear{margin:0;border:none;background:transparent;color:var(--accent);font:inherit;font-size:12px;font-weight:600;letter-spacing:normal;text-transform:none;cursor:pointer;padding:4px 8px;border-radius:8px;white-space:nowrap}
        .bb-notif-clear:hover{background:color-mix(in srgb,var(--accent) 12%,transparent)}
        .bb-notif-clear:disabled{opacity:.5;cursor:not-allowed}
        /* Mobile: wide panel + right:0 on ~42px bell wrap drew the menu across the full header (over logo/hamburger). Anchor to header + safe insets instead. */
        @media(max-width:640px){
          .bb-notif-wrap{position:static}
          .bb-notif-panel{
            position:absolute;
            top:100%;
            right:max(14px,env(safe-area-inset-right,0px));
            left:auto;
            margin-top:8px;
            width:min(360px,calc(100vw - max(28px,env(safe-area-inset-left,0px) + env(safe-area-inset-right,0px))));
            max-height:min(420px,65dvh);
            z-index:60
          }
        }
        .bb-notif-row{width:100%;text-align:left;padding:10px 14px;border:none;background:transparent;cursor:pointer;color:var(--text-primary);font-family:inherit;font-size:13px;line-height:1.45;border-bottom:1px solid var(--border)}
        .bb-notif-row:last-child{border-bottom:none}
        .bb-notif-row:hover{background:color-mix(in srgb,var(--accent) 8%,transparent)}
        .bb-notif-title{font-weight:600;display:block;margin-bottom:2px}
        .bb-notif-desc{color:var(--text-secondary);font-size:12px;display:block}
        .bb-notif-time{font-size:11px;color:var(--text-secondary);margin-top:4px}
        .bb-notif-empty{padding:16px 14px;color:var(--text-secondary);font-size:13px;margin:0}
        .bb-notif-push-footer{padding:10px 14px 8px;margin-top:2px;border-top:1px solid var(--border)}
        .bb-notif-push-btn{width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--accent-border);background:linear-gradient(145deg,var(--accent-light),var(--accent) 45%,var(--accent-dark));color:var(--on-accent);font-weight:700;font-size:12px;letter-spacing:.02em;cursor:pointer;box-sizing:border-box}
        .bb-notif-push-btn:disabled{opacity:.55;cursor:not-allowed}
        .bb-notif-push-hint{margin:8px 0 0;font-size:11px;line-height:1.45;color:var(--text-secondary)}
        .bb-admin-welcome-card{background:linear-gradient(135deg,var(--bg-surface),color-mix(in srgb,var(--accent) 9%,var(--bg-card)));border-radius:14px;border-left:5px solid var(--accent);padding:18px 20px;margin-bottom:16px;box-sizing:border-box;width:100%;box-shadow:var(--shadow-md),inset 0 0 0 1px var(--accent-border)}
        .bb-admin-welcome-title{font-size:clamp(17px,4.2vw,24px);font-weight:700;color:var(--olive);margin:0 0 8px;line-height:1.32;letter-spacing:.04em}
        .bb-admin-welcome-role{font-weight:800;letter-spacing:.03em}
        .bb-admin-welcome-date{font-size:13px;color:var(--text-secondary);margin:0;line-height:1.45}
        .bb-dash-root{font-family:'Outfit',sans-serif;font-weight:400;-webkit-font-smoothing:antialiased}
        .bb-trainer-shell{display:flex;flex-direction:column;min-height:100dvh}
        @media(min-width:900px){.bb-trainer-shell .bb-dash-main{padding-bottom:calc(28px + env(safe-area-inset-bottom,0px))}}
        .bb-user-shell{display:flex;flex-direction:column;min-height:100dvh}
        .bb-user-layout-row{display:flex;flex:1;min-height:0;min-width:0;align-items:stretch;flex-direction:row}
        .bb-user-sidebar-desktop{display:none;flex-direction:column;width:240px;flex-shrink:0;border-right:1px solid var(--border);background:color-mix(in srgb,var(--bg-primary) 97%,transparent);padding:12px 0 24px;gap:2px}
        .bb-user-side-logo{padding:0 18px 20px;border-bottom:1px solid var(--border);margin-bottom:10px}
        .bb-user-side-logo img{display:block;height:72px;width:auto;object-fit:contain}
        .bb-user-side-link{display:flex;align-items:center;gap:10px;padding:11px 16px;border:none;background:transparent;color:var(--text-secondary);font:inherit;font-size:11px;font-weight:600;cursor:pointer;text-align:left;width:100%;text-transform:uppercase;letter-spacing:.08em;border-left:3px solid transparent;box-sizing:border-box}
        .bb-user-side-link:hover,.bb-user-side-link:focus{background:rgb(var(--accent-rgb) / 0.06);color:var(--accent);outline:none}
        .bb-user-side-link-active{color:var(--accent);border-left-color:var(--accent);background:rgb(var(--accent-rgb) / 0.08)}
        .bb-user-section-strip{margin:0 0 16px;padding-bottom:14px;border-bottom:1px solid var(--border)}
        .bb-user-section-name{display:block;font-family:'Syne',sans-serif;font-size:14px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--text-primary);margin-bottom:6px}
        .bb-user-section-sub{display:block;font-size:13px;color:var(--text-secondary);line-height:1.45}
        .bb-user-pwa-row{display:flex;justify-content:center;margin-bottom:16px}
        .bb-user-pwa-btn{padding:10px 20px;border-radius:10px;border:1px solid var(--accent-border);background:var(--accent-dim);color:var(--accent);font-weight:700;font-size:12px;cursor:pointer;font:inherit}
        .bb-user-desktop-only{display:none}
        .bb-user-home-wrap.bb-desktop .bb-user-desktop-only{display:block}
        .bb-user-home-wrap.bb-desktop .bb-user-mobile-home{display:none!important}
        .user-wa-top-btn{width:42px;height:42px;border-radius:50%;border:1px solid var(--accent-border);background:transparent;color:var(--accent);display:grid;place-items:center;cursor:pointer;padding:0;flex-shrink:0}
        .user-wa-top-btn svg{width:22px;height:22px;fill:currentColor}
        .timer-paused-label{font-size:12px;color:var(--text-secondary);text-align:center;margin-top:8px;letter-spacing:.06em;text-transform:uppercase}
        .user-welcome-avatar{width:64px;height:64px;border-radius:50%;object-fit:cover;border:2px solid rgb(var(--accent-rgb) / 0.55);display:block}
        @media(min-width:900px){
          .bb-user-shell .bb-user-sidebar-desktop{display:flex}
          .bb-user-shell .bb-nav-dock{display:none!important}
          .bb-user-shell .bb-dash-main{padding-bottom:calc(28px + env(safe-area-inset-bottom,0px))}
        }
        .bb-trainer-welcome-line{margin:0 0 10px;font-family:'Outfit',sans-serif;font-size:clamp(15px,3.4vw,18px);font-weight:600;color:var(--olive);letter-spacing:.03em;line-height:1.35}
        .bb-trainer-welcome-name{font-weight:700;background:linear-gradient(122deg,var(--olive) 0%,var(--accent) 55%,var(--accent-light) 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
        .bb-dashboard-title{margin:0 0 12px;font-family:'Bebas Neue',sans-serif;font-size:clamp(28px,8vw,44px);letter-spacing:3px;line-height:1;background:linear-gradient(122deg,var(--olive) 0%,var(--accent) 32%,var(--accent-light) 62%,var(--accent-bright) 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
        .bb-admin-section-page-title{font-size:28px;letter-spacing:2px;margin-bottom:6px}
        .bb-admin-hub-cards{display:grid;grid-template-columns:1fr;gap:10px}
        @media(min-width:480px){.bb-admin-hub-cards{grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px}}
        .bb-admin-hub-card{display:flex;flex-direction:column;align-items:flex-start;padding:18px 20px;background:color-mix(in srgb, var(--text-primary) 5%, var(--bg-primary));border:1px solid var(--border);border-radius:10px;cursor:pointer;transition:all .25s;color:inherit;text-align:left;width:100%;box-sizing:border-box;font:inherit}
        .bb-admin-hub-card:hover{background:var(--accent-dim);border-color:var(--accent-border);transform:translateY(-2px);box-shadow:var(--shadow-sm)}
        .bb-admin-hub-card-icon{font-size:22px;margin-bottom:12px;opacity:.9;line-height:1}
        .bb-admin-hub-card-title{font-family:'Outfit',sans-serif;font-size:14px;font-weight:700;letter-spacing:.5px;color:var(--text-primary);margin-bottom:8px;line-height:1.3}
        .bb-admin-hub-card-desc{font-family:'DM Sans',sans-serif;font-size:12px;color:var(--text-secondary);line-height:1.5;letter-spacing:.2px}
        .bb-admin-summary-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:18px}
        .bb-admin-summary-card{background:linear-gradient(172deg,var(--bg-surface),color-mix(in srgb,var(--accent) 6%,var(--bg-card)));border-radius:14px;padding:16px;min-height:76px;display:flex;flex-direction:column;justify-content:center;border:1px solid var(--border);cursor:pointer;text-align:left;box-shadow:var(--shadow-sm),inset 0 1px 0 color-mix(in srgb,var(--text-on-accent) 65%,transparent);transition:transform .2s ease,box-shadow .2s ease}.bb-admin-summary-card:hover{transform:translateY(-3px);box-shadow:var(--shadow-lg),inset 0 1px 0 color-mix(in srgb,var(--text-on-accent) 75%,transparent)}
        .bb-admin-summary-lbl{font-size:10px;font-weight:600;letter-spacing:1.5px;color:var(--text-secondary);margin-bottom:8px}
        .bb-admin-summary-num{font-family:'Bebas Neue',sans-serif;font-size:36px;line-height:1;font-weight:700}
        .bb-admin-summary-num.num-gold{color:var(--accent)}.bb-admin-summary-num.num-green{color:var(--green)}.bb-admin-summary-num.num-orange{color:var(--accent-dark)}.bb-admin-summary-num.num-pink{color:var(--text-primary)}
        .bb-admin-qa-title{font-size:10px;font-weight:600;letter-spacing:1.5px;color:var(--text-secondary);margin:0 0 10px}
        .bb-admin-qa-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
        .bb-admin-qa-btn{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:16px 10px;background:var(--bg-card);border-radius:12px;color:var(--text-primary);font-size:12px;font-weight:600;cursor:pointer;border:1px solid var(--border)}
        .bb-admin-qa-btn:hover{background:var(--bg-card-hover);border-color:var(--accent-border)}
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
        .bb-sa-roster-shell{position:relative;border-radius:22px;padding:clamp(20px,4vw,34px);box-sizing:border-box;background:radial-gradient(ellipse 120% 90% at 0% 0%,rgb(var(--accent-rgb) / 0.16),transparent 52%),radial-gradient(ellipse 80% 70% at 100% 8%,rgb(var(--accent-rgb) / 0.09),transparent 48%),linear-gradient(168deg,color-mix(in srgb,var(--bg-card) 94%,var(--text-primary) 6%),var(--bg-surface));border:1px solid color-mix(in srgb,var(--accent) 24%,var(--border));box-shadow:0 28px 56px rgb(var(--shadow-rgb) / 0.14),inset 0 1px 0 color-mix(in srgb,var(--text-on-accent) 14%,transparent)}
        .bb-sa-roster-shell::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--text-on-accent) 6%,transparent)}
        .bb-sa-roster-hero{position:relative;z-index:1;margin-bottom:4px;padding-bottom:22px;border-bottom:1px solid color-mix(in srgb,var(--accent) 14%,var(--border))}
        .bb-sa-roster-kicker{margin:0 0 10px;font-family:'Syne',sans-serif;font-size:10px;font-weight:700;letter-spacing:5px;text-transform:uppercase;color:rgb(var(--accent-rgb) / 0.58)}
        .bb-sa-roster-title{margin:0 0 14px;font-family:'Bebas Neue',sans-serif;font-size:clamp(34px,7vw,52px);letter-spacing:5px;line-height:0.95;background:linear-gradient(118deg,var(--olive) 0%,var(--accent) 38%,var(--accent-light) 68%,var(--accent-bright) 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
        .bb-sa-roster-sub{margin:0;font-size:14px;line-height:1.6;color:var(--text-secondary);max-width:46ch}
        .bb-sa-roster-stats{display:flex;flex-wrap:wrap;gap:12px;margin-top:20px;align-items:center}
        .bb-sa-roster-stat{display:inline-flex;align-items:center;gap:12px;padding:10px 18px;border-radius:999px;background:rgb(var(--accent-rgb) / 0.09);border:1px solid rgb(var(--accent-rgb) / 0.22);box-shadow:inset 0 1px 0 color-mix(in srgb,var(--text-on-accent) 10%,transparent)}
        .bb-sa-roster-stat-num{font-family:'Bebas Neue',sans-serif;font-size:24px;letter-spacing:2px;color:var(--accent);line-height:1}
        .bb-sa-roster-stat-lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:var(--text-secondary)}
        .bb-sa-roster-search-wrap{position:relative;z-index:1;margin-top:22px}
        .bb-sa-roster-search-icon{position:absolute;left:18px;top:50%;transform:translateY(-50%);width:20px;height:20px;color:rgb(var(--accent-rgb) / 0.48);pointer-events:none}
        .bb-sa-roster-search-icon svg{width:100%;height:100%;display:block;stroke:currentColor;fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
        .bb-sa-roster-input{width:100%;box-sizing:border-box;padding:17px 20px 17px 52px;border-radius:16px;border:1px solid color-mix(in srgb,var(--accent) 20%,var(--border));background:color-mix(in srgb,var(--bg-primary) 72%,transparent);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);color:var(--text-primary);font-size:15px;font-family:inherit;transition:border-color .2s ease,box-shadow .2s ease}
        .bb-sa-roster-input:focus{outline:none;border-color:rgb(var(--accent-rgb) / 0.42);box-shadow:0 0 0 4px rgb(var(--accent-rgb) / 0.1)}
        .bb-sa-roster-input::placeholder{color:var(--text-muted)}
        .bb-sa-roster-grid{list-style:none;margin:22px 0 0;padding:0;display:grid;gap:15px;grid-template-columns:1fr;position:relative;z-index:1}
        @media(min-width:760px){.bb-sa-roster-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}}
        @media(min-width:1200px){.bb-sa-roster-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
        .bb-sa-roster-card{position:relative;border-radius:20px;padding:20px 18px 20px 22px;cursor:pointer;border:1px solid color-mix(in srgb,var(--accent) 14%,var(--border));background:linear-gradient(158deg,color-mix(in srgb,var(--bg-surface) 82%,var(--accent) 18%) 0%,var(--bg-card) 55%,color-mix(in srgb,var(--bg-card) 92%,var(--text-primary) 8%) 100%);box-shadow:0 10px 32px rgb(var(--shadow-rgb) / 0.1),inset 0 1px 0 color-mix(in srgb,var(--text-on-accent) 12%,transparent);transition:transform .25s ease,box-shadow .25s ease,border-color .25s ease;box-sizing:border-box}
        .bb-sa-roster-card:hover{transform:translateY(-4px);border-color:rgb(var(--accent-rgb) / 0.38);box-shadow:0 20px 48px rgb(var(--accent-rgb) / 0.12),inset 0 1px 0 color-mix(in srgb,var(--text-on-accent) 18%,transparent)}
        .bb-sa-roster-card:focus{outline:none;box-shadow:0 0 0 3px rgb(var(--accent-rgb) / 0.22),0 10px 32px rgb(var(--shadow-rgb) / 0.1)}
        .bb-sa-roster-card:focus:not(:focus-visible){box-shadow:0 10px 32px rgb(var(--shadow-rgb) / 0.1),inset 0 1px 0 color-mix(in srgb,var(--text-on-accent) 12%,transparent)}
        .bb-sa-roster-card-inner{display:flex;gap:18px;align-items:flex-start;min-width:0}
        .bb-sa-roster-mono{flex-shrink:0;width:54px;height:54px;border-radius:50%;display:grid;place-items:center;font-family:'Syne',sans-serif;font-weight:700;font-size:17px;letter-spacing:0.5px;color:var(--accent);background:linear-gradient(148deg,rgb(var(--accent-rgb) / 0.28),rgb(var(--accent-rgb) / 0.05));border:2px solid rgb(var(--accent-rgb) / 0.38);box-shadow:inset 0 1px 0 color-mix(in srgb,var(--text-on-accent) 22%,transparent),0 4px 14px rgb(var(--accent-rgb) / 0.08)}
        .bb-sa-roster-body{min-width:0;flex:1}
        .bb-sa-roster-name{margin:0 0 6px;font-family:'Syne',sans-serif;font-size:17px;font-weight:700;letter-spacing:0.35px;color:var(--text-primary);line-height:1.2}
        .bb-sa-roster-email{margin:0 0 14px;font-size:13px;color:var(--text-secondary);word-break:break-word;line-height:1.45}
        .bb-sa-roster-meta{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center}
        .bb-sa-roster-coach{font-size:12px;color:var(--text-secondary);line-height:1.4}
        .bb-sa-roster-coach strong{color:var(--text-primary);font-weight:600}
        .bb-sa-roster-status{font-size:9px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;padding:6px 12px;border-radius:999px;border:1px solid var(--border);background:rgb(var(--accent-rgb) / 0.06);color:var(--text-secondary)}
        .bb-sa-roster-status--approved{border-color:color-mix(in srgb,var(--green) 45%,var(--border));background:color-mix(in srgb,var(--green) 12%,transparent);color:var(--green)}
        .bb-sa-roster-status--pending{border-color:color-mix(in srgb,var(--accent-dark) 40%,var(--border));background:color-mix(in srgb,var(--accent-dark) 10%,transparent);color:var(--accent-dark)}
        .bb-sa-roster-badge-warn{font-size:10px;font-weight:700;letter-spacing:0.4px;color:var(--red)}
        .bb-sa-roster-cta{flex-shrink:0;align-self:center;display:flex;flex-direction:column;align-items:flex-end;gap:6px;padding-left:8px}
        .bb-sa-roster-cta-pill{font-size:9px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:var(--accent);padding:11px 14px;border-radius:999px;border:1px solid rgb(var(--accent-rgb) / 0.38);background:linear-gradient(180deg,rgb(var(--accent-rgb) / 0.14),rgb(var(--accent-rgb) / 0.05));box-shadow:inset 0 1px 0 color-mix(in srgb,var(--text-on-accent) 12%,transparent)}
        .bb-sa-roster-empty{position:relative;z-index:1;text-align:center;margin-top:28px;padding:52px 28px;border-radius:20px;border:1px dashed color-mix(in srgb,var(--accent) 30%,var(--border));background:rgb(var(--accent-rgb) / 0.045)}
        .bb-sa-roster-empty-line{width:56px;height:1px;margin:0 auto 18px;background:linear-gradient(90deg,transparent,rgb(var(--accent-rgb) / 0.65),transparent)}
        .bb-sa-roster-empty p{margin:0;font-size:15px;line-height:1.55;color:var(--text-secondary);max-width:32ch;margin-left:auto;margin-right:auto}
        .bb-sa-home{margin-top:4px;margin-bottom:4px}
        .bb-sa-home-top-bento{display:grid;gap:12px;margin-bottom:10px}
        @media(min-width:880px){.bb-sa-home-top-bento{grid-template-columns:minmax(0,0.9fr) minmax(0,1.1fr);gap:14px;align-items:stretch}}
        .bb-sa-home-hero{position:relative;border-radius:20px;padding:14px 16px 16px;box-sizing:border-box;background:radial-gradient(ellipse 100% 120% at 0% 0%,rgb(var(--accent-rgb) / 0.14),transparent 55%),linear-gradient(165deg,color-mix(in srgb,var(--bg-card) 95%,var(--text-primary) 5%),var(--bg-surface));border:1px solid color-mix(in srgb,var(--accent) 22%,var(--border));box-shadow:0 16px 40px rgb(var(--shadow-rgb) / 0.1),inset 0 1px 0 color-mix(in srgb,var(--text-on-accent) 12%,transparent)}
        .bb-sa-home-hero::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--text-on-accent) 5%,transparent)}
        .bb-sa-home-kicker{margin:0 0 6px;font-family:'Syne',sans-serif;font-size:9px;font-weight:700;letter-spacing:4px;text-transform:uppercase;color:rgb(var(--accent-rgb) / 0.52)}
        .bb-sa-home-hero-title{margin:0;font-family:'Bebas Neue',sans-serif;font-size:clamp(26px,5.5vw,38px);letter-spacing:4px;line-height:0.95;background:linear-gradient(118deg,var(--olive) 0%,var(--accent) 42%,var(--accent-light) 72%,var(--accent-bright) 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
        .bb-sa-home-hero-line{margin:8px 0 2px;font-size:12px;line-height:1.45;color:var(--text-secondary);max-width:36ch}
        .bb-sa-home-hero-date{margin:6px 0 0;font-size:11px;font-variant-numeric:tabular-nums;letter-spacing:0.04em;color:rgb(var(--accent-rgb) / 0.75);font-weight:600}
        .bb-sa-home-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
        @media(max-width:380px){.bb-sa-home-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}
        .bb-sa-metric{position:relative;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;text-align:left;min-height:0;padding:10px 11px 11px;border-radius:16px;border:1px solid color-mix(in srgb,var(--accent) 14%,var(--border));background:linear-gradient(165deg,color-mix(in srgb,var(--bg-surface) 88%,var(--accent) 12%),var(--bg-card));box-shadow:0 6px 20px rgb(var(--shadow-rgb) / 0.07),inset 0 1px 0 color-mix(in srgb,var(--text-on-accent) 10%,transparent);cursor:pointer;font:inherit;color:inherit;transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease;box-sizing:border-box}
        .bb-sa-metric:hover{transform:translateY(-2px);border-color:rgb(var(--accent-rgb) / 0.32);box-shadow:0 12px 28px rgb(var(--accent-rgb) / 0.1),inset 0 1px 0 color-mix(in srgb,var(--text-on-accent) 14%,transparent)}
        .bb-sa-metric-lbl{font-size:8px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:var(--text-secondary);margin-bottom:4px;line-height:1.25}
        .bb-sa-metric-num{font-family:'Bebas Neue',sans-serif;font-size:clamp(24px,6.5vw,30px);line-height:1;font-weight:700}
        .bb-sa-metric-num.num-gold{color:var(--accent)}.bb-sa-metric-num.num-green{color:var(--green)}.bb-sa-metric-num.num-orange{color:var(--accent-dark)}.bb-sa-metric-num.num-pink{color:var(--text-primary)}
        .bb-sa-sync-shell{margin-bottom:10px;border-radius:16px;overflow:hidden;border:1px solid color-mix(in srgb,var(--accent) 16%,var(--border));background:linear-gradient(180deg,color-mix(in srgb,var(--bg-card) 92%,var(--accent) 8%),var(--bg-surface));box-shadow:0 8px 24px rgb(var(--shadow-rgb) / 0.08),inset 0 1px 0 color-mix(in srgb,var(--text-on-accent) 8%,transparent)}
        .bb-sa-sync-shell.bb-sa-sync--warn{border-color:color-mix(in srgb,var(--red) 45%,var(--border))}
        .bb-sa-sync-trigger{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;border:none;background:transparent;color:var(--text-primary);cursor:pointer;font:inherit;text-align:left}
        .bb-sa-sync-trigger-lbl{font-family:'Syne',sans-serif;font-size:9px;font-weight:700;letter-spacing:2.2px;text-transform:uppercase;color:var(--text-secondary)}
        .bb-sa-sync-trigger-meta{font-size:11px;font-variant-numeric:tabular-nums;color:var(--accent);font-weight:600;white-space:nowrap}
        .bb-sa-sync-body{padding:0 14px 12px}
        .bb-sa-sync-reload{margin-top:8px;padding:8px 16px;border-radius:999px;border:1px solid rgb(var(--accent-rgb) / 0.4);background:linear-gradient(180deg,rgb(var(--accent-rgb) / 0.12),rgb(var(--accent-rgb) / 0.04));color:var(--accent);font-weight:700;font-size:12px;cursor:pointer;font:inherit}
        .bb-sa-sync-reload:disabled{opacity:0.55;cursor:wait}
        .bb-sa-home-queues{display:grid;gap:10px;margin-bottom:10px}
        @media(min-width:960px){.bb-sa-home-queues{grid-template-columns:1fr 1fr;gap:12px;align-items:stretch}}
        .bb-sa-queue-col{min-width:0;display:flex;flex-direction:column}
        .bb-sa-sec-head{font-family:'Syne',sans-serif;font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgb(var(--accent-rgb) / 0.55);margin:0 0 8px;line-height:1.35;scroll-margin-top:20px}
        .bb-sa-sec-head strong{color:var(--accent)}
        .bb-sa-queue-panel{border-radius:18px;padding:10px 10px 12px;border:1px solid color-mix(in srgb,var(--accent) 12%,var(--border));background:linear-gradient(175deg,var(--bg-card),color-mix(in srgb,var(--bg-surface) 88%,var(--accent) 12%));box-shadow:0 10px 28px rgb(var(--shadow-rgb) / 0.08),inset 0 1px 0 color-mix(in srgb,var(--text-on-accent) 8%,transparent);max-height:min(48vh,400px);overflow-y:auto;-webkit-overflow-scrolling:touch;box-sizing:border-box}
        .bb-sa-queue-panel .bb-list-rows{gap:8px}
        .bb-sa-queue-panel .bb-list-row{background:color-mix(in srgb,var(--text-primary) 4%,var(--bg-primary));border:1px solid color-mix(in srgb,var(--accent) 8%,var(--border));border-radius:14px;padding:11px 12px}
        .bb-sa-queue-panel .bb-inline-label{margin-top:10px;margin-bottom:6px;display:block}
        .bb-sa-btn-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:2px}
        .bb-sa-btn-approve{padding:8px 14px;border-radius:999px;border:1px solid color-mix(in srgb,var(--green) 55%,transparent);background:linear-gradient(180deg,color-mix(in srgb,var(--green) 16%,transparent),color-mix(in srgb,var(--green) 6%,transparent));color:var(--green);font-weight:700;font-size:11px;letter-spacing:0.04em;cursor:pointer;font:inherit}
        .bb-sa-btn-approve:disabled{opacity:0.55;cursor:wait}
        .bb-sa-btn-reject{padding:8px 14px;border-radius:999px;border:1px solid color-mix(in srgb,var(--red) 50%,transparent);background:linear-gradient(180deg,color-mix(in srgb,var(--red) 12%,transparent),color-mix(in srgb,var(--red) 4%,transparent));color:var(--red);font-weight:700;font-size:11px;letter-spacing:0.04em;cursor:pointer;font:inherit}
        .bb-sa-btn-reject:disabled{opacity:0.55;cursor:wait}
        .bb-sa-queue-select{width:100%;max-width:100%;padding:10px 12px;border-radius:12px;border:1px solid color-mix(in srgb,var(--accent) 15%,var(--border));background:var(--bg-card);color:var(--text-primary);font-size:13px;box-sizing:border-box}
        .bb-sa-roster-snap-section{margin-bottom:8px}
        .bb-sa-roster-snap-panel{max-height:none;padding:12px}
        .bb-sa-roster-snap-panel .bb-list-row{padding:10px 12px}
        .bb-sa-roster-open-btn{width:100%;margin-top:10px;padding:12px 16px;border-radius:14px;border:1px solid rgb(var(--accent-rgb) / 0.35);background:linear-gradient(145deg,var(--accent-light),var(--accent) 42%,var(--accent-dark));color:var(--on-accent);font-weight:700;font-size:12px;letter-spacing:1px;text-transform:uppercase;cursor:pointer;font:inherit;box-shadow:0 8px 22px rgb(var(--accent-rgb) / 0.25),inset 0 1px 0 color-mix(in srgb,var(--text-on-accent) 28%,transparent)}
        .bb-sa-roster-open-btn:hover{filter:brightness(1.03)}
        .bb-sa-portfolio-shell{position:relative;border-radius:22px;padding:clamp(18px,3.5vw,28px);box-sizing:border-box;background:radial-gradient(ellipse 120% 90% at 100% 0%,rgb(var(--accent-rgb) / 0.14),transparent 52%),linear-gradient(168deg,color-mix(in srgb,var(--bg-card) 95%,var(--text-primary) 5%),var(--bg-surface));border:1px solid color-mix(in srgb,var(--accent) 22%,var(--border));box-shadow:0 22px 48px rgb(var(--shadow-rgb) / 0.12)}
        .bb-sa-portfolio-shell::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--text-on-accent) 6%,transparent)}
        .bb-sa-portfolio-kicker{margin:0 0 8px;font-family:'Syne',sans-serif;font-size:10px;font-weight:700;letter-spacing:4px;text-transform:uppercase;color:rgb(var(--accent-rgb) / 0.55)}
        .bb-sa-portfolio-title{margin:0 0 10px;font-family:'Bebas Neue',sans-serif;font-size:clamp(28px,6vw,42px);letter-spacing:4px;line-height:1;background:linear-gradient(118deg,var(--olive) 0%,var(--accent) 38%,var(--accent-light) 70%,var(--accent-bright) 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
        .bb-sa-portfolio-sub{margin:0 0 16px;font-size:14px;line-height:1.55;color:var(--text-secondary);max-width:52ch}
        .bb-sa-portfolio-table-wrap{overflow-x:auto;margin-top:8px;-webkit-overflow-scrolling:touch;position:relative;z-index:1}
        .bb-sa-portfolio-table{width:100%;border-collapse:separate;border-spacing:0;font-size:13px}
        .bb-sa-portfolio-table th{font-family:'Syne',sans-serif;font-size:9px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:rgb(var(--accent-rgb) / 0.72);text-align:left;padding:10px 10px;border-bottom:1px solid color-mix(in srgb,var(--accent) 16%,var(--border));white-space:nowrap}
        .bb-sa-portfolio-table td{padding:11px 10px;border-bottom:1px solid var(--border);vertical-align:middle;color:var(--text-primary)}
        .bb-sa-portfolio-table tr.bb-sa-portfolio-tr-click{cursor:pointer;transition:background .2s ease}
        .bb-sa-portfolio-table tr.bb-sa-portfolio-tr-click:hover{background:rgb(var(--accent-rgb) / 0.06)}
        .bb-sa-portfolio-coach-grid{display:grid;gap:12px;grid-template-columns:1fr;position:relative;z-index:1}
        @media(min-width:720px){.bb-sa-portfolio-coach-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
        .bb-sa-portfolio-coach-card{display:flex;flex-direction:column;align-items:stretch;padding:16px 18px;border-radius:16px;border:1px solid color-mix(in srgb,var(--accent) 16%,var(--border));background:linear-gradient(158deg,color-mix(in srgb,var(--bg-surface) 88%,var(--accent) 12%),var(--bg-card));cursor:pointer;transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease;box-sizing:border-box;text-align:left;font:inherit;color:inherit;width:100%}
        .bb-sa-portfolio-coach-card:hover{transform:translateY(-3px);box-shadow:0 14px 32px rgb(var(--accent-rgb) / 0.12);border-color:rgb(var(--accent-rgb) / 0.35)}
        .bb-sa-portfolio-coach-name{font-family:'Syne',sans-serif;font-weight:700;font-size:16px;color:var(--text-primary);margin:0 0 6px;line-height:1.25}
        .bb-sa-portfolio-coach-meta{font-size:12px;color:var(--text-secondary);margin:0;word-break:break-word;line-height:1.4}
        .bb-sa-portfolio-coach-stats{display:flex;flex-wrap:wrap;gap:8px 12px;margin-top:12px}
        .bb-sa-portfolio-stat-pill{font-size:9px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;padding:6px 10px;border-radius:999px;background:rgb(var(--accent-rgb) / 0.09);border:1px solid rgb(var(--accent-rgb) / 0.2);color:var(--text-secondary)}
        .bb-sa-portfolio-stat-pill strong{color:var(--accent);font-family:'Bebas Neue',sans-serif;font-size:16px;font-weight:700;letter-spacing:1px;margin-right:5px}
        .bb-sa-portfolio-detail-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:14px;margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid color-mix(in srgb,var(--accent) 14%,var(--border));position:relative;z-index:1}
        .bb-sa-portfolio-back-inline{padding:9px 16px;border-radius:999px;border:1px solid color-mix(in srgb,var(--accent) 28%,var(--border));background:color-mix(in srgb,var(--accent) 8%,transparent);color:var(--accent);font-weight:700;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;cursor:pointer;font:inherit}
        .bb-sa-portfolio-back-inline:hover{filter:brightness(1.05)}
        .bb-sa-portfolio-empty{text-align:center;padding:40px 20px;color:var(--text-secondary);font-size:14px;line-height:1.55}
        /* ── SA Quick Access Strip ── */
        .bb-sa-qac-strip{display:flex;flex-wrap:nowrap;gap:10px;align-items:center;padding:0 0 12px;margin:0 0 8px;min-height:42px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}
        .bb-sa-qac-strip::-webkit-scrollbar{display:none}
        .bb-sa-qac-chip{display:inline-flex;align-items:center;gap:6px;padding:9px 14px;min-height:38px;border-radius:999px;font-size:12px;font-weight:700;letter-spacing:.3px;cursor:pointer;border:1px solid color-mix(in srgb,var(--accent) 22%,var(--border));background:linear-gradient(180deg,color-mix(in srgb,var(--bg-surface) 88%,var(--accent) 12%),var(--bg-card));color:var(--text-primary);font-family:inherit;transition:all .18s ease;text-decoration:none;position:relative;box-shadow:0 2px 8px rgb(var(--shadow-rgb)/.06),inset 0 1px 0 color-mix(in srgb,var(--text-on-accent) 10%,transparent)}
        .bb-sa-qac-chip:hover{border-color:rgb(var(--accent-rgb)/.45);background:linear-gradient(180deg,rgb(var(--accent-rgb)/.12),rgb(var(--accent-rgb)/.04));color:var(--accent);transform:translateY(-1px);box-shadow:0 4px 14px rgb(var(--accent-rgb)/.12)}
        .bb-sa-qac-chip:disabled{opacity:.55;cursor:not-allowed;transform:none}
        .bb-sa-qac-chip-primary{border-color:rgb(var(--accent-rgb)/.4);background:linear-gradient(145deg,var(--accent-light),var(--accent) 52%,var(--accent-dark));color:var(--on-accent);box-shadow:0 4px 14px rgb(var(--accent-rgb)/.28)}
        .bb-sa-qac-chip-primary:hover{filter:brightness(1.05);transform:translateY(-1px)}
        .bb-sa-qac-chip-stat{cursor:default;background:rgb(var(--accent-rgb)/.06);border-color:rgb(var(--accent-rgb)/.18)}
        .bb-sa-qac-chip-stat:hover{transform:none;color:var(--text-primary);border-color:rgb(var(--accent-rgb)/.18)}
        .bb-sa-welcome-chip{background:linear-gradient(112deg,color-mix(in srgb,var(--bg-card) 88%,var(--accent) 12%),color-mix(in srgb,var(--bg-surface) 86%,var(--accent-bright) 14%));border-color:color-mix(in srgb,var(--accent) 32%,var(--border));box-shadow:0 8px 22px rgb(var(--accent-rgb)/.12),inset 0 1px 0 color-mix(in srgb,var(--text-on-accent) 18%,transparent)}
        .bb-sa-welcome-text{font-family:'Bebas Neue',sans-serif;font-size:clamp(24px,4.3vw,34px);letter-spacing:1.4px;line-height:1;background:linear-gradient(96deg,var(--olive) 0%,var(--accent) 48%,var(--accent-bright) 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
        .bb-sa-qac-badge{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;border-radius:999px;background:var(--accent);color:var(--on-accent);font-size:10px;font-weight:700;padding:0 4px;margin-left:2px}
        /* ── SA QA grid (6-col) ── */
        .bb-sa-qa-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:18px}
        @media(min-width:480px){.bb-sa-qa-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
        @media(min-width:700px){.bb-sa-qa-grid{grid-template-columns:repeat(6,minmax(0,1fr))}}
        /* ── SA bottom nav (5 tabs) ── */
        .bb-nav-inner-sa{grid-template-columns:repeat(5,minmax(0,1fr))}
        /* ── SA clients sub-nav ── */
        .bb-sa-clients-subnav{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;align-items:center}
        .bb-sa-clients-subnav-btn{display:inline-flex;align-items:center;gap:6px;padding:9px 14px;border-radius:999px;font-size:12px;font-weight:700;letter-spacing:.3px;cursor:pointer;border:1px solid var(--border);background:transparent;color:var(--text-secondary);font-family:inherit;transition:all .18s ease;position:relative}
        .bb-sa-clients-subnav-btn:hover{border-color:var(--accent-border);color:var(--accent);background:rgb(var(--accent-rgb)/.06)}
        .bb-sa-clients-subnav-btn-active{border-color:var(--accent)!important;background:rgb(var(--accent-rgb)/.12)!important;color:var(--accent)!important;box-shadow:0 2px 10px rgb(var(--accent-rgb)/.15)}
        .bb-sa-clients-subnav-badge{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;border-radius:999px;background:var(--accent);color:var(--on-accent);font-size:10px;font-weight:700;padding:0 4px;margin-left:4px}
        /* ── SA Enterprise tab ── */
        .bb-sa-ent-shell{padding:0 0 8px}
        .bb-sa-ent-hero{margin-bottom:16px}
        .bb-sa-ent-empty{border-radius:22px;padding:clamp(24px,5vw,40px);border:1px dashed color-mix(in srgb,var(--accent) 30%,var(--border));background:radial-gradient(ellipse 80% 60% at 50% 0%,rgb(var(--accent-rgb)/.05),transparent 65%),var(--bg-surface);text-align:center}
        .bb-sa-ent-empty-icon{font-size:52px;line-height:1;margin-bottom:18px;opacity:.7}
        .bb-sa-ent-empty-title{font-family:'Syne',sans-serif;font-size:20px;font-weight:700;color:var(--text-primary);margin:0 0 10px;letter-spacing:.5px}
        .bb-sa-ent-empty-sub{font-size:13px;color:var(--text-secondary);line-height:1.65;max-width:52ch;margin:0 auto 28px}
        .bb-sa-ent-pipeline{display:flex;flex-direction:column;gap:0;text-align:left;max-width:420px;margin:0 auto 28px;position:relative}
        .bb-sa-ent-pipeline::before{content:"";position:absolute;left:9px;top:20px;bottom:20px;width:2px;background:linear-gradient(180deg,rgb(var(--accent-rgb)/.35),rgb(var(--accent-rgb)/.05));border-radius:2px}
        .bb-sa-ent-stage{display:flex;gap:16px;align-items:flex-start;padding:12px 0;position:relative;z-index:1}
        .bb-sa-ent-stage-dot{flex-shrink:0;width:20px;height:20px;border-radius:50%;background:linear-gradient(148deg,rgb(var(--accent-rgb)/.35),rgb(var(--accent-rgb)/.08));border:2px solid rgb(var(--accent-rgb)/.35);margin-top:1px}
        .bb-sa-ent-stage-name{font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:2px}
        .bb-sa-ent-stage-desc{font-size:11px;color:var(--text-secondary);line-height:1.4}
        .bb-sa-ent-cta{padding:12px 24px;border-radius:14px;border:1px solid rgb(var(--accent-rgb)/.38);background:linear-gradient(145deg,var(--accent-light),var(--accent) 50%,var(--accent-dark));color:var(--on-accent);font-weight:700;font-size:13px;letter-spacing:.8px;cursor:pointer;font-family:inherit;box-shadow:0 8px 22px rgb(var(--accent-rgb)/.25)}
        .bb-sa-ent-cta:hover{filter:brightness(1.04)}
        .bb-sa-luxe-shell{position:relative;padding:14px;border-radius:16px;border:1px solid color-mix(in srgb,var(--accent) 20%,var(--border));background:radial-gradient(120% 95% at 8% -5%,rgb(var(--accent-rgb)/.10),transparent 42%),linear-gradient(180deg,color-mix(in srgb,var(--bg-surface) 94%,var(--accent) 6%),var(--bg-card));box-shadow:0 8px 24px rgb(var(--shadow-rgb)/.08)}
        .bb-sa-slim-hdr{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
        .bb-sa-slim-title{font-size:15px;font-weight:700;color:var(--text-primary);letter-spacing:.3px;background:linear-gradient(95deg,var(--olive) 0%,var(--accent) 45%,var(--accent-bright) 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
        .bb-sa-slim-count{font-size:12px;color:var(--text-secondary);font-weight:600}
        .bb-sa-slim-search{display:flex;align-items:center;gap:8px;background:linear-gradient(180deg,color-mix(in srgb,var(--bg-card) 92%,var(--accent) 8%),var(--bg-card));border:1px solid color-mix(in srgb,var(--accent) 26%,var(--border));border-radius:10px;padding:0 12px;margin-bottom:14px;box-shadow:inset 0 1px 0 color-mix(in srgb,var(--text-on-accent) 8%,transparent)}
        .bb-sa-slim-search-icon{flex-shrink:0;width:16px;height:16px;stroke:var(--text-secondary);fill:none;stroke-width:2;stroke-linecap:round}
        .bb-sa-slim-search-input{flex:1;border:none;background:transparent;padding:10px 0;font-size:13px;color:var(--text-primary);font-family:inherit;outline:none}
        .bb-sa-slim-search-input::placeholder{color:var(--text-secondary)}
        .bb-sa-slim-table{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;background:color-mix(in srgb,var(--bg-card) 94%,var(--accent) 6%);border:1px solid color-mix(in srgb,var(--accent) 18%,var(--border));border-radius:12px;overflow:hidden}
        .bb-sa-slim-table th{text-align:left;padding:8px 10px;font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--accent);background:linear-gradient(180deg,rgb(var(--accent-rgb)/.10),rgb(var(--accent-rgb)/.04));border-bottom:1px solid color-mix(in srgb,var(--accent) 28%,var(--border));white-space:nowrap}
        .bb-sa-slim-table td{padding:11px 10px;border-bottom:1px solid color-mix(in srgb,var(--border) 55%,transparent);color:var(--text-primary);vertical-align:middle;background:transparent}
        .bb-sa-slim-table tr:last-child td{border-bottom:none}
        .bb-sa-slim-tr-click{cursor:pointer}
        .bb-sa-slim-tr-click:hover td{background:linear-gradient(90deg,rgb(var(--accent-rgb)/.11),rgb(var(--accent-rgb)/.03))}
        .bb-sa-slim-pill{display:inline-flex;align-items:center;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.2px;white-space:nowrap}
        .bb-sa-slim-pill-active{background:rgb(34 197 94/.12);color:#16a34a}
        .bb-sa-slim-pill-pending{background:rgb(var(--accent-rgb)/.1);color:var(--accent)}
        .bb-sa-slim-pill-suspended{background:rgb(239 68 68/.1);color:#dc2626}
        .bb-sa-slim-pill-rejected{background:rgb(200 83 83/.1);color:#b91c1c}
        .bb-sa-slim-arrow{font-size:16px;color:var(--accent);line-height:1}
        .bb-sa-slim-empty{padding:32px 0;text-align:center;color:var(--text-secondary);font-size:13px}
        .bb-sa-slim-back{display:inline-flex;align-items:center;gap:6px;padding:6px 0;font-size:13px;font-weight:600;color:var(--text-secondary);background:none;border:none;cursor:pointer;font-family:inherit;margin-bottom:12px;transition:color .15s}
        .bb-sa-slim-back:hover{color:var(--text-primary)}
        .bb-sa-slim-scrollwrap{position:relative;overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:12px}
        .bb-sa-slim-scrollhint{position:absolute;right:10px;top:50%;transform:translateY(-50%);pointer-events:none;background:color-mix(in srgb,var(--bg-card) 82%,transparent);border:1px solid color-mix(in srgb,var(--border) 70%,transparent);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-radius:999px;padding:7px 8px;display:flex;align-items:center;justify-content:center;opacity:.92}
        .bb-sa-slim-scrollhint-icon{width:14px;height:14px;stroke:var(--text-secondary);fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
        .bb-sa-req-actions{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
        .bb-sa-req-actions .bb-sa-queue-select{min-width:140px;height:34px;padding:0 10px}
        .bb-sa-modal-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:14px;padding-top:12px;border-top:1px solid var(--border)}
        .bb-sa-modal-actions .bb-sa-queue-select{min-width:180px;height:36px;padding:0 10px}
        @media(max-width:640px){.bb-sa-req-actions{flex-direction:column;align-items:stretch}.bb-sa-req-actions .bb-btn-view,.bb-sa-req-actions .bb-sa-btn-approve,.bb-sa-req-actions .bb-sa-btn-reject{width:100%}}
        @media(max-width:640px){.bb-sa-modal-actions{flex-direction:column;align-items:stretch}.bb-sa-modal-actions .bb-sa-queue-select,.bb-sa-modal-actions .bb-sa-btn-approve,.bb-sa-modal-actions .bb-sa-btn-reject{width:100%}}
        .bb-sa-slim-detail-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--border)}
        .bb-sa-slim-detail-name{font-size:16px;font-weight:700;color:var(--text-primary);margin:0 0 3px;display:flex;align-items:center;flex-wrap:wrap;gap:6px}
        .bb-sa-slim-detail-meta{font-size:12px;color:var(--text-secondary);margin:0}
        .bb-admin-la-list-wrap{display:flex;flex-direction:column;gap:0}
        .bb-admin-la-title{font-size:10px;font-weight:600;letter-spacing:1.5px;color:var(--text-secondary);margin:0 0 10px}
        .bb-section-page{padding:4px 0 8px}
        .bb-admin-filter-bar label,.bb-admin-filter-bar span.bb-list-row-sub{font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--text-secondary)}
        .bb-btn-view{padding:8px 14px;border-radius:8px;border:1px solid var(--accent-border);background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--accent);font-weight:700;font-size:12px;cursor:pointer;font-family:inherit;white-space:nowrap}
        .bb-btn-view:hover{background:color-mix(in srgb,var(--accent) 22%,transparent)}
        .bb-admin-actions-col{text-align:right;width:1%;white-space:nowrap}
        .bb-form-view-grid{display:grid;gap:12px}
        .bb-form-view-row{display:grid;grid-template-columns:minmax(120px,150px) 1fr;gap:10px 14px;font-size:13px;line-height:1.45;align-items:start}
        @media(max-width:520px){.bb-form-view-row{grid-template-columns:1fr;gap:2px}}
        .bb-fv-lbl{color:var(--text-secondary);font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase}
        .bb-fv-val{color:var(--text-primary);word-break:break-word}
        .bb-form-view-block{margin-top:2px}
        .bb-form-view-block .bb-fv-blk{background:color-mix(in srgb,var(--text-primary) 4%,var(--bg-card));border:1px solid var(--border);border-radius:10px;padding:12px 14px;font-size:13px;line-height:1.55;white-space:pre-wrap;word-break:break-word;color:var(--text-primary);margin-top:6px}
        .bb-insights-filters{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin-bottom:14px}
        .bb-insights-label{font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--text-secondary);display:block;margin-bottom:4px}
        .bb-insights-field{display:flex;flex-direction:column;min-width:0}
        .bb-insights-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:10px;margin-bottom:14px}
        .bb-insights-card{padding:14px;background:rgba(200,164,78,0.06);border:1px solid var(--border);border-radius:8px;text-align:center}
        .bb-insights-card-num{font-family:'Bebas Neue',sans-serif;font-size:24px;letter-spacing:1px;color:var(--accent);line-height:1}
        .bb-insights-card-lbl{font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--text-secondary);margin-top:6px;line-height:1.25}
        .bb-insights-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
        .bb-campaigns-panel .bb-campaigns-h3{font-size:clamp(16px,3.5vw,20px);font-weight:700;letter-spacing:.04em;color:var(--text-primary);margin:0 0 8px}
        .bb-campaigns-subtitle{font-size:14px;font-weight:700;letter-spacing:.04em;color:var(--text-primary);margin-bottom:12px}
        .bb-campaign-ai-box{background:rgba(200,164,78,0.06);border:1px solid rgba(200,164,78,0.25);border-radius:12px;padding:18px 16px;margin-bottom:24px}
        .bb-campaign-ai-title{font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--accent);margin-bottom:10px}
        .bb-campaign-ai-row{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end}
        .bb-campaign-ai-textarea{flex:1;min-width:200px;resize:none;font-family:inherit}
        .bb-campaign-ai-reply{margin-top:12px;font-size:13px;color:var(--text-secondary);line-height:1.6;white-space:pre-wrap;background:color-mix(in srgb,var(--text-primary) 6%,var(--bg-card));border-radius:8px;padding:12px 14px}
        .bb-campaign-add-row{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end}
        .bb-campaign-day-h{font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--accent);margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--border)}
        .bb-campaign-row{display:flex;align-items:center;gap:12px;padding:12px 14px;background:color-mix(in srgb,var(--text-primary) 3%,var(--bg-card));border:1px solid var(--border);border-radius:10px;margin-bottom:8px;flex-wrap:wrap}
        .bb-admin-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;margin-top:10px;border-radius:10px;border:1px solid var(--border)}
        .bb-admin-table{width:100%;border-collapse:collapse;font-size:13px;min-width:520px}
        .bb-admin-table th,.bb-admin-table td{padding:10px 12px;text-align:left;border-bottom:1px solid var(--border);vertical-align:top}
        .bb-admin-table th{font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);background:rgb(var(--accent-rgb) / 0.06)}
        .bb-admin-table tbody tr:hover{background:rgb(var(--accent-rgb) / 0.06)}
        .bb-back-btn{display:inline-flex;align-items:center;gap:6px;background:transparent;border:1px solid var(--border);color:var(--text-primary);padding:8px 16px;border-radius:8px;cursor:pointer;font-family:'Outfit',sans-serif;font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-bottom:14px;min-height:40px}
        .bb-back-btn:hover{background:var(--accent-dim);border-color:var(--accent);color:var(--accent)}
        .bb-section-h2{font-family:'Bebas Neue',sans-serif;font-size:26px;letter-spacing:3px;background:linear-gradient(95deg,var(--olive) 0%,var(--accent) 38%,var(--accent-light) 78%,var(--accent-bright) 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin:0 0 16px;text-transform:uppercase}
        .bb-panel{background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px;box-sizing:border-box;box-shadow:var(--shadow-sm)}
        .bb-list-rows{list-style:none;margin:0;padding:0;display:grid;gap:10px}
        .bb-list-row{display:block;padding:14px 16px;background:rgb(var(--accent-rgb) / 0.06);border:1px solid var(--border);border-radius:8px;cursor:pointer;box-sizing:border-box}
        .bb-list-row-static{cursor:default}
        .bb-list-row-active{border-color:rgb(var(--accent-rgb) / 0.55)!important;background:rgb(var(--accent-rgb) / 0.1)!important}
        .bb-msg-scroll{max-height:260px;overflow-y:auto;display:grid;gap:8px}
        .bb-msg-meta{margin-top:4px;color:var(--text-secondary);font-size:10px}
        .bb-list-row-title{font-size:14px;font-weight:700;color:var(--text-primary);margin:0 0 4px}
        .bb-list-row-sub{font-family:'DM Sans',sans-serif;font-size:12px;color:var(--text-secondary);margin:0;line-height:1.45}
        .bb-inline-label{font-size:10px;font-weight:600;letter-spacing:1.2px;color:var(--text-secondary);margin-bottom:8px;display:block}
        .bb-input,.bb-textarea{background:var(--bg-card);border:1px solid var(--border);color:var(--text-primary);border-radius:8px;padding:10px 12px;font:inherit;width:100%;box-sizing:border-box}.bb-input:focus,.bb-textarea:focus{border-color:var(--accent);outline:none}
        @media(max-width:520px){.bb-input,.bb-textarea{font-size:16px;line-height:1.35}}
        .bb-input::placeholder,.bb-textarea::placeholder{color:var(--text-muted)}
        .bb-btn-primary{border:1px solid var(--accent-border);background:linear-gradient(145deg,var(--accent-light) 0%,var(--accent) 52%,var(--accent-dark) 100%);color:var(--on-accent);border-radius:10px;padding:10px 16px;font-weight:700;cursor:pointer;font:inherit;box-shadow:0 6px 22px rgb(var(--accent-rgb) / 0.35),inset 0 1px 0 color-mix(in srgb,var(--text-on-accent) 35%,transparent)}
        .bb-btn-primary:hover{background:linear-gradient(145deg,var(--accent) 0%,var(--accent-dark) 100%);filter:none;box-shadow:0 8px 28px rgb(var(--accent-rgb) / 0.42),inset 0 1px 0 color-mix(in srgb,var(--text-on-accent) 40%,transparent)}
        .bb-btn-primary:disabled{opacity:.55;cursor:not-allowed;filter:none;box-shadow:none;border-color:var(--border)}
        .bb-msg-bubble-user{align-self:end;max-width:88%;background:var(--accent-dim);border:1px solid var(--accent-border);border-radius:10px;padding:10px}
        .bb-msg-bubble-client{align-self:start;max-width:88%;background:var(--bg-surface);border:1px solid var(--border);border-radius:10px;padding:10px}
        .bb-detail-panel{border-color:var(--accent-border)!important;border-width:1.5px!important}
        .bb-detail-modal-backdrop{position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:14px}
        .bb-detail-modal-card{position:relative;width:min(900px,100%);max-height:82vh;overflow-y:auto;margin:0!important;box-shadow:var(--shadow-lg)}
        .bb-nav-dock{position:fixed;left:0;right:0;bottom:0;z-index:30;background:color-mix(in srgb,var(--bg-primary) 93%,transparent);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-top:1px solid var(--border);box-shadow:0 -10px 40px rgb(var(--shadow-rgb) / 0.08);padding-bottom:max(0px,calc(env(safe-area-inset-bottom,0px) - 8px))}
        .bb-nav-inner{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));min-height:70px;align-items:center}
        .bb-nav-btn{border:none;background:transparent;color:var(--text-secondary);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-size:11px;font-weight:600;letter-spacing:.3px;position:relative;cursor:pointer;font:inherit;padding:9px 2px;font-family:'Outfit',sans-serif}
        .bb-nav-btn:hover,.bb-nav-btn:focus{color:var(--text-primary);outline:none}
        .bb-nav-btn-active{color:var(--accent)}
        .bb-nav-tabbar{position:absolute;top:0;left:50%;transform:translateX(-50%);height:3px;width:32px;background:linear-gradient(90deg,var(--accent),var(--accent-light),var(--accent-bright));border-radius:2px;box-shadow:0 0 12px rgb(var(--accent-rgb) / 0.45)}
        .bb-trainer-with-sidebar{display:flex;flex:1;align-items:stretch;min-height:0;min-width:0}
        .bb-trainer-sidebar{display:none;flex-direction:column;width:228px;flex-shrink:0;border-right:1px solid var(--border);background:color-mix(in srgb,var(--bg-primary) 97%,transparent);padding:12px 0 24px;gap:2px}
        .bb-trainer-side-link{display:flex;align-items:center;gap:10px;padding:11px 16px;border:none;background:transparent;color:var(--text-secondary);font:inherit;font-size:13px;font-weight:600;cursor:pointer;text-align:left;width:100%;box-sizing:border-box;border-radius:0}
        .bb-trainer-side-link:hover,.bb-trainer-side-link:focus{background:var(--accent-dim);color:var(--accent);outline:none}
        .bb-trainer-side-link-active{color:var(--accent);background:rgb(var(--accent-rgb) / 0.1);box-shadow:inset 3px 0 0 var(--accent)}
        .bb-trainer-main-wrap{flex:1;min-width:0;display:flex;flex-direction:column}
        .bb-trainer-ham{display:none;align-items:center;justify-content:center;width:44px;height:44px;border-radius:10px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-primary);font-size:20px;cursor:pointer;flex-shrink:0}
        .bb-trainer-ham:hover{border-color:var(--accent);color:var(--accent)}
        .bb-trainer-drawer-overlay{position:fixed;inset:0;z-index:34;background:rgba(0,0,0,0.5)}
        .bb-trainer-drawer{position:fixed;left:0;top:0;bottom:0;width:min(280px,90vw);z-index:36;background:var(--bg-card);border-right:1px solid var(--border);padding:max(12px,env(safe-area-inset-top,0px)) 0 24px;overflow-y:auto;transform:translateX(-100%);transition:transform 0.22s ease;box-shadow:var(--shadow-lg)}
        .bb-trainer-drawer-open{transform:translateX(0)}
        .bb-trainer-drawer-close{display:flex;align-items:center;justify-content:space-between;padding:8px 16px 16px;border-bottom:1px solid var(--border);margin-bottom:8px}
        .bb-trainer-drawer-close button{border:none;background:transparent;color:var(--text-secondary);font-size:22px;cursor:pointer;line-height:1}
        @media(min-width:900px){
          .bb-trainer-shell .bb-trainer-sidebar{display:flex}
          .bb-trainer-shell .bb-nav-dock{display:none!important}
          .bb-trainer-shell .bb-trainer-ham{display:none!important}
          .bb-trainer-drawer,.bb-trainer-drawer-overlay{display:none!important}
        }
        @media(max-width:899px){
          .bb-trainer-shell .bb-trainer-ham{display:inline-flex}
        }
        .bb-trainer-drawer:not(.bb-trainer-drawer-open){pointer-events:none}
        .bb-staff-overlay{position:fixed;left:0;right:0;top:calc(58px + env(safe-area-inset-top,0px));bottom:calc(70px + max(0px,calc(env(safe-area-inset-bottom,0px) - 8px)));z-index:25;background:var(--dark);color:var(--text-on-dark);overflow-y:auto;padding:14px 14px 20px;-webkit-overflow-scrolling:touch}
        .bb-staff-overlay .bb-section-h2{color:var(--text-on-dark)}
        .bb-staff-overlay .bb-back-btn{border-color:rgba(255,255,255,0.45);color:rgba(255,255,255,0.9)}
        .bb-staff-overlay .bb-back-btn:hover{background:rgba(201,168,76,0.15);border-color:var(--accent);color:var(--accent)}
        .bb-ai-assist-panel{position:fixed;bottom:calc(70px + max(12px,env(safe-area-inset-bottom,0px)));right:max(16px,env(safe-area-inset-right,0px));left:auto;width:min(380px,calc(100vw - 32px));max-height:min(420px,65dvh);background:var(--bg-card);border:1px solid var(--border);border-radius:16px;box-shadow:var(--shadow-lg);z-index:40;display:flex;flex-direction:column;overflow:hidden}
        .bb-ai-assist-panel[hidden]{display:none!important}
        .bb-ai-assist-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--border);background:var(--accent-dim)}
        .bb-ai-assist-head strong{font-size:15px;color:var(--text-primary)}
        .bb-ai-assist-x{width:36px;height:36px;border:none;background:transparent;color:var(--text-secondary);font-size:22px;cursor:pointer;border-radius:8px}
        .bb-ai-assist-body{padding:12px 16px;font-size:12px;color:var(--text-secondary);line-height:1.5;border-bottom:1px solid var(--border)}
        .bb-ai-assist-foot{padding:10px 12px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:8px}
        .bb-user-welcome-card{background:linear-gradient(180deg,var(--bg-surface),var(--bg-primary));border:1px solid var(--border);border-radius:16px;padding:16px;display:flex;gap:12px;align-items:flex-start;text-align:left;cursor:pointer;width:100%;box-sizing:border-box}
        .bb-user-welcome-card:hover{border-color:var(--accent-border)}
        .bb-user-wc-icon{width:44px;height:44px;border-radius:12px;background:var(--accent-dim);border:1px solid var(--border);display:grid;place-items:center;font-size:20px;flex-shrink:0}
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
        #usec-home .today-card{min-height:100px;padding:20px;border-radius:14px;border:1px solid var(--border);background:color-mix(in srgb, var(--text-primary) 4%, var(--bg-primary))}
        #usec-home .micro-goals-wrap{padding:28px;border-radius:16px;border:1px solid var(--border);background:color-mix(in srgb, var(--text-primary) 3%, var(--bg-primary))}
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
          .bb-client-home-title{text-align:center;width:100%}
          #usec-home .user-welcome{text-align:center;display:flex;flex-direction:column;align-items:center}
          #usec-home .user-welcome-avatar,#usec-home .user-welcome-avatar-placeholder{margin-left:auto;margin-right:auto}
          #usec-home .user-welcome h1{text-align:center;width:100%}
          #usec-home .user-welcome .user-welcome-tag{width:100%;text-align:center}
          #usec-home .today-card{text-align:center}
        }
        .user-welcome{text-align:center;padding:56px 24px 64px;position:relative}
        .user-welcome::before{content:'';position:absolute;top:0;left:50%;transform:translateX(-50%);width:min(480px,95%);height:320px;background:radial-gradient(ellipse 70% 60% at 50% 0%,rgb(var(--accent-rgb) / 0.08) 0%,transparent 70%);pointer-events:none}
        .user-welcome-avatar-placeholder{position:relative;margin:0 auto 32px;width:100px;height:100px;border-radius:50%;border:3px solid rgb(var(--accent-rgb) / 0.55);background:radial-gradient(circle at 50% 30%,rgb(var(--accent-rgb) / 0.14),color-mix(in srgb, var(--bg-primary) 96%, transparent) 68%);display:grid;place-items:center;color:var(--text-secondary);box-shadow:0 12px 32px rgb(var(--shadow-rgb) / 0.08),0 0 0 4px rgb(var(--accent-rgb) / 0.12),0 0 20px rgb(var(--accent-rgb) / 0.15);flex-shrink:0}
        .user-welcome-avatar-placeholder svg{width:44px;height:44px;stroke:var(--text-secondary);fill:none;stroke-width:1.5}
        .user-welcome h1{font-family:'Syne',sans-serif;font-size:clamp(34px,5vw,56px);font-weight:800;letter-spacing:-0.02em;margin-bottom:12px;line-height:1.1}
        .user-welcome h1 .welcome-label{display:block;font-size:11px;font-weight:600;letter-spacing:4px;text-transform:uppercase;color:var(--text-secondary);margin-bottom:8px;opacity:.9}
        .user-welcome h1 .welcome-name{background:linear-gradient(135deg,var(--text-primary) 0%,var(--accent-light) 45%,var(--accent) 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
        .user-welcome .user-welcome-tag{font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:600;letter-spacing:2.5px;color:var(--accent);margin-bottom:32px;opacity:1}
        .welcome-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;max-width:860px;margin:0 auto}
        .welcome-card{position:relative;display:flex;align-items:center;gap:14px;padding:18px 20px;background:linear-gradient(180deg,var(--bg-surface),var(--bg-primary));border:1px solid var(--border);border-radius:16px;text-align:left;cursor:pointer;transition:all .3s ease;overflow:hidden;box-shadow:var(--shadow-sm);font:inherit;color:inherit;width:100%;box-sizing:border-box}
        .welcome-card::before{content:'';position:absolute;left:0;top:14px;bottom:14px;width:3px;background:linear-gradient(180deg,rgb(var(--accent-rgb) / 0.95),rgb(var(--accent-rgb) / 0.18));border-radius:999px;opacity:.75;transition:opacity .3s}
        .welcome-card::after{content:'›';margin-left:auto;color:rgb(var(--accent-rgb) / 0.9);font-size:22px;line-height:1;transition:transform .3s ease,color .3s ease}
        .welcome-card:hover{border-color:var(--accent-border);transform:translateY(-2px);box-shadow:var(--shadow-md)}
        .welcome-card:hover::before{opacity:1}
        .welcome-card:hover::after{transform:translateX(3px);color:var(--accent)}
        .welcome-card .wc-icon-wrap{width:48px;height:48px;flex:0 0 48px;margin:0;border-radius:12px;background:var(--accent-dim);border:1px solid var(--border);display:grid;place-items:center;transition:all .3s}
        .welcome-card .wc-icon-wrap svg{width:28px;height:28px;stroke:var(--accent);fill:none;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round;transition:stroke .4s}
        .welcome-card:hover .wc-icon-wrap{background:var(--accent-dim);border-color:var(--accent-border)}
        .welcome-card:hover .wc-icon-wrap svg{stroke:var(--accent-light)}
        .welcome-card .wc-copy{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1;text-align:left}
        .welcome-card .wc-title{font-family:'Syne',sans-serif;font-size:13px;font-weight:700;letter-spacing:1.2px;color:var(--text-primary);margin:0;text-transform:uppercase}
        .welcome-card .wc-desc{font-size:12px;color:var(--text-secondary);line-height:1.45;letter-spacing:0.1px;margin:0}
        .wc-title.sc-style{font-family:'Bebas Neue',sans-serif;letter-spacing:2px;color:var(--accent)}
        .welcome-card .req{color:var(--red)}
        .today-dash{display:flex;flex-direction:column;gap:24px;max-width:640px;margin:0 auto}
        .today-row{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start}
        .today-card{flex:1;min-width:200px;padding:20px;background:color-mix(in srgb, var(--text-primary) 5%, var(--bg-primary));border:1px solid var(--border);border-radius:12px}
        .today-card h3{font-size:12px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:var(--olive);margin-bottom:12px}
        .today-card p{margin:0;font-size:14px;color:var(--text-secondary);line-height:1.5}
        .today-card .val{font-weight:600;color:var(--text-primary);margin-top:6px}
        .today-card.action{cursor:pointer;transition:background .2s,border-color .2s}
        .today-card.action:hover{background:rgb(var(--accent-rgb) / 0.06);border-color:var(--accent)}
        .micro-goals-wrap{background:color-mix(in srgb, var(--text-primary) 3%, var(--bg-primary));border:1px solid var(--border);border-radius:14px;padding:24px;margin:0}
        .micro-goals-wrap h3{font-size:13px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:var(--olive);margin-bottom:16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
        .micro-goals-wrap .streak-badge{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;background:rgb(var(--accent-rgb) / 0.2);border-radius:20px;font-size:13px;font-weight:700;color:var(--accent);transition:background .3s,box-shadow .3s,transform .15s}
        .micro-goals-wrap .streak-badge[data-tier="fire"]{background:var(--accent-dim);box-shadow:0 0 12px rgb(var(--accent-rgb) / 0.22)}
        .micro-goals-wrap .streak-badge[data-tier="rocket"]{background:linear-gradient(135deg,rgb(var(--accent-rgb) / 0.28),var(--accent-dim));box-shadow:0 0 16px rgb(var(--accent-rgb) / 0.25)}
        .micro-goals-wrap .streak-badge[data-tier="diamond"]{background:linear-gradient(135deg,rgb(var(--shadow-rgb) / 0.08),rgb(var(--accent-rgb) / 0.22));box-shadow:0 0 20px rgb(var(--accent-rgb) / 0.3)}
        .micro-goals-wrap .streak-badge[data-tier="legend"]{background:linear-gradient(135deg,rgb(var(--accent-rgb) / 0.35),rgb(var(--accent-rgb) / 0.18));box-shadow:0 0 24px rgb(var(--accent-rgb) / 0.38);animation:bbStreakGlow 2s ease-in-out infinite alternate}
        .micro-goals-wrap .streak-badge[data-at-risk="true"]{background:var(--red-dim);box-shadow:0 0 16px rgb(var(--red-rgb) / 0.35);animation:bbStreakPulse 1.5s ease-in-out infinite}
        @keyframes bbStreakGlow{from{box-shadow:0 0 20px rgb(var(--accent-rgb) / 0.28)}to{box-shadow:0 0 28px rgb(var(--accent-rgb) / 0.45)}}
        @keyframes bbStreakPulse{0%,100%{opacity:1}50%{opacity:.85}}
        .streak-at-risk-banner{display:flex;align-items:center;gap:10px;padding:12px 16px;background:var(--red-dim);border:1px solid rgb(var(--red-rgb) / 0.35);border-radius:10px;margin-bottom:16px}
        .streak-at-risk-banner .icon{font-size:16px;flex-shrink:0;line-height:1}
        .streak-at-risk-banner .text{flex:1;font-size:13px;font-weight:600;color:var(--text-primary)}
        .micro-goals-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin-bottom:20px}
        @media(min-width:600px){.micro-goals-grid{grid-template-columns:repeat(4,1fr)}}
        .micro-goal-field{display:flex;flex-direction:column;gap:6px}
        .micro-goal-field label{font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--text-secondary)}
        .micro-goal-field input{width:100%;padding:10px 14px;border:1px solid var(--border);border-radius:8px;background:var(--bg-card);color:var(--text-primary);font-size:14px;box-sizing:border-box}
        .micro-goal-field input:focus{border-color:var(--accent);outline:none}
        .micro-goal-field input::placeholder{color:var(--text-muted)}
        .micro-goal-field input:disabled{opacity:0.75}
        .micro-goals-submit{width:100%;padding:12px;background:linear-gradient(145deg,var(--accent-light),var(--accent) 45%,var(--accent-dark));border:1px solid var(--accent-border);border-radius:10px;color:var(--on-accent);font-weight:700;font-size:13px;letter-spacing:1px;cursor:pointer;transition:opacity .2s,filter .2s;box-shadow:0 6px 20px rgb(var(--accent-rgb) / 0.3),inset 0 1px 0 color-mix(in srgb,var(--text-on-accent) 35%,transparent)}
        .micro-goals-submit:hover{background:var(--accent-dark);color:var(--text-on-accent)}
        .micro-goals-submit:hover{opacity:.95}
        .micro-goals-submit:disabled{opacity:.5;cursor:not-allowed}
        .weekly-recap{display:flex;flex-wrap:wrap;gap:12px;margin-top:16px;padding-top:16px;border-top:1px solid var(--border)}
        .weekly-recap-item{flex:1;min-width:100px;text-align:center;padding:12px;background:var(--bg-card);border-radius:8px}
        .weekly-recap-item .lbl{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-secondary);margin-bottom:4px;display:block}
        .weekly-recap-item .num{font-size:18px;font-weight:700;color:var(--accent)}
        .push-enable-wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:18px 20px;background:rgb(var(--accent-rgb) / 0.1);border:1px solid rgb(var(--accent-rgb) / 0.35);border-radius:10px;margin-top:16px;text-align:center}
        .push-enable-wrap p{margin:0;min-width:0;font-size:13px;color:var(--text-secondary);max-width:320px}
        .push-enable-btn{padding:10px 20px;background:linear-gradient(145deg,var(--accent-light),var(--accent) 45%,var(--accent-dark));border:1px solid var(--accent-border);border-radius:10px;color:var(--on-accent);font-weight:700;font-size:12px;letter-spacing:.5px;cursor:pointer;box-shadow:0 6px 20px rgb(var(--accent-rgb) / 0.3),inset 0 1px 0 color-mix(in srgb,var(--text-on-accent) 35%,transparent)}
        .push-enable-btn:hover{background:var(--accent-dark);color:var(--text-on-accent)}
        .ud-user-back{margin-bottom:16px}
        .ud-back-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;background:transparent;border:1px solid var(--border);color:var(--text-primary);border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;transition:all .2s;font-family:'Outfit',sans-serif}
        .ud-back-btn:hover{background:var(--accent-dim);border-color:var(--accent);color:var(--accent)}
        .form-hint{font-size:14px;color:var(--text-secondary);margin:0 0 16px;line-height:1.5}
        .checkin-hub-back{margin-bottom:16px}
        .checkin-back-btn{display:inline-flex;align-items:center;gap:4px;padding:6px 12px;background:transparent;border:1px solid var(--border);color:var(--text-primary);border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;transition:all .2s;font-family:'Outfit',sans-serif}
        .checkin-back-btn:hover{background:var(--accent-dim);border-color:var(--accent);color:var(--accent)}
        .checkin-hub-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;max-width:720px}
        .checkin-option-card{display:flex;flex-direction:column;align-items:flex-start;gap:10px;padding:20px;background:linear-gradient(180deg,var(--bg-surface),var(--bg-primary));border:1px solid var(--border);border-radius:16px;cursor:pointer;transition:all .3s ease;box-shadow:var(--shadow-sm);text-align:left;font:inherit;color:inherit;width:100%;box-sizing:border-box}
        .checkin-option-card:hover{border-color:var(--accent-border);transform:translateY(-2px);box-shadow:var(--shadow-md)}
        .checkin-option-card .checkin-card-icon{width:48px;height:48px;border-radius:12px;background:var(--accent-dim);border:1px solid var(--border);display:grid;place-items:center}
        .checkin-option-card .checkin-card-icon svg{width:28px;height:28px;stroke:var(--accent);fill:none;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
        .checkin-option-card .checkin-card-title{font-family:'Syne',sans-serif;font-size:14px;font-weight:700;letter-spacing:1px;color:var(--text-primary);text-transform:uppercase;margin:0}
        .checkin-option-card .checkin-card-desc{font-size:12px;color:var(--text-secondary);line-height:1.45;margin:0}
        .ud-form-section-title{font-family:'Syne',sans-serif;font-size:14px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--accent);margin-bottom:20px;margin-top:0}
        .bb-trainer-profile-page{max-width:520px;margin:0 auto}
        .bb-trainer-profile-page-sub{font-size:14px;color:var(--text-secondary);line-height:1.5;margin:-4px auto 18px;text-align:center;max-width:520px;padding:0 8px;box-sizing:border-box}
        .bb-trainer-change-photo{margin-top:14px;padding:12px 24px;border-radius:10px;border:1px solid var(--accent-border);background:linear-gradient(145deg,var(--accent-light),var(--accent) 45%,var(--accent-dark));color:var(--on-accent);font-weight:700;font-size:12px;letter-spacing:.08em;text-transform:none;cursor:pointer;font:inherit;display:block;width:100%;max-width:240px;margin-left:auto;margin-right:auto;box-shadow:0 6px 20px rgb(var(--accent-rgb) / 0.26),inset 0 1px 0 color-mix(in srgb,var(--text-on-accent) 28%,transparent)}
        .bb-trainer-change-photo:hover{filter:brightness(1.03)}
        .bb-trainer-avatar-ring{width:120px;height:120px;border-radius:50%;object-fit:cover;border:3px solid rgb(var(--accent-rgb) / 0.55);display:block;margin:0 auto;box-sizing:border-box}
        .bb-trainer-avatar-placeholder-wrap{width:120px;height:120px;margin:0 auto}
        .ud-form-group{margin-bottom:18px;min-width:0}
        .ud-form-group label{display:block;font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:6px;letter-spacing:.5px}
        .ud-form-group label .req{color:var(--red)}
        .ud-form-input{width:100%;padding:12px 16px;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-family:'Outfit',sans-serif;font-size:14px;transition:border-color .3s;outline:none;box-sizing:border-box}
        .ud-form-input:focus{border-color:var(--accent)}
        .ud-form-input::placeholder{color:var(--text-muted)}
        .ud-form-input:focus{border-color:var(--accent)}
        .ud-form-input::placeholder{color:var(--text-secondary)}
        textarea.ud-form-input{resize:vertical;min-height:80px}
        .ud-form-submit{width:100%;padding:14px;background:linear-gradient(145deg,var(--accent-light),var(--accent) 45%,var(--accent-dark));border:1px solid var(--accent-border);border-radius:10px;color:var(--on-accent);font-family:'Outfit',sans-serif;font-weight:700;font-size:15px;letter-spacing:1px;text-transform:uppercase;cursor:pointer;transition:all .3s;margin-top:8px;box-shadow:0 8px 24px rgb(var(--accent-rgb) / 0.32),inset 0 1px 0 color-mix(in srgb,var(--text-on-accent) 35%,transparent)}
        .ud-form-submit:hover{transform:translateY(-1px);background:var(--accent-dark);color:var(--text-on-accent);box-shadow:var(--shadow-md)}
        .ud-form-divider{height:1px;background:var(--border);margin:24px 0}
        .ud-form-hint-sm{font-size:11px;color:var(--text-secondary);margin-top:4px;display:block}
        .timer-display{text-align:center;margin:28px 0;overflow-x:auto;-webkit-overflow-scrolling:touch}
        .timer-digits{font-family:'Bebas Neue',sans-serif;font-size:clamp(30px,9vw,64px);letter-spacing:2px;color:var(--text-primary);display:inline-flex;flex-wrap:nowrap;align-items:center;justify-content:center;gap:clamp(4px,1.5vw,8px);max-width:100%;box-sizing:border-box}
        .timer-digits span{display:inline-flex;align-items:center;justify-content:center;min-width:2.2ch;padding:clamp(4px,1.2vw,8px) clamp(6px,2vw,12px);background:var(--bg-card);border-radius:8px;box-sizing:border-box;flex:0 0 auto}
        .timer-digits .timer-sep{min-width:auto;padding:clamp(2px,0.8vw,6px) clamp(2px,1vw,6px);font-size:0.65em;line-height:1;color:var(--accent);background:transparent}
        .timer-sep{color:var(--accent);vertical-align:middle}
        .timer-btn{display:block;margin:16px auto;padding:14px 60px;border:1.5px solid var(--accent);border-radius:10px;background:rgb(var(--accent-rgb) / 0.05);color:var(--accent);font-size:28px;cursor:pointer;transition:all .3s;box-shadow:0 0 20px rgb(var(--accent-rgb) / 0.1);font-family:inherit}
        .timer-btn:hover{background:rgb(var(--accent-rgb) / 0.15);box-shadow:0 0 30px rgb(var(--accent-rgb) / 0.2)}
        .timer-reset{display:block;margin:8px auto;padding:8px 20px;border:none;background:transparent;color:var(--text-secondary);font-size:12px;cursor:pointer;letter-spacing:1px;text-transform:uppercase;font-family:'Outfit',sans-serif}
        .timer-reset:hover{color:var(--accent)}
        .workout-programs-box{margin-top:28px}
        .user-programs-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px}
        .prog-card{background:linear-gradient(180deg,var(--bg-surface),var(--bg-primary));border:1px solid var(--border);border-radius:16px;overflow:hidden;box-shadow:var(--shadow-sm);display:flex;flex-direction:column;min-width:0}
        .prog-meta{padding:14px 16px;display:flex;flex-direction:column;gap:6px}
        .prog-title{font-family:'Syne',sans-serif;font-size:14px;font-weight:700;letter-spacing:0.6px;color:var(--text-primary);text-transform:uppercase;line-height:1.25}
        .prog-sub{font-size:12px;color:var(--text-secondary);line-height:1.4}
        .prog-actions{display:flex;gap:10px;flex-wrap:wrap;padding:0 16px 16px}
        .prog-actions a{flex:1 1 0%;min-width:120px;text-align:center;padding:10px;border-radius:8px;background:rgb(var(--accent-rgb) / 0.12);color:var(--accent);font-weight:600;font-size:12px;text-decoration:none;border:1px solid rgb(var(--accent-rgb) / 0.25)}
        .schedule-call-block{padding:24px;background:rgb(var(--accent-rgb) / 0.06);border:1px solid var(--border);border-radius:14px;margin-bottom:24px;min-width:0;overflow:hidden}
        .ud-form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        @media(max-width:520px){.ud-form-row{grid-template-columns:1fr}}
        .my-meetings{margin-top:24px}
        .my-meeting-item{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:14px 18px;background:color-mix(in srgb, var(--text-primary) 5%, var(--bg-primary));border:1px solid var(--border);border-radius:10px;margin-bottom:10px}
        .my-meeting-item .m-info{font-size:14px;color:var(--text-primary)}
        .my-meeting-item .m-date{color:var(--accent);font-weight:600}
        .chat-header-strip{margin-bottom:20px;text-align:center}
        .chat-header-desc{font-size:14px;color:var(--text-secondary);margin:0}
        .chat-container{background:linear-gradient(180deg,var(--bg-card),var(--bg-surface));border:1px solid var(--border);border-radius:20px;padding:20px}
        .thread-messages-box{display:flex;flex-direction:column;gap:10px;min-height:240px;max-height:420px;overflow-y:auto;padding:20px;background:var(--bg-card);border:1px solid var(--border);border-radius:16px;margin-bottom:20px;-webkit-overflow-scrolling:touch}
        .thread-msg{display:flex;align-items:flex-end;gap:10px;max-width:82%}
        .thread-msg.user{align-self:flex-end;flex-direction:row-reverse;margin-left:auto}
        .thread-msg.admin{align-self:flex-start;flex-direction:row}
        .thread-msg-bubble{padding:12px 16px;border-radius:18px;font-size:14px;line-height:1.55;word-break:break-word}
        .thread-msg.user .thread-msg-bubble{border-bottom-right-radius:4px;background:linear-gradient(135deg,rgb(var(--accent-rgb) / 0.28),rgb(var(--accent-rgb) / 0.12));border:1px solid rgb(var(--accent-rgb) / 0.45);color:var(--text-primary)}
        .thread-msg.admin .thread-msg-bubble{border-bottom-left-radius:4px;background:linear-gradient(180deg,var(--bg-surface),var(--bg-card));border:1px solid var(--border);color:var(--text-primary);box-shadow:0 1px 2px rgb(var(--shadow-rgb) / 0.04)}
        .thread-msg-meta{font-size:11px;color:var(--text-secondary);margin-top:6px;opacity:.9}
        .thread-reply-wrap{display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-top:12px}
        .thread-reply-wrap .ud-form-input{flex:1;min-width:0;min-height:52px;resize:none;border-radius:14px}
        .chat-send-btn{min-height:52px;padding:0 24px;border-radius:14px;font-weight:600;background:linear-gradient(145deg,var(--accent-light),var(--accent) 45%,var(--accent-dark));color:var(--on-accent);border:1px solid var(--accent-border);cursor:pointer;font-family:'Outfit',sans-serif;box-shadow:0 6px 20px rgb(var(--accent-rgb) / 0.3),inset 0 1px 0 color-mix(in srgb,var(--text-on-accent) 35%,transparent)}
        .chat-send-btn:hover{background:var(--accent-dark);color:var(--text-on-accent)}
        .progress-form-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:16px;margin-bottom:24px}
        .progress-form-grid .ud-form-group{min-width:0}
        .admin-cp-heading{font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:rgb(var(--accent-rgb) / 0.7);margin-bottom:12px;font-family:'Outfit',sans-serif}
        .progress-logs-list{background:color-mix(in srgb, var(--text-primary) 5%, var(--bg-primary));border:1px solid var(--border);border-radius:8px;overflow-x:auto}
        .progress-logs-list table{width:100%;min-width:320px;border-collapse:collapse;font-size:13px}
        .progress-logs-list th{text-align:left;padding:10px 12px;color:var(--accent);font-weight:600;border-bottom:1px solid var(--border);background:rgb(var(--accent-rgb) / 0.06)}
        .progress-logs-list td{padding:10px 12px;color:var(--text-secondary);border-bottom:1px solid var(--border)}
        .progress-logs-list tr:last-child td{border-bottom:none}
        .admin-cp-placeholder{color:var(--text-secondary);padding:16px;text-align:center;font-size:14px;margin:0}
        .admin-cp-kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:16px}
        @media(min-width:640px){.admin-cp-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}}
        .admin-cp-kpi{background:color-mix(in srgb,var(--text-primary) 5%,var(--bg-card));border:1px solid var(--border);border-radius:8px;padding:14px;text-align:center}
        .admin-cp-kpi .num{display:block;font-size:1.15rem;font-weight:700;color:var(--accent)}
        .admin-cp-kpi .lbl{display:block;font-size:10px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;margin-top:6px}
        .bb-client-progress-charts{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;margin-top:16px}
        .bb-cp-chart-wrap{background:color-mix(in srgb,var(--text-primary) 4%,var(--bg-card));border:1px solid var(--border);border-radius:12px;padding:12px;min-height:200px}
        .bb-cp-chart-wrap canvas{max-height:200px;width:100%!important}
        .bb-cp-chart-title{font-size:11px;color:var(--text-secondary);margin-top:8px;text-align:center}
        .progress-insights{margin-top:12px;padding:12px 14px;background:rgb(var(--accent-rgb) / 0.08);border:1px solid rgb(var(--accent-rgb) / 0.22);border-radius:8px;font-size:13px;line-height:1.5;color:var(--text-secondary)}
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
          background: "color-mix(in srgb, var(--bg-primary) 93%, transparent)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {isTrainer ? (
            <button type="button" className="bb-trainer-ham" onClick={() => setTrainerNavOpen(true)} aria-label="Open menu">
              &#9776;
            </button>
          ) : null}
          <img src={`${apiBase}/img/Fitbase_logo2.png`} alt="FitBase" style={{ height: 52, width: "auto", objectFit: "contain" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="bb-notif-wrap" ref={notifWrapRef}>
            <button
              type="button"
              className="bb-header-btn"
              aria-label="Notifications"
              aria-expanded={notifOpen}
              onClick={() => setNotifOpen((o) => !o)}
            >
              🔔
              {inboxItems.length > 0 ? (
                <span className="bb-header-badge">{inboxItems.length > 99 ? "99+" : inboxItems.length}</span>
              ) : null}
          </button>
            {notifOpen ? (
              <div className="bb-notif-panel" role="menu">
                <div className="bb-notif-panel-head">
                  <span>Notifications</span>
                  {inboxItems.length > 0 ? (
                    <button
                      type="button"
                      className="bb-notif-clear"
                      disabled={inboxLoading}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void clearInboxNotifications();
                      }}
                    >
                      Clear all
                    </button>
                  ) : null}
                </div>
                {inboxLoading && inboxItems.length === 0 ? (
                  <p className="bb-notif-empty">Loading…</p>
                ) : inboxItems.length === 0 ? (
                  <p className="bb-notif-empty">No notifications yet.</p>
                ) : (
                  inboxItems.map((n, idx) => (
                    <button
                      key={String(n.id ?? idx)}
                      type="button"
                      className="bb-notif-row"
                      role="menuitem"
                      onClick={() => applyInboxLink(n.link)}
                    >
                      <span className="bb-notif-title">{n.title || "Update"}</span>
                      {n.desc ? <span className="bb-notif-desc">{n.desc}</span> : null}
                      {n.time ? (
                        <span className="bb-notif-time">{new Date(String(n.time)).toLocaleString()}</span>
                      ) : null}
                    </button>
                  ))
                )}
                <div className="bb-notif-push-footer">
                  <button
                    type="button"
                    className="bb-notif-push-btn"
                    disabled={pushEnableBusy || !session?.token}
                    onClick={() => {
                      void (async () => {
                        if (!session?.token) return;
                        setPushEnableBusy(true);
                        setPushFeedback("");
                        try {
                          const r = await subscribeFitbasePush(apiBase, session.token);
                          if (r.ok) {
                            setPushFeedback("Push enabled. Install the app to your home screen for icon badges and alerts when the app is closed.");
                          } else if (r.reason === "denied") {
                            setPushFeedback("Notifications are blocked. Enable them in browser or system settings.");
                          } else if (r.reason === "no-vapid") {
                            setPushFeedback("Server is not configured for push yet (VAPID keys). Counts on the bell still update.");
                          } else {
                            setPushFeedback("Could not enable push on this device.");
                          }
                        } finally {
                          setPushEnableBusy(false);
                        }
                      })();
                    }}
                  >
                    {pushEnableBusy ? "Working…" : "Turn on push alerts (banner + home screen badge)"}
                  </button>
                  {pushFeedback ? <p className="bb-notif-push-hint">{pushFeedback}</p> : null}
                </div>
              </div>
            ) : null}
          </div>
          {role === "user" ? (
            <button
              type="button"
              className="user-wa-top-btn"
              title="Chat on WhatsApp"
              aria-label="Chat on WhatsApp"
              onClick={() => window.open("https://wa.me/919502575669", "_blank", "noopener,noreferrer")}
            >
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
            </button>
          ) : null}
          <button
            className="bb-header-btn"
            aria-label="Refresh"
            disabled={role === "superadmin" && superadminSync.loading}
            onClick={() => {
              if (role === "superadmin") void loadSuperadminDashboard();
              else {
                void reloadMainDashboardData();
                void loadInbox();
                if (role === "admin" && session?.token) {
                  const headers = { Authorization: `Bearer ${session.token}` };
                  void fetch(`${apiBase}/api/admin/referral-link`, { headers })
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
                }
              }
            }}
          >
            ↻
          </button>
          <button
            onClick={() => {
              clearPwaAppBadge();
              clearFitbaseSessionStorage();
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

      {isTrainer && trainerNavOpen ? (
        <button type="button" className="bb-trainer-drawer-overlay" aria-label="Close menu" onClick={() => setTrainerNavOpen(false)} />
      ) : null}
      {isTrainer ? (
        <aside
          className={`bb-trainer-drawer${trainerNavOpen ? " bb-trainer-drawer-open" : ""}`}
          aria-hidden={!trainerNavOpen}
        >
          <div className="bb-trainer-drawer-close">
            <strong style={{ fontSize: 14, color: "var(--text-primary)" }}>Menu</strong>
            <button type="button" onClick={() => setTrainerNavOpen(false)} aria-label="Close">
              ×
            </button>
          </div>
          {trainerNavDefs.map(({ t, label, ic }) => (
            <button
              key={t}
              type="button"
              className={`bb-trainer-side-link${activeTab === t ? " bb-trainer-side-link-active" : ""}`}
              onClick={() => goTab(t)}
            >
              <span aria-hidden>{ic}</span> {label}
            </button>
          ))}
          <button
            type="button"
            className={`bb-trainer-side-link${staffAiOpen ? " bb-trainer-side-link-active" : ""}`}
            onClick={() => {
              setStaffAiOpen(true);
              setTrainerNavOpen(false);
            }}
          >
            <span aria-hidden>{String.fromCodePoint(0x1f4a1)}</span> AI Assist
          </button>
        </aside>
      ) : null}

      <div
        className={role === "user" ? "bb-user-layout-row" : undefined}
        style={{
          display: "flex",
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          flexDirection: isTrainer || role === "user" ? "row" : "column"
        }}
      >
        {role === "user" ? (
          <aside className="bb-user-sidebar-desktop" aria-label="Member navigation">
            <div className="bb-user-side-logo">
              <img src={`${apiBase}/img/Fitbase_logo2.png`} alt="FitBase" decoding="async" />
            </div>
            {(
              [
                ["home", "Home", "\u25A0"],
                ["clients", "My Workout", "\uD83C\uDFCB"],
                ["programs", "My Programs", "\uD83C\uDFAF"],
                ["progress", "My Progress", "\uD83D\uDCCA"],
                ["forms", "Sunday Check-in", "\u2713"],
                ["messages", "Messages", "\uD83D\uDCAC"],
                ["profile", "My Profile", "\uD83D\uDC64"],
                ["contact", "Contact Us", "\u2709"]
              ] as const
            ).map(([t, label, ic]) => {
              const tab = t as DashboardTab;
              const active =
                tab === "forms"
                  ? activeTab === "forms"
                  : tab === "clients"
                    ? activeTab === "clients"
                    : activeTab === tab;
              return (
                <button
                  key={t}
                  type="button"
                  className={`bb-user-side-link${active ? " bb-user-side-link-active" : ""}`}
                  onClick={() => {
                    goTab(tab);
                    if (tab === "forms") setUserCheckinView("hub");
                  }}
                >
                  <span aria-hidden>{ic}</span> {label}
                </button>
              );
            })}
          </aside>
        ) : null}
        {isTrainer ? (
          <aside className="bb-trainer-sidebar" aria-label="Trainer navigation">
            {trainerNavDefs.map(({ t, label, ic }) => (
              <button
                key={t}
                type="button"
                className={`bb-trainer-side-link${activeTab === t ? " bb-trainer-side-link-active" : ""}`}
                onClick={() => goTab(t)}
              >
                <span aria-hidden>{ic}</span> {label}
              </button>
            ))}
            <button
              type="button"
              className={`bb-trainer-side-link${staffAiOpen ? " bb-trainer-side-link-active" : ""}`}
              onClick={() => {
                setStaffAiOpen(true);
                setTrainerNavOpen(false);
              }}
            >
              <span aria-hidden>{String.fromCodePoint(0x1f4a1)}</span> AI Assist
            </button>
          </aside>
        ) : null}
        <section ref={dashMainRef} className="bb-dash-main" style={{ flex: 1, minWidth: 0 }}>
        {isTrainer && activeTab === "home" ? (
          <p className="bb-trainer-welcome-line">
            Welcome back <span className="bb-trainer-welcome-name">{displayName}</span>
          </p>
        ) : null}
        {role === "user" ? (
          <>
            <div className="bb-user-section-strip" aria-live="polite">
              <span className="bb-user-section-name">{userSecTitle}</span>
              <span className="bb-user-section-sub">{userSecSub}</span>
            </div>
            {activeTab === "home" && userShowPwaRow ? (
              <div className="bb-user-pwa-row">
                <button type="button" className="bb-user-pwa-btn" onClick={handlePwaAddToHomescreenUser}>
                  Add to Home Screen
                </button>
          </div>
        ) : null}
          </>
        ) : (
          <>
            {!(isSuperadminViewer && (activeTab === "home" || activeTab === "clients")) ? (
              <h1
                className={`bb-dashboard-title${activeTab === "home" ? "" : " bb-admin-section-page-title"}`}
              >
                {activeTab === "home"
                  ? "DASHBOARD"
                  : activeTab === "forms"
                    ? "FORMS"
                    : activeTab === "programs" && isTrainer
                      ? "PROGRAMS"
                      : activeTab === "training"
                        ? "TRAINING"
                        : activeTab === "analytics"
                          ? trainerAnalyticsSub === "insights"
                            ? "PERFORMANCE INSIGHTS"
                            : trainerAnalyticsSub === "campaigns"
                              ? "CAMPAIGNS"
                              : "ANALYTICS"
                          : activeTab === "messages" && isStaff
                            ? trainerMessagesView === "meetings"
                              ? "MEETINGS"
                              : "MESSAGES"
                            : activeTab === "profile" && isTrainer
                              ? "MY PROFILE"
                              : activeTab.toUpperCase()}
              </h1>
            ) : null}
            {isTrainer && activeTab === "profile" ? (
              <p className="bb-trainer-profile-page-sub">Keep your personal and contact details up to date.</p>
            ) : null}
          </>
        )}

        {error ? <p style={{ color: "var(--red)", marginTop: 12 }}>{error}</p> : null}

        {activeTab === "home" ? (
          <>
            {role === "user" ? (
              <div
                id="usec-home"
                style={{ marginTop: 8 }}
                className={`bb-user-home-wrap${userWide768 ? " bb-desktop" : ""}`}
              >
                <div className="bb-user-desktop-only">
                  <UserMemberDesktopDashboard
                    displayName={displayName}
                    workouts={workouts}
                    meetings={activity}
                    userToday={userToday}
                    userStreak={userStreak}
                    trainerChatName={userTrainerChatDisplayName}
                    onNavigate={userNavigateDesktop}
                  />
                </div>
                <div className="bb-user-mobile-home user-welcome">
                  {userWelcomeAvatarSrc ? (
                    <img className="user-welcome-avatar" src={userWelcomeAvatarSrc} alt="" />
                  ) : (
                    <div className="user-welcome-avatar-placeholder" aria-hidden>
                      <svg viewBox="0 0 24 24">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    </div>
                  )}
                  <h1>
                    <span className="welcome-label">Welcome back</span>
                    <span className="welcome-name">{displayName}</span>
                  </h1>
                  <p className="user-welcome-tag">Fitbase Elite Member</p>

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
                          <span className="icon" aria-hidden>
                            ⏱
                          </span>
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
                        <p>
                          Get banners when your coach messages or assigns programs, plus a count on your app icon (like food-order
                          apps)—after you enable below and add FitBase to your home screen.
                        </p>
                        <button
                          type="button"
                          className="push-enable-btn"
                          disabled={pushEnableBusy || !session?.token}
                          onClick={() => {
                            void (async () => {
                              if (!session?.token) return;
                              setPushEnableBusy(true);
                              setPushFeedback("");
                              try {
                                const r = await subscribeFitbasePush(apiBase, session.token);
                                if (r.ok) {
                                  setPushFeedback("You’re set. Keep the app installed for alerts in the background.");
                                } else if (r.reason === "denied") {
                                  setPushFeedback("Allow notifications in your browser settings to continue.");
                                } else if (r.reason === "no-vapid") {
                                  setPushFeedback("Push will work once the server has VAPID keys configured.");
                                } else {
                                  setPushFeedback("Could not subscribe on this device.");
                                }
                              } finally {
                                setPushEnableBusy(false);
                              }
                            })();
                          }}
                        >
                          {pushEnableBusy ? "…" : "Enable notifications"}
                        </button>
                        {pushFeedback ? (
                          <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)", maxWidth: 320 }}>{pushFeedback}</p>
                        ) : null}
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
                        <div className="wc-desc">
                          {userTrainerChatDisplayName ? `Chat with ${userTrainerChatDisplayName}` : "Chat with your coach"}
                        </div>
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
                {/* ── SA QUICK ACCESS STRIP ─────────────────────────── */}
                <div className="bb-sa-qac-strip">
                  {saTab === "overview" && (
                    <div
                      className="bb-sa-qac-chip bb-sa-qac-chip-stat bb-sa-welcome-chip"
                      style={{ width: "100%", padding: "12px 16px" }}
                    >
                      <span className="bb-sa-welcome-text">
                        Welcome back, {displayName || "Super Admin"}
                      </span>
                    </div>
                  )}
                  {saTab === "applications" && (
                    <>
                      <span className="bb-sa-qac-chip bb-sa-qac-chip-stat">
                        <span aria-hidden>🧑‍💼</span> Trainer apps: <strong>{trainerRequests.filter((r:any) => String(r.status) === "pending").length} pending</strong>
                      </span>
                      <span className="bb-sa-qac-chip bb-sa-qac-chip-stat">
                        <span aria-hidden>👤</span> Client reqs: <strong>{clientLeadRequests.filter((c:any) => String(c.status) === "pending").length} pending</strong>
                      </span>
                    </>
                  )}
                  {saTab === "trainers" && (
                    <>
                      <span className="bb-sa-qac-chip bb-sa-qac-chip-stat">
                        <span aria-hidden>👤</span> Active coaches: <strong>{superadminTrainers.filter((t:any) => !t.suspended).length}</strong>
                      </span>
                      <button type="button" className="bb-sa-qac-chip" onClick={() => goSaTab("applications")}>
                        <span aria-hidden>📥</span> View requests
                      </button>
                    </>
                  )}
                  {saTab === "members" && (
                    <>
                      <span className="bb-sa-qac-chip bb-sa-qac-chip-stat">
                        <span aria-hidden>👥</span> Members linked: <strong>{superadminRosterRows.length}</strong>
                      </span>
                      <button type="button" className="bb-sa-qac-chip" onClick={() => { goSaTab("applications"); setTrainerClientsView("pending"); }}>
                        <span aria-hidden>⏳</span> Pending sign-ups
                      </button>
                    </>
                  )}
                  {saTab === "enterprise" && (
                    <>
                      <span className="bb-sa-qac-chip bb-sa-qac-chip-stat">
                        <span aria-hidden>🏢</span> Enterprise requests: <strong>{superadminEnterpriseRequests.length}</strong>
                      </span>
                      <button type="button" className="bb-sa-qac-chip" onClick={() => goSaTab("applications")}>
                        <span aria-hidden>{String.fromCodePoint(0x1f4e5)}</span> View Applications
                      </button>
                    </>
                  )}
                </div>

                {/* ── OVERVIEW TAB ─────────────────────────────────── */}
                {saTab === "overview" && (
                <div className="bb-sa-home">
                  <div className="bb-sa-home-top-bento">
                    <div className="bb-sa-home-hero">
                      <p className="bb-sa-home-kicker">Command suite</p>
                      <h1 className="bb-sa-home-hero-title">Overview</h1>
                      <p className="bb-sa-home-hero-line">
                        Trainers, clients, onboarding queues — all on one canvas.
                      </p>
                      <p className="bb-sa-home-hero-date" suppressHydrationWarning>
                        {todayLabel || "\u00a0"}
                      </p>
                    </div>
                    <div className="bb-sa-home-metrics">
                      <button
                        type="button"
                        className="bb-sa-metric"
                        onClick={() => goSaTab("members")}
                      >
                        <span className="bb-sa-metric-lbl">Members</span>
                        <span className="bb-sa-metric-num num-gold">
                          {Number(superadminSnapshot?.stats?.approved_users ?? stats?.active_members ?? 0)}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="bb-sa-metric"
                        onClick={() => goSaTab("applications")}
                      >
                        <span className="bb-sa-metric-lbl">Trainer apps</span>
                        <span className="bb-sa-metric-num num-green">
                          {trainerRequests.filter((r: any) => String(r.status) === "pending").length}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="bb-sa-metric"
                        onClick={() => goSaTab("applications")}
                      >
                        <span className="bb-sa-metric-lbl">Client requests</span>
                        <span className="bb-sa-metric-num num-green">
                          {clientLeadRequests.filter((c: any) => String(c.status) === "pending").length}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="bb-sa-metric"
                        onClick={() => {
                          goTab("forms");
                          setTrainerFormsView("sunday");
                        }}
                      >
                        <span className="bb-sa-metric-lbl">Sunday check-ins</span>
                        <span className="bb-sa-metric-num num-gold">
                          {Number(superadminSnapshot?.stats?.sunday_checkins ?? 0)}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="bb-sa-metric"
                        onClick={() => { goTab("messages"); setTrainerMessagesView("threads"); }}
                      >
                        <span className="bb-sa-metric-lbl">Messages</span>
                        <span className="bb-sa-metric-num num-pink">{Number(stats?.messages ?? threads.length ?? 0)}</span>
                      </button>
                      <button
                        type="button"
                        className="bb-sa-metric"
                        onClick={() => goSaTab("trainers")}
                      >
                        <span className="bb-sa-metric-lbl">Coach portfolio</span>
                        <span className="bb-sa-metric-num num-gold">{superadminTrainers.filter((t: any) => !t.suspended).length}</span>
                      </button>
                  </div>
                  </div>

                  <div className={`bb-sa-sync-shell${superadminSync.issues.length ? " bb-sa-sync--warn" : ""}`}>
                    <button type="button" className="bb-sa-sync-trigger" onClick={() => setSuperadminSyncOpen((o) => !o)}>
                      <span className="bb-sa-sync-trigger-lbl">System sync {superadminSyncOpen ? "▾" : "▸"}</span>
                      <span className="bb-sa-sync-trigger-meta">
                        {superadminSync.lastLoadedLabel || "—"}
                        {superadminSync.loading ? " · …" : ""}
                      </span>
                    </button>
                    {superadminSyncOpen ? (
                      <div className="bb-sa-sync-body">
                        <p className="bb-list-row-sub" style={{ marginTop: 0, wordBreak: "break-word" }}>
                          Endpoint <strong>{apiBase}</strong>
                        </p>
                        {!superadminSync.issues.length ? (
                          <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--green)", lineHeight: 1.5 }}>
                            All endpoints OK. If counts stay zero, confirm forms post to this site URL.
                          </p>
                        ) : (
                          <ul style={{ margin: "10px 0 0", paddingLeft: 18, color: "var(--red)", fontSize: 12, lineHeight: 1.55 }}>
                            {superadminSync.issues.map((msg, i) => (
                              <li key={i}>{msg}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
                )}

                {/* ── APPLICATIONS TAB ─────────────────────────────── */}
                {saTab === "applications" && (
                <div className="bb-sa-home">
                  <div className="bb-sa-home-queues">
                    <div className="bb-sa-queue-col">
                      <div className="bb-sa-slim-hdr" style={{ marginBottom: 8 }}>
                        <h3 id="sa-trainer-onboarding" className="bb-sa-sec-head" style={{ margin: 0 }}>
                          Trainer requests
                        </h3>
                        <span className="bb-sa-slim-count">
                          {trainerRequests.filter((r: any) => String(r.status) === "pending").length} pending · {trainerRequests.length} total
                        </span>
                      </div>
                      <p style={{ margin: "0 0 12px", fontSize: 13 }}>
                        <a href="/admin/trainers" style={{ color: "var(--accent)", fontWeight: 600 }}>
                          Open trainer management (tables &amp; credentials) →
                        </a>
                      </p>
                      <div className="bb-sa-queue-panel">
                        {trainerRequests.length ? (
                          <div className="bb-sa-slim-scrollwrap">
                            <table className="bb-sa-slim-table">
                              <thead>
                                <tr>
                                  <th>Name</th>
                                  <th>Email</th>
                                  <th>Status</th>
                                  <th>Submitted</th>
                                  <th>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {[...trainerRequests]
                                  .sort((a: any, b: any) => {
                                    const pa = String(a.status) === "pending" ? 0 : 1;
                                    const pb = String(b.status) === "pending" ? 0 : 1;
                                    if (pa !== pb) return pa - pb;
                                    return String(b.created_at || "").localeCompare(String(a.created_at || ""));
                                  })
                                  .slice(0, 50)
                                  .map((req: any) => {
                                    const rid = String(req.id || "");
                                    return (
                                      <tr
                                        key={rid || req.email}
                                        className="bb-sa-slim-tr-click"
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => setSuperadminRequestDetailModal({ kind: "trainer", data: req })}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            setSuperadminRequestDetailModal({ kind: "trainer", data: req });
                                          }
                                        }}
                                      >
                                        <td style={{ fontWeight: 600 }}>{req.full_name || "Trainer applicant"}</td>
                                        <td style={{ color: "var(--text-secondary)", fontSize: 12 }}>{req.email || "—"}</td>
                                        <td>
                                          <span className={superadminRosterStatusClass(req.status)}>{String(req.status || "pending").toUpperCase()}</span>
                                        </td>
                                        <td style={{ color: "var(--text-secondary)", fontSize: 12 }}>{superadminFormatShortDate(req.created_at)}</td>
                                        <td>
                                          <div className="bb-sa-req-actions">
                                            <button type="button" className="bb-btn-view" onClick={() => setSuperadminRequestDetailModal({ kind: "trainer", data: req })}>
                                              View
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                              </tbody>
                            </table>
                          </div>
                        ) : <p className="bb-live-empty">No trainer requests yet.</p>}
                      </div>
                    </div>

                    <div className="bb-sa-queue-col">
                      <div className="bb-sa-slim-hdr" style={{ marginBottom: 8 }}>
                        <h3 id="sa-client-onboarding" className="bb-sa-sec-head" style={{ margin: 0 }}>
                          Client requests
                        </h3>
                        <span className="bb-sa-slim-count">
                          {clientLeadRequests.filter((c: any) => String(c.status) === "pending").length} pending · {Math.min(clientLeadRequests.length, 50)} recent
                        </span>
                      </div>
                      <div className="bb-sa-queue-panel">
                        {clientLeadRequests.length ? (
                          <div className="bb-sa-slim-scrollwrap">
                            <table className="bb-sa-slim-table">
                              <thead>
                                <tr>
                                  <th>Name</th>
                                  <th>Email</th>
                                  <th>Status</th>
                                  <th>Submitted</th>
                                  <th>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
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
                                return (
                                  <tr
                                    key={cid || c.email}
                                    className="bb-sa-slim-tr-click"
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => setSuperadminRequestDetailModal({ kind: "client", data: c })}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        setSuperadminRequestDetailModal({ kind: "client", data: c });
                                      }
                                    }}
                                  >
                                    <td style={{ fontWeight: 600 }}>{c.full_name || "Client"}</td>
                                    <td style={{ color: "var(--text-secondary)", fontSize: 12 }}>{c.email || "—"}</td>
                                    <td>
                                      <span className={superadminRosterStatusClass(c.status)}>{String(c.status || "pending").toUpperCase()}</span>
                                    </td>
                                    <td style={{ color: "var(--text-secondary)", fontSize: 12 }}>{superadminFormatShortDate(c.created_at)}</td>
                                    <td>
                                      <div className="bb-sa-req-actions">
                                        <button type="button" className="bb-btn-view" onClick={() => setSuperadminRequestDetailModal({ kind: "client", data: c })}>
                                          View
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="bb-live-empty">No client coaching requests yet.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                )}

                {/* OVERVIEW shortcuts + live activity */}
                {saTab === "overview" && (
                <>
                  <h3 className="bb-admin-qa-title">QUICK ACCESS</h3>
                  <div className="bb-sa-qa-grid">
                    {[
                      { label: "Trainers", icon: String.fromCodePoint(0x1f464), onClick: () => goSaTab("trainers") },
                      { label: "Members", icon: String.fromCodePoint(0x1f46a), onClick: () => goSaTab("members") },
                      { label: "Applications", icon: String.fromCodePoint(0x1f4e5), onClick: () => goSaTab("applications") },
                      { label: "Messages", icon: String.fromCodePoint(0x1f4ac), onClick: () => { goTab("messages"); setTrainerMessagesView("threads"); } },
                      { label: "AI Assist", icon: String.fromCodePoint(0x1f4a1), onClick: () => setStaffAiOpen(true) },
                      { label: "Trainer Mgmt", icon: String.fromCodePoint(0x1f4bc), href: "/admin/trainers" as const },
                      { label: "Forms", icon: String.fromCodePoint(0x1f4cb), onClick: () => { goTab("forms"); setTrainerFormsView("daily"); } },
                      { label: "Enterprise", icon: String.fromCodePoint(0x1f3e2), onClick: () => goSaTab("enterprise") }
                    ].map((x) =>
                      "href" in x ? (
                        <a key={x.label} href={x.href} className="bb-admin-qa-btn" style={{ textDecoration: "none" }}>
                          <span className="bb-admin-qa-ic">{x.icon}</span>
                          <span>{x.label}</span>
                        </a>
                      ) : (
                        <button key={x.label} type="button" className="bb-admin-qa-btn" onClick={x.onClick}>
                          <span className="bb-admin-qa-ic">{x.icon}</span>
                          <span>{x.label}</span>
                        </button>
                      )
                    )}
                  </div>
                  <h3 className="bb-admin-la-title">LIVE ACTIVITY</h3>
                  <div className="bb-admin-la-list-wrap">
                    {activity.length ? (
                      <ul className="bb-live-list">
                        {activity.slice(0, 8).map((a, i) => {
                          const type = String(a?.type || "").toLowerCase();
                          const status = type.includes("workout") ? "DONE" : type.includes("check") ? "NEW" : "LIVE";
                          const text = `${a?.name || a?.user_name || "User"} — ${a?.type || "Update"}`;
                          return (
                            <li key={i} className="bb-live-row" style={{ borderBottom: i === 7 ? "none" : undefined }}>
                              <span className="bb-live-dot" />
                              <span>{text}</span>
                              <span className="bb-live-pill">{status}</span>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="bb-live-empty">No recent activity yet. Data appears once members start logging check-ins and workouts.</p>
                    )}
                  </div>
                </>
                )}

                {/* ── ENTERPRISE TAB ─────────────────────────────────── */}
                {saTab === "enterprise" && (
                <div className="bb-sa-ent-shell">
                  <div className="bb-sa-ent-hero">
                    <p className="bb-sa-home-kicker">Enterprise Pipeline</p>
                    <h1 className="bb-sa-home-hero-title">Enterprise</h1>
                    <p className="bb-sa-home-hero-line">
                      Gym chains, corporate wellness, and sports academies applying for white-label access will appear here.
                    </p>
                  </div>
                  {superadminEnterpriseRequests.length ? (
                    <div className="bb-sa-luxe-shell">
                      <div className="bb-sa-slim-hdr" style={{ marginBottom: 8 }}>
                        <span className="bb-sa-slim-title">Enterprise Requests</span>
                        <span className="bb-sa-slim-count">
                          {superadminEnterpriseRequests.filter((r: any) => String(r.status) === "pending").length} pending
                        </span>
                      </div>
                      <div className="bb-sa-slim-scrollwrap">
                        <table className="bb-sa-slim-table">
                          <thead>
                            <tr>
                              <th>Business</th>
                              <th>Contact</th>
                              <th>Status</th>
                              <th>Submitted</th>
                              <th>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {superadminEnterpriseRequests.slice(0, 100).map((r: any) => (
                              <tr
                                key={String(r.id || r.email)}
                                className="bb-sa-slim-tr-click"
                                role="button"
                                tabIndex={0}
                                onClick={() => setSuperadminRequestDetailModal({ kind: "trainer", data: r })}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    setSuperadminRequestDetailModal({ kind: "trainer", data: r });
                                  }
                                }}
                              >
                                <td style={{ fontWeight: 600 }}>{r.gym_name || "Enterprise / Business"}</td>
                                <td style={{ color: "var(--text-secondary)", fontSize: 12 }}>
                                  {r.full_name || "—"}
                                  {r.email ? ` · ${r.email}` : ""}
                                </td>
                                <td>
                                  <span className={superadminRosterStatusClass(r.status)}>
                                    {String(r.status || "pending").toUpperCase()}
                                  </span>
                                </td>
                                <td style={{ color: "var(--text-secondary)", fontSize: 12 }}>
                                  {superadminFormatShortDate(r.created_at)}
                                </td>
                                <td>
                                  <button
                                    type="button"
                                    className="bb-btn-view"
                                    onClick={() => setSuperadminRequestDetailModal({ kind: "trainer", data: r })}
                                  >
                                    View
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="bb-sa-ent-empty">
                      <div className="bb-sa-ent-empty-icon" aria-hidden>{String.fromCodePoint(0x1f3e2)}</div>
                      <p className="bb-sa-ent-empty-title">No enterprise applications yet</p>
                      <p className="bb-sa-ent-empty-sub">
                        When businesses submit an enterprise inquiry from the website, their request will appear here for review and
                        onboarding. You&apos;ll be able to assign a dedicated onboarding call, configure white-label settings, and
                        provision team access.
                      </p>
                      <div className="bb-sa-ent-pipeline">
                        {[
                          { stage: "Inquiry", desc: "Business submits enterprise form", active: false },
                          { stage: "Review", desc: "SA reviews fit & scale", active: false },
                          { stage: "Demo Call", desc: "Schedule onboarding call", active: false },
                          { stage: "Provisioning", desc: "Configure white-label access", active: false },
                          { stage: "Live", desc: "Business goes live on FitBase", active: false }
                        ].map((s, i) => (
                          <div key={i} className="bb-sa-ent-stage">
                            <div className="bb-sa-ent-stage-dot" />
                            <div>
                              <div className="bb-sa-ent-stage-name">{s.stage}</div>
                              <div className="bb-sa-ent-stage-desc">{s.desc}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <button type="button" className="bb-sa-ent-cta" onClick={() => goSaTab("applications")}>
                        View Individual Applications →
                      </button>
                    </div>
                  )}
                </div>
                )}
              </>
            ) : (
              <>
                <div className="bb-admin-summary-cards" style={{ marginTop: 12 }}>
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
                        goTab("training");
                      }
                    },
                    {
                      label: "Programs",
                      icon: String.fromCodePoint(0x1f3af),
                      onClick: () => {
                        goTab("programs");
                      }
                    },
                    {
                      label: "Analytics",
                      icon: String.fromCodePoint(0x1f4ca),
                      onClick: () => {
                        goTab("analytics");
                      }
                    },
                    {
                      label: "Add Client",
                      icon: String.fromCodePoint(0x2795),
                      onClick: () => {
                        goTab("clients");
                        setTrainerClientsView("addClient");
                      }
                    },
                    {
                      label: "Invite link",
                      icon: String.fromCodePoint(0x1f517),
                      onClick: () => {
                        goTab("clients");
                        setTrainerClientsView("hub");
                      }
                    },
                    {
                      label: "Profile",
                      icon: String.fromCodePoint(0x1f464),
                      onClick: () => {
                        goTab("profile");
                      }
                    },
                    {
                      label: "Meetings",
                      icon: String.fromCodePoint(0x1f4f9),
                      onClick: () => {
                        goTab("messages");
                        setTrainerMessagesView("meetings");
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
                  {!timerRunning && timerSeconds > 0 ? (
                    <div className="timer-paused-label" aria-live="polite">
                      Paused
                    </div>
                  ) : null}
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
                {role !== "superadmin" ? (
                <button
                  type="button"
                  className="bb-back-btn"
                  onClick={() => {
                    if (trainerClientsView === "hub") {
                      setActiveTab("home");
                      return;
                    }
                    setTrainerClientsView("hub");
                  }}
                >
                  ← Back
                </button>
                ) : null}
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
                      icon={String.fromCodePoint(0x2795)}
                      title="Add client"
                      desc="Create a client account on your roster"
                      onClick={() => setTrainerClientsView("addClient")}
                    />
                    <HubCard
                      icon={String.fromCodePoint(0x1f4c8)}
                      title="Client Progress"
                      desc="View progress reports and share links"
                      onClick={() => setTrainerClientsView("progress")}
                    />
                  </div>
                ) : null}
                {trainerClientsView === "roster" && role === "superadmin" ? (
                  <div className="bb-sa-luxe-shell">
                    <div className="bb-sa-slim-hdr">
                      <span className="bb-sa-slim-title">Members</span>
                      <span className="bb-sa-slim-count">
                        {superadminRosterFiltered.length}{superadminRosterQ.trim() ? " matches" : " total"}
                      </span>
                    </div>
                    <div className="bb-sa-slim-search">
                      <svg className="bb-sa-slim-search-icon" viewBox="0 0 24 24" aria-hidden>
                        <circle cx="11" cy="11" r="7" />
                        <path d="M20 20l-4.2-4.2" />
                      </svg>
                      <input
                        className="bb-sa-slim-search-input"
                        value={superadminRosterQ}
                        onChange={(e) => setSuperadminRosterQ(e.target.value)}
                        placeholder="Search by name, email or coach…"
                        autoComplete="off"
                      />
                    </div>
                    {superadminRosterFiltered.length ? (
                      <div className="bb-sa-slim-scrollwrap">
                        <div className="bb-sa-slim-scrollhint" aria-hidden>
                          <svg className="bb-sa-slim-scrollhint-icon" viewBox="0 0 24 24">
                            <path d="M9 6l6 6-6 6" />
                            <path d="M15 6l-6 6 6 6" />
                          </svg>
                        </div>
                        <table className="bb-sa-slim-table">
                          <thead>
                            <tr>
                              <th>Member</th>
                              <th>Coach</th>
                              <th>Status</th>
                              <th>Joined</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {superadminRosterFiltered.slice(0, 200).map(({ client: u, trainer: t }) => {
                              const tname = [t.first_name, t.last_name].filter(Boolean).join(" ") || t.email || "Coach";
                              const dname = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email || "Member";
                              const statusText = u.approval_status
                                ? String(u.approval_status).replace(/\b\w/g, (c) => c.toUpperCase())
                                : "—";
                              const open = () => openClientDetail(u);
                              return (
                                <tr
                                  key={`${t.id}-${u.id}`}
                                  className="bb-sa-slim-tr-click"
                                  onClick={open}
                                  role="button"
                                  tabIndex={0}
                                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }}
                                >
                                  <td>
                                    <div style={{ fontWeight: 600 }}>{dname}</div>
                                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 1 }}>{u.email || ""}</div>
                                  </td>
                                  <td style={{ color: "var(--text-secondary)", fontSize: 12 }}>
                                    {tname}
                                    {t.suspended ? <span style={{ color: "var(--red)", marginLeft: 4 }}>· suspended</span> : null}
                                  </td>
                                  <td>
                                    <span className={superadminRosterStatusClass(u.approval_status)}>{statusText}</span>
                                  </td>
                                  <td style={{ color: "var(--text-secondary)", fontSize: 12, whiteSpace: "nowrap" }}>
                                    {superadminFormatShortDate(u.created_at)}
                                  </td>
                                  <td style={{ textAlign: "right" }}>
                                    <span className="bb-sa-slim-arrow">›</span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="bb-sa-slim-empty">
                        {superadminRosterRows.length
                          ? "No matches. Try a different search."
                          : "No members linked to coaches yet."}
                      </p>
                    )}
                  </div>
                ) : null}
                {trainerClientsView === "coachPortfolio" && role === "superadmin" ? (
                  <div className="bb-sa-luxe-shell">
                    {!superadminPortfolioTrainerId ? (
                      <>
                        <div className="bb-sa-slim-hdr">
                          <span className="bb-sa-slim-title">Trainers</span>
                          <span className="bb-sa-slim-count">
                            {superadminTrainersFiltered.length}
                            {superadminTrainersQ.trim() ? " matches" : " coaches"}
                          </span>
                        </div>
                        <div className="bb-sa-slim-search">
                          <svg className="bb-sa-slim-search-icon" viewBox="0 0 24 24" aria-hidden>
                            <circle cx="11" cy="11" r="7" />
                            <path d="M20 20l-4.2-4.2" />
                          </svg>
                          <input
                            className="bb-sa-slim-search-input"
                            value={superadminTrainersQ}
                            onChange={(e) => setSuperadminTrainersQ(e.target.value)}
                            placeholder="Search by name or email…"
                            autoComplete="off"
                          />
                        </div>
                        {superadminTrainersFiltered.length ? (
                          <div className="bb-sa-slim-scrollwrap">
                            <div className="bb-sa-slim-scrollhint" aria-hidden>
                              <svg className="bb-sa-slim-scrollhint-icon" viewBox="0 0 24 24">
                                <path d="M9 6l6 6-6 6" />
                                <path d="M15 6l-6 6 6 6" />
                              </svg>
                            </div>
                            <table className="bb-sa-slim-table">
                              <thead>
                                <tr>
                                  <th>Coach</th>
                                  <th>Email</th>
                                  <th style={{ textAlign: "center" }}>Active</th>
                                  <th style={{ textAlign: "center" }}>Pending</th>
                                  <th>Status</th>
                                  <th>Since</th>
                                  <th></th>
                                </tr>
                              </thead>
                              <tbody>
                                {superadminTrainersFiltered.map((t: any) => {
                                  const tid = String(t.id || "");
                                  const name = [t.first_name, t.last_name].filter(Boolean).join(" ") || t.email || "Coach";
                                  const ap = Number(t.clients_approved ?? 0);
                                  const pe = Number(t.clients_pending ?? 0);
                                  return (
                                    <tr
                                      key={tid || String(t.email)}
                                      className="bb-sa-slim-tr-click"
                                      onClick={() => setSuperadminPortfolioTrainerId(tid || null)}
                                      role="button"
                                      tabIndex={0}
                                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSuperadminPortfolioTrainerId(tid || null); } }}
                                    >
                                      <td style={{ fontWeight: 600 }}>{name}</td>
                                      <td style={{ color: "var(--text-secondary)", fontSize: 12 }}>{t.email || "—"}</td>
                                      <td style={{ textAlign: "center" }}>{ap}</td>
                                      <td style={{ textAlign: "center", color: pe > 0 ? "var(--accent)" : undefined }}>{pe}</td>
                                      <td>
                                        <span className={t.suspended ? "bb-sa-slim-pill bb-sa-slim-pill-suspended" : "bb-sa-slim-pill bb-sa-slim-pill-active"}>
                                          {t.suspended ? "Suspended" : "Active"}
                                        </span>
                                      </td>
                                      <td style={{ color: "var(--text-secondary)", fontSize: 12 }}>{superadminFormatShortDate(t.created_at)}</td>
                                      <td style={{ textAlign: "right" }}><span className="bb-sa-slim-arrow">›</span></td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="bb-sa-slim-empty">
                            {superadminTrainers.length
                              ? "No matches. Try a different search."
                              : "No coaches on the platform yet. Approve trainer applications to see them here."}
                          </p>
                        )}
                      </>
                    ) : (
                      (() => {
                        const row = trainerClientOverview.find((r: any) => String(r.id) === superadminPortfolioTrainerId);
                        const tMeta = superadminTrainers.find((t: any) => String(t.id) === superadminPortfolioTrainerId);
                        let clientsParsed: any[] = [];
                        if (row) {
                          try {
                            const raw = row.clients;
                            if (Array.isArray(raw)) clientsParsed = raw;
                            else if (typeof raw === "string") clientsParsed = JSON.parse(raw || "[]");
                          } catch { clientsParsed = []; }
                        }
                        const coachName =
                          [row?.first_name, row?.last_name].filter(Boolean).join(" ") ||
                          [tMeta?.first_name, tMeta?.last_name].filter(Boolean).join(" ") ||
                          row?.email || tMeta?.email || "Coach";
                        const coachEmail = row?.email || tMeta?.email || "—";
                        const isSuspended = row?.suspended || tMeta?.suspended;
                        return (
                          <>
                            <button type="button" className="bb-sa-slim-back" onClick={() => setSuperadminPortfolioTrainerId(null)}>
                              ← All Trainers
                            </button>
                            <div className="bb-sa-slim-detail-head">
                              <div>
                                <p className="bb-sa-slim-detail-name">
                                  {coachName}
                                  {isSuspended ? (
                                    <span className="bb-sa-slim-pill bb-sa-slim-pill-suspended" style={{ marginLeft: 10, fontSize: 11 }}>Suspended</span>
                                  ) : null}
                                </p>
                                <p className="bb-sa-slim-detail-meta">{coachEmail}</p>
                              </div>
                              <span className="bb-sa-slim-count">{clientsParsed.length} clients</span>
                            </div>
                            {clientsParsed.length ? (
                              <div className="bb-sa-slim-scrollwrap">
                                <div className="bb-sa-slim-scrollhint" aria-hidden>
                                  <svg className="bb-sa-slim-scrollhint-icon" viewBox="0 0 24 24">
                                    <path d="M9 6l6 6-6 6" />
                                    <path d="M15 6l-6 6 6 6" />
                                  </svg>
                                </div>
                                <table className="bb-sa-slim-table">
                                  <thead>
                                    <tr>
                                      <th>Member</th>
                                      <th>Status</th>
                                      <th>Week #</th>
                                      <th style={{ textAlign: "center" }}>WO / CI (7d)</th>
                                      <th>Joined</th>
                                      <th></th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {clientsParsed.map((u: any) => {
                                      const uid = String(u.id ?? "");
                                      const displayName = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email || "Member";
                                      const st = u.approval_status
                                        ? String(u.approval_status).replace(/\b\w/g, (c: string) => c.toUpperCase())
                                        : "—";
                                      const open = () => openClientDetail(u);
                                      return (
                                        <tr
                                          key={uid || u.email}
                                          className="bb-sa-slim-tr-click"
                                          onClick={open}
                                          role="button"
                                          tabIndex={0}
                                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }}
                                        >
                                          <td>
                                            <div style={{ fontWeight: 600 }}>{displayName}</div>
                                            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 1 }}>{u.email || ""}</div>
                                          </td>
                                          <td><span className={superadminRosterStatusClass(u.approval_status)}>{st}</span></td>
                                          <td style={{ color: "var(--text-secondary)", fontSize: 12 }}>{superadminWeeksOnPlatform(u.created_at) || "—"}</td>
                                          <td style={{ textAlign: "center", fontSize: 13 }}>
                                            <span style={{ fontWeight: 600 }}>{Number(u.workouts_7d ?? 0)}</span>
                                            <span style={{ color: "var(--text-secondary)", margin: "0 3px" }}>/</span>
                                            <span style={{ fontWeight: 600 }}>{Number(u.daily_checkins_7d ?? 0)}</span>
                                          </td>
                                          <td style={{ color: "var(--text-secondary)", fontSize: 12, whiteSpace: "nowrap" }}>
                                            {superadminFormatShortDate(u.created_at)}
                                          </td>
                                          <td style={{ textAlign: "right" }}><span className="bb-sa-slim-arrow">›</span></td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <p className="bb-sa-slim-empty">No clients assigned to this coach yet.</p>
                            )}
                          </>
                        );
                      })()
                    )}
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
                              <p className="bb-list-row-sub" style={{ marginTop: 4 }}>
                                Signed up: {u.created_at ? new Date(u.created_at).toLocaleString() : "—"}
                              </p>
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
                                    style={{ border: "none", background: "var(--green)", color: "var(--on-accent)", borderRadius: 8, padding: "8px 10px", fontWeight: 700, cursor: "pointer" }}
                                  >
                                    {approveBusy ? "..." : "Approve"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => updatePendingUser(id, "reject")}
                                    disabled={approveBusy || rejectBusy}
                                    style={{ border: "none", background: "var(--red)", color: "var(--on-accent)", borderRadius: 8, padding: "8px 10px", fontWeight: 700, cursor: "pointer" }}
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
                {trainerClientsView === "addClient" ? (
                  <>
                    {role === "admin" ? (
                      <div className="bb-panel">
                        <span className="bb-inline-label">ADD NEW CLIENT</span>
                        <p className="bb-list-row-sub" style={{ marginBottom: 12 }}>
                          Creates an approved client on your roster. They can sign in with the email and temporary password you set.
                        </p>
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
                          <input
                            className="bb-input"
                            value={newClient.country}
                            onChange={(e) => setNewClient((p) => ({ ...p, country: e.target.value }))}
                            placeholder="Country (optional)"
                          />
                          <input
                            className="bb-input"
                            value={newClient.timezone}
                            onChange={(e) => setNewClient((p) => ({ ...p, timezone: e.target.value }))}
                            placeholder="Timezone (optional)"
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
                    ) : (
                    <div className="bb-panel">
                        <p className="bb-live-empty">Super admins manage clients via the platform roster and coach assignments.</p>
                                </div>
                    )}
                  </>
                ) : null}
                {trainerClientsView === "progress" ? (
                  <div className="bb-panel">
                    <span className="bb-inline-label">
                      CLIENTS · <strong style={{ color: "var(--accent)" }}>{clientProgressFiltered.length}</strong>
                    </span>
                    <p className="bb-list-row-sub" style={{ marginBottom: 12 }}>
                      Date range (by account created date), search (name, email, phone, city), Apply / Clear, and CSV export.
                    </p>
                    <AdminListFiltersBar
                      filter={clientProgressFilterDraft}
                      onPatch={(p) => setClientProgressFilterDraft((prev) => ({ ...prev, ...p }))}
                      onApply={() => setClientProgressFilterApplied({ ...clientProgressFilterDraft })}
                      onClear={() => {
                        const z = { from: "", to: "", search: "" };
                        setClientProgressFilterDraft(z);
                        setClientProgressFilterApplied(z);
                      }}
                      onCsv={() =>
                        downloadCsvFile(
                          `client-progress-${new Date().toISOString().slice(0, 10)}.csv`,
                          [
                            { key: "first_name", header: "First name" },
                            { key: "last_name", header: "Last name" },
                            { key: "email", header: "Email" },
                            { key: "phone", header: "Phone" },
                            { key: "city", header: "City" },
                            { key: "created_at", header: "Account created" }
                          ],
                          clientProgressFiltered.map((u: any) => ({
                            first_name: u.first_name ?? "",
                            last_name: u.last_name ?? "",
                            email: u.email ?? "",
                            phone: u.phone ?? "",
                            city: u.city ?? "",
                            created_at: u.created_at
                              ? new Date(String(u.created_at)).toLocaleString()
                              : ""
                          })) as Record<string, unknown>[]
                        )
                      }
                      searchPlaceholder="Name, email, phone, or city"
                    />
                    {clientProgressFiltered.length ? (
                      <ul className="bb-list-rows">
                        {clientProgressFiltered.slice(0, 250).map((u: any) => (
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
                      <p className="bb-live-empty">
                        {activeClients.length === 0 ? "No clients to show." : "No clients match these filters."}
                      </p>
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
                  onClick={() => {
                    if (trainerFormsView === "hub") {
                      setActiveTab("home");
                      return;
                    }
                    if (role === "superadmin") {
                      goSaTab("overview");
                      return;
                    }
                    setTrainerFormsView("hub");
                  }}
                >
                  ← Back
                </button>
                {role === "superadmin" ? (
                  <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                    {(
                      [
                        ["daily", "Daily"],
                        ["sunday", "Sunday"],
                        ["part2", "Part 2"]
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setTrainerFormsView(id)}
                        style={{
                          borderRadius: 999,
                          padding: "8px 14px",
                          fontWeight: 700,
                          fontSize: 12,
                          letterSpacing: 0.04,
                          textTransform: "uppercase",
                          cursor: "pointer",
                          border:
                            trainerFormsView === id ? "1px solid var(--accent)" : "1px solid var(--border)",
                          background: trainerFormsView === id ? "color-mix(in srgb, var(--accent) 18%, transparent)" : "transparent",
                          color: "var(--text-primary)"
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                ) : null}
                {trainerFormsView === "hub" && role !== "superadmin" ? (
                  <>
                    <div className="bb-panel" style={{ marginBottom: 14 }}>
                      <span className="bb-inline-label">PART-2 LINK FOR CLIENTS</span>
                      <p className="bb-list-row-sub" style={{ marginTop: 6, marginBottom: 10, lineHeight: 1.45 }}>
                        Share this URL with clients so they can open and submit the Part-2 questionnaire.
                      </p>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "stretch" }}>
                        <input
                          type="text"
                          readOnly
                          className="bb-input"
                          value={part2ClientFormUrl}
                          aria-label="Part-2 form URL for clients"
                          style={{ flex: "1 1 220px", cursor: "pointer" }}
                          onFocus={(e) => e.target.select()}
                        />
                        <button type="button" className="bb-btn-primary" onClick={() => void copyPart2ClientLink()}>
                          {part2LinkCopied ? "Copied" : "Copy link"}
                        </button>
                      </div>
                    </div>
                  <div className="bb-admin-hub-cards">
                    <HubCard
                      icon={String.fromCodePoint(0x1f4c5)}
                      title="Sunday Check-In"
                      desc="Weekly client progress check-in"
                      onClick={() => setTrainerFormsView("sunday")}
                    />
                    <HubCard
                      icon={String.fromCodePoint(0x1f4dd)}
                      title="Part-2 Form"
                      desc="View Part-2 submissions from your clients"
                      onClick={() => setTrainerFormsView("part2")}
                    />
                    <HubCard
                      icon={String.fromCodePoint(0x1f4cc)}
                      title="Daily Check-In"
                      desc="Daily steps, water, protein and sleep logs"
                      onClick={() => setTrainerFormsView("daily")}
                    />
                  </div>
                  </>
                ) : null}
                {trainerFormsView === "part2" ? (
                  <div className="bb-panel">
                    {isStaff ? (
                      <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
                        <span className="bb-inline-label">PART-2 LINK FOR CLIENTS</span>
                        <p className="bb-list-row-sub" style={{ marginTop: 6, marginBottom: 10, lineHeight: 1.45 }}>
                          Send this link to clients who still need to complete Part-2.
                        </p>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "stretch" }}>
                          <input
                            type="text"
                            readOnly
                            className="bb-input"
                            value={part2ClientFormUrl}
                            aria-label="Part-2 form URL for clients"
                            style={{ flex: "1 1 220px", cursor: "pointer" }}
                            onFocus={(e) => e.target.select()}
                          />
                          <button type="button" className="bb-btn-primary" onClick={() => void copyPart2ClientLink()}>
                            {part2LinkCopied ? "Copied" : "Copy link"}
                          </button>
                        </div>
                  </div>
                ) : null}
                    <span className="bb-inline-label">
                      PART-2 SUBMISSIONS · <strong style={{ color: "var(--accent)" }}>{part2Submissions.length}</strong>
                    </span>
                    {isStaff ? (
                      <AdminListFiltersBar
                        filter={trainerListFilters.part2}
                        onPatch={(p) => setTrainerListFilters((prev) => ({ ...prev, part2: { ...prev.part2, ...p } }))}
                        onApply={() => void refetchAdminList("/api/admin/part2-submissions", trainerListFilters.part2, setPart2Submissions)}
                        onClear={() => {
                          const z = { from: "", to: "", search: "" };
                          setTrainerListFilters((prev) => ({ ...prev, part2: z }));
                          void refetchAdminList("/api/admin/part2-submissions", z, setPart2Submissions);
                        }}
                        onCsv={() =>
                          downloadCsvFile(
                            `part2-submissions-${new Date().toISOString().slice(0, 10)}.csv`,
                            [
                              { key: "name", header: "Name" },
                              { key: "email", header: "Email" },
                              { key: "mobile", header: "Mobile" },
                              { key: "activity_level", header: "Activity" },
                              { key: "created_at", header: "Submitted" }
                            ],
                            part2Submissions as Record<string, unknown>[]
                          )
                        }
                        searchPlaceholder="Name, email, or mobile"
                      />
                    ) : null}
                    {part2Submissions.length ? (
                      <div className="bb-admin-table-wrap">
                        <table className="bb-admin-table">
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th>Email</th>
                              <th>Mobile</th>
                              <th>Activity</th>
                              <th>Submitted</th>
                              <th className="bb-admin-actions-col">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {part2Submissions.slice(0, 250).map((p: any) => (
                              <tr
                                key={p.id}
                                className="bb-sa-slim-tr-click"
                                role="button"
                                tabIndex={0}
                                onClick={() => void openPart2Detail(p)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    void openPart2Detail(p);
                                  }
                                }}
                              >
                                <td>{p.name || "—"}</td>
                                <td>{p.email || "—"}</td>
                                <td>{p.mobile || "—"}</td>
                                <td>{p.activity_level || "—"}</td>
                                <td>{p.created_at ? new Date(p.created_at).toLocaleString() : "—"}</td>
                                <td className="bb-admin-actions-col">
                                  <button
                                    type="button"
                                    className="bb-btn-view"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void openPart2Detail(p);
                                    }}
                                  >
                                    View
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
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
                    {isStaff ? (
                      <AdminListFiltersBar
                        filter={trainerListFilters.sunday}
                        onPatch={(p) => setTrainerListFilters((prev) => ({ ...prev, sunday: { ...prev.sunday, ...p } }))}
                        onApply={() => void refetchAdminList("/api/admin/sunday-checkins", trainerListFilters.sunday, setSundayCheckinsApi)}
                        onClear={() => {
                          const z = { from: "", to: "", search: "" };
                          setTrainerListFilters((prev) => ({ ...prev, sunday: z }));
                          void refetchAdminList("/api/admin/sunday-checkins", z, setSundayCheckinsApi);
                        }}
                        onCsv={() =>
                          downloadCsvFile(
                            `sunday-checkins-${new Date().toISOString().slice(0, 10)}.csv`,
                            [
                              { key: "full_name", header: "Full name" },
                              { key: "reply_email", header: "Reply email" },
                              { key: "member_name", header: "Member (account)" },
                              { key: "email", header: "Account email" },
                              { key: "total_weight_loss", header: "Weight loss" },
                              { key: "trainer_first_name", header: "Coach first" },
                              { key: "trainer_last_name", header: "Coach last" },
                              { key: "trainer_email", header: "Coach email" },
                              { key: "created_at", header: "Submitted" }
                            ],
                            sundayCheckinsApi.map((c: any) => ({
                              ...c,
                              member_name: [c.first_name, c.last_name].filter(Boolean).join(" ")
                            })) as Record<string, unknown>[]
                          )
                        }
                        searchPlaceholder="Name or email"
                      />
                    ) : null}
                    {sundayCheckinsApi.length ? (
                      <div className="bb-admin-table-wrap">
                        <table className="bb-admin-table">
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th>Email</th>
                              <th>Weight loss</th>
                              {role === "superadmin" ? <th>Coach</th> : null}
                              <th>Submitted</th>
                              <th className="bb-admin-actions-col">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sundayCheckinsApi.slice(0, 250).map((c: any) => (
                              <tr
                                key={c.id}
                                className="bb-sa-slim-tr-click"
                                role="button"
                                tabIndex={0}
                                onClick={() => void openSundayDetail(c)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    void openSundayDetail(c);
                                  }
                                }}
                              >
                                <td>{c.full_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || c.reply_email || "—"}</td>
                                <td>{c.reply_email || c.email || "—"}</td>
                                <td>{c.total_weight_loss != null ? String(c.total_weight_loss) : "—"}</td>
                                {role === "superadmin" ? (
                                  <td>
                                    {[c.trainer_first_name, c.trainer_last_name].filter(Boolean).join(" ") || c.trainer_email || "—"}
                                  </td>
                                ) : null}
                                <td>{c.created_at ? new Date(c.created_at).toLocaleString() : "—"}</td>
                                <td className="bb-admin-actions-col">
                                  <button
                                    type="button"
                                    className="bb-btn-view"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void openSundayDetail(c);
                                    }}
                                  >
                                    View
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
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
                    {isStaff ? (
                      <AdminListFiltersBar
                        filter={trainerListFilters.daily}
                        onPatch={(p) => setTrainerListFilters((prev) => ({ ...prev, daily: { ...prev.daily, ...p } }))}
                        onApply={() => void refetchAdminList("/api/admin/daily-checkins", trainerListFilters.daily, setDailyCheckins)}
                        onClear={() => {
                          const z = { from: "", to: "", search: "" };
                          setTrainerListFilters((prev) => ({ ...prev, daily: z }));
                          void refetchAdminList("/api/admin/daily-checkins", z, setDailyCheckins);
                        }}
                        onCsv={() =>
                          downloadCsvFile(
                            `daily-checkins-${new Date().toISOString().slice(0, 10)}.csv`,
                            [
                              { key: "checkin_date", header: "Date" },
                              { key: "first_name", header: "First name" },
                              { key: "last_name", header: "Last name" },
                              { key: "email", header: "Email" },
                              { key: "steps", header: "Steps" },
                              { key: "water_ml", header: "Water ml" },
                              { key: "protein_g", header: "Protein g" },
                              { key: "sleep_hours", header: "Sleep h" },
                              { key: "trainer_email", header: "Coach email" },
                              { key: "created_at", header: "Saved at" }
                            ],
                            dailyCheckins as Record<string, unknown>[]
                          )
                        }
                        searchPlaceholder="Name or email"
                      />
                    ) : null}
                    {dailyCheckins.length ? (
                      <div className="bb-admin-table-wrap">
                        <table className="bb-admin-table">
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th>Email</th>
                              <th>Date</th>
                              <th>Steps</th>
                              <th>Protein</th>
                              <th>Sleep</th>
                              {role === "superadmin" ? <th>Coach</th> : null}
                              <th className="bb-admin-actions-col">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dailyCheckins.slice(0, 250).map((c: any) => (
                              <tr
                                key={c.id}
                                className="bb-sa-slim-tr-click"
                                role="button"
                                tabIndex={0}
                                onClick={() => void openCheckinDetail(c)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    void openCheckinDetail(c);
                                  }
                                }}
                              >
                                <td>{[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}</td>
                                <td>{c.email || "—"}</td>
                                <td>{c.checkin_date || "—"}</td>
                                <td>{c.steps ?? "—"}</td>
                                <td>{c.protein_g ?? "—"}</td>
                                <td>{c.sleep_hours ?? "—"}</td>
                                {role === "superadmin" ? (
                                  <td>
                                    {[c.trainer_first_name, c.trainer_last_name].filter(Boolean).join(" ") || c.trainer_email || "—"}
                                  </td>
                                ) : null}
                                <td className="bb-admin-actions-col">
                                  <button
                                    type="button"
                                    className="bb-btn-view"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void openCheckinDetail(c);
                                    }}
                                  >
                                    View
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                            </div>
                    ) : (
                      <p className="bb-live-empty">No daily check-ins yet.</p>
                    )}
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        {isTrainer && activeTab === "training" ? (
          <div className="bb-section-page">
            <button type="button" className="bb-back-btn" onClick={() => goTab("home")}>
              ← Back
            </button>
            <div className="bb-panel">
              <span className="bb-inline-label">WORKOUT LOGS · {workouts.length}</span>
              <p className="bb-list-row-sub" style={{ marginBottom: 12 }}>
                Date range, search (name, email, workout, notes), Apply / Clear, and CSV export.
              </p>
              <AdminListFiltersBar
                filter={trainerListFilters.workouts}
                onPatch={(p) => setTrainerListFilters((prev) => ({ ...prev, workouts: { ...prev.workouts, ...p } }))}
                onApply={() => void refetchAdminList("/api/admin/workouts", trainerListFilters.workouts, setWorkouts)}
                onClear={() => {
                  const z = { from: "", to: "", search: "" };
                  setTrainerListFilters((prev) => ({ ...prev, workouts: z }));
                  void refetchAdminList("/api/admin/workouts", z, setWorkouts);
                }}
                onCsv={() =>
                  downloadCsvFile(
                    `workouts-${new Date().toISOString().slice(0, 10)}.csv`,
                    [
                      { key: "first_name", header: "First name" },
                      { key: "last_name", header: "Last name" },
                      { key: "email", header: "Email" },
                      { key: "workout_name", header: "Workout" },
                      { key: "duration_min", header: "Duration min" },
                      { key: "feedback", header: "Feedback" },
                      { key: "created_at", header: "Logged at" }
                    ],
                    workouts.map((w: any) => ({
                      ...w,
                      duration_min: String(Math.floor((Number(w.duration_seconds) || 0) / 60))
                    })) as Record<string, unknown>[]
                  )
                }
                searchPlaceholder="Name, email, or workout"
              />
              {workouts.length ? (
                <div className="bb-admin-table-wrap">
                  <table className="bb-admin-table">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Email</th>
                        <th>Workout</th>
                        <th>Duration</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workouts.slice(0, 250).map((w: any) => (
                        <tr key={w.id} onClick={() => openWorkoutDetail(w)} style={{ cursor: "pointer" }}>
                          <td>{[w.first_name, w.last_name].filter(Boolean).join(" ") || "—"}</td>
                          <td>{w.email || "—"}</td>
                          <td>{w.workout_name || "—"}</td>
                          <td>{Math.floor((Number(w.duration_seconds) || 0) / 60)} min</td>
                          <td>{w.created_at ? new Date(w.created_at).toLocaleString() : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="bb-live-empty">No workouts logged yet.</p>
              )}
            </div>
          </div>
        ) : null}

        {isTrainer && activeTab === "programs" ? (
          <div className="bb-section-page">
            <button type="button" className="bb-back-btn" onClick={() => goTab("home")}>
              ← Back
            </button>
            <div style={{ display: "grid", gap: 12 }}>
              <div className="bb-panel">
                <span className="bb-inline-label">ASSIGN PROGRAM (MAX 4 PER CLIENT)</span>
                <div style={{ display: "grid", gap: 8 }}>
                  <select className="bb-input" value={assignUserId} onChange={(e) => setAssignUserId(e.target.value)} style={{ cursor: "pointer" }}>
                    <option value="">Select client</option>
                    {activeClients.map((u: any) => (
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
                  </div>
                ) : null}

        {isTrainer && activeTab === "analytics" ? (
          <div className="bb-section-page">
            <button
              type="button"
              className="bb-back-btn"
              onClick={() => {
                if (trainerAnalyticsSub) setTrainerAnalyticsSub(null);
                else goTab("home");
              }}
            >
              ← Back
            </button>
            {trainerAnalyticsSub === null ? (
              <div className="bb-admin-hub-cards">
                <HubCard
                  icon={String.fromCodePoint(0x1f4ca)}
                  title="Performance Insights"
                  desc="Filters, charts, and CSV export"
                  onClick={() => setTrainerAnalyticsSub("insights")}
                />
                <HubCard
                  icon={String.fromCodePoint(0x1f4e4)}
                  title="Campaigns"
                  desc="Scheduled broadcast messages to all users"
                  onClick={() => setTrainerAnalyticsSub("campaigns")}
                />
              </div>
            ) : null}
            {trainerAnalyticsSub === "insights" ? performanceInsightsPanel : null}
            {trainerAnalyticsSub === "campaigns" ? campaignsPanel : null}
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
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div style={{ position: "relative", display: "inline-block" }}>
                {userWelcomeAvatarSrc ? (
                  <img
                    src={userWelcomeAvatarSrc}
                    alt="Profile"
                    style={{
                      width: 120,
                      height: 120,
                      borderRadius: "50%",
                      objectFit: "cover",
                      border: "3px solid rgb(var(--accent-rgb) / 0.45)"
                    }}
                  />
                ) : (
                  <div
                    className="user-welcome-avatar-placeholder"
                    style={{ width: 120, height: 120, margin: 0 }}
                    aria-hidden
                  >
                    <svg viewBox="0 0 24 24" width={48} height={48} fill="none" stroke="currentColor" strokeWidth={1.5}>
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </div>
                )}
                <input
                  type="file"
                  id="profAvatarInput"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={handleProfileAvatarUpload}
                />
                <button
                  type="button"
                  onClick={() => document.getElementById("profAvatarInput")?.click()}
                  style={{
                    marginTop: 12,
                    padding: "8px 20px",
                    background: "var(--accent)",
                    border: "none",
                    borderRadius: 6,
                    color: "var(--on-accent)",
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: "pointer",
                    letterSpacing: 1,
                    display: "block",
                    width: "100%"
                  }}
                >
                  Change Photo
                </button>
                <div className="ud-form-hint-sm" style={{ marginTop: 8 }}>
                  JPG, PNG, WEBP or GIF up to 5 MB
                </div>
              </div>
            </div>
            <div className="ud-form-section-title">Personal information</div>
            <div className="ud-form-group">
              <label>First Name</label>
              <input
                type="text"
                className="ud-form-input"
                readOnly
                value={String(remoteProfile?.first_name ?? session?.user?.first_name ?? "")}
                placeholder="e.g. John"
              />
              <span className="ud-form-hint-sm">Your first name as we should address you</span>
            </div>
            <div className="ud-form-group">
              <label>Last Name</label>
              <input
                type="text"
                className="ud-form-input"
                readOnly
                value={String(remoteProfile?.last_name ?? session?.user?.last_name ?? "")}
                placeholder="e.g. Smith"
              />
              <span className="ud-form-hint-sm">Your family or surname</span>
            </div>
            <div className="ud-form-divider" />
            <div className="ud-form-section-title">Contact details</div>
            <div className="ud-form-group">
              <label>
                Mobile number <span style={{ fontWeight: 400, color: "var(--text-secondary)" }}>(Linked to WhatsApp)</span>
              </label>
              <input
                type="tel"
                className="ud-form-input"
                value={profPhone}
                onChange={(e) => setProfPhone(e.target.value)}
                placeholder="e.g. +91 98765 43210"
              />
              <span className="ud-form-hint-sm">Used for scheduling and support</span>
            </div>
            <div className="ud-form-group">
              <label>Email address</label>
              <input
                type="email"
                className="ud-form-input"
                value={profEmail}
                onChange={(e) => setProfEmail(e.target.value)}
                placeholder="e.g. john@example.com"
              />
              {profEmailErr ? (
                <span style={{ color: "var(--red)", fontSize: 12, display: "block", marginTop: 6 }}>{profEmailErr}</span>
              ) : null}
            </div>
            {profileSaveOk ? (
              <p style={{ color: "var(--green)", textAlign: "center", marginTop: 12 }}>Profile updated successfully.</p>
            ) : null}
            <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 24, flexWrap: "wrap" }}>
              <button type="button" className="ud-back-btn" onClick={() => void loadUserProfileFromApi()}>
                Discard
              </button>
              <button
                type="button"
                className="ud-form-submit"
                style={{ width: "auto", padding: "12px 40px", marginTop: 0 }}
                onClick={() => void saveUserProfile()}
                disabled={profileSaving}
              >
                {profileSaving ? "Saving…" : "Update"}
              </button>
            </div>
          </div>
        ) : null}

        {isTrainer && activeTab === "profile" ? (
          <div className="bb-section-page bb-trainer-profile-page">
            <div className="ud-user-back">
              <button type="button" className="ud-back-btn" onClick={() => goTab("home")}>
                ← Back
              </button>
            </div>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div style={{ position: "relative", display: "inline-block" }}>
                {userWelcomeAvatarSrc ? (
                  <img src={userWelcomeAvatarSrc} alt="Profile" className="bb-trainer-avatar-ring" />
                ) : (
                  <div className="user-welcome-avatar-placeholder bb-trainer-avatar-placeholder-wrap" aria-hidden>
                    <svg viewBox="0 0 24 24" width={48} height={48} fill="none" stroke="currentColor" strokeWidth={1.5}>
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </div>
                )}
                <input
                  type="file"
                  id="trainerProfAvatarInput"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={handleProfileAvatarUpload}
                />
                <button
                  type="button"
                  className="bb-trainer-change-photo"
                  onClick={() => document.getElementById("trainerProfAvatarInput")?.click()}
                >
                  Change Photo
                </button>
                <div className="ud-form-hint-sm" style={{ marginTop: 10, textAlign: "center" }}>
                  JPG, PNG, WEBP or GIF up to 5 MB
                </div>
              </div>
            </div>
            <div className="ud-form-section-title">Personal information</div>
            <div className="ud-form-group">
              <label>First Name</label>
              <input
                type="text"
                className="ud-form-input"
                readOnly
                value={String(remoteProfile?.first_name ?? session?.user?.first_name ?? "")}
                placeholder="—"
              />
              <span className="ud-form-hint-sm">Your first name as we should address you</span>
            </div>
            <div className="ud-form-group">
              <label>Last Name</label>
              <input
                type="text"
                className="ud-form-input"
                readOnly
                value={String(remoteProfile?.last_name ?? session?.user?.last_name ?? "")}
                placeholder="—"
              />
              <span className="ud-form-hint-sm">Your family or surname</span>
            </div>
            <div className="ud-form-divider" />
            <div className="ud-form-section-title">Contact details</div>
            <div className="ud-form-group">
              <label>
                Mobile number <span style={{ fontWeight: 400, color: "var(--text-secondary)" }}>(Linked to WhatsApp)</span>
              </label>
              <input
                type="tel"
                className="ud-form-input"
                value={profPhone}
                onChange={(e) => setProfPhone(e.target.value)}
                placeholder="e.g. +91 98765 43210"
              />
              <span className="ud-form-hint-sm">Used for scheduling and support</span>
            </div>
            <div className="ud-form-group">
              <label>Email address</label>
              <input
                type="email"
                className="ud-form-input"
                value={profEmail}
                onChange={(e) => setProfEmail(e.target.value)}
                placeholder="e.g. coach@example.com"
              />
              {profEmailErr ? (
                <span style={{ color: "var(--red)", fontSize: 12, display: "block", marginTop: 6 }}>{profEmailErr}</span>
              ) : null}
            </div>
            <div className="ud-form-group">
              <label>Country / region</label>
              <input
                type="text"
                className="ud-form-input"
                value={trainerProfCountry}
                onChange={(e) => setTrainerProfCountry(e.target.value)}
                placeholder="e.g. India"
              />
              <span className="ud-form-hint-sm">Optional — helps with scheduling</span>
            </div>
            <div className="ud-form-group">
              <label>Timezone</label>
              <input
                type="text"
                className="ud-form-input"
                value={trainerProfTimezone}
                onChange={(e) => setTrainerProfTimezone(e.target.value)}
                placeholder="e.g. Asia/Kolkata"
              />
              <span className="ud-form-hint-sm">IANA name or your local label</span>
            </div>
            {profileSaveOk ? (
              <p style={{ color: "var(--green)", textAlign: "center", marginTop: 12 }}>Profile updated successfully.</p>
            ) : null}
            <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 24, flexWrap: "wrap" }}>
              <button type="button" className="ud-back-btn" onClick={() => void loadTrainerProfileFromApi()}>
                Discard
              </button>
              <button
                type="button"
                className="ud-form-submit"
                style={{ width: "auto", padding: "12px 40px", marginTop: 0, textTransform: "uppercase", letterSpacing: "0.06em" }}
                onClick={() => void saveTrainerProfile()}
                disabled={profileSaving}
              >
                {profileSaving ? "Saving…" : "Update"}
              </button>
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
                      title="Messages"
                      desc={
                        isSuperadminViewer
                          ? "Chat with trainers only (separate from clients)"
                          : "Clients and Super Admin — separate threads"
                      }
                      onClick={() => setTrainerMessagesView("threads")}
                    />
                    <HubCard
                      icon={String.fromCodePoint(0x1f4c5)}
                      title="Meetings"
                      desc="Schedule calls and view meeting requests"
                      onClick={() => setTrainerMessagesView("meetings")}
                    />
                  </div>
                ) : trainerMessagesView === "threads" ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    <div className="bb-panel">
                      <span className="bb-inline-label">THREADS</span>
                      {threads.length ? (
                        <ul className="bb-list-rows">
                          {threads.slice(0, 50).map((t: any, ti: number) => {
                            const rowKey = String(t.id || `tr-${t.trainer_user_id || t.user_id || ti}`);
                            const id = String(t.id || "");
                            const active = id ? selectedThreadId === id : false;
                            const opening = opsThreadOpening === String(t.trainer_user_id || t.user_id || "");
                            return (
                              <li
                                key={rowKey}
                                className={`bb-list-row${active ? " bb-list-row-active" : ""}`}
                                onClick={() => void selectStaffThreadRow(t)}
                                role="presentation"
                              >
                                <div className="bb-list-row-title">
                                  {opening ? "Opening…" : staffThreadListTitle(t, role)}
                                </div>
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
                                const kind = String(selectedThreadRow?.thread_kind || "client");
                                let staffSide: boolean;
                                let otherLabel: string;
                                if (isSuperadminViewer && kind === "ops") {
                                  staffSide = m.sender_role === "superadmin";
                                  otherLabel = staffThreadListTitle(selectedThreadRow, role);
                                } else if (isTrainer && kind === "ops") {
                                  staffSide = m.sender_role === "admin";
                                  otherLabel = "Super Admin";
                                } else {
                                  staffSide = m.sender_role === "admin" || m.sender_role === "superadmin";
                                  otherLabel = "Client";
                                }
                                const mine = staffSide;
                                const label = mine ? "You" : otherLabel;
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
            ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  <div className="bb-panel">
                      <span className="bb-inline-label">MEETINGS</span>
                      <p className="bb-list-row-sub" style={{ marginBottom: 12 }}>
                        Schedule a call for a client or review upcoming meeting requests.
                      </p>
                      {isStaff && role !== "user" ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", marginBottom: 16 }}>
                          <select
                            className="bb-input"
                            style={{ minWidth: 160, flex: "1 1 160px", cursor: "pointer" }}
                            value={trainerScheduleUserId}
                            onChange={(e) => setTrainerScheduleUserId(e.target.value)}
                          >
                            <option value="">Select client</option>
                            {activeClients.map((u: any) => (
                              <option key={u.id} value={u.id}>
                                {[u.first_name, u.last_name].filter(Boolean).join(" ") || u.email}
                              </option>
                            ))}
                          </select>
                          <div>
                            <span className="bb-list-row-sub" style={{ display: "block", marginBottom: 4 }}>
                              Date
                            </span>
                            <input
                              type="date"
                              className="bb-input"
                              value={trainerMeetingDate}
                              onChange={(e) => setTrainerMeetingDate(e.target.value)}
                            />
                          </div>
                          <div>
                            <span className="bb-list-row-sub" style={{ display: "block", marginBottom: 4 }}>
                              Time
                            </span>
                            <input
                              type="time"
                              className="bb-input"
                              value={trainerMeetingTime}
                              onChange={(e) => setTrainerMeetingTime(e.target.value)}
                            />
                          </div>
                          <button
                            type="button"
                            className="bb-btn-primary"
                            onClick={() => void submitTrainerMeeting()}
                            disabled={trainerMeetingSubmitting}
                          >
                            {trainerMeetingSubmitting ? "…" : "Schedule"}
                          </button>
                        </div>
                      ) : null}
                      {staffMeetings.length ? (
                      <ul className="bb-list-rows">
                          {staffMeetings.map((m: any) => (
                            <li
                              key={String(m.id)}
                              className="bb-list-row"
                              onClick={() => setSelectedMeeting(m)}
                              role="presentation"
                            >
                              <div className="bb-list-row-title">
                                {String(m.user_name || "").trim() || m.user_email || "Client"}
                              </div>
                              <p className="bb-list-row-sub">
                                {m.meeting_date || "—"} · {m.time_slot || "—"}
                                {m.user_email ? ` · ${m.user_email}` : ""}
                              </p>
                            </li>
                          ))}
                      </ul>
                    ) : (
                        <p className="bb-live-empty">No upcoming scheduled meetings.</p>
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
                  <p className="chat-header-desc">
                    {userTrainerChatDisplayName
                      ? `Chat with ${userTrainerChatDisplayName}. Just type and send.`
                      : "Message your coach. Just type and send."}
                  </p>
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
                                {staffSide ? userTrainerChatDisplayName || "Coach" : "You"} ·{" "}
                                {m.created_at ? new Date(m.created_at).toLocaleString() : ""}
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
                      {activeClients.map((u: any) => (
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

            {staffOverlay === "insights" ? performanceInsightsPanel : null}

            {staffOverlay === "campaigns" ? campaignsPanel : null}
          </div>
        ) : null}

        {(selectedClient ||
          selectedCheckin ||
          selectedWorkout ||
          selectedMeeting ||
          selectedSunday ||
          selectedPart2) ? (
          <div
            className="bb-detail-modal-backdrop"
            role="dialog"
            aria-modal="true"
            onClick={() => {
              setSelectedClient(null);
              setSelectedCheckin(null);
              setSelectedWorkout(null);
              setSelectedMeeting(null);
              setSelectedSunday(null);
              setSelectedPart2(null);
              setClientProgress(null);
              setClientProgressShareUrl("");
            }}
          >
          <div className="bb-panel bb-detail-panel bb-detail-modal-card" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              aria-label="Close details"
              onClick={() => {
                setSelectedClient(null);
                setSelectedCheckin(null);
                setSelectedWorkout(null);
                setSelectedMeeting(null);
                setSelectedSunday(null);
                setSelectedPart2(null);
                setClientProgress(null);
                setClientProgressShareUrl("");
              }}
              style={{
                position: "absolute",
                top: 10,
                right: 10,
                width: 32,
                height: 32,
                borderRadius: 999,
                border: "1px solid var(--border)",
                background: "var(--bg-surface)",
                color: "var(--text-primary)",
                fontSize: 18,
                lineHeight: 1,
                cursor: "pointer"
              }}
            >
              ×
            </button>
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
                  setSelectedCheckin(null);
                  setSelectedWorkout(null);
                  setSelectedMeeting(null);
                  setSelectedSunday(null);
                  setSelectedPart2(null);
                  setClientProgress(null);
                  setClientProgressShareUrl("");
                }}
              >
                Close
              </button>
            </div>
            {selectedClient ? (
              <div style={{ display: "grid", gap: 6 }}>
                <div><strong>Client:</strong> {[selectedClient.first_name, selectedClient.last_name].filter(Boolean).join(" ") || selectedClient.email || "User"}</div>
                <div><strong>Email:</strong> {selectedClient.email || "-"}</div>
                <div>
                  <strong>Phone:</strong> {selectedClient.phone ? String(selectedClient.phone) : "—"}
                </div>
                <div>
                  <strong>Status:</strong>{" "}
                  {selectedClient.suspended
                    ? "Suspended"
                    : selectedClient.approval_status
                      ? String(selectedClient.approval_status).replace(/\b\w/g, (c) => c.toUpperCase())
                      : "—"}
                </div>
                {selectedClient._coachName ? (
                  <div>
                    <strong>Coach:</strong> {selectedClient._coachName}
                    {selectedClient._coachEmail ? ` (${selectedClient._coachEmail})` : ""}
                  </div>
                ) : null}
                {clientProgress && typeof clientProgress === "object" && (clientProgress as { error?: string }).error ? (
                  <p className="bb-list-row-sub" style={{ marginTop: 8, color: "var(--red)" }}>
                    {(clientProgress as { error?: string }).error}
                  </p>
                ) : null}
                {clientProgress && typeof clientProgress === "object" && !(clientProgress as { error?: string }).error ? (
                  <>
                    <p className="bb-list-row-sub" style={{ marginTop: 10, marginBottom: 0 }}>
                      KPIs blend progress logs, workout sessions, daily check-ins, and Sunday check-ins. Consistency uses the last 28 days; streak counts consecutive days with any logged activity. Generate a link when the client should open their read-only report.
                      {(clientProgress as { suspended?: boolean }).suspended ? (
                        <span style={{ color: s.gold, fontWeight: 700 }}> (User is suspended)</span>
                      ) : null}
                    </p>
                    <div className="admin-cp-kpis">
                      {[
                        {
                          lbl: "Current Weight",
                          num: clientProgress.currentWeight != null ? `${clientProgress.currentWeight} kg` : "—"
                        },
                        {
                          lbl: "Weight Change %",
                          num: clientProgress.weightChangePercent != null ? `${clientProgress.weightChangePercent}%` : "—"
                        },
                        {
                          lbl: "Strength Growth %",
                          num: clientProgress.strengthGrowthPercent != null ? `${clientProgress.strengthGrowthPercent}%` : "—"
                        },
                        {
                          lbl: "Consistency %",
                          num: clientProgress.workoutConsistencyPercent != null ? `${clientProgress.workoutConsistencyPercent}%` : "—"
                        },
                        {
                          lbl: "Active Streak",
                          num: clientProgress.activeStreak != null ? `${clientProgress.activeStreak} days` : "—"
                        },
                        {
                          lbl: "Goal Completion %",
                          num:
                            clientProgress.goalCompletionPercent != null
                              ? `${Math.round(Number(clientProgress.goalCompletionPercent))}%`
                              : "—"
                        }
                      ].map((k) => (
                        <div key={k.lbl} className="admin-cp-kpi">
                          <span className="num">{k.num}</span>
                          <span className="lbl">{k.lbl}</span>
              </div>
                      ))}
                    </div>
                    {clientProgress.averageCalories != null || clientProgress.averageSleep != null ? (
                      <p className="bb-list-row-sub" style={{ marginTop: 10 }}>
                        {clientProgress.averageCalories != null ? (
                          <span>
                            <strong>Avg calories:</strong> {String(clientProgress.averageCalories)}{" "}
                          </span>
            ) : null}
                        {clientProgress.averageSleep != null ? (
                          <span>
                            <strong>Avg sleep (h):</strong> {String(clientProgress.averageSleep)}
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                    {Array.isArray(clientProgress.insights) && clientProgress.insights.length ? (
                      <p className="progress-insights">
                        <strong>Insights:</strong> {clientProgress.insights.map((x: unknown) => String(x)).join(" • ")}
                      </p>
                    ) : null}
                    <ClientProgressCharts logs={Array.isArray(clientProgress.logs) ? clientProgress.logs : []} />
                    <div className="bb-staff-detail-actions">
                      <button
                        type="button"
                        className="bb-staff-detail-btn"
                        disabled={clientProgressShareBusy}
                        onClick={() => void generateClientProgressShareLink()}
                      >
                        {clientProgressShareBusy ? "Generating…" : "Share link with user"}
                      </button>
                      {(clientProgress as { suspended?: boolean }).suspended ? (
                        <button
                          type="button"
                          className="bb-staff-detail-btn"
                          disabled={clientProgressUserBusy}
                          onClick={() => void reactivateSelectedClient()}
                        >
                          Re-activate user
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="bb-staff-detail-btn bb-staff-detail-btn--danger"
                          disabled={clientProgressUserBusy}
                          onClick={() => void suspendSelectedClient()}
                        >
                          Suspend user
                        </button>
                      )}
                    </div>
                    {clientProgressShareUrl ? (
                      <div style={{ marginTop: 12 }}>
                        <div className="admin-cp-heading" style={{ marginBottom: 6 }}>
                          Link to send to client
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          <input type="text" readOnly className="ud-form-input" style={{ flex: 1, minWidth: 200 }} value={clientProgressShareUrl} />
                          <button type="button" className="bb-staff-detail-btn" onClick={() => void copyClientProgressShareUrl()}>
                            Copy link
                          </button>
                          <a href={clientProgressShareUrl} target="_blank" rel="noreferrer" style={{ color: s.gold, fontWeight: 700 }}>
                            Open report
                          </a>
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : selectedClient && session?.token ? (
                  <p className="bb-list-row-sub" style={{ marginTop: 8 }}>Loading progress…</p>
                ) : null}
              </div>
            ) : null}
            {selectedCheckin ? (
              <div className="bb-form-view-grid">
                <span className="bb-inline-label" style={{ marginBottom: 4 }}>
                  Daily check-in
                </span>
                <AdminDetailRow label="Name">
                  {[selectedCheckin.first_name, selectedCheckin.last_name].filter(Boolean).join(" ") || "—"}
                </AdminDetailRow>
                <AdminDetailRow label="Email">{adminDetailText(selectedCheckin.email)}</AdminDetailRow>
                <AdminDetailRow label="Phone">{adminDetailText(selectedCheckin.phone)}</AdminDetailRow>
                <AdminDetailRow label="Check-in date">{formatAdminCheckinDate(selectedCheckin.checkin_date)}</AdminDetailRow>
                <AdminDetailRow label="Steps">{adminDetailText(selectedCheckin.steps)}</AdminDetailRow>
                <AdminDetailRow label="Water (ml)">{adminDetailText(selectedCheckin.water_ml)}</AdminDetailRow>
                <AdminDetailRow label="Protein (g)">{adminDetailText(selectedCheckin.protein_g)}</AdminDetailRow>
                <AdminDetailRow label="Sleep (hrs)">{adminDetailText(selectedCheckin.sleep_hours)}</AdminDetailRow>
                {selectedCheckin.trainer_first_name || selectedCheckin.trainer_email ? (
                  <AdminDetailRow label="Coach">
                    {[selectedCheckin.trainer_first_name, selectedCheckin.trainer_last_name].filter(Boolean).join(" ") ||
                      selectedCheckin.trainer_email ||
                      "—"}
                  </AdminDetailRow>
                ) : null}
                <AdminDetailRow label="Saved at">
                  {selectedCheckin.created_at ? new Date(String(selectedCheckin.created_at)).toLocaleString() : "—"}
                </AdminDetailRow>
              </div>
            ) : null}
            {selectedSunday ? (
              <div className="bb-form-view-grid">
                <span className="bb-inline-label" style={{ marginBottom: 4 }}>
                  Sunday check-in
                </span>
                <AdminDetailRow label="Full name">{adminDetailText(selectedSunday.full_name)}</AdminDetailRow>
                <AdminDetailRow label="Reply email">{adminDetailText(selectedSunday.reply_email)}</AdminDetailRow>
                <AdminDetailRow label="Plan">{adminDetailText(selectedSunday.plan)}</AdminDetailRow>
                <AdminDetailBlock label="Current weight, waist & week" value={selectedSunday.current_weight_waist_week} />
                <AdminDetailBlock label="Last week weight & waist" value={selectedSunday.last_week_weight_waist} />
                <AdminDetailBlock label="Total weight loss/gain" value={selectedSunday.total_weight_loss} />
                <AdminDetailBlock label="How did your training go?" value={selectedSunday.training_go} />
                <AdminDetailBlock label="How did your nutrition go?" value={selectedSunday.nutrition_go} />
                <AdminDetailBlock label="Sleep (bed/wake, 8 hours, difficulties)" value={selectedSunday.sleep} />
                <AdminDetailBlock label="Occupation & stress" value={selectedSunday.occupation_stress} />
                <AdminDetailBlock label="Other stress & cause" value={selectedSunday.other_stress} />
                <AdminDetailBlock label="Differences felt (physically & mentally)" value={selectedSunday.differences_felt} />
                <AdminDetailBlock label="Biggest achievements" value={selectedSunday.achievements} />
                <AdminDetailBlock label="Improve for coming week" value={selectedSunday.improve_next_week} />
                <AdminDetailBlock label="Questions" value={selectedSunday.questions} />
                {selectedSunday.account_first_name || selectedSunday.account_email ? (
                  <AdminDetailRow label="Linked account">
                    {[selectedSunday.account_first_name, selectedSunday.account_last_name].filter(Boolean).join(" ") || "—"}
                    {selectedSunday.account_email ? ` · ${selectedSunday.account_email}` : ""}
                  </AdminDetailRow>
                ) : null}
                {selectedSunday.trainer_first_name || selectedSunday.trainer_email ? (
                  <AdminDetailRow label="Coach">
                    {[selectedSunday.trainer_first_name, selectedSunday.trainer_last_name].filter(Boolean).join(" ") ||
                      selectedSunday.trainer_email ||
                      "—"}
                  </AdminDetailRow>
                ) : null}
                <AdminDetailRow label="Submitted">
                  {selectedSunday.created_at ? new Date(String(selectedSunday.created_at)).toLocaleString() : "—"}
                </AdminDetailRow>
              </div>
            ) : null}
            {selectedPart2 ? (
              <div className="bb-form-view-grid">
                <span className="bb-inline-label" style={{ marginBottom: 4 }}>
                  Part-2 submission
                </span>
                <AdminDetailRow label="Name">{adminDetailText(selectedPart2.name)}</AdminDetailRow>
                <AdminDetailRow label="Email">{adminDetailText(selectedPart2.email)}</AdminDetailRow>
                <AdminDetailRow label="Mobile">{adminDetailText(selectedPart2.mobile)}</AdminDetailRow>
                <AdminDetailRow label="Activity level">{adminDetailText(selectedPart2.activity_level)}</AdminDetailRow>
                <AdminDetailBlock label="Sports history" value={selectedPart2.sports_history} />
                <AdminDetailBlock label="Past/current injuries" value={selectedPart2.injuries} />
                <AdminDetailBlock label="Mental health" value={selectedPart2.mental_health} />
                <AdminDetailBlock label="Gym experience" value={selectedPart2.gym_experience} />
                <AdminDetailBlock label="Food choices" value={selectedPart2.food_choices} />
                <AdminDetailBlock label="Vices & addictions" value={selectedPart2.vices_addictions} />
                <AdminDetailBlock label="Goals" value={selectedPart2.goals} />
                <AdminDetailBlock label="What compelled you" value={selectedPart2.what_compelled} />
                <AdminDetailRow label="Submitted">
                  {selectedPart2.created_at ? new Date(String(selectedPart2.created_at)).toLocaleString() : "—"}
                </AdminDetailRow>
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
                <div><strong>Notes:</strong> {selectedMeeting.notes || selectedMeeting.message || "-"}</div>
                {role === "user" || role === "admin" || role === "superadmin" ? (
                  <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                    <button
                      onClick={() => updateMeetingStatus("scheduled")}
                      disabled={isMeetingUpdating}
                      style={{ border: "none", background: "var(--green)", color: "var(--on-accent)", borderRadius: 8, padding: "7px 10px", fontWeight: 700 }}
                    >
                      {isMeetingUpdating ? "..." : "Mark Scheduled"}
                    </button>
                    <button
                      onClick={() => updateMeetingStatus("completed")}
                      disabled={isMeetingUpdating}
                      style={{ border: "none", background: "var(--accent-light)", color: "var(--on-accent)", borderRadius: 8, padding: "7px 10px", fontWeight: 700 }}
                    >
                      {isMeetingUpdating ? "..." : "Mark Completed"}
                    </button>
                    <button
                      onClick={() => updateMeetingStatus("cancelled")}
                      disabled={isMeetingUpdating}
                      style={{ border: "none", background: "var(--red)", color: "var(--on-accent)", borderRadius: 8, padding: "7px 10px", fontWeight: 700 }}
                    >
                      {isMeetingUpdating ? "..." : "Cancel"}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          </div>
        ) : null}
      </section>
      </div>

      {isStaff ? (
        <div className="bb-ai-assist-panel" style={{ display: staffAiOpen ? "flex" : "none" }} role="dialog" aria-label="AI Assist">
          <div className="bb-ai-assist-head">
            <strong>AI Assist</strong>
            <button type="button" className="bb-ai-assist-x" onClick={() => setStaffAiOpen(false)} aria-label="Close">
              ×
            </button>
          </div>
          <div className="bb-ai-assist-body">
            {role === "superadmin" ? (
              <>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    marginBottom: 12,
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-secondary)"
                  }}
                >
                  <span style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px" }}>
                    Trainers: {superadminTrainers.filter((t: any) => !t.suspended).length} active
                  </span>
                  <span style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px" }}>
                    Roster links: {superadminRosterRows.length}
                  </span>
                  <span style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px" }}>
                    Pending sign-ups: {pendingUsers.length}
                  </span>
                </div>
            <p style={{ margin: 0 }}>
                  Platform-wide context: trainer applications, website coaching requests, Part-2 forms, daily/Sunday check-ins, and roster health. Ask for a morning briefing, bottleneck analysis, or &ldquo;which coaches have suspended accounts?&rdquo;
                </p>
              </>
            ) : (
              <p style={{ margin: 0 }}>
                Ask about Part-2 submissions, check-ins, sign-ups, or clients. Try &ldquo;Quick summary&rdquo; or &ldquo;How many pending sign-ups?&rdquo;
              </p>
            )}
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

      {superadminRequestDetailModal ? (
        (() => {
          const modalData = superadminRequestDetailModal.data || {};
          const reqId = String(modalData?.id || "");
          const isTrainerReq = superadminRequestDetailModal.kind === "trainer";
          const isPending = String(modalData?.status || "").toLowerCase() === "pending";
          const busyApprove = isTrainerReq ? superadminQueueBusy === `${reqId}-ta` : superadminQueueBusy === `${reqId}-ca`;
          const busyReject = isTrainerReq ? superadminQueueBusy === `${reqId}-tr` : superadminQueueBusy === `${reqId}-cr`;
          const busy = busyApprove || busyReject;
          const assignedTrainer = assignTrainerForClient[reqId] || "";
          return (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="sa-request-detail-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100000,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16
          }}
          onClick={() => setSuperadminRequestDetailModal(null)}
        >
          <div
            className="bb-card"
            style={{
              position: "relative",
              maxWidth: 560,
              width: "100%",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: 20,
              boxShadow: "var(--shadow-lg)",
              maxHeight: "82vh",
              overflowY: "auto"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              aria-label="Close details"
              onClick={() => setSuperadminRequestDetailModal(null)}
              style={{
                position: "absolute",
                top: 10,
                right: 10,
                width: 32,
                height: 32,
                borderRadius: 999,
                border: "1px solid var(--border)",
                background: "var(--bg-surface)",
                color: "var(--text-primary)",
                fontSize: 18,
                lineHeight: 1,
                cursor: "pointer"
              }}
            >
              ×
            </button>
            <h2 id="sa-request-detail-title" style={{ margin: "0 0 6px", fontSize: 18, color: "var(--text-primary)" }}>
              {superadminRequestDetailModal.kind === "trainer" ? "Trainer request details" : "Client request details"}
            </h2>
            <p style={{ margin: "0 0 14px", fontSize: 12, color: "var(--text-secondary)" }}>
              Submitted {superadminFormatShortDate(superadminRequestDetailModal.data?.created_at)} · Status{" "}
              <strong>{String(superadminRequestDetailModal.data?.status || "pending").toUpperCase()}</strong>
            </p>
            <div className="bb-form-view-grid">
              {Object.entries(modalData)
                .filter(([k, v]) => !["_coachName", "_coachEmail"].includes(k) && v != null && String(v).trim() !== "")
                .map(([k, v]) => (
                  <div key={k} className="bb-form-view-row">
                    <div className="bb-fv-lbl">{k.replace(/_/g, " ")}</div>
                    <div className="bb-fv-val" style={{ whiteSpace: "pre-wrap" }}>{String(v)}</div>
                  </div>
                ))}
            </div>
            {isPending ? (
              <div className="bb-sa-modal-actions">
                {!isTrainerReq ? (
                  <select
                    className="bb-sa-queue-select"
                    value={assignedTrainer}
                    onChange={(e) => setAssignTrainerForClient((p) => ({ ...p, [reqId]: e.target.value }))}
                  >
                    <option value="">Assign trainer…</option>
                    {superadminTrainers.map((t: any) => (
                      <option key={t.id} value={t.id}>
                        {[t.first_name, t.last_name].filter(Boolean).join(" ") || t.email}
                        {t.suspended ? " (suspended)" : ""}
                      </option>
                    ))}
                  </select>
                ) : null}
                <button
                  type="button"
                  className="bb-sa-btn-approve"
                  disabled={busy || !reqId || (!isTrainerReq && !assignedTrainer)}
                  onClick={() => {
                    if (!reqId) return;
                    setSuperadminRequestDetailModal(null);
                    if (isTrainerReq) void superadminApproveTrainerRequestRow(reqId);
                    else void superadminApproveClientRequestRow(reqId, assignedTrainer);
                  }}
                >
                  {busyApprove ? "…" : "Approve"}
                </button>
                <button
                  type="button"
                  className="bb-sa-btn-reject"
                  disabled={busy || !reqId}
                  onClick={() => {
                    if (!reqId) return;
                    setSuperadminRequestDetailModal(null);
                    if (isTrainerReq) void superadminRejectTrainerRequestRow(reqId);
                    else void superadminRejectClientRequestRow(reqId);
                  }}
                >
                  {busyReject ? "…" : "Reject"}
                </button>
              </div>
            ) : null}
            <button
              type="button"
              className="bb-back-btn"
              style={{ marginBottom: 0, marginTop: 14, width: "100%", justifyContent: "center" }}
              onClick={() => setSuperadminRequestDetailModal(null)}
            >
              Close details
            </button>
          </div>
        </div>
          );
        })()
      ) : null}

      {superadminTrainerCredModal ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="sa-cred-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100000,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16
          }}
          onClick={() => setSuperadminTrainerCredModal(null)}
        >
          <div
            className="bb-card"
            style={{
              maxWidth: 440,
              width: "100%",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: 22,
              boxShadow: "var(--shadow-lg)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="sa-cred-title" style={{ margin: "0 0 8px", fontSize: 18, color: "var(--text-primary)" }}>
              Trainer approved
            </h2>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--text-secondary)" }}>
              Share these credentials with <strong>{superadminTrainerCredModal.full_name}</strong>
            </p>
            {(() => {
              const origin = typeof window !== "undefined" ? window.location.origin : "";
              const joinPath = `/join/${superadminTrainerCredModal.trainer_code}`;
              const joinFull = `${origin}${joinPath}`;
              const loginLine = superadminTrainerCredModal.login_url.replace(/^https?:\/\//, "");
              const copy = async (label: string, text: string) => {
                try {
                  await navigator.clipboard.writeText(text);
                  if (typeof window !== "undefined") window.alert(`${label} copied.`);
                } catch {
                  if (typeof window !== "undefined") window.prompt(`Copy ${label}:`, text);
                }
              };
              const copyAll = async () => {
                const block = `---
Welcome to FitBase!
Login: ${superadminTrainerCredModal.login_url}
Email: ${superadminTrainerCredModal.email}
Password: ${superadminTrainerCredModal.temp_password}
Your client invite link: ${joinFull}
Change your password on first login.
---`;
                await copy("All details", block);
              };
              const row = (lab: string, val: string, onCopy: () => void) => (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{lab}</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <code
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 13,
                        padding: "8px 10px",
                        background: "var(--bg-surface)",
                        borderRadius: 8,
                        border: "1px solid var(--border)",
                        wordBreak: "break-all"
                      }}
                    >
                      {val}
                    </code>
                    <button
                      type="button"
                      className="bb-btn-secondary"
                      style={{ flexShrink: 0 }}
                      onClick={() => void onCopy()}
                    >
                      Copy
                    </button>
                  </div>
                </div>
              );
              return (
                <>
                  {row("Login URL", loginLine, () =>
                    void copy("Login URL", superadminTrainerCredModal.login_url)
                  )}
                  {row("Email", superadminTrainerCredModal.email, () =>
                    void copy("Email", superadminTrainerCredModal.email)
                  )}
                  {row("Password", superadminTrainerCredModal.temp_password, () =>
                    void copy("Password", superadminTrainerCredModal.temp_password)
                  )}
                  {row("Client invite link", joinFull.replace(/^https?:\/\//, ""), () => void copy("Invite link", joinFull))}
                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
                    <button type="button" className="bb-btn-secondary" onClick={() => void copyAll()}>
                      Copy all
                    </button>
                    <button type="button" className="bb-btn-primary" onClick={() => setSuperadminTrainerCredModal(null)}>
                      Done
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      ) : null}

      <nav className="bb-nav-dock">
        <div className={isSuperadminViewer ? "bb-nav-inner bb-nav-inner-sa" : "bb-nav-inner"}>
          {role === "user" ? (
            <>
              {tabButton("home", "Home", "\u2605")}
              {tabButton("clients", "Workout", "\uD83D\uDCAA")}
              {tabButton("programs", "Programs", "\uD83C\uDFAF")}
              {tabButton("forms", "Check-in", "\u2705")}
              {tabButton("messages", "Messages", "\uD83D\uDCAC")}
            </>
          ) : isSuperadminViewer ? (
            <>
              {(["overview","applications","trainers","members","enterprise"] as const).map((t) => {
                const labels: Record<string,string> = {overview:"Overview",applications:"Requests",trainers:"Trainers",members:"Members",enterprise:"Biz"};
                const icons: Record<string,string> = {overview:"\u2605",applications:"\uD83D\uDCE5",trainers:"\uD83D\uDC64",members:"\uD83D\uDC65",enterprise:"\uD83C\uDFE2"};
                const isActive = (() => {
                  if (t === "trainers") return activeTab === "clients" && (trainerClientsView === "coachPortfolio");
                  if (t === "members") return activeTab === "clients" && trainerClientsView !== "coachPortfolio";
                  return activeTab !== "clients" && saTab === t;
                })();
                return (
                  <button
                    key={t}
                    type="button"
                    className={`bb-nav-btn${isActive ? " bb-nav-btn-active" : ""}`}
                    onClick={() => goSaTab(t)}
                    aria-label={labels[t]}
                  >
                    {isActive && <span className="bb-nav-tabbar" aria-hidden />}
                    <span aria-hidden style={{fontSize:20,lineHeight:1}}>{icons[t]}</span>
                    <span>{labels[t]}</span>
                  </button>
                );
              })}
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

