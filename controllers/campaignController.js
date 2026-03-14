'use strict';

/**
 * Campaign Controller
 * Pure helper functions: parsing, normalisation, AI command detection.
 * All DB operations are handled by routes in server.js using queryAll/run.
 */

const DAYS_OF_WEEK = [
  'sunday', 'monday', 'tuesday', 'wednesday',
  'thursday', 'friday', 'saturday',
];

const DAY_ALIASES = {
  sun: 'sunday', mon: 'monday', tue: 'tuesday', wed: 'wednesday',
  thu: 'thursday', fri: 'friday', sat: 'saturday',
};

// ─── Normalisers ─────────────────────────────────────────────────────────────

/**
 * Normalise a day name to lowercase full form, e.g. "Mon" → "monday".
 * Returns null if unrecognised.
 */
function normalizeDay(day) {
  if (!day) return null;
  const d = String(day).trim().toLowerCase();
  if (DAYS_OF_WEEK.includes(d)) return d;
  if (DAY_ALIASES[d]) return DAY_ALIASES[d];
  // partial match
  for (const wd of DAYS_OF_WEEK) {
    if (wd.startsWith(d)) return wd;
  }
  return null;
}

/**
 * Normalise a time string to "HH:MM" (24h), e.g. "9 AM" → "09:00".
 * Returns null if unrecognisable.
 */
function normalizeTime(timeStr) {
  const s = String(timeStr || '').trim().toLowerCase();

  // "9:00 AM", "9 AM", "2:30 pm"
  const amPm = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (amPm) {
    let h      = parseInt(amPm[1], 10);
    const min  = parseInt(amPm[2] || '0', 10);
    const period = amPm[3];
    if (period === 'pm' && h < 12) h += 12;
    if (period === 'am' && h === 12) h = 0;
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }

  // "09:00", "9:00", "21:30"
  const plain = s.match(/^(\d{1,2}):(\d{2})$/);
  if (plain) {
    const h = parseInt(plain[1], 10);
    const m = parseInt(plain[2], 10);
    if (h < 0 || h > 23 || m < 0 || m > 59) return null;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  return null;
}

// ─── AI Command Parser ────────────────────────────────────────────────────────

/**
 * Detect and parse an AI natural-language campaign command.
 *
 * Returns one of:
 *   { action: 'list' }
 *   { action: 'pause',   id: string }
 *   { action: 'resume',  id: string }
 *   { action: 'delete',  id: string }
 *   { action: 'broadcast', message: string }
 *   { action: 'create',  data: { message, day_of_week, time_of_day } }
 *   null  — not a campaign command, let normal AI handle it
 */
function parseAICampaignCommand(text) {
  const t = String(text || '').trim();
  const tl = t.toLowerCase();

  // ── list ──────────────────────────────────────────────────────────────────
  if (/\b(list|show|view|display)\b.*\bcampaign|\bcampaign.*\b(list|show|view)\b/.test(tl)) {
    return { action: 'list' };
  }

  // ── pause ─────────────────────────────────────────────────────────────────
  const pauseM = tl.match(/\bpause\b.*?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/);
  if (pauseM) return { action: 'pause', id: pauseM[1] };

  // ── resume ────────────────────────────────────────────────────────────────
  const resumeM = tl.match(/\bresume\b.*?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/);
  if (resumeM) return { action: 'resume', id: resumeM[1] };

  // ── delete ────────────────────────────────────────────────────────────────
  const deleteM = tl.match(/\b(delete|remove)\b.*?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/);
  if (deleteM) return { action: 'delete', id: deleteM[2] };

  // ── broadcast now ─────────────────────────────────────────────────────────
  // "broadcast: Hydrate well!" or "send now: <message>" or "broadcast message: ..."
  const broadcastM = t.match(/\b(?:broadcast|send\s+now)\s*(?:message\s*)?[:\-–]\s*(.+)/i);
  if (broadcastM) {
    return { action: 'broadcast', message: broadcastM[1].trim() };
  }

  // ── create (verbose): "create reminder campaign: <msg> every <day> at <time>" ──
  const verbosePattern = /(?:create|add|schedule)\s+(?:a\s+)?(?:reminder\s+|campaign\s+|message\s+)?(?:campaign\s+)?[:\-–]?\s*(.+?)\s+every\s+(day|daily|sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat)\s+(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i;
  const verboseM = t.match(verbosePattern);
  if (verboseM) {
    const message = verboseM[1].trim();
    const dayRaw  = verboseM[2].trim().toLowerCase();
    const timeRaw = verboseM[3].trim();
    const day  = (dayRaw === 'day' || dayRaw === 'daily') ? 'daily' : normalizeDay(dayRaw);
    const time = normalizeTime(timeRaw);
    if (day && time && message) {
      return { action: 'create', data: { message, day_of_week: day, time_of_day: time } };
    }
  }

  // ── create (short): "create weekly motivation Monday 9 AM" ───────────────
  const shortPattern = /(?:create|add|schedule)\s+(?:weekly\s+)?(.+?)\s+(?:message\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat|daily|day)\s+(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i;
  const shortM = t.match(shortPattern);
  if (shortM) {
    const message = shortM[1].trim();
    const dayRaw  = shortM[2].trim().toLowerCase();
    const timeRaw = shortM[3].trim();
    const day  = (dayRaw === 'day' || dayRaw === 'daily') ? 'daily' : normalizeDay(dayRaw);
    const time = normalizeTime(timeRaw);
    if (day && time && message) {
      return { action: 'create', data: { message, day_of_week: day, time_of_day: time } };
    }
  }

  return null; // not a campaign command
}

/**
 * Format a campaign list as a human-readable reply for the AI Assist.
 */
function formatCampaignListReply(campaigns) {
  if (!campaigns || campaigns.length === 0) {
    return 'No campaigns found. Use the Campaigns tab to create your first one, or type a command like:\n\n"Create reminder campaign: Hydrate well! every monday at 9 AM"';
  }

  // Group by day
  const grouped = {};
  const ORDER = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday','daily'];
  for (const c of campaigns) {
    const d = String(c.day_of_week || 'unknown');
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(c);
  }

  const lines = [];
  for (const day of ORDER) {
    if (!grouped[day]) continue;
    lines.push(`**${day.charAt(0).toUpperCase() + day.slice(1)}**`);
    for (const c of grouped[day]) {
      const status = c.is_active ? '🟢' : '🔴';
      lines.push(`  ${status} ${c.time_of_day} — ${c.message}  (id: \`${c.id}\`)`);
    }
  }

  return `**Campaign Schedule (${campaigns.length} total)**\n\n` + lines.join('\n') +
    '\n\n🟢 active · 🔴 paused\n\nTo pause: "Pause campaign <id>"\nTo resume: "Resume campaign <id>"\nTo delete: "Delete campaign <id>"';
}

module.exports = {
  normalizeDay,
  normalizeTime,
  parseAICampaignCommand,
  formatCampaignListReply,
  DAYS_OF_WEEK,
};
