import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UseGuards
} from "@nestjs/common";
import type { Response } from "express";
import { Pool } from "pg";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { RolesGuard } from "./roles.guard";
import { Roles } from "./roles.decorator";
import { randomUUID } from "crypto";
import * as bcrypt from "bcryptjs";
import * as jwt from "jsonwebtoken";

@Controller("api/superadmin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("superadmin")
export class SuperadminController {
  constructor(@Inject("PG_POOL") private readonly pool: Pool | null) {}

  private get secret(): string {
    return process.env.JWT_SECRET || "dev-secret-change-me";
  }

  private signShareToken(payload: { from?: string | null; to?: string | null; user_id?: string | null }) {
    return jwt.sign({ ...payload, purpose: "superadmin-share" }, this.secret, {
      expiresIn: (process.env.SUPERADMIN_SHARE_LINK_EXPIRY || "24h") as any
    });
  }

  private verifyShareToken(token?: string | null) {
    if (!token) return null;
    try {
      const decoded = jwt.verify(token, this.secret) as any;
      if (decoded?.purpose === "superadmin-share") return decoded;
      return null;
    } catch {
      return null;
    }
  }

  private async safeRows(sql: string, params: any[] = []) {
    if (!this.pool) return [];
    try {
      const r = await this.pool.query(sql, params);
      return r.rows || [];
    } catch (e: any) {
      // Missing tables are common on fresh deployments; dashboard should still load.
      if (e?.code === "42P01") return [];
      throw e;
    }
  }

  private async safeCount(sql: string, params: any[] = []) {
    const rows = await this.safeRows(sql, params);
    return Number(rows?.[0]?.c || 0);
  }

  private async getSuperadminDashboardData(filters: {
    from?: string | null;
    to?: string | null;
    user_id?: string | null;
  }) {
    const dateFrom = filters.from || null;
    const dateTo = filters.to || null;
    const filterUserId = filters.user_id || null;
    const hasDate = !!(dateFrom || dateTo);

    const pendingRequests = await this.safeCount("SELECT COUNT(*)::int as c FROM audit_requests WHERE status='pending'");
    const auditTotal = await this.safeCount("SELECT COUNT(*)::int as c FROM audit_requests");
    const tribeTotal = await this.safeCount("SELECT COUNT(*)::int as c FROM tribe_members");
    const tribeActive = await this.safeCount("SELECT COUNT(*)::int as c FROM tribe_members WHERE status='active'");
    const workoutsCount = await this.safeCount("SELECT COUNT(*)::int as c FROM workout_logs");
    const part2Count = await this.safeCount("SELECT COUNT(*)::int as c FROM part2_audit");
    const sundayCount = await this.safeCount("SELECT COUNT(*)::int as c FROM sunday_checkins");
    const messagesCount = await this.safeCount("SELECT COUNT(*)::int as c FROM contact_messages");
    const meetingsCount = await this.safeCount("SELECT COUNT(*)::int as c FROM meetings");
    const signupsPending = await this.safeCount(
      "SELECT COUNT(*)::int as c FROM users WHERE role='user' AND (approval_status IS NULL OR approval_status = 'pending')"
    );
    const usersApproved = await this.safeCount(
      "SELECT COUNT(*)::int as c FROM users WHERE role='user' AND (approval_status = 'approved' OR approval_status IS NULL)"
    );
    const dailyCheckinsCount = await this.safeCount("SELECT COUNT(*)::int as c FROM daily_checkins");
    const programAssignCount = await this.safeCount(
      "SELECT COUNT(*)::int as c FROM user_program_assignments WHERE removed_at IS NULL"
    );

    const stats = {
      pending_requests: pendingRequests,
      audit_total: auditTotal,
      tribe_total: tribeTotal,
      tribe_active: tribeActive,
      workouts: workoutsCount,
      part2: part2Count,
      sunday_checkins: sundayCount,
      daily_checkins: dailyCheckinsCount,
      program_assignments: programAssignCount,
      messages: messagesCount,
      meetings: meetingsCount,
      pending_signups: signupsPending,
      approved_users: usersApproved
    };

    let audit = await this.safeRows(
      "SELECT id, first_name, last_name, email, city, goals, status, created_at FROM audit_requests ORDER BY created_at DESC LIMIT 200"
    );
    let part2 = await this.safeRows(
      "SELECT id, name, email, mobile, activity_level, created_at FROM part2_audit ORDER BY created_at DESC LIMIT 200"
    );
    let sundayCheckins = await this.safeRows(
      "SELECT id, full_name, reply_email, total_weight_loss, achievements, created_at FROM sunday_checkins ORDER BY created_at DESC LIMIT 200"
    );
    let users = await this.safeRows(
      "SELECT id, first_name, last_name, email, approval_status, created_at FROM users WHERE role='user' ORDER BY created_at DESC LIMIT 300"
    );
    let workouts = await this.safeRows(
      "SELECT w.id, w.user_id, w.workout_name, w.duration_seconds, w.feedback, w.created_at, u.first_name, u.last_name FROM workout_logs w LEFT JOIN users u ON w.user_id = u.id ORDER BY w.created_at DESC LIMIT 200"
    );
    const tribe = await this.safeRows(
      "SELECT id, first_name, last_name, email, city, phase, start_date, activity_per_week, status FROM tribe_members ORDER BY start_date DESC LIMIT 200"
    );
    let meetings = await this.safeRows(
      "SELECT id, user_id, user_name, user_email, meeting_date, time_slot, status, created_at FROM meetings ORDER BY created_at DESC LIMIT 200"
    );
    let messages = await this.safeRows(
      "SELECT id, user_id, name, email, message, created_at FROM contact_messages ORDER BY created_at DESC LIMIT 200"
    );
    let dailyCheckins = await this.safeRows(
      "SELECT dc.id, dc.user_id, dc.checkin_date, dc.steps, dc.water_ml, dc.protein_g, dc.sleep_hours, dc.created_at, u.first_name, u.last_name, u.email FROM daily_checkins dc LEFT JOIN users u ON u.id = dc.user_id ORDER BY dc.checkin_date DESC, dc.created_at DESC LIMIT 200"
    );
    let programAssignments = await this.safeRows(
      "SELECT a.id, a.user_id, a.program_id, a.assigned_at, p.name as program_name, u.first_name, u.last_name, u.email FROM user_program_assignments a JOIN programs p ON p.id = a.program_id LEFT JOIN users u ON u.id = a.user_id WHERE a.removed_at IS NULL ORDER BY a.assigned_at DESC LIMIT 200"
    );

    if (hasDate || filterUserId) {
      const filterByDate = (rows: any[], dateKey: string) =>
        rows.filter((r) => {
          const d = String(r?.[dateKey] || r?.created_at || "").slice(0, 10);
          const okDate = (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo);
          const okUser = !filterUserId || String(r?.user_id || r?.id || "") === String(filterUserId);
          return okDate && okUser;
        });

      audit = filterByDate(audit, "created_at");
      part2 = filterByDate(part2, "created_at");
      sundayCheckins = filterByDate(sundayCheckins, "created_at");
      workouts = filterByDate(workouts, "created_at");
      meetings = filterByDate(meetings, "created_at");
      messages = filterByDate(messages, "created_at");
      dailyCheckins = filterByDate(dailyCheckins, "checkin_date");
      programAssignments = filterByDate(programAssignments, "assigned_at");
      if (filterUserId) {
        users = users.filter((r) => String(r?.id || "") === String(filterUserId));
        dailyCheckins = dailyCheckins.filter((r) => String(r?.user_id || "") === String(filterUserId));
        programAssignments = programAssignments.filter((r) => String(r?.user_id || "") === String(filterUserId));
      }
    }

    return {
      stats,
      performance: { ...stats },
      audit,
      part2,
      sunday_checkins: sundayCheckins,
      daily_checkins: dailyCheckins,
      program_assignments: programAssignments,
      users,
      workouts,
      tribe,
      meetings,
      messages,
      filters: { from: dateFrom, to: dateTo, user_id: filterUserId }
    };
  }

  @Get("dashboard")
  async dashboard(@Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Database unavailable" });
    try {
      const from = req.query?.from ? String(req.query.from) : null;
      const to = req.query?.to ? String(req.query.to) : null;
      const userId = req.query?.user_id ? String(req.query.user_id) : null;
      const data = await this.getSuperadminDashboardData({ from, to, user_id: userId });
      return res.json(data);
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Failed to load dashboard" });
    }
  }

  @Post("share-link")
  async shareLink(
    @Body() body: { from?: string | null; to?: string | null; user_id?: string | null },
    @Req() req: any,
    @Res() res: Response
  ) {
    try {
      const token = this.signShareToken({
        from: body?.from || null,
        to: body?.to || null,
        user_id: body?.user_id || null
      });
      const baseUrl = String(process.env.PUBLIC_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
      return res.json({ url: `${baseUrl}/index.html?superadmin_share=${encodeURIComponent(token)}`, token });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Failed to create share link" });
    }
  }

  @Get("shared")
  async shared(@Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Database unavailable" });
    try {
      const token = String(req.query?.t || req.query?.token || "");
      const decoded = this.verifyShareToken(token);
      if (!decoded) return res.status(401).json({ error: "Invalid or expired share link" });
      const data = await this.getSuperadminDashboardData({
        from: decoded.from || null,
        to: decoded.to || null,
        user_id: decoded.user_id || null
      });
      return res.json(data);
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Failed to load shared data" });
    }
  }

  @Get("trainers")
  async trainers(@Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Failed to load trainers" });
    try {
      const rows = await this.pool.query(
        `SELECT t.id, t.email, t.first_name, t.last_name, t.phone, t.created_at, COALESCE(t.suspended, FALSE) as suspended,
                (SELECT COUNT(*) FROM users u WHERE u.role = 'user' AND u.trainer_id = t.id) as clients_total,
                (SELECT COUNT(*) FROM users u WHERE u.role = 'user' AND u.trainer_id = t.id AND (u.approval_status IS NULL OR u.approval_status = 'approved')) as clients_approved,
                (SELECT COUNT(*) FROM users u WHERE u.role = 'user' AND u.trainer_id = t.id AND u.approval_status = 'pending') as clients_pending
         FROM users t
         WHERE t.role = 'admin'
         ORDER BY t.created_at DESC`
      );
      return res.json(rows.rows);
    } catch {
      return res.status(500).json({ error: "Failed to load trainers" });
    }
  }

  @Get("trainer-client-overview")
  async trainerClientOverview(@Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Failed to load trainer and client overview" });
    try {
      const rows = await this.pool.query(
        `SELECT
           t.id,
           t.email,
           t.first_name,
           t.last_name,
           t.phone,
           COALESCE(t.suspended, FALSE) AS suspended,
           COALESCE(
             json_agg(
               json_build_object(
                 'id', u.id,
                 'email', u.email,
                 'first_name', u.first_name,
                 'last_name', u.last_name,
                 'approval_status', u.approval_status,
                 'suspended', COALESCE(u.suspended, FALSE)
               )
               ORDER BY u.created_at DESC
             ) FILTER (WHERE u.id IS NOT NULL),
             '[]'::json
           ) AS clients
         FROM users t
         LEFT JOIN users u ON u.trainer_id = t.id AND u.role = 'user'
         WHERE t.role = 'admin'
         GROUP BY t.id
         ORDER BY t.created_at DESC`
      );
      return res.json(rows.rows);
    } catch {
      return res.status(500).json({ error: "Failed to load trainer and client overview" });
    }
  }

  @Get("trainer-requests")
  async trainerRequests(@Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Failed to load trainer requests" });
    try {
      const rows = await this.pool.query(
        `SELECT id, full_name, email, phone, gym_name, city, message, status, created_at, reviewed_at, reviewed_by, trainer_user_id
         FROM trainer_requests
         WHERE status = 'pending'
         ORDER BY created_at DESC`
      );
      return res.json(rows.rows);
    } catch {
      return res.status(500).json({ error: "Failed to load trainer requests" });
    }
  }

  @Post("trainer-requests/:id/approve")
  async approveTrainerRequest(
    @Param("id") id: string,
    @Body() body: { password?: string },
    @Req() req: any,
    @Res() res: Response
  ) {
    if (!this.pool) return res.status(500).json({ error: "Failed to approve trainer request" });
    try {
      const requestId = String(id || "").trim();
      const password = String(body?.password || "").trim();
      if (!password || password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }

      const reqRes = await this.pool.query(
        "SELECT * FROM trainer_requests WHERE id = $1 AND status = 'pending' LIMIT 1",
        [requestId]
      );
      const reqRow = reqRes.rows[0];
      if (!reqRow) {
        return res.status(404).json({ error: "Trainer request not found or already reviewed" });
      }

      const emailNorm = String(reqRow.email || "").trim().toLowerCase();
      const hash = bcrypt.hashSync(password, 10);
      const nameParts = String(reqRow.full_name || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      const firstName = nameParts.length ? nameParts[0] : "Trainer";
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";

      const existingRes = await this.pool.query(
        "SELECT id, role FROM users WHERE LOWER(email) = $1 LIMIT 1",
        [emailNorm]
      );
      const existing = existingRes.rows[0];
      if (existing && existing.role !== "admin") {
        return res.status(409).json({ error: "Email already exists as a non-trainer account" });
      }

      let trainerId = "";
      if (existing && existing.role === "admin") {
        trainerId = existing.id;
        await this.pool.query(
          "UPDATE users SET password = $1, first_name = $2, last_name = $3, phone = $4, approval_status = 'approved', suspended = FALSE WHERE id = $5",
          [hash, firstName, lastName, reqRow.phone || "", trainerId]
        );
      } else {
        trainerId = randomUUID();
        await this.pool.query(
          "INSERT INTO users (id, email, password, first_name, last_name, phone, role, approval_status, suspended) VALUES ($1, $2, $3, $4, $5, $6, 'admin', 'approved', FALSE)",
          [trainerId, emailNorm, hash, firstName, lastName, reqRow.phone || ""]
        );
      }

      const reviewer = String(req.user?.id || "");
      await this.pool.query(
        "UPDATE trainer_requests SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $1, trainer_user_id = $2 WHERE id = $3",
        [reviewer, trainerId, requestId]
      );

      return res.json({ ok: true, trainer_id: trainerId, email: emailNorm, password });
    } catch {
      return res.status(500).json({ error: "Failed to approve trainer request" });
    }
  }

  @Post("trainer-requests/:id/reject")
  async rejectTrainerRequest(@Param("id") id: string, @Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Failed to reject trainer request" });
    try {
      const requestId = String(id || "").trim();
      const reqRes = await this.pool.query(
        "SELECT id FROM trainer_requests WHERE id = $1 AND status = 'pending' LIMIT 1",
        [requestId]
      );
      if (!reqRes.rows[0]) {
        return res.status(404).json({ error: "Trainer request not found or already reviewed" });
      }
      const reviewer = String(req.user?.id || "");
      await this.pool.query(
        "UPDATE trainer_requests SET status = 'rejected', reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $1 WHERE id = $2",
        [reviewer, requestId]
      );
      return res.json({ ok: true });
    } catch {
      return res.status(500).json({ error: "Failed to reject trainer request" });
    }
  }

  @Post("trainers")
  async createTrainer(
    @Body()
    body: {
      email?: string;
      password?: string;
      first_name?: string;
      last_name?: string;
      phone?: string;
    },
    @Res() res: Response
  ) {
    if (!this.pool) return res.status(500).json({ error: "Failed to create trainer" });
    try {
      const emailNorm = String(body?.email || "").trim().toLowerCase();
      const pwd = String(body?.password || "");
      if (!emailNorm || !pwd) return res.status(400).json({ error: "Email and password required" });
      if (pwd.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

      const existingRes = await this.pool.query(
        "SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1",
        [emailNorm]
      );
      if (existingRes.rows[0]) return res.status(409).json({ error: "Email already exists" });

      const id = randomUUID();
      const hash = bcrypt.hashSync(pwd, 10);
      await this.pool.query(
        "INSERT INTO users (id, email, password, first_name, last_name, phone, role, approval_status) VALUES ($1, $2, $3, $4, $5, $6, 'admin', 'approved')",
        [id, emailNorm, hash, body?.first_name || "", body?.last_name || "", body?.phone || ""]
      );
      const created = await this.pool.query(
        "SELECT id, email, first_name, last_name, phone, created_at FROM users WHERE id = $1 LIMIT 1",
        [id]
      );
      return res.json({ ok: true, trainer: created.rows[0] });
    } catch {
      return res.status(500).json({ error: "Failed to create trainer" });
    }
  }

  @Post("trainers/:id/suspend")
  async suspendTrainer(@Param("id") id: string, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Failed to suspend trainer" });
    try {
      const tr = await this.pool.query(
        "SELECT id FROM users WHERE id = $1 AND role = 'admin' LIMIT 1",
        [id]
      );
      if (!tr.rows[0]) return res.status(404).json({ error: "Trainer not found" });
      await this.pool.query("UPDATE users SET suspended = TRUE WHERE id = $1", [id]);
      return res.json({ ok: true });
    } catch {
      return res.status(500).json({ error: "Failed to suspend trainer" });
    }
  }

  @Post("trainers/:id/reactivate")
  async reactivateTrainer(@Param("id") id: string, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Failed to reactivate trainer" });
    try {
      const tr = await this.pool.query(
        "SELECT id FROM users WHERE id = $1 AND role = 'admin' LIMIT 1",
        [id]
      );
      if (!tr.rows[0]) return res.status(404).json({ error: "Trainer not found" });
      await this.pool.query("UPDATE users SET suspended = FALSE WHERE id = $1", [id]);
      return res.json({ ok: true });
    } catch {
      return res.status(500).json({ error: "Failed to reactivate trainer" });
    }
  }

  @Post("trainers/:id/reset-password")
  async resetTrainerPassword(
    @Param("id") id: string,
    @Body() body: { password?: string },
    @Res() res: Response
  ) {
    if (!this.pool) return res.status(500).json({ error: "Failed to reset trainer password" });
    try {
      const newPassword = String(body?.password || "");
      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }
      const tr = await this.pool.query(
        "SELECT id, email FROM users WHERE id = $1 AND role = 'admin' LIMIT 1",
        [id]
      );
      if (!tr.rows[0]) return res.status(404).json({ error: "Trainer not found" });
      const hash = bcrypt.hashSync(newPassword, 10);
      await this.pool.query("UPDATE users SET password = $1 WHERE id = $2", [hash, id]);
      return res.json({
        ok: true,
        message: "Trainer password reset successfully",
        email: tr.rows[0].email
      });
    } catch {
      return res.status(500).json({ error: "Failed to reset trainer password" });
    }
  }
}
