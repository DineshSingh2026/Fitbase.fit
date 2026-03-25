import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Req,
  Res,
  UseGuards
} from "@nestjs/common";
import type { Response } from "express";
import { Pool } from "pg";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { RolesGuard } from "./roles.guard";
import { Roles } from "./roles.decorator";
import * as bcrypt from "bcryptjs";
import {
  ensureTrainersTableQueries,
  ensureUniqueTrainerCode,
  generateTempPassword
} from "./trainers-credential.util";

function publicLoginUrl(): string {
  const u = String(process.env.TRAINER_LOGIN_URL || process.env.PUBLIC_LOGIN_URL || "").trim();
  if (u) return u.replace(/\/$/, "");
  return "https://fitbase.fit/login";
}

function stripTrainerRow(row: Record<string, unknown>) {
  const { password_hash: _ph, temp_password: _tp, ...rest } = row;
  return rest;
}

@Controller("api/admin/trainers")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("superadmin")
export class AdminTrainersController {
  constructor(@Inject("PG_POOL") private readonly pool: Pool | null) {}

  private async ensureSchema() {
    if (!this.pool) return;
    await ensureTrainersTableQueries(this.pool);
  }

  @Get()
  async list(@Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Database unavailable" });
    try {
      await this.ensureSchema();
      const status = String(req.query?.status || "pending").trim().toLowerCase();
      if (status === "pending") {
        const r = await this.pool.query(
          `SELECT id, full_name, email, phone, gym_name, city, message, status, must_change_password,
                  trainer_code, approved_at, approved_by, rejection_reason, created_at
           FROM trainers WHERE status = 'pending' ORDER BY created_at DESC LIMIT 500`
        );
        return res.json(r.rows.map((row) => stripTrainerRow(row as Record<string, unknown>)));
      }
      if (status === "approved") {
        const r = await this.pool.query(
          `SELECT t.id, t.full_name, t.email, t.phone, t.gym_name, t.city, t.message, t.status, t.must_change_password,
                  t.trainer_code, t.approved_at, t.approved_by, t.created_at,
                  COALESCE(u.suspended, FALSE) AS suspended,
                  COALESCE(u.id, t.id) AS trainer_user_id,
                  (SELECT COUNT(*)::int FROM users c WHERE c.role = 'user' AND c.trainer_id::text = u.id::text) AS clients_total
           FROM trainers t
           LEFT JOIN users u ON LOWER(TRIM(u.email)) = LOWER(TRIM(t.email)) AND u.role = 'admin'
           WHERE t.status = 'approved'
           ORDER BY t.approved_at DESC NULLS LAST, t.created_at DESC
           LIMIT 500`
        );
        return res.json(r.rows.map((row) => stripTrainerRow(row as Record<string, unknown>)));
      }
      if (status === "rejected") {
        const r = await this.pool.query(
          `SELECT id, full_name, email, phone, gym_name, city, message, status, rejection_reason, created_at
           FROM trainers WHERE status = 'rejected' ORDER BY created_at DESC LIMIT 500`
        );
        return res.json(r.rows.map((row) => stripTrainerRow(row as Record<string, unknown>)));
      }
      return res.status(400).json({ error: "Invalid status. Use pending, approved, or rejected." });
    } catch (e: any) {
      console.error("[admin/trainers list]", e?.message || e);
      return res.status(500).json({ error: "Failed to list trainers" });
    }
  }

