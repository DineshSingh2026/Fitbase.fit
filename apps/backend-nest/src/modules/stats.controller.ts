import { Controller, Get, Inject, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { Pool } from "pg";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { RolesGuard } from "./roles.guard";
import { Roles } from "./roles.decorator";

@Controller("api")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin", "superadmin")
export class StatsController {
  constructor(@Inject("PG_POOL") private readonly pool: Pool | null) {}

  private async safeCount(sql: string, params: any[] = []) {
    if (!this.pool) return 0;
    try {
      const r = await this.pool.query(sql, params);
      return Number(r.rows?.[0]?.c || 0);
    } catch (e: any) {
      if (e?.code === "42P01" || e?.code === "42703") return 0;
      throw e;
    }
  }

  @Get("stats")
  async stats(@Req() req: any, @Res() res: Response) {
    if (!this.pool) {
      return res.status(500).json({ error: "Database unavailable" });
    }
    try {
      const trainerId = req.user?.role === "admin" ? String(req.user.id || "") : null;

      const activeMembers = await this.safeCount(
        "SELECT COUNT(*)::int AS c FROM users WHERE role='user' AND (approval_status IS NULL OR approval_status='approved') AND ($1::text IS NULL OR trainer_id = $2)",
        [trainerId, trainerId]
      );
      const pendingSignups = await this.safeCount(
        "SELECT COUNT(*)::int AS c FROM users WHERE role='user' AND (approval_status IS NULL OR approval_status='pending') AND ($1::text IS NULL OR trainer_id = $2)",
        [trainerId, trainerId]
      );
      const dailyCheckins = await this.safeCount(
        "SELECT COUNT(*)::int AS c FROM daily_checkins d LEFT JOIN users u ON u.id = d.user_id WHERE ($1::text IS NULL OR u.trainer_id = $2)",
        [trainerId, trainerId]
      );
      const messages = await this.safeCount(
        "SELECT COUNT(*)::int AS c FROM contact_messages c LEFT JOIN users u ON u.id = c.user_id WHERE ($1::text IS NULL OR u.trainer_id = $2)",
        [trainerId, trainerId]
      );
      const pendingRequests = await this.safeCount("SELECT COUNT(*)::int AS c FROM audit_requests WHERE status='pending'");

      return res.json({
        pending_requests: pendingRequests,
        active_members: activeMembers,
        daily_checkins: dailyCheckins,
        pending_signups: pendingSignups,
        messages
      });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Failed to fetch stats" });
    }
  }
}
