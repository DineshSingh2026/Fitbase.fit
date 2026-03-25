const DAYS_OF_WEEK = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday"
] as const;

const DAY_ALIASES: Record<string, string> = {
  sun: "sunday",
  mon: "monday",
  tue: "tuesday",
  wed: "wednesday",
  thu: "thursday",
  fri: "friday",
  sat: "saturday"
};

export function normalizeCampaignDay(day: unknown): string | null {
  if (day == null) return null;
  const d = String(day).trim().toLowerCase();
  if (DAYS_OF_WEEK.includes(d as (typeof DAYS_OF_WEEK)[number])) return d;
  if (DAY_ALIASES[d]) return DAY_ALIASES[d];
  for (const wd of DAYS_OF_WEEK) {
    if (wd.startsWith(d)) return wd;
  }
  return null;
}

export function normalizeCampaignTime(timeStr: unknown): string | null {
  const s = String(timeStr || "")
    .trim()
    .toLowerCase();

  const amPm = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (amPm) {
    let h = parseInt(amPm[1], 10);
    const min = parseInt(amPm[2] || "0", 10);
    const period = amPm[3];
    if (period === "pm" && h < 12) h += 12;
    if (period === "am" && h === 12) h = 0;
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }

  const plain = s.match(/^(\d{1,2}):(\d{2})$/);
  if (plain) {
    const h = parseInt(plain[1], 10);
    const m = parseInt(plain[2], 10);
    if (h < 0 || h > 23 || m < 0 || m > 59) return null;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  return null;
}

export type ParsedCampaignCommand =
  | { action: "list" }
  | { action: "pause"; id: string }
  | { action: "resume"; id: string }
  | { action: "delete"; id: string }
  | { action: "broadcast"; message: string }
  | { action: "create"; data: { message: string; day_of_week: string; time_of_day: string } };

export function parseAICampaignCommand(text: unknown): ParsedCampaignCommand | null {
  const t = String(text || "").trim();
  const tl = t.toLowerCase();

  if (/\b(list|show|view|display)\b.*\bcampaign|\bcampaign.*\b(list|show|view)\b/.test(tl)) {
    return { action: "list" };
  }

  const uuidRe = "([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})";
  const pauseM = tl.match(new RegExp(`\\bpause\\b.*?${uuidRe}`));
  if (pauseM) return { action: "pause", id: pauseM[1] };

  const resumeM = tl.match(new RegExp(`\\bresume\\b.*?${uuidRe}`));
  if (resumeM) return { action: "resume", id: resumeM[1] };

  const deleteM = tl.match(new RegExp(`\\b(delete|remove)\\b.*?${uuidRe}`));
  if (deleteM) return { action: "delete", id: deleteM[2] };

  const broadcastM = t.match(/\b(?:broadcast|send\s+now)\s*(?:message\s*)?[:\-–]\s*(.+)/i);
  if (broadcastM) {
    return { action: "broadcast", message: broadcastM[1].trim() };
  }

  const verbosePattern =
    /(?:create|add|schedule)\s+(?:a\s+)?(?:reminder\s+|campaign\s+|message\s+)?(?:campaign\s+)?[:\-–]?\s*(.+?)\s+every\s+(day|daily|sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat)\s+(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i;
  const verboseM = t.match(verbosePattern);
  if (verboseM) {
    const message = verboseM[1].trim();
    const dayRaw = verboseM[2].trim().toLowerCase();
    const timeRaw = verboseM[3].trim();
    const day = dayRaw === "day" || dayRaw === "daily" ? "daily" : normalizeCampaignDay(dayRaw);
    const time = normalizeCampaignTime(timeRaw);
    if (day && time && message) {
      return { action: "create", data: { message, day_of_week: day, time_of_day: time } };
    }
  }

  const shortPattern =
    /(?:create|add|schedule)\s+(?:weekly\s+)?(.+?)\s+(?:message\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat|daily|day)\s+(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i;
  const shortM = t.match(shortPattern);
  if (shortM) {
    const message = shortM[1].trim();
    const dayRaw = shortM[2].trim().toLowerCase();
    const timeRaw = shortM[3].trim();
    const day = dayRaw === "day" || dayRaw === "daily" ? "daily" : normalizeCampaignDay(dayRaw);
    const time = normalizeCampaignTime(timeRaw);
    if (day && time && message) {
      return { action: "create", data: { message, day_of_week: day, time_of_day: time } };
    }
  }

  return null;
}

export function formatCampaignListReply(campaigns: any[]): string {
  if (!campaigns || campaigns.length === 0) {
    return `No campaigns found. Use the Campaigns tab to create your first one, or type a command like:\n\n"Create reminder campaign: Hydrate well! every monday at 9 AM"`;
  }

  const grouped: Record<string, any[]> = {};
  const ORDER = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "daily"];
  for (const c of campaigns) {
    const d = String(c.day_of_week || "unknown");
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(c);
  }

  const lines: string[] = [];
  for (const day of ORDER) {
    if (!grouped[day]) continue;
    lines.push(`**${day.charAt(0).toUpperCase() + day.slice(1)}**`);
    for (const c of grouped[day]) {
      const status = c.is_active ? "🟢" : "🔴";
      lines.push(`  ${status} ${c.time_of_day} — ${c.message}  (id: \`${c.id}\`)`);
    }
  }

  return (
    `**Campaign Schedule (${campaigns.length} total)**\n\n` +
    lines.join("\n") +
    `\n\n🟢 active · 🔴 paused\n\nTo pause: "Pause campaign <id>"\nTo resume: "Resume campaign <id>"\nTo delete: "Delete campaign <id>"`
  );
}

const DOW_TO_CRON: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6
};

export function parseTimeHHMM(timeStr: unknown): { hour: number; minute: number } | null {
  const m = String(timeStr || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

export function buildCronExpression(day_of_week: unknown, time_of_day: unknown): string | null {
  const t = parseTimeHHMM(time_of_day);
  if (!t) return null;
  const day = String(day_of_week || "")
    .trim()
    .toLowerCase();
  if (day === "daily") {
    return `${t.minute} ${t.hour} * * *`;
  }
  const dow = DOW_TO_CRON[day];
  if (dow === undefined) return null;
  return `${t.minute} ${t.hour} * * ${dow}`;
}
