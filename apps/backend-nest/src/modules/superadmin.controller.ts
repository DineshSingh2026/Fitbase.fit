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

  private generateReferralCode(): string {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let s = "";
    for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  private async ensureTrainerReferralCode(trainerId: string): Promise<string | null> {
    if (!this.pool || !trainerId) return null;
    const cur = await this.pool.query(
      "SELECT referral_code FROM users WHERE id = $1 AND role = 'admin' LIMIT 1",
      [trainerId]
    );
    const existing = String(cur.rows[0]?.referral_code || "").trim();
    if (existing) return existing;
    for (let i = 0; i < 40; i++) {
      const code = this.generateReferralCode();
      const taken = await this.pool.query("SELECT id FROM users WHERE referral_code = $1 LIMIT 1", [code]);
      if (taken.rows[0]) continue;
      try {
        await this.pool.query("UPDATE users SET referral_code = $1 WHERE id = $2 AND role = 'admin'", [
          code,
          trainerId
        ]);
        return code;
      } catch {
        /* unique */
      }
    }
    return null;
  }

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

  /** Base table comes from TrainerRequestsController; superadmin queries need extra columns for review flow. */
  private async ensureTrainerRequestsSchema() {
    if (!this.pool) return;
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS trainer_requests (
        id uuid PRIMARY KEY,
        full_name text NOT NULL,
        email text NOT NULL,
        phone text,
        gym_name text,
        city text,
        message text,
        status text NOT NULL DEFAULT 'pending',
        created_at timestamptz DEFAULT now()
      )`
    );
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS trainer_requests_email_idx ON trainer_requests (LOWER(email))`
    );
    await this.pool.query(`CREATE INDEX IF NOT EXISTS trainer_requests_status_idx ON trainer_requests (status)`);
    await this.pool.query(`ALTER TABLE trainer_requests ADD COLUMN IF NOT EXISTS phone text`);
    await this.pool.query(`ALTER TABLE trainer_requests ADD COLUMN IF NOT EXISTS gym_name text`);
    await this.pool.query(`ALTER TABLE trainer_requests ADD COLUMN IF NOT EXISTS city text`);
    await this.pool.query(`ALTER TABLE trainer_requests ADD COLUMN IF NOT EXISTS message text`);
    await this.pool.query(
      `ALTER TABLE trainer_requests ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now()`
    );
    await this.pool.query(`ALTER TABLE trainer_requests ADD COLUMN IF NOT EXISTS reviewed_at timestamptz`);
    await this.pool.query(`ALTER TABLE trainer_requests ADD COLUMN IF NOT EXISTS reviewed_by text`);
    await this.pool.query(`ALTER TABLE trainer_requests ADD COLUMN IF NOT EXISTS trainer_user_id text`);
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

    const workoutsCount = await this.safeCount("SELECT COUNT(*)::int as c FROM workout_logs");
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
    const part2Count = await this.safeCount("SELECT COUNT(*)::int as c FROM part2_audit");
    const programAssignCount = await this.safeCount(
      "SELECT COUNT(*)::int as c FROM user_program_assignments WHERE removed_at IS NULL"
    );

    const stats = {
      pending_requests: 0,
      audit_total: 0,
      tribe_total: 0,
      tribe_active: 0,
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

    const audit: any[] = [];
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
      "SELECT w.id, w.user_id, w.workout_name, w.duration_seconds, w.feedback, w.created_at, u.first_name, u.last_name FROM workout_logs w LEFT JOIN users u ON u.id::text = w.user_id::text ORDER BY w.created_at DESC LIMIT 200"
    );
    const tribe: any[] = [];
    let meetings = await this.safeRows(
      "SELECT id, user_id, user_name, user_email, meeting_date, time_slot, status, created_at FROM meetings ORDER BY created_at DESC LIMIT 200"
    );
    let messages = await this.safeRows(
      "SELECT id, user_id, name, email, message, created_at FROM contact_messages ORDER BY created_at DESC LIMIT 200"
    );
    let dailyCheckins = await this.safeRows(
      "SELECT dc.id, dc.user_id, dc.checkin_date, dc.steps, dc.water_ml, dc.protein_g, dc.sleep_hours, dc.created_at, u.first_name, u.last_name, u.email FROM daily_checkins dc LEFT JOIN users u ON u.id::text = dc.user_id::text ORDER BY dc.checkin_date DESC, dc.created_at DESC LIMIT 200"
    );
    let programAssignments = await this.safeRows(
      "SELECT a.id, a.user_id, a.program_id, a.assigned_at, p.name as program_name, u.first_name, u.last_name, u.email FROM user_program_assignments a JOIN programs p ON p.id = a.program_id LEFT JOIN users u ON u.id::text = a.user_id::text WHERE a.removed_at IS NULL ORDER BY a.assigned_at DESC LIMIT 200"
    );

    if (hasDate || filterUserId) {
      const filterByDate = (rows: any[], dateKey: string) =>
        rows.filter((r) => {
          const d = String(r?.[dateKey] || r?.created_at || "").slice(0, 10);
          const okDate = (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo);
          const okUser = !filterUserId || String(r?.user_id || r?.id || "") === String(filterUserId);
          return okDate && okUser;
        });

      sundayCheckins = filterByDate(sundayCheckins, "created_at");
      part2 = filterByDate(part2, "created_at");
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
        `SELECT t.id, t.email, t.first_name, t.last_name, t.phone, t.created_at, t.referral_code, COALESCE(t.suspended, FALSE) as suspended,
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
           t.referral_code,
           COALESCE(t.suspended, FALSE) AS suspended,
           COALESCE(
             json_agg(
               json_build_object(
                 'id', u.id,
                 'email', u.email,
                 'first_name', u.first_name,
                 'last_name', u.last_name,
                 'phone', u.phone,
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
  async trainerRequests(@Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Failed to load trainer requests" });
    try {
      await this.ensureTrainerRequestsSchema();
      const status = String(req.query?.status || "pending").trim().toLowerCase();
      let sql = `SELECT id, full_name, email, phone, gym_name, city, message, status, created_at, reviewed_at, reviewed_by, trainer_user_id
         FROM trainer_requests
         WHERE 1=1`;
      const params: string[] = [];
      if (status && status !== "all") {
        sql += ` AND status = $1`;
        params.push(status);
      }
      sql += ` ORDER BY created_at DESC LIMIT 300`;
      const rows = await this.pool.query(sql, params);
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
      await this.ensureTrainerRequestsSchema();
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

      const referral_code = await this.ensureTrainerReferralCode(trainerId);
      return res.json({ ok: true, trainer_id: trainerId, email: emailNorm, password, referral_code });
    } catch {
      return res.status(500).json({ error: "Failed to approve trainer request" });
    }
  }

  @Post("trainer-requests/:id/reject")
  async rejectTrainerRequest(@Param("id") id: string, @Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Failed to reject trainer request" });
    try {
      await this.ensureTrainerRequestsSchema();
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

  private async ensureClientRequestsTable() {
    if (!this.pool) return;
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS client_requests (
        id text PRIMARY KEY,
        full_name text NOT NULL,
        email text NOT NULL,
        phone text DEFAULT '',
        city text DEFAULT '',
        goal_focus text DEFAULT '',
        message text DEFAULT '',
        heard_about text DEFAULT '',
        status text NOT NULL DEFAULT 'pending',
        assigned_trainer_id text,
        created_at timestamptz DEFAULT now(),
        reviewed_at timestamptz,
        reviewed_by text
      )`
    );
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS client_requests_email_lower_idx ON client_requests (LOWER(email))`
    );
    await this.pool.query(`CREATE INDEX IF NOT EXISTS client_requests_status_idx ON client_requests (status)`);
    await this.pool.query(`ALTER TABLE client_requests ADD COLUMN IF NOT EXISTS phone text DEFAULT ''`);
    await this.pool.query(`ALTER TABLE client_requests ADD COLUMN IF NOT EXISTS city text DEFAULT ''`);
    await this.pool.query(`ALTER TABLE client_requests ADD COLUMN IF NOT EXISTS goal_focus text DEFAULT ''`);
    await this.pool.query(`ALTER TABLE client_requests ADD COLUMN IF NOT EXISTS message text DEFAULT ''`);
    await this.pool.query(`ALTER TABLE client_requests ADD COLUMN IF NOT EXISTS heard_about text DEFAULT ''`);
    await this.pool.query(`ALTER TABLE client_requests ADD COLUMN IF NOT EXISTS assigned_trainer_id text`);
    await this.pool.query(`ALTER TABLE client_requests ADD COLUMN IF NOT EXISTS reviewed_at timestamptz`);
    await this.pool.query(`ALTER TABLE client_requests ADD COLUMN IF NOT EXISTS reviewed_by text`);
  }

  @Get("client-requests")
  async clientRequestsList(@Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Failed to load client requests" });
    try {
      await this.ensureClientRequestsTable();
      const status = String(req.query?.status || "pending").trim().toLowerCase();
      let sql = `SELECT c.id, c.full_name, c.email, c.phone, c.city, c.goal_focus, c.message, c.heard_about,
          c.status, c.assigned_trainer_id, c.created_at, c.reviewed_at, c.reviewed_by,
          t.first_name AS trainer_first_name, t.last_name AS trainer_last_name, t.email AS trainer_email
        FROM client_requests c
        LEFT JOIN users t ON t.role = 'admin'
          AND c.assigned_trainer_id IS NOT NULL
          AND TRIM(c.assigned_trainer_id) <> ''
          AND t.id::text = TRIM(c.assigned_trainer_id)
        WHERE 1=1`;
      const params: string[] = [];
      if (status && status !== "all") {
        sql += ` AND c.status = $1`;
        params.push(status);
      }
      sql += ` ORDER BY c.created_at DESC LIMIT 250`;
      const rows = await this.pool.query(sql, params);
      return res.json(rows.rows);
    } catch {
      return res.status(500).json({ error: "Failed to load client requests" });
    }
  }

  @Post("client-requests/:id/approve")
  async approveClientRequest(
    @Param("id") id: string,
    @Body() body: { trainer_user_id?: string },
    @Req() req: any,
    @Res() res: Response
  ) {
    if (!this.pool) return res.status(500).json({ error: "Failed to approve client request" });
    try {
      const requestId = String(id || "").trim();
      const trainerUserId = String(body?.trainer_user_id || "").trim();
      if (!trainerUserId) {
        return res.status(400).json({ error: "trainer_user_id is required to assign a coach" });
      }

      const tr = await this.pool.query(
        "SELECT id FROM users WHERE id = $1 AND role = 'admin' LIMIT 1",
        [trainerUserId]
      );
      if (!tr.rows[0]) {
        return res.status(400).json({ error: "Invalid trainer" });
      }

      await this.ensureClientRequestsTable();
      const reqRes = await this.pool.query(
        "SELECT id FROM client_requests WHERE id = $1 AND status = 'pending' LIMIT 1",
        [requestId]
      );
      if (!reqRes.rows[0]) {
        return res.status(404).json({ error: "Client request not found or already reviewed" });
      }

      const reviewer = String(req.user?.id || "");
      await this.pool.query(
        `UPDATE client_requests SET status = 'approved', assigned_trainer_id = $1,
         reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $2 WHERE id = $3`,
        [trainerUserId, reviewer || null, requestId]
      );

      const referral_code = await this.ensureTrainerReferralCode(trainerUserId);
      return res.json({
        ok: true,
        referral_code,
        join_path: `/join/${referral_code}`,
        message:
          "Assigned. Share the join link with the client so they can complete signup under this trainer."
      });
    } catch {
      return res.status(500).json({ error: "Failed to approve client request" });
    }
  }

  @Post("client-requests/:id/reject")
  async rejectClientRequest(@Param("id") id: string, @Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Failed to reject client request" });
    try {
      const requestId = String(id || "").trim();
      await this.ensureClientRequestsTable();
      const reqRes = await this.pool.query(
        "SELECT id FROM client_requests WHERE id = $1 AND status = 'pending' LIMIT 1",
        [requestId]
      );
      if (!reqRes.rows[0]) {
        return res.status(404).json({ error: "Client request not found or already reviewed" });
      }
      const reviewer = String(req.user?.id || "");
      await this.pool.query(
        `UPDATE client_requests SET status = 'rejected', reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $1 WHERE id = $2`,
        [reviewer || null, requestId]
      );
      return res.json({ ok: true });
    } catch {
      return res.status(500).json({ error: "Failed to reject client request" });
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
      const referral_code = await this.ensureTrainerReferralCode(id);
      const created = await this.pool.query(
        "SELECT id, email, first_name, last_name, phone, created_at FROM users WHERE id = $1 LIMIT 1",
        [id]
      );
      return res.json({ ok: true, trainer: { ...created.rows[0], referral_code } });
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
