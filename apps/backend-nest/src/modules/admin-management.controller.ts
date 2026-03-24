import { Body, Controller, Get, Inject, Param, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { Pool } from "pg";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { RolesGuard } from "./roles.guard";
import { Roles } from "./roles.decorator";
import { randomUUID } from "crypto";
import * as bcrypt from "bcryptjs";
import { normalizeRoleString } from "./auth-role.util";

function isAdmin(user: any): boolean {
  return normalizeRoleString(user?.role) === "admin";
}

function isSuperadmin(user: any): boolean {
  return normalizeRoleString(user?.role) === "superadmin";
}

@Controller("api/admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin", "superadmin")
export class AdminManagementController {
  constructor(@Inject("PG_POOL") private readonly pool: Pool | null) {}

  private async safeRows(sql: string, params: any[] = []) {
    if (!this.pool) return [];
    try {
      const r = await this.pool.query(sql, params);
      return r.rows || [];
    } catch (e: any) {
      if (e?.code === "42P01" || e?.code === "42703") return [];
      throw e;
    }
  }

  @Get("referral-link")
  async referralLink(@Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Failed to load invite link" });
    if (!isAdmin(req.user)) {
      return res.status(403).json({ error: "Only trainers have a client invite link" });
    }
    const trainerId = String(req.user?.id || "");
    try {
      const cur = await this.pool.query(
        "SELECT referral_code FROM users WHERE id = $1 AND role = 'admin' LIMIT 1",
        [trainerId]
      );
      let code = String(cur.rows[0]?.referral_code || "").trim();
      if (!code) {
        const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
        for (let attempt = 0; attempt < 40; attempt++) {
          let g = "";
          for (let i = 0; i < 10; i++) g += chars[Math.floor(Math.random() * chars.length)];
          const taken = await this.pool.query("SELECT id FROM users WHERE referral_code = $1 LIMIT 1", [g]);
          if (taken.rows[0]) continue;
          await this.pool.query("UPDATE users SET referral_code = $1 WHERE id = $2 AND role = 'admin'", [
            g,
            trainerId
          ]);
          code = g;
          break;
        }
      }
      if (!code) return res.status(500).json({ error: "Could not generate invite code" });
      return res.json({ referral_code: code, join_path: `/join/${code}` });
    } catch {
      return res.status(500).json({ error: "Failed to load invite link" });
    }
  }

  @Get("pending-signups")
  async pendingSignups(@Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Failed to fetch pending sign-ups" });
    try {
      let sql =
        "SELECT id, email, first_name, last_name, phone, city, date_of_birth, gender, whatsapp, country, created_at, trainer_id FROM users WHERE role = 'user' AND (approval_status IS NULL OR approval_status = 'pending')";
      const params: string[] = [];
      if (isAdmin(req.user)) {
        sql += " AND (trainer_id IS NULL OR trainer_id = $1)";
        params.push(req.user.id);
      }
      sql += " ORDER BY created_at DESC";
      const list = await this.pool.query(sql, params);
      return res.json(list.rows);
    } catch {
      return res.status(500).json({ error: "Failed to fetch pending sign-ups" });
    }
  }

  @Post("approve-user/:id")
  async approveUser(
    @Param("id") id: string,
    @Body() body: { trainer_id?: string },
    @Req() req: any,
    @Res() res: Response
  ) {
    if (!this.pool) return res.status(500).json({ error: "Failed to approve user" });
    try {
      const userRes = await this.pool.query(
        "SELECT id, role, email, first_name, last_name, phone, country, city, trainer_id FROM users WHERE id = $1 LIMIT 1",
        [id]
      );
      const user = userRes.rows[0];
      if (!user) return res.status(404).json({ error: "User not found" });
      if (user.role === "admin") return res.status(400).json({ error: "Cannot change admin approval" });
      if (isAdmin(req.user) && user.trainer_id && user.trainer_id !== req.user.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      let targetTrainerId: string | null = null;
      if (isSuperadmin(req.user)) {
        targetTrainerId = body?.trainer_id ? String(body.trainer_id).trim() : user.trainer_id || null;
      } else {
        targetTrainerId = req.user.id;
      }
      if (targetTrainerId) {
        const tr = await this.pool.query(
          "SELECT id FROM users WHERE id = $1 AND role = 'admin' LIMIT 1",
          [targetTrainerId]
        );
        if (!tr.rows[0]) return res.status(400).json({ error: "Invalid trainer_id" });
      }

      await this.pool.query(
        "UPDATE users SET approval_status = 'approved', trainer_id = COALESCE($1, trainer_id) WHERE id = $2",
        [targetTrainerId, id]
      );

      const existingTribe = await this.pool.query(
        "SELECT id FROM tribe_members WHERE LOWER(email) = $1 LIMIT 1",
        [String(user.email || "").toLowerCase()]
      );
      if (!existingTribe.rows[0]) {
        const tribeId = randomUUID();
        const today = new Date().toISOString().split("T")[0];
        const city = String(user.city || user.country || "").trim();
        await this.pool.query(
          "INSERT INTO tribe_members (id, first_name, last_name, email, phone, city, phase, start_date, activity_per_week, starting_weight, current_weight, target_weight, next_checkin, notes, status) VALUES ($1,$2,$3,$4,$5,$6,1,$7,0,$8,$9,$10,$11,$12,$13)",
          [
            tribeId,
            user.first_name || "",
            user.last_name || "",
            user.email || "",
            user.phone || "",
            city,
            today,
            null,
            null,
            null,
            "",
            "Newly approved",
            "active"
          ]
        );
      }
      return res.json({ message: "User approved" });
    } catch (e: any) {
      console.error("[admin approve-user]", e?.message || e);
      return res.status(500).json({ error: "Failed to approve user" });
    }
  }

  @Post("reject-user/:id")
  async rejectUser(@Param("id") id: string, @Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Failed to reject user" });
    try {
      const userRes = await this.pool.query(
        "SELECT id, role, trainer_id FROM users WHERE id = $1 LIMIT 1",
        [id]
      );
      const user = userRes.rows[0];
      if (!user) return res.status(404).json({ error: "User not found" });
      if (user.role === "admin") return res.status(400).json({ error: "Cannot change admin approval" });
      if (isAdmin(req.user) && user.trainer_id && user.trainer_id !== req.user.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      await this.pool.query("UPDATE users SET approval_status = 'rejected' WHERE id = $1", [id]);
      return res.json({ message: "User rejected" });
    } catch {
      return res.status(500).json({ error: "Failed to reject user" });
    }
  }

  @Get("pending-signup/:id")
  async pendingSignupById(@Param("id") id: string, @Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Failed to fetch sign-up request" });
    try {
      let sql =
        "SELECT id, email, first_name, last_name, phone, city, date_of_birth, gender, whatsapp, country, timezone, created_at, trainer_id FROM users WHERE id = $1 AND role = 'user' AND (approval_status IS NULL OR approval_status = 'pending')";
      const params: string[] = [id];
      if (isAdmin(req.user)) {
        sql += " AND (trainer_id IS NULL OR trainer_id = $2)";
        params.push(req.user.id);
      }
      const userRes = await this.pool.query(sql, params);
      const user = userRes.rows[0];
      if (!user) return res.status(404).json({ error: "Not found" });
      return res.json(user);
    } catch {
      return res.status(500).json({ error: "Failed to fetch sign-up request" });
    }
  }

  @Post("create-client")
  async createClient(
    @Body()
    body: {
      email?: string;
      password?: string;
      first_name?: string;
      last_name?: string;
      phone?: string;
      city?: string;
      country?: string;
      timezone?: string;
      trainer_id?: string;
    },
    @Req() req: any,
    @Res() res: Response
  ) {
    if (!this.pool) return res.status(500).json({ error: "Failed to create client" });
    try {
      const emailNorm = String(body?.email || "").trim().toLowerCase();
      const pwd = String(body?.password || "");
      if (!emailNorm || !pwd) return res.status(400).json({ error: "Email and password are required" });
      if (pwd.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

      const existing = await this.pool.query("SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1", [
        emailNorm
      ]);
      if (existing.rows[0]) return res.status(409).json({ error: "Email already registered" });

      let trainerId: string | null = null;
      if (isAdmin(req.user)) {
        trainerId = req.user.id;
      } else if (body?.trainer_id) {
        const tr = await this.pool.query(
          "SELECT id FROM users WHERE id = $1 AND role = 'admin' LIMIT 1",
          [String(body.trainer_id).trim()]
        );
        if (!tr.rows[0]) return res.status(400).json({ error: "Invalid trainer_id" });
        trainerId = tr.rows[0].id;
      }

      const id = randomUUID();
      const hash = bcrypt.hashSync(pwd, 10);
      const country = String(body?.country || "").trim();
      const timezone = String(body?.timezone || "").trim();
      const cityTrim = String(body?.city || "").trim();
      const cityForTribe = cityTrim || country || "";
      await this.pool.query(
        "INSERT INTO users (id, email, password, first_name, last_name, phone, city, country, timezone, role, approval_status, trainer_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'user','approved',$10)",
        [
          id,
          emailNorm,
          hash,
          body?.first_name || "",
          body?.last_name || "",
          body?.phone || "",
          cityTrim,
          country,
          timezone,
          trainerId
        ]
      );

      const tribeId = randomUUID();
      const today = new Date().toISOString().split("T")[0];
      try {
        await this.pool.query(
          "INSERT INTO tribe_members (id, first_name, last_name, email, phone, city, phase, start_date, activity_per_week, starting_weight, current_weight, target_weight, next_checkin, notes, status) VALUES ($1,$2,$3,$4,$5,$6,1,$7,0,$8,$9,$10,$11,$12,$13)",
          [
            tribeId,
            body?.first_name || "",
            body?.last_name || "",
            emailNorm,
            body?.phone || "",
            cityForTribe,
            today,
            null,
            null,
            null,
            "",
            "Added by trainer dashboard",
            "active"
          ]
        );
      } catch (e: any) {
        if (!(e?.code === "42P01" || e?.code === "42703")) throw e;
      }

      return res.json({
        id,
        email: emailNorm,
        first_name: body?.first_name || "",
        last_name: body?.last_name || "",
        role: "user",
        approval_status: "approved",
        trainer_id: trainerId || null
      });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Failed to create client" });
    }
  }

  @Get("audit-requests")
  async auditRequests(@Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json([]);
    try {
      const from = req.query?.from ? String(req.query.from) : null;
      const to = req.query?.to ? String(req.query.to) : null;
      const where: string[] = [];
      const params: any[] = [];
      if (from) {
        params.push(from);
        where.push(`date(created_at) >= date($${params.length})`);
      }
      if (to) {
        params.push(to);
        where.push(`date(created_at) <= date($${params.length})`);
      }
      let sql =
        "SELECT id, first_name, last_name, email, city, goals, status, created_at FROM audit_requests";
      if (where.length) sql += " WHERE " + where.join(" AND ");
      sql += " ORDER BY created_at DESC LIMIT 300";
      return res.json(await this.safeRows(sql, params));
    } catch {
      return res.json([]);
    }
  }

  @Get("sunday-checkins")
  async sundayCheckins(@Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json([]);
    try {
      const from = req.query?.from ? String(req.query.from) : null;
      const to = req.query?.to ? String(req.query.to) : null;
      const where: string[] = [];
      const params: any[] = [];
      if (from) {
        params.push(from);
        where.push(`date(created_at) >= date($${params.length})`);
      }
      if (to) {
        params.push(to);
        where.push(`date(created_at) <= date($${params.length})`);
      }
      let sql =
        "SELECT id, user_id, full_name, reply_email, total_weight_loss, achievements, created_at FROM sunday_checkins";
      if (where.length) sql += " WHERE " + where.join(" AND ");
      sql += " ORDER BY created_at DESC LIMIT 300";
      let rows = await this.safeRows(sql, params);
      if (isAdmin(req.user)) {
        rows = rows.filter((r: any) => !r.user_id || String(r.user_id) === String(req.user.id));
      }
      return res.json(rows);
    } catch {
      return res.json([]);
    }
  }

  @Get("daily-checkins")
  async dailyCheckins(@Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json([]);
    try {
      const from = req.query?.from ? String(req.query.from) : null;
      const to = req.query?.to ? String(req.query.to) : null;
      const where: string[] = [];
      const params: any[] = [];
      if (from) {
        params.push(from);
        where.push(`date(dc.checkin_date) >= date($${params.length})`);
      }
      if (to) {
        params.push(to);
        where.push(`date(dc.checkin_date) <= date($${params.length})`);
      }
      let sql =
        "SELECT dc.id, dc.user_id, dc.checkin_date, dc.steps, dc.water_ml, dc.protein_g, dc.sleep_hours, dc.created_at, u.first_name, u.last_name, u.email, u.trainer_id FROM daily_checkins dc LEFT JOIN users u ON u.id::text = dc.user_id::text";
      if (where.length) sql += " WHERE " + where.join(" AND ");
      sql += " ORDER BY dc.checkin_date DESC, dc.created_at DESC LIMIT 400";
      let rows = await this.safeRows(sql, params);
      if (isAdmin(req.user)) {
        rows = rows.filter((r: any) => String(r.trainer_id || "") === String(req.user.id));
      }
      return res.json(rows);
    } catch {
      return res.status(500).json([]);
    }
  }

  @Get("daily-checkins/:id")
  async dailyCheckinById(@Param("id") id: string, @Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Not found" });
    try {
      const rows = await this.safeRows(
        "SELECT dc.id, dc.user_id, dc.checkin_date, dc.steps, dc.water_ml, dc.protein_g, dc.sleep_hours, dc.created_at, u.first_name, u.last_name, u.email, u.trainer_id FROM daily_checkins dc LEFT JOIN users u ON u.id::text = dc.user_id::text WHERE dc.id = $1 LIMIT 1",
        [id]
      );
      const row = rows[0];
      if (!row) return res.status(404).json({ error: "Not found" });
      if (isAdmin(req.user) && String(row.trainer_id || "") !== String(req.user.id)) {
        return res.status(403).json({ error: "Access denied" });
      }
      return res.json(row);
    } catch {
      return res.status(500).json({ error: "Not found" });
    }
  }

  @Get("workouts")
  async workouts(@Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json([]);
    try {
      const from = req.query?.from ? String(req.query.from) : null;
      const to = req.query?.to ? String(req.query.to) : null;
      const where: string[] = [];
      const params: any[] = [];
      if (from) {
        params.push(from);
        where.push(`date(w.created_at) >= date($${params.length})`);
      }
      if (to) {
        params.push(to);
        where.push(`date(w.created_at) <= date($${params.length})`);
      }
      let sql =
        "SELECT w.id, w.user_id, w.workout_name, w.duration_seconds, w.feedback, w.created_at, u.first_name, u.last_name, u.email, u.trainer_id FROM workout_logs w LEFT JOIN users u ON u.id::text = w.user_id::text";
      if (where.length) sql += " WHERE " + where.join(" AND ");
      sql += " ORDER BY w.created_at DESC LIMIT 400";
      let rows = await this.safeRows(sql, params);
      if (isAdmin(req.user)) {
        rows = rows.filter((r: any) => String(r.trainer_id || "") === String(req.user.id));
      }
      return res.json(rows);
    } catch {
      return res.status(500).json([]);
    }
  }

  @Get("workouts/:id")
  async workoutById(@Param("id") id: string, @Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Not found" });
    try {
      const rows = await this.safeRows(
        "SELECT w.id, w.user_id, w.workout_name, w.duration_seconds, w.feedback, w.created_at, u.first_name, u.last_name, u.email, u.trainer_id FROM workout_logs w LEFT JOIN users u ON u.id::text = w.user_id::text WHERE w.id = $1 LIMIT 1",
        [id]
      );
      const row = rows[0];
      if (!row) return res.status(404).json({ error: "Not found" });
      if (isAdmin(req.user) && String(row.trainer_id || "") !== String(req.user.id)) {
        return res.status(403).json({ error: "Access denied" });
      }
      return res.json(row);
    } catch {
      return res.status(500).json({ error: "Not found" });
    }
  }

  @Get("part2-submissions")
  async part2Submissions(@Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json([]);
    try {
      const from = req.query?.from ? String(req.query.from) : null;
      const to = req.query?.to ? String(req.query.to) : null;
      const where: string[] = [];
      const params: any[] = [];
      if (from) {
        params.push(from);
        where.push(`date(created_at) >= date($${params.length})`);
      }
      if (to) {
        params.push(to);
        where.push(`date(created_at) <= date($${params.length})`);
      }
      let sql =
        "SELECT id, name, email, mobile, activity_level, created_at FROM part2_audit";
      if (where.length) sql += " WHERE " + where.join(" AND ");
      sql += " ORDER BY created_at DESC LIMIT 300";
      return res.json(await this.safeRows(sql, params));
    } catch {
      return res.status(500).json([]);
    }
  }

  @Get("users")
  async users(@Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Server error" });
    try {
      let sql =
        "SELECT id, first_name, last_name, email, country, timezone, COALESCE(suspended, false) as suspended, trainer_id FROM users WHERE role = 'user' AND (approval_status IS NULL OR approval_status = 'approved') AND (email NOT LIKE '%@test.fitbase.fit') AND (LOWER(first_name) NOT LIKE '%e2e%')";
      const params: string[] = [];
      if (isAdmin(req.user)) {
        sql += " AND trainer_id = $1";
        params.push(req.user.id);
      }
      sql += " ORDER BY first_name, last_name";
      const list = await this.pool.query(sql, params);
      return res.json(list.rows);
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Server error" });
    }
  }

  @Post("users/:id/suspend")
  async suspendUser(@Param("id") id: string, @Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Failed to suspend user" });
    try {
      const userRes = await this.pool.query(
        "SELECT id, role, trainer_id FROM users WHERE id = $1 LIMIT 1",
        [id]
      );
      const user = userRes.rows[0];
      if (!user) return res.status(404).json({ error: "User not found" });
      if (user.role !== "user") return res.status(400).json({ error: "Can only suspend client users" });
      if (isAdmin(req.user) && user.trainer_id !== req.user.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      await this.pool.query("UPDATE users SET suspended = TRUE WHERE id = $1", [id]);
      return res.json({ message: "User suspended" });
    } catch {
      return res.status(500).json({ error: "Failed to suspend user" });
    }
  }

  @Post("users/:id/reactivate")
  async reactivateUser(@Param("id") id: string, @Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Failed to reactivate user" });
    try {
      const userRes = await this.pool.query(
        "SELECT id, role, trainer_id FROM users WHERE id = $1 LIMIT 1",
        [id]
      );
      const user = userRes.rows[0];
      if (!user) return res.status(404).json({ error: "User not found" });
      if (user.role !== "user") return res.status(400).json({ error: "Can only reactivate client users" });
      if (isAdmin(req.user) && user.trainer_id !== req.user.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      await this.pool.query("UPDATE users SET suspended = FALSE WHERE id = $1", [id]);
      return res.json({ message: "User reactivated" });
    } catch {
      return res.status(500).json({ error: "Failed to reactivate user" });
    }
  }

  @Get("recent-activity")
  async recentActivity(@Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json([]);
    try {
      const perSource = 12;
      const maxOut = 24;
      const activities: Array<{ name: string; type: string; status: string; created_at: string }> = [];
      const trainerId = isAdmin(req.user) ? String(req.user.id || "") : null;
      const scopeSql = `($1::text IS NULL OR u.trainer_id::text = $2::text)`;
      const pendingScope = `($1::text IS NULL OR trainer_id::text = $2::text)`;
      const params = [trainerId, trainerId, perSource];

      const safeQ = async (sql: string): Promise<any[]> => {
        try {
          const r = await this.pool!.query(sql, params);
          return r.rows || [];
        } catch (err: any) {
          if (err?.code === "42P01" || err?.code === "42703") return [];
          console.warn("[recent-activity] source skipped:", err?.message || err);
          return [];
        }
      };

      (await safeQ(
        `SELECT s.full_name, s.created_at
         FROM sunday_checkins s
         LEFT JOIN users u ON u.id::text = s.user_id::text
         WHERE ${scopeSql}
         ORDER BY s.created_at DESC LIMIT $3`
      )).forEach((r: any) =>
        activities.push({
          name: r.full_name || "Unknown",
          type: "Sunday check-in",
          status: "NEW",
          created_at: r.created_at
        })
      );

      (await safeQ(
        `SELECT u.first_name, u.last_name, dc.checkin_date, dc.created_at
         FROM daily_checkins dc
         LEFT JOIN users u ON u.id::text = dc.user_id::text
         WHERE ${scopeSql}
         ORDER BY dc.created_at DESC LIMIT $3`
      )).forEach((r: any) =>
        activities.push({
          name: `${r.first_name || ""} ${r.last_name || ""}`.trim() || "Member",
          type: "Daily check-in",
          status: "DONE",
          created_at: r.created_at
        })
      );

      (await safeQ(
        `SELECT u.first_name, u.last_name, w.created_at
         FROM workout_logs w LEFT JOIN users u ON u.id::text = w.user_id::text
         WHERE ${scopeSql}
         ORDER BY w.created_at DESC LIMIT $3`
      )).forEach((r: any) =>
        activities.push({
          name: `${r.first_name || ""} ${r.last_name || ""}`.trim() || "User",
          type: "Workout logged",
          status: "DONE",
          created_at: r.created_at
        })
      );

      (await safeQ(
        `SELECT c.name, c.created_at
         FROM contact_messages c
         LEFT JOIN users u ON u.id::text = c.user_id::text
         WHERE ${scopeSql}
         ORDER BY c.created_at DESC LIMIT $3`
      )).forEach((r: any) =>
        activities.push({
          name: r.name || "Unknown",
          type: "Message",
          status: "UNREAD",
          created_at: r.created_at
        })
      );

      (await safeQ(
        `SELECT first_name, last_name, created_at
         FROM users
         WHERE role='user' AND approval_status='pending' AND ${pendingScope}
         ORDER BY created_at DESC LIMIT $3`
      )).forEach((r: any) =>
        activities.push({
          name: `${r.first_name || ""} ${r.last_name || ""}`.trim() || "New user",
          type: "Sign-up",
          status: "PENDING",
          created_at: r.created_at
        })
      );

      activities.sort(
        (a, b) => new Date(String(b.created_at || 0)).getTime() - new Date(String(a.created_at || 0)).getTime()
      );
      return res.json(activities.slice(0, maxOut));
    } catch (e: any) {
      console.error("[admin recent-activity]", e?.message || e);
      return res.json([]);
    }
  }

  @Get("performance-insights")
  async performanceInsights(@Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Database unavailable", summary: {}, data: [] });
    try {
      const source = String(req.query?.source || "all").toLowerCase();
      const dateFrom = req.query?.from ? String(req.query.from) : null;
      const dateTo = req.query?.to ? String(req.query.to) : null;
      const filterUserId = req.query?.user_id ? String(req.query.user_id) : null;
      const scopedUserId = isAdmin(req.user) ? null : filterUserId;
      const trainerId = isAdmin(req.user) ? req.user.id : null;
      const hasDate = !!(dateFrom || dateTo);
      const summary: Record<string, any> = {};

      const usersApproved = await this.pool.query(
        "SELECT COUNT(*)::int as c FROM users WHERE role='user' AND (approval_status IS NULL OR approval_status = 'approved') AND ($1::text IS NULL OR trainer_id = $2)",
        [trainerId, trainerId]
      );
      summary.users_approved = usersApproved.rows[0]?.c || 0;

      const pendingAudit = await this.pool.query(
        "SELECT COUNT(*)::int as c FROM audit_requests WHERE status='pending'"
      );
      summary.pending_requests = pendingAudit.rows[0]?.c || 0;

      const dailyCheckins = await this.pool.query(
        "SELECT COUNT(*)::int as c FROM daily_checkins d LEFT JOIN users u ON u.id::text = d.user_id::text WHERE ($1::text IS NULL OR u.trainer_id = $2)",
        [trainerId, trainerId]
      );
      summary.daily_checkins = dailyCheckins.rows[0]?.c || 0;

      const counters = [
        { key: "workouts", sql: "SELECT COUNT(*)::int as c FROM workout_logs w", dateCol: "w.created_at", userCol: "w.user_id" },
        { key: "sunday_checkin", sql: "SELECT COUNT(*)::int as c FROM sunday_checkins", dateCol: "created_at", userCol: "user_id" },
        { key: "audit", sql: "SELECT COUNT(*)::int as c FROM audit_requests", dateCol: "created_at", userCol: null },
        { key: "part2", sql: "SELECT COUNT(*)::int as c FROM part2_audit", dateCol: "created_at", userCol: null },
        { key: "meetings", sql: "SELECT COUNT(*)::int as c FROM meetings WHERE status='scheduled'", dateCol: "created_at", userCol: "user_id" },
        { key: "messages", sql: "SELECT COUNT(*)::int as c FROM contact_messages", dateCol: "created_at", userCol: "user_id" }
      ];

      for (const item of counters) {
        let sql = item.sql;
        const conditions: string[] = [];
        const params: any[] = [];
        if (hasDate && item.dateCol) {
          if (dateFrom) {
            params.push(dateFrom);
            conditions.push(`date(${item.dateCol}) >= date($${params.length})`);
          }
          if (dateTo) {
            params.push(dateTo);
            conditions.push(`date(${item.dateCol}) <= date($${params.length})`);
          }
        }
        if (scopedUserId && item.userCol) {
          params.push(scopedUserId);
          conditions.push(`${item.userCol} = $${params.length}`);
        }
        if (conditions.length) {
          sql += (item.sql.toLowerCase().includes(" where ") ? " AND " : " WHERE ") + conditions.join(" AND ");
        }
        const row = await this.pool.query(sql, params);
        summary[item.key] = row.rows[0]?.c || 0;
      }

      let data: any[] = [];
      if (source === "all" || source === "overview") {
        const limit = 80;
        const w = await this.pool.query(
          "SELECT w.id, w.user_id, w.workout_name, w.duration_seconds, w.created_at, u.first_name, u.last_name FROM workout_logs w LEFT JOIN users u ON u.id::text = w.user_id::text ORDER BY w.created_at DESC LIMIT 200"
        );
        const sc = await this.pool.query(
          "SELECT id, user_id, full_name, reply_email, created_at FROM sunday_checkins ORDER BY created_at DESC LIMIT 200"
        );
        const ar = await this.pool.query(
          "SELECT id, first_name, last_name, email, created_at FROM audit_requests ORDER BY created_at DESC LIMIT 200"
        );
        const p2 = await this.pool.query(
          "SELECT id, name, email, created_at FROM part2_audit ORDER BY created_at DESC LIMIT 200"
        );
        const meet = await this.pool.query(
          "SELECT id, user_id, user_name, user_email, meeting_date, time_slot, created_at FROM meetings ORDER BY created_at DESC LIMIT 200"
        );
        const msg = await this.pool.query(
          "SELECT id, user_id, name, email, message, created_at FROM contact_messages ORDER BY created_at DESC LIMIT 200"
        );
        data = [
          ...w.rows.map((r: any) => ({ ...r, _source: "workouts", _date: r.created_at })),
          ...sc.rows.map((r: any) => ({ ...r, _source: "sunday_checkin", _date: r.created_at })),
          ...ar.rows.map((r: any) => ({ ...r, _source: "audit", _date: r.created_at })),
          ...p2.rows.map((r: any) => ({ ...r, _source: "part2", _date: r.created_at })),
          ...meet.rows.map((r: any) => ({ ...r, _source: "meetings", _date: r.created_at })),
          ...msg.rows.map((r: any) => ({ ...r, _source: "messages", _date: r.created_at }))
        ];
        if (hasDate) {
          data = data.filter((r) => {
            const d = String(r._date || r.created_at || "").slice(0, 10);
            return (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo);
          });
        }
        if (scopedUserId) data = data.filter((r) => r.user_id === scopedUserId);
        data.sort(
          (a, b) => new Date(String(b._date || b.created_at || 0)).getTime() - new Date(String(a._date || a.created_at || 0)).getTime()
        );
        data = data.slice(0, limit);
      } else {
        const limit = 500;
        const params: any[] = [];
        let sql = "";
        const addDateUserFilters = (dateCol: string, userCol: string | null) => {
          const where: string[] = [];
          if (dateFrom) {
            params.push(dateFrom);
            where.push(`date(${dateCol}) >= date($${params.length})`);
          }
          if (dateTo) {
            params.push(dateTo);
            where.push(`date(${dateCol}) <= date($${params.length})`);
          }
          if (scopedUserId && userCol) {
            params.push(scopedUserId);
            where.push(`${userCol} = $${params.length}`);
          }
          return where;
        };

        if (source === "workouts") {
          sql =
            "SELECT w.id, w.user_id, w.workout_name, w.duration_seconds, w.feedback, w.created_at, u.first_name, u.last_name, u.email FROM workout_logs w LEFT JOIN users u ON u.id::text = w.user_id::text";
          const where = addDateUserFilters("w.created_at", "w.user_id");
          if (where.length) sql += " WHERE " + where.join(" AND ");
          sql += ` ORDER BY w.created_at DESC LIMIT ${limit}`;
        } else if (source === "sunday_checkin") {
          sql = "SELECT id, user_id, full_name, reply_email, plan, total_weight_loss, created_at FROM sunday_checkins";
          const where = addDateUserFilters("created_at", "user_id");
          if (where.length) sql += " WHERE " + where.join(" AND ");
          sql += ` ORDER BY created_at DESC LIMIT ${limit}`;
        } else if (source === "audit") {
          sql = "SELECT id, first_name, last_name, email, city, goals, status, created_at FROM audit_requests";
          const where = addDateUserFilters("created_at", null);
          if (where.length) sql += " WHERE " + where.join(" AND ");
          sql += ` ORDER BY created_at DESC LIMIT ${limit}`;
        } else if (source === "part2") {
          sql = "SELECT id, name, email, mobile, activity_level, created_at FROM part2_audit";
          const where = addDateUserFilters("created_at", null);
          if (where.length) sql += " WHERE " + where.join(" AND ");
          sql += ` ORDER BY created_at DESC LIMIT ${limit}`;
        } else if (source === "meetings") {
          sql =
            "SELECT id, user_id, user_name, user_email, user_phone, meeting_date, time_slot, status, created_at FROM meetings";
          const where = addDateUserFilters("created_at", "user_id");
          if (where.length) sql += " WHERE " + where.join(" AND ");
          sql += ` ORDER BY created_at DESC LIMIT ${limit}`;
        } else if (source === "messages") {
          sql = "SELECT id, user_id, name, email, phone, message, created_at FROM contact_messages";
          const where = addDateUserFilters("created_at", "user_id");
          if (where.length) sql += " WHERE " + where.join(" AND ");
          sql += ` ORDER BY created_at DESC LIMIT ${limit}`;
        }
        if (sql) {
          const rows = await this.pool.query(sql, params);
          data = rows.rows;
        }
      }

      const stats = { ...summary, sunday_checkins: summary.sunday_checkin };
      return res.json({
        summary,
        stats,
        data,
        filters: { source, dateFrom, dateTo, user_id: filterUserId || null }
      });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Server error", summary: {}, data: [] });
    }
  }
}
