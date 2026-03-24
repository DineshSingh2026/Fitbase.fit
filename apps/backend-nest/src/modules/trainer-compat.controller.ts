import { Body, Controller, Get, Inject, Param, Post, Put, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { Pool } from "pg";
import { randomUUID } from "crypto";
import * as jwt from "jsonwebtoken";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { RolesGuard } from "./roles.guard";
import { Roles } from "./roles.decorator";

@Controller("api")
export class TrainerCompatController {
  constructor(@Inject("PG_POOL") private readonly pool: Pool | null) {}

  private async ensureMeetingsTable() {
    if (!this.pool) return;
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS meetings (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL,
        user_name text,
        user_email text,
        user_phone text,
        meeting_date text,
        time_slot text,
        status text DEFAULT 'scheduled',
        notes text,
        created_at timestamptz DEFAULT now()
      )`
    );
  }

  private get secret(): string {
    return process.env.JWT_SECRET || "fitbase-progress-secret-change-in-production";
  }

  private signProgressReportToken(userId: string) {
    return jwt.sign({ userId, purpose: "progress-report" }, this.secret, {
      expiresIn: process.env.PROGRESS_REPORT_LINK_EXPIRY || "30d"
    } as any);
  }

  private verifyProgressReportToken(token?: string | null): string | null {
    if (!token) return null;
    try {
      const decoded = jwt.verify(token, this.secret) as any;
      if (decoded?.purpose === "progress-report" && decoded?.userId) return String(decoded.userId);
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
      if (e?.code === "42P01" || e?.code === "42703") return [];
      throw e;
    }
  }

  private async assertTrainerCanAccessClient(reqUser: any, userId: string) {
    if (!this.pool) return false;
    if (reqUser?.role === "superadmin") return true;
    if (reqUser?.role !== "admin") return false;
    const rows = await this.safeRows(
      "SELECT id FROM users WHERE id = $1 AND role = 'user' AND trainer_id = $2 LIMIT 1",
      [userId, reqUser.id]
    );
    return !!rows[0];
  }

  @Get("clients")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "superadmin")
  async clients(@Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.json([]);
    try {
      const trainerId = req.user?.role === "admin" ? String(req.user.id) : null;
      const rows = await this.safeRows(
        "SELECT id, first_name, last_name, email, country, timezone, COALESCE(suspended,false) AS suspended, trainer_id FROM users WHERE role='user' AND (approval_status IS NULL OR approval_status='approved') AND ($1::text IS NULL OR trainer_id = $2) ORDER BY first_name, last_name",
        [trainerId, trainerId]
      );
      return res.json(rows);
    } catch {
      return res.json([]);
    }
  }

  @Get("tribe")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "superadmin")
  async tribe(@Res() res: Response) {
    if (!this.pool) return res.json([]);
    const rows = await this.safeRows(
      "SELECT * FROM tribe_members WHERE status='active' ORDER BY phase DESC, start_date ASC"
    );
    return res.json(rows);
  }

  @Post("tribe")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "superadmin")
  async addTribe(@Body() body: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Failed to add member" });
    try {
      if (!String(body?.first_name || "").trim()) return res.status(400).json({ error: "Name required" });
      await this.pool.query(
        "INSERT INTO tribe_members (id,first_name,last_name,email,phone,city,phase,start_date,activity_per_week,starting_weight,current_weight,target_weight,next_checkin,notes,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'active')",
        [
          randomUUID(),
          body?.first_name || "",
          body?.last_name || "",
          body?.email || "",
          body?.phone || "",
          body?.city || "",
          body?.phase || 1,
          body?.start_date || new Date().toISOString().slice(0, 10),
          body?.activity_per_week || 0,
          body?.starting_weight ?? null,
          body?.current_weight ?? null,
          body?.target_weight ?? null,
          body?.next_checkin || "",
          body?.notes || ""
        ]
      );
      return res.json({ message: "Member added" });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Failed to add member" });
    }
  }

  @Get("meetings")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "superadmin")
  async meetings(@Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.json([]);
    await this.ensureMeetingsTable();
    const trainerId = req.user?.role === "admin" ? String(req.user.id) : null;
    const rows = await this.safeRows(
      "SELECT m.*, u.trainer_id FROM meetings m LEFT JOIN users u ON u.id::text = m.user_id::text WHERE m.status='scheduled' ORDER BY m.meeting_date ASC, m.time_slot ASC"
    );
    const filtered =
      trainerId == null ? rows : rows.filter((r: any) => String(r.trainer_id || "") === trainerId);
    return res.json(filtered);
  }

  @Post("meetings")
  @UseGuards(JwtAuthGuard)
  async createMeeting(@Body() body: any, @Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Failed to schedule call" });
    try {
      await this.ensureMeetingsTable();
      if (!body?.user_id || !body?.meeting_date || !body?.time_slot) {
        return res.status(400).json({ error: "User, date and time slot required" });
      }
      if (req.user?.role === "user" && String(req.user.id) !== String(body.user_id)) {
        return res.status(403).json({ error: "Access denied" });
      }
      if (req.user?.role === "admin") {
        const ok = await this.assertTrainerCanAccessClient(req.user, String(body.user_id));
        if (!ok) return res.status(403).json({ error: "Access denied" });
      }
      const id = randomUUID();
      await this.pool.query(
        "INSERT INTO meetings (id, user_id, user_name, user_email, user_phone, meeting_date, time_slot, status, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,'scheduled',$8)",
        [id, body.user_id, body.user_name || "", body.user_email || "", body.user_phone || "", body.meeting_date, body.time_slot, body.notes || ""]
      );
      return res.json({ id, message: "Call scheduled successfully" });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Failed to schedule call" });
    }
  }

  @Get("meetings/user/:userId")
  @UseGuards(JwtAuthGuard)
  async meetingsForUser(@Param("userId") userId: string, @Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.json([]);
    await this.ensureMeetingsTable();
    if (req.user?.role === "user" && String(req.user.id) !== String(userId)) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (req.user?.role === "admin") {
      const ok = await this.assertTrainerCanAccessClient(req.user, String(userId));
      if (!ok) return res.status(403).json({ error: "Access denied" });
    }
    const rows = await this.safeRows(
      "SELECT * FROM meetings WHERE user_id = $1 ORDER BY meeting_date DESC, created_at DESC",
      [userId]
    );
    return res.json(rows);
  }

  @Put("meetings/:id")
  @UseGuards(JwtAuthGuard)
  async updateMeeting(@Param("id") id: string, @Body() body: any, @Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Update failed" });
    await this.ensureMeetingsTable();
    const rows = await this.safeRows("SELECT * FROM meetings WHERE id = $1 LIMIT 1", [id]);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: "Not found" });
    if (req.user?.role === "user" && String(req.user.id) !== String(row.user_id || "")) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (req.user?.role === "admin") {
      const ok = await this.assertTrainerCanAccessClient(req.user, String(row.user_id || ""));
      if (!ok) return res.status(403).json({ error: "Access denied" });
    }
    const updates: string[] = [];
    const params: any[] = [];
    if (body?.meeting_date !== undefined) {
      params.push(body.meeting_date);
      updates.push(`meeting_date = $${params.length}`);
    }
    if (body?.time_slot !== undefined) {
      params.push(body.time_slot);
      updates.push(`time_slot = $${params.length}`);
    }
    if (body?.status !== undefined) {
      params.push(body.status);
      updates.push(`status = $${params.length}`);
    }
    if (!updates.length) return res.status(400).json({ error: "No valid fields" });
    params.push(id);
    await this.pool.query(`UPDATE meetings SET ${updates.join(", ")} WHERE id = $${params.length}`, params);
    return res.json({ message: "Updated" });
  }

  @Get("admin/user-progress/:userId")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "superadmin")
  async adminUserProgress(@Param("userId") userId: string, @Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Database unavailable" });
    if (req.user?.role === "admin") {
      const ok = await this.assertTrainerCanAccessClient(req.user, userId);
      if (!ok) return res.status(403).json({ error: "Access denied" });
    }
    try {
      const userRow = await this.safeRows(
        "SELECT COALESCE(suspended,false) AS suspended FROM users WHERE id = $1 LIMIT 1",
        [userId]
      );
      const suspended = !!userRow[0]?.suspended;
      const progressLogs = await this.safeRows(
        "SELECT * FROM progress_logs WHERE user_id = $1 ORDER BY created_at ASC",
        [userId]
      );
      const daily = await this.safeRows(
        "SELECT checkin_date, steps, water_ml, protein_g, sleep_hours FROM daily_checkins WHERE user_id = $1 ORDER BY checkin_date ASC",
        [userId]
      );
      const workouts = await this.safeRows(
        "SELECT created_at, duration_seconds FROM workout_logs WHERE user_id = $1 ORDER BY created_at ASC",
        [userId]
      );
      const currentWeight = progressLogs.length
        ? progressLogs.filter((x: any) => x.weight != null).slice(-1)[0]?.weight ?? null
        : null;
      const activeStreak = daily.length;
      const workoutConsistencyPercent = progressLogs.length
        ? ((workouts.length / progressLogs.length) * 100).toFixed(1)
        : "0.0";
      const logs = progressLogs.map((p: any) => ({
        created_at: p.created_at,
        weight: p.weight,
        body_fat: p.body_fat,
        calories_intake: p.calories_intake,
        protein_intake: p.protein_intake,
        workout_completed: !!p.workout_completed,
        workout_type: p.workout_type,
        strength_bench: p.strength_bench,
        strength_squat: p.strength_squat,
        strength_deadlift: p.strength_deadlift,
        sleep_hours: p.sleep_hours,
        water_intake: p.water_intake,
        steps: null
      }));
      return res.json({
        currentWeight,
        weightChangePercent: null,
        strengthGrowthPercent: null,
        workoutConsistencyPercent,
        activeStreak,
        goalCompletionPercent: 0,
        averageCalories: null,
        averageSleep: null,
        insights: [],
        logs,
        suspended
      });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Failed to load progress" });
    }
  }

  @Get("admin/progress-report-link/:userId")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "superadmin")
  async progressReportLink(@Param("userId") userId: string, @Req() req: any, @Res() res: Response) {
    if (req.user?.role === "admin") {
      const ok = await this.assertTrainerCanAccessClient(req.user, userId);
      if (!ok) return res.status(403).json({ error: "Access denied" });
    }
    const token = this.signProgressReportToken(userId);
    const baseUrl = `${req.protocol}://${req.get("host")}`.replace(/\/$/, "");
    return res.json({ url: `${baseUrl}/progress-report.html?t=${encodeURIComponent(token)}`, token });
  }

  @Get("progress-report")
  async progressReport(@Req() req: any, @Res() res: Response) {
    const token = String(req.query?.token || req.query?.t || "");
    const userId = this.verifyProgressReportToken(token);
    if (!userId) return res.status(401).json({ error: "Invalid or expired link" });
    const rows = await this.safeRows("SELECT * FROM progress_logs WHERE user_id = $1 ORDER BY created_at ASC", [userId]);
    return res.json({
      currentWeight: rows.length ? rows.filter((x: any) => x.weight != null).slice(-1)[0]?.weight ?? null : null,
      logs: rows
    });
  }
}