  @Patch(":id/approve")
  async approve(@Param("id") id: string, @Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Database unavailable" });
    const trainerId = String(id || "").trim();
    const superadminId = String(req.user?.id || "").trim();
    if (!trainerId || !superadminId) {
      return res.status(400).json({ error: "Invalid request" });
    }

    const client = await this.pool.connect();
    try {
      await this.ensureSchema();
      await client.query("BEGIN");

      const lock = await client.query(
        `SELECT * FROM trainers WHERE id = $1 AND status = 'pending' FOR UPDATE LIMIT 1`,
        [trainerId]
      );
      const row = lock.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Trainer not found or already reviewed" });
      }

      const emailNorm = String(row.email || "").trim().toLowerCase();
      const tempPassword = generateTempPassword();
      const passwordHash = bcrypt.hashSync(tempPassword, 10);
      const trainerCode = await ensureUniqueTrainerCode(client, String(row.full_name || "Trainer"));

      const nameParts = String(row.full_name || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      const firstName = nameParts.length ? nameParts[0] : "Trainer";
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";

      const exRes = await client.query(`SELECT id, role FROM users WHERE LOWER(email) = $1 LIMIT 1`, [emailNorm]);
      const existing = exRes.rows[0];
      if (existing && String(existing.role || "").toLowerCase() !== "admin") {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "Email already exists as a non-trainer account" });
      }
      if (existing && String(existing.id) !== String(trainerId)) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "Email is already tied to a different trainer account" });
      }

      await client.query(
        `UPDATE trainers SET
          status = 'approved',
          password_hash = $1,
          temp_password = $2,
          must_change_password = true,
          trainer_code = $3,
          approved_at = CURRENT_TIMESTAMP,
          approved_by = $4::uuid,
          rejection_reason = NULL
        WHERE id = $5::uuid`,
        [passwordHash, tempPassword, trainerCode, superadminId, trainerId]
      );

      if (existing) {
        await client.query(
          `UPDATE users SET password = $1, first_name = $2, last_name = $3, phone = $4,
           referral_code = $5, approval_status = 'approved', suspended = FALSE, role = 'admin'
           WHERE id = $6::uuid`,
          [passwordHash, firstName, lastName, String(row.phone || "").trim(), trainerCode, trainerId]
        );
      } else {
        await client.query(
          `INSERT INTO users (id, email, password, first_name, last_name, phone, role, approval_status, suspended, referral_code)
           VALUES ($1::uuid, $2, $3, $4, $5, $6, 'admin', 'approved', FALSE, $7)`,
          [trainerId, emailNorm, passwordHash, firstName, lastName, String(row.phone || "").trim(), trainerCode]
        );
      }

      await client.query(
        `UPDATE trainer_requests SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $1, trainer_user_id = $2
         WHERE id = $3::uuid`,
        [superadminId, trainerId, trainerId]
      );

      await client.query("COMMIT");

      const loginUrl = publicLoginUrl();
      return res.json({
        success: true,
        trainer: {
          id: trainerId,
          full_name: String(row.full_name || ""),
          email: emailNorm,
          temp_password: tempPassword,
          trainer_code: trainerCode,
          login_url: loginUrl,
          message: "Share these credentials with the trainer"
        }
      });
    } catch (e: any) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
      console.error("[admin/trainers approve]", e?.message || e);
      return res.status(500).json({ error: "Failed to approve trainer" });
    } finally {
      client.release();
    }
  }

  @Patch(":id/reject")
  async reject(
    @Param("id") id: string,
    @Body() body: { reason?: string },
    @Req() req: any,
    @Res() res: Response
  ) {
    if (!this.pool) return res.status(500).json({ error: "Database unavailable" });
    const trainerId = String(id || "").trim();
    const superadminId = String(req.user?.id || "").trim();
    const reason = body?.reason != null ? String(body.reason).trim().slice(0, 2000) : "";
    if (!trainerId) return res.status(400).json({ error: "Invalid id" });

    try {
      await this.ensureSchema();
      const r = await this.pool.query(
        `UPDATE trainers SET status = 'rejected', rejection_reason = $1, approved_at = NULL, approved_by = NULL,
         password_hash = NULL, temp_password = NULL, trainer_code = NULL
         WHERE id = $2::uuid AND status = 'pending'
         RETURNING id`,
        [reason || null, trainerId]
      );
      if (!r.rows[0]) {
        return res.status(404).json({ error: "Trainer not found or already reviewed" });
      }
      await this.pool.query(
        `UPDATE trainer_requests SET status = 'rejected', reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $1, rejection_reason = $2
         WHERE id = $3::uuid`,
        [superadminId, reason || null, trainerId]
      );
      return res.json({ success: true });
    } catch (e: any) {
      console.error("[admin/trainers reject]", e?.message || e);
      return res.status(500).json({ error: "Failed to reject trainer" });
    }
  }
}
