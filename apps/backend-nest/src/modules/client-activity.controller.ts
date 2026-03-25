import { Body, Controller, Get, Inject, Param, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { Pool } from "pg";
import { randomUUID } from "crypto";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { RolesGuard } from "./roles.guard";
import { Roles } from "./roles.decorator";
import { normalizeRoleString } from "./auth-role.util";

@Controller("api")
export class ClientActivityController {
  constructor(@Inject("PG_POOL") private readonly pool: Pool | null) {}

  private async assertTrainerCanAccessClient(reqUser: any, userId: string): Promise<boolean> {
    if (!this.pool) return false;
    if (normalizeRoleString(reqUser?.role) === "superadmin") return true;
    if (normalizeRoleString(reqUser?.role) !== "admin") return false;
    const r = await this.pool.query(
      "SELECT id FROM users WHERE id = $1::uuid AND role = 'user' AND trainer_id = $2::uuid LIMIT 1",
      [userId, reqUser.id]
    );
    return !!r.rows[0];
  }

  private toDateStr(val: unknown): string | null {
    if (val == null) return null;
    if (val instanceof Date) return val.toISOString().slice(0, 10);
    return String(val).slice(0, 10);
  }

  @Get("today")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("user")
  async today(@Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Database unavailable" });
    const userId = String(req.user?.id || "");
    const today = new Date().toISOString().slice(0, 10);
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekStartIso = weekStart.toISOString();
    try {
      const [checkin, meetings, workouts, lastMsg, sundayThisWeek] = await Promise.all([
        this.pool
          .query("SELECT * FROM daily_checkins WHERE user_id = $1 AND checkin_date = $2::date LIMIT 1", [
            userId,
            today
          ])
          .catch(() => ({ rows: [] as any[] })),
        this.pool
          .query(
            "SELECT * FROM meetings WHERE user_id = $1::uuid AND COALESCE(status,'') != 'cancelled' ORDER BY meeting_date ASC, time_slot ASC",
            [userId]
          )
          .catch(() => ({ rows: [] as any[] })),
        this.pool
          .query(
            "SELECT * FROM workout_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
            [userId]
          )
          .catch(() => ({ rows: [] as any[] })),
        this.pool
          .query(
            `SELECT tm.body, tm.created_at, tm.sender_role, mt.id AS thread_id
             FROM thread_messages tm
             JOIN message_threads mt ON mt.id = tm.thread_id
             WHERE mt.user_id = $1::uuid
             AND (mt.thread_kind = 'client' OR mt.thread_kind IS NULL)
             ORDER BY tm.created_at DESC LIMIT 1`,
            [userId]
          )
          .catch(() => ({ rows: [] as any[] })),
        this.pool
          .query(
            `SELECT id, created_at FROM sunday_checkins
             WHERE user_id = $1 AND created_at >= $2::timestamptz
             ORDER BY created_at DESC LIMIT 1`,
            [userId, weekStartIso]
          )
          .catch(() => ({ rows: [] as any[] }))
      ]);

      const lastRow = lastMsg.rows[0];
      const lastMessage = lastRow
        ? {
            body: lastRow.body,
            created_at: lastRow.created_at,
            sender_role: lastRow.sender_role,
            thread_id: lastRow.thread_id
          }
        : null;

      const upcomingMeetings = (meetings.rows || []).filter((m: any) => {
        const md = String(m.meeting_date || "");
        if (!md) return false;
        const t = new Date(md + "T12:00:00").getTime();
        return !Number.isNaN(t) && t >= new Date().setHours(0, 0, 0, 0);
      });

      return res.json({
        checkin: checkin.rows[0] || null,
        nextMeeting: upcomingMeetings[0] || null,
        lastWorkout: workouts.rows[0] || null,
        lastMessage,
        pendingSundayCheckin: !(sundayThisWeek.rows && sundayThisWeek.rows.length)
      });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Failed to load today data" });
    }
  }

  @Get("daily-checkin/streak")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("user")
  async dailyStreak(@Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Database unavailable" });
    const userId = String(req.user?.id || "");
    try {
      const r = await this.pool.query(
        `SELECT checkin_date, steps, water_ml, protein_g, sleep_hours
         FROM daily_checkins WHERE user_id = $1 ORDER BY checkin_date DESC LIMIT 365`,
        [userId]
      );
      const rows = r.rows || [];
      if (!rows.length) {
        return res.json({
          streak: 0,
          todaySaved: false,
          atRisk: false,
          secondsUntilMidnight: null,
          weekly: {},
          days: []
        });
      }

      const today = this.toDateStr(new Date())!;
      const dates = new Set(rows.map((row: any) => this.toDateStr(row.checkin_date)).filter(Boolean) as string[]);
      const todaySaved = dates.has(today);
      let streak = 0;
      const d = new Date();
      if (!todaySaved) d.setDate(d.getDate() - 1);
      for (let i = 0; i < 365; i++) {
        const ds = this.toDateStr(d);
        if (!ds || !dates.has(ds)) break;
        streak++;
        d.setDate(d.getDate() - 1);
      }
      const atRisk = !todaySaved && streak > 0;
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
      const secondsUntilMidnight = Math.max(0, Math.floor((midnight.getTime() - now.getTime()) / 1000));

      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const weekData = rows.filter((row: any) => {
        const cd = row.checkin_date ? new Date(row.checkin_date) : null;
        return cd && !Number.isNaN(cd.getTime()) && cd >= weekStart;
      });
      const avgSteps = weekData.length
        ? Math.round(weekData.reduce((s: number, row: any) => s + (Number(row.steps) || 0), 0) / weekData.length)
        : null;
      const avgWater = weekData.length
        ? Math.round(weekData.reduce((s: number, row: any) => s + (Number(row.water_ml) || 0), 0) / weekData.length)
        : null;
      const avgProtein = weekData.length
        ? Math.round(weekData.reduce((s: number, row: any) => s + (Number(row.protein_g) || 0), 0) / weekData.length)
        : null;
      const avgSleep = weekData.length
        ? (weekData.reduce((s: number, row: any) => s + (Number(row.sleep_hours) || 0), 0) / weekData.length).toFixed(1)
        : null;

      return res.json({
        streak,
        todaySaved: !!todaySaved,
        atRisk: !!atRisk,
        secondsUntilMidnight: atRisk ? secondsUntilMidnight : null,
        weekly: { avgSteps, avgWater, avgProtein, avgSleep },
        days: rows
      });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Failed to load streak" });
    }
  }

  @Post("daily-checkin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("user")
  async postDailyCheckin(@Body() body: any, @Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Failed to save check-in" });
    const userId = String(req.user?.id || "");
    const today = new Date().toISOString().slice(0, 10);
    const { steps, water_ml, protein_g, sleep_hours } = body || {};
    try {
      const ex = await this.pool.query(
        "SELECT id FROM daily_checkins WHERE user_id = $1 AND checkin_date = $2::date LIMIT 1",
        [userId, today]
      );
      if (ex.rows[0]) {
        return res.status(400).json({ error: "You can only fill the daily check-in once per day." });
      }
      const id = randomUUID();
      await this.pool.query(
        `INSERT INTO daily_checkins (id, user_id, checkin_date, steps, water_ml, protein_g, sleep_hours)
         VALUES ($1, $2, $3::date, $4, $5, $6, $7)`,
        [
          id,
          userId,
          today,
          steps != null ? Number(steps) : null,
          water_ml != null ? Number(water_ml) : null,
          protein_g != null ? Number(protein_g) : null,
          sleep_hours != null ? Number(sleep_hours) : null
        ]
      );
      const row = await this.pool.query(
        "SELECT * FROM daily_checkins WHERE user_id = $1 AND checkin_date = $2::date LIMIT 1",
        [userId, today]
      );
      return res.json(row.rows[0] || { id, user_id: userId, checkin_date: today, steps, water_ml, protein_g, sleep_hours });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Failed to save check-in" });
    }
  }

  @Get("workouts/:userId")
  @UseGuards(JwtAuthGuard)
  async listWorkoutsForUser(@Param("userId") userId: string, @Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.json([]);
    const role = normalizeRoleString(req.user?.role);
    if (role === "user" && String(req.user.id) !== String(userId)) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (role === "admin") {
      const ok = await this.assertTrainerCanAccessClient(req.user, String(userId));
      if (!ok) return res.status(403).json({ error: "Access denied" });
    }
    try {
      const r = await this.pool.query(
        "SELECT * FROM workout_logs WHERE user_id = $1 ORDER BY created_at DESC",
        [userId]
      );
      return res.json(r.rows || []);
    } catch {
      return res.json([]);
    }
  }

  @Post("workouts")
  @UseGuards(JwtAuthGuard)
  async postWorkout(@Body() body: any, @Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Failed to log workout" });
    const { user_id, workout_name, duration_seconds, feedback } = body || {};
    if (!user_id || !workout_name) return res.status(400).json({ error: "User and workout name required" });
    const uid = String(user_id);
    const role = normalizeRoleString(req.user?.role);
    if (role === "user" && String(req.user.id) !== uid) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (role === "admin") {
      const ok = await this.assertTrainerCanAccessClient(req.user, uid);
      if (!ok) return res.status(403).json({ error: "Access denied" });
    }
    try {
      const id = randomUUID();
      await this.pool.query(
        `INSERT INTO workout_logs (id, user_id, workout_name, duration_seconds, feedback)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, uid, String(workout_name), Number(duration_seconds) || 0, String(feedback || "")]
      );
      return res.json({ id, message: "Workout logged" });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Failed to log workout" });
    }
  }

  @Get("progress")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("user")
  async getProgress(@Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Failed to load progress" });
    const userId = String(req.user?.id || "");
    try {
      const r = await this.pool.query(
        "SELECT * FROM progress_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 365",
        [userId]
      );
      return res.json({ logs: r.rows || [], streak: 0, goalCompletionPercent: 0, insights: [] });
    } catch {
      return res.json({ logs: [], streak: 0, goalCompletionPercent: 0, insights: [] });
    }
  }

  @Post("progress")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("user")
  async postProgress(@Body() body: any, @Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Failed to save progress" });
    const userId = String(req.user?.id || "");
    const {
      log_date,
      weight,
      body_fat,
      calories_intake,
      protein_intake,
      workout_completed,
      workout_type,
      strength_bench,
      strength_squat,
      strength_deadlift,
      sleep_hours,
      water_intake
    } = body || {};
    try {
      let createdAt: Date | null = null;
      if (log_date && String(log_date).trim()) {
        const d = new Date(String(log_date).trim());
        if (!Number.isNaN(d.getTime())) createdAt = d;
      }
      await this.pool.query(
        `INSERT INTO progress_logs (
           user_id, weight, body_fat, calories_intake, protein_intake,
           workout_completed, workout_type, strength_bench, strength_squat, strength_deadlift,
           sleep_hours, water_intake, created_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, COALESCE($13, now()))`,
        [
          userId,
          weight != null && weight !== "" ? parseFloat(String(weight)) : null,
          body_fat != null && body_fat !== "" ? parseFloat(String(body_fat)) : null,
          calories_intake != null && calories_intake !== "" ? parseInt(String(calories_intake), 10) : null,
          protein_intake != null && protein_intake !== "" ? parseInt(String(protein_intake), 10) : null,
          !!workout_completed,
          workout_type || null,
          strength_bench != null && strength_bench !== "" ? parseFloat(String(strength_bench)) : null,
          strength_squat != null && strength_squat !== "" ? parseFloat(String(strength_squat)) : null,
          strength_deadlift != null && strength_deadlift !== "" ? parseFloat(String(strength_deadlift)) : null,
          sleep_hours != null && sleep_hours !== "" ? parseFloat(String(sleep_hours)) : null,
          water_intake != null && water_intake !== "" ? parseFloat(String(water_intake)) : null,
          createdAt
        ]
      );
      return res.status(201).json({ success: true, message: "Progress saved for this date" });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Failed to save progress" });
    }
  }

  @Post("sunday-checkin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("user")
  async postSundayCheckin(@Body() body: any, @Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Failed to submit check-in" });
    const b = body || {};
    if (!String(b.full_name || "").trim()) {
      return res.status(400).json({ error: "Full name is required" });
    }
    const userId = String(req.user?.id || "");
    if (b.user_id != null && String(b.user_id) !== userId) {
      return res.status(403).json({ error: "Access denied" });
    }
    try {
      const id = randomUUID();
      await this.pool.query(
        `INSERT INTO sunday_checkins (
           id, user_id, full_name, reply_email, plan, current_weight_waist_week, last_week_weight_waist,
           total_weight_loss, training_go, nutrition_go, sleep, occupation_stress, other_stress,
           differences_felt, achievements, improve_next_week, questions
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          id,
          userId,
          String(b.full_name || "").trim(),
          String(b.reply_email || "").trim(),
          String(b.plan || ""),
          String(b.current_weight_waist_week || ""),
          String(b.last_week_weight_waist || ""),
          String(b.total_weight_loss || ""),
          String(b.training_go || ""),
          String(b.nutrition_go || ""),
          String(b.sleep || ""),
          String(b.occupation_stress || ""),
          String(b.other_stress || ""),
          String(b.differences_felt || ""),
          String(b.achievements || ""),
          String(b.improve_next_week || ""),
          String(b.questions || "")
        ]
      );
      return res.json({ id, message: "Sunday check-in submitted successfully" });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Failed to submit check-in" });
    }
  }
}
