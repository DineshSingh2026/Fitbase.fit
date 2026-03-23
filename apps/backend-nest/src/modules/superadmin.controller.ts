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

@Controller("api/superadmin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("superadmin")
export class SuperadminController {
  constructor(@Inject("PG_POOL") private readonly pool: Pool | null) {}

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
