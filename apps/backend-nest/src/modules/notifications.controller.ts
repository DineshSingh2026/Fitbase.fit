import { Controller, Get, Inject, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { Pool } from "pg";
import { JwtAuthGuard } from "./jwt-auth.guard";

@Controller("api")
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(@Inject("PG_POOL") private readonly pool: Pool | null) {}

  @Get("notifications")
  async notifications(@Req() req: any, @Res() res: Response) {
    const pg = this.pool;
    if (!pg) return res.status(500).json([]);
    try {
      const notifications: any[] = [];
      const role = String(req.user?.role || "");
      const isSuperadmin = role === "superadmin";
      const isTrainer = role === "admin";
      const isStaff = isSuperadmin || isTrainer;
      const trainerId = isTrainer ? String(req.user?.id || "") : "";

      const run = async (fn: () => Promise<void>) => {
        try {
          await fn();
        } catch {
          /* one broken query must not empty the whole inbox */
        }
      };

      if (isSuperadmin) {
        await run(async () => {
          const messages = await pg.query(
            "SELECT id, name, email, message, created_at FROM contact_messages ORDER BY created_at DESC LIMIT 20"
          );
          messages.rows.forEach((m: any) => {
            const msg = String(m.message || "").substring(0, 50);
            notifications.push({
              id: "message-" + m.id,
              type: "message",
              title: "New Contact Message",
              desc: `${m.name}: ${msg}${String(m.message || "").length > 50 ? "..." : ""}`,
              time: m.created_at,
              link: "messages"
            });
          });
        });

        await run(async () => {
          const chatMessages = await pg.query(
            `SELECT m.id, m.thread_id, m.body, m.created_at, u.first_name, u.last_name, u.email
             FROM thread_messages m
             JOIN message_threads t ON t.id = m.thread_id
             LEFT JOIN users u ON u.id::text = t.user_id::text
             WHERE m.sender_role = 'user'
             AND (t.thread_kind = 'client' OR t.thread_kind IS NULL)
             ORDER BY m.created_at DESC LIMIT 50`
          );
          chatMessages.rows.forEach((m: any) => {
            const name =
              [m.first_name, m.last_name].filter(Boolean).join(" ") || m.email || "User";
            const preview =
              String(m.body || "").substring(0, 80) +
              (String(m.body || "").length > 80 ? "..." : "");
            notifications.push({
              id: "chat-" + m.id,
              type: "chat",
              title: "Message from " + name,
              desc: preview,
              time: m.created_at,
              link: "messages-meetings"
            });
          });
        });

        await run(async () => {
          const opsFromTrainer = await pg.query(
            `SELECT m.id, m.thread_id, m.body, m.created_at, u.first_name, u.last_name, u.email
             FROM thread_messages m
             JOIN message_threads t ON t.id = m.thread_id
             JOIN users u ON u.id::text = t.user_id::text AND u.role = 'admin'
             WHERE t.thread_kind = 'ops' AND m.sender_role = 'admin'
             ORDER BY m.created_at DESC LIMIT 40`
          );
          opsFromTrainer.rows.forEach((m: any) => {
            const name =
              [m.first_name, m.last_name].filter(Boolean).join(" ") || m.email || "Trainer";
            const preview =
              String(m.body || "").substring(0, 80) +
              (String(m.body || "").length > 80 ? "..." : "");
            notifications.push({
              id: "opschat-" + m.id,
              type: "chat",
              title: "Message from trainer " + name,
              desc: preview,
              time: m.created_at,
              link: "messages-meetings"
            });
          });
        });

        await run(async () => {
          const workouts = await pg.query(
            "SELECT w.id, w.workout_name, w.duration_seconds, w.created_at, u.first_name, u.last_name FROM workout_logs w LEFT JOIN users u ON u.id::text = w.user_id::text ORDER BY w.created_at DESC LIMIT 20"
          );
          workouts.rows.forEach((w: any) => {
            const mins = Math.floor((Number(w.duration_seconds) || 0) / 60);
            notifications.push({
              id: "workout-" + w.id,
              type: "workout",
              title: "Workout Logged",
              desc: `${w.first_name || ""} ${w.last_name || ""} - ${w.workout_name} (${mins} min)`,
              time: w.created_at,
              link: "workouts"
            });
          });
        });

        await run(async () => {
          const pendingSignups = await pg.query(
            "SELECT id, email, first_name, last_name, created_at FROM users WHERE role='user' AND (approval_status IS NULL OR approval_status = 'pending') ORDER BY created_at DESC LIMIT 20"
          );
          pendingSignups.rows.forEach((u: any) => {
            notifications.push({
              id: "signup-" + u.id,
              type: "user",
              title: "New User Sign-up (Pending Approval)",
              desc: `${u.first_name || ""} ${u.last_name || ""} (${u.email})`,
              time: u.created_at,
              link: "signups"
            });
          });
        });

        await run(async () => {
          const meetReqs = await pg.query(
            "SELECT id, user_name, user_email, meeting_date, time_slot, created_at FROM meetings WHERE status='scheduled' ORDER BY created_at DESC LIMIT 15"
          );
          meetReqs.rows.forEach((m: any) => {
            notifications.push({
              id: "meeting-" + m.id,
              type: "meeting",
              title: "Call Scheduled",
              desc: `${m.user_name || m.user_email} — ${m.meeting_date} ${m.time_slot}`,
              time: m.created_at,
              link: "meetings"
            });
          });
        });

        await run(async () => {
          const part2Subs = await pg.query(
            "SELECT id, name, email, created_at FROM part2_audit ORDER BY created_at DESC LIMIT 15"
          );
          part2Subs.rows.forEach((p: any) => {
            notifications.push({
              id: "part2-" + p.id,
              type: "form",
              title: "Part-2 Form Submitted",
              desc: `${p.name} (${p.email})`,
              time: p.created_at,
              link: "part2"
            });
          });
        });

        try {
          const sundayRows = await pg.query(
            `SELECT s.id, s.full_name, s.reply_email, s.created_at, u.first_name, u.last_name
             FROM sunday_checkins s
             LEFT JOIN users u ON u.id::text = s.user_id::text
             ORDER BY s.created_at DESC LIMIT 25`
          );
          sundayRows.rows.forEach((s: any) => {
            const who =
              [s.first_name, s.last_name].filter(Boolean).join(" ") ||
              s.full_name ||
              s.reply_email ||
              "User";
            notifications.push({
              id: "sunday-" + s.id,
              type: "checkin",
              title: "Sunday Check-in Submitted",
              desc: who,
              time: s.created_at,
              link: "sundaycheckin"
            });
          });
        } catch {}

        try {
          const dailyRows = await pg.query(
            `SELECT d.id, d.checkin_date, d.created_at, d.steps, d.water_ml, d.protein_g, d.sleep_hours,
                    u.first_name, u.last_name, u.email
             FROM daily_checkins d
             LEFT JOIN users u ON u.id::text = d.user_id::text
             ORDER BY d.created_at DESC LIMIT 30`
          );
          dailyRows.rows.forEach((d: any) => {
            const who = [d.first_name, d.last_name].filter(Boolean).join(" ") || d.email || "User";
            const bits: string[] = [];
            if (d.steps != null) bits.push(`${d.steps} steps`);
            if (d.water_ml != null) bits.push(`${d.water_ml}ml water`);
            if (d.protein_g != null) bits.push(`${d.protein_g}g protein`);
            if (d.sleep_hours != null) bits.push(`${d.sleep_hours}h sleep`);
            notifications.push({
              id: "daily-" + d.id,
              type: "checkin",
              title: "Daily Check-in — " + who,
              desc: (bits.length ? bits.join(" · ") : "Logged") + " · " + String(d.checkin_date || ""),
              time: d.created_at,
              link: "dailycheckin"
            });
          });
        } catch {}

        try {
          const wlogs = await pg.query(
            `SELECT w.id, w.weight_kg, w.created_at, u.first_name, u.last_name
             FROM weight_logs w
             LEFT JOIN users u ON u.id::text = w.user_id::text
             ORDER BY w.created_at DESC LIMIT 20`
          );
          wlogs.rows.forEach((w: any) => {
            const who = [w.first_name, w.last_name].filter(Boolean).join(" ") || "User";
            notifications.push({
              id: "weight-" + w.id,
              type: "workout",
              title: "Weight Logged",
              desc: `${who} — ${w.weight_kg} kg`,
              time: w.created_at,
              link: "clientprogress"
            });
          });
        } catch {}

        try {
          const prog = await pg.query(
            `SELECT p.id, p.weight, p.body_fat, p.created_at, u.first_name, u.last_name
             FROM progress_logs p
             LEFT JOIN users u ON u.id::text = p.user_id::text
             ORDER BY p.created_at DESC LIMIT 25`
          );
          prog.rows.forEach((p: any) => {
            const who = [p.first_name, p.last_name].filter(Boolean).join(" ") || "User";
            const parts: string[] = [];
            if (p.weight != null) parts.push(`${p.weight} kg`);
            if (p.body_fat != null) parts.push(`${p.body_fat}% bf`);
            notifications.push({
              id: "progress-" + String(p.id),
              type: "workout",
              title: "Progress Update — " + who,
              desc: parts.length ? parts.join(", ") : "New entry",
              time: p.created_at,
              link: "clientprogress"
            });
          });
        } catch {}

        try {
          const hyd = await pg.query(
            `SELECT h.id, h.amount_ml, h.glasses, h.created_at, u.first_name, u.last_name
             FROM hydration_logs h
             LEFT JOIN users u ON u.id::text = h.user_id::text
             ORDER BY h.created_at DESC LIMIT 15`
          );
          hyd.rows.forEach((h: any) => {
            const who = [h.first_name, h.last_name].filter(Boolean).join(" ") || "User";
            const amt = h.amount_ml ? `${h.amount_ml} ml` : h.glasses ? `${h.glasses} glasses` : "Hydration";
            notifications.push({
              id: "hyd-" + h.id,
              type: "checkin",
              title: "Hydration Logged",
              desc: `${who} — ${amt}`,
              time: h.created_at,
              link: "dailycheckin"
            });
          });
        } catch {}
      } else if (isTrainer && trainerId) {
        await run(async () => {
          const chatMessages = await pg.query(
            `SELECT m.id, m.thread_id, m.body, m.created_at, u.first_name, u.last_name, u.email
             FROM thread_messages m
             JOIN message_threads t ON t.id = m.thread_id
             LEFT JOIN users u ON u.id::text = t.user_id::text
             WHERE m.sender_role = 'user'
             AND (t.thread_kind = 'client' OR t.thread_kind IS NULL)
             AND EXISTS (
               SELECT 1 FROM users c
               WHERE c.id::text = t.user_id::text AND c.role = 'user' AND c.trainer_id::text = $1::text
             )
             ORDER BY m.created_at DESC LIMIT 50`,
            [trainerId]
          );
          chatMessages.rows.forEach((m: any) => {
            const name =
              [m.first_name, m.last_name].filter(Boolean).join(" ") || m.email || "Client";
            const preview =
              String(m.body || "").substring(0, 80) +
              (String(m.body || "").length > 80 ? "..." : "");
            notifications.push({
              id: "chat-" + m.id,
              type: "chat",
              title: "Message from " + name,
              desc: preview,
              time: m.created_at,
              link: "messages-meetings"
            });
          });
        });

        await run(async () => {
          const fromSa = await pg.query(
            `SELECT m.id, m.body, m.created_at
             FROM thread_messages m
             JOIN message_threads t ON t.id = m.thread_id
             WHERE t.thread_kind = 'ops' AND t.user_id::text = $1::text AND m.sender_role = 'superadmin'
             ORDER BY m.created_at DESC LIMIT 30`,
            [trainerId]
          );
          fromSa.rows.forEach((m: any) => {
            const preview =
              String(m.body || "").substring(0, 80) +
              (String(m.body || "").length > 80 ? "..." : "");
            notifications.push({
              id: "opschat-" + m.id,
              type: "chat",
              title: "Message from Super Admin",
              desc: preview,
              time: m.created_at,
              link: "messages-meetings"
            });
          });
        });

        await run(async () => {
          const workouts = await pg.query(
            `SELECT w.id, w.workout_name, w.duration_seconds, w.created_at, u.first_name, u.last_name
             FROM workout_logs w
             JOIN users u ON u.id::text = w.user_id::text
             WHERE u.trainer_id::text = $1::text
             ORDER BY w.created_at DESC LIMIT 20`,
            [trainerId]
          );
          workouts.rows.forEach((w: any) => {
            const mins = Math.floor((Number(w.duration_seconds) || 0) / 60);
            notifications.push({
              id: "workout-" + w.id,
              type: "workout",
              title: "Workout Logged",
              desc: `${w.first_name || ""} ${w.last_name || ""} - ${w.workout_name} (${mins} min)`,
              time: w.created_at,
              link: "workouts"
            });
          });
        });

        await run(async () => {
          const pendingSignups = await pg.query(
            `SELECT id, email, first_name, last_name, created_at FROM users
             WHERE role='user' AND (approval_status IS NULL OR approval_status = 'pending')
             AND trainer_id::text = $1::text
             ORDER BY created_at DESC LIMIT 20`,
            [trainerId]
          );
          pendingSignups.rows.forEach((u: any) => {
            notifications.push({
              id: "signup-" + u.id,
              type: "user",
              title: "New User Sign-up (Pending Approval)",
              desc: `${u.first_name || ""} ${u.last_name || ""} (${u.email})`,
              time: u.created_at,
              link: "signups"
            });
          });
        });

        await run(async () => {
          const meetReqs = await pg.query(
            `SELECT m.id, m.user_name, m.user_email, m.meeting_date, m.time_slot, m.created_at
             FROM meetings m
             JOIN users u ON u.id::text = m.user_id::text
             WHERE m.status='scheduled' AND u.trainer_id::text = $1::text
             ORDER BY m.created_at DESC LIMIT 15`,
            [trainerId]
          );
          meetReqs.rows.forEach((m: any) => {
            notifications.push({
              id: "meeting-" + m.id,
              type: "meeting",
              title: "Call Scheduled",
              desc: `${m.user_name || m.user_email} — ${m.meeting_date} ${m.time_slot}`,
              time: m.created_at,
              link: "meetings"
            });
          });
        });

        await run(async () => {
          const part2Subs = await pg.query(
            `SELECT p.id, p.name, p.email, p.created_at FROM part2_audit p
             WHERE EXISTS (
               SELECT 1 FROM users u
               WHERE u.role = 'user' AND u.trainer_id::text = $1::text
               AND LOWER(TRIM(COALESCE(u.email,''))) = LOWER(TRIM(COALESCE(p.email,'')))
             )
             ORDER BY p.created_at DESC LIMIT 15`,
            [trainerId]
          );
          part2Subs.rows.forEach((p: any) => {
            notifications.push({
              id: "part2-" + p.id,
              type: "form",
              title: "Part-2 Form Submitted",
              desc: `${p.name} (${p.email})`,
              time: p.created_at,
              link: "part2"
            });
          });
        });

        try {
          const sundayRows = await pg.query(
            `SELECT s.id, s.full_name, s.reply_email, s.created_at, u.first_name, u.last_name
             FROM sunday_checkins s
             JOIN users u ON u.id::text = s.user_id::text
             WHERE u.trainer_id::text = $1::text
             ORDER BY s.created_at DESC LIMIT 25`,
            [trainerId]
          );
          sundayRows.rows.forEach((s: any) => {
            const who =
              [s.first_name, s.last_name].filter(Boolean).join(" ") ||
              s.full_name ||
              s.reply_email ||
              "User";
            notifications.push({
              id: "sunday-" + s.id,
              type: "checkin",
              title: "Sunday Check-in Submitted",
              desc: who,
              time: s.created_at,
              link: "sundaycheckin"
            });
          });
        } catch {}

        try {
          const dailyRows = await pg.query(
            `SELECT d.id, d.checkin_date, d.created_at, d.steps, d.water_ml, d.protein_g, d.sleep_hours,
                    u.first_name, u.last_name, u.email
             FROM daily_checkins d
             JOIN users u ON u.id::text = d.user_id::text
             WHERE u.trainer_id::text = $1::text
             ORDER BY d.created_at DESC LIMIT 30`,
            [trainerId]
          );
          dailyRows.rows.forEach((d: any) => {
            const who = [d.first_name, d.last_name].filter(Boolean).join(" ") || d.email || "User";
            const bits: string[] = [];
            if (d.steps != null) bits.push(`${d.steps} steps`);
            if (d.water_ml != null) bits.push(`${d.water_ml}ml water`);
            if (d.protein_g != null) bits.push(`${d.protein_g}g protein`);
            if (d.sleep_hours != null) bits.push(`${d.sleep_hours}h sleep`);
            notifications.push({
              id: "daily-" + d.id,
              type: "checkin",
              title: "Daily Check-in — " + who,
              desc: (bits.length ? bits.join(" · ") : "Logged") + " · " + String(d.checkin_date || ""),
              time: d.created_at,
              link: "dailycheckin"
            });
          });
        } catch {}

        try {
          const wlogs = await pg.query(
            `SELECT w.id, w.weight_kg, w.created_at, u.first_name, u.last_name
             FROM weight_logs w
             JOIN users u ON u.id::text = w.user_id::text
             WHERE u.trainer_id::text = $1::text
             ORDER BY w.created_at DESC LIMIT 20`,
            [trainerId]
          );
          wlogs.rows.forEach((w: any) => {
            const who = [w.first_name, w.last_name].filter(Boolean).join(" ") || "User";
            notifications.push({
              id: "weight-" + w.id,
              type: "workout",
              title: "Weight Logged",
              desc: `${who} — ${w.weight_kg} kg`,
              time: w.created_at,
              link: "clientprogress"
            });
          });
        } catch {}

        try {
          const prog = await pg.query(
            `SELECT p.id, p.weight, p.body_fat, p.created_at, u.first_name, u.last_name
             FROM progress_logs p
             JOIN users u ON u.id::text = p.user_id::text
             WHERE u.trainer_id::text = $1::text
             ORDER BY p.created_at DESC LIMIT 25`,
            [trainerId]
          );
          prog.rows.forEach((p: any) => {
            const who = [p.first_name, p.last_name].filter(Boolean).join(" ") || "User";
            const parts: string[] = [];
            if (p.weight != null) parts.push(`${p.weight} kg`);
            if (p.body_fat != null) parts.push(`${p.body_fat}% bf`);
            notifications.push({
              id: "progress-" + String(p.id),
              type: "workout",
              title: "Progress Update — " + who,
              desc: parts.length ? parts.join(", ") : "New entry",
              time: p.created_at,
              link: "clientprogress"
            });
          });
        } catch {}

        try {
          const hyd = await pg.query(
            `SELECT h.id, h.amount_ml, h.glasses, h.created_at, u.first_name, u.last_name
             FROM hydration_logs h
             JOIN users u ON u.id::text = h.user_id::text
             WHERE u.trainer_id::text = $1::text
             ORDER BY h.created_at DESC LIMIT 15`,
            [trainerId]
          );
          hyd.rows.forEach((h: any) => {
            const who = [h.first_name, h.last_name].filter(Boolean).join(" ") || "User";
            const amt = h.amount_ml ? `${h.amount_ml} ml` : h.glasses ? `${h.glasses} glasses` : "Hydration";
            notifications.push({
              id: "hyd-" + h.id,
              type: "checkin",
              title: "Hydration Logged",
              desc: `${who} — ${amt}`,
              time: h.created_at,
              link: "dailycheckin"
            });
          });
        } catch {}
      } else {
        const thread = await pg.query(
          `SELECT id FROM message_threads
           WHERE user_id = $1::uuid AND (thread_kind = 'client' OR thread_kind IS NULL)
           ORDER BY updated_at DESC LIMIT 1`,
          [req.user.id]
        );
        if (thread.rows[0]) {
          const coachMsgs = await pg.query(
            `SELECT m.id, m.body, m.created_at FROM thread_messages m
             WHERE m.thread_id = $1::uuid
             AND m.sender_role IN ('admin', 'superadmin')
             ORDER BY m.created_at DESC LIMIT 10`,
            [thread.rows[0].id]
          );
          coachMsgs.rows.forEach((m: any) => {
            const preview =
              String(m.body || "").substring(0, 60) +
              (String(m.body || "").length > 60 ? "..." : "");
            notifications.push({
              id: "chat-" + m.id,
              type: "chat",
              title: "New message from your coach",
              desc: preview,
              time: m.created_at,
              link: "messages"
            });
          });
        }

        const programAssignments = await pg.query(
          `SELECT a.id, a.assigned_at, p.name FROM user_program_assignments a
           JOIN programs p ON p.id = a.program_id
           WHERE a.user_id = $1::uuid AND a.removed_at IS NULL AND a.seen_at IS NULL
           ORDER BY a.assigned_at DESC LIMIT 5`,
          [req.user.id]
        );
        programAssignments.rows.forEach((a: any) => {
          notifications.push({
            id: "program-" + a.id,
            type: "program",
            title: "Program Assigned",
            desc: 'Your coach assigned "' + (a.name || "") + '"',
            time: a.assigned_at,
            link: "programs"
          });
        });
      }

      notifications.sort(
        (a, b) => new Date(String(b.time || 0)).getTime() - new Date(String(a.time || 0)).getTime()
      );
      const maxItems = isStaff ? 150 : 40;
      return res.json(notifications.slice(0, maxItems));
    } catch {
      return res.json([]);
    }
  }
}
