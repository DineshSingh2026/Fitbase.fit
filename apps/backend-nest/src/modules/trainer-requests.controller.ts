import { Body, Controller, Inject, Post, Res } from "@nestjs/common";
import { Pool } from "pg";
import { randomUUID } from "crypto";
import type { Response } from "express";

@Controller("api")
export class TrainerRequestsController {
  constructor(@Inject("PG_POOL") private readonly pool: Pool | null) {}

  @Post("trainer-requests")
  async createTrainerRequest(
    @Body()
    body: {
      full_name?: string;
      email?: string;
      phone?: string;
      gym_name?: string;
      city?: string;
      message?: string;
    },
    @Res() res: Response
  ) {
    if (!this.pool) return res.status(500).json({ error: "Failed to submit trainer request" });

    try {
      const name = String(body?.full_name || "").trim();
      const emailNorm = String(body?.email || "").trim().toLowerCase();
      if (!name || !emailNorm) {
        return res.status(400).json({ error: "Full name and email are required" });
      }

      const existingTrainer = await this.pool.query(
        "SELECT id FROM users WHERE LOWER(email) = $1 AND role = 'admin' LIMIT 1",
        [emailNorm]
      );
      if (existingTrainer.rows[0]) {
        return res.status(409).json({
          error:
            "This email is already onboarded as a trainer. Please use your login credentials."
        });
      }

      const pending = await this.pool.query(
        "SELECT id FROM trainer_requests WHERE LOWER(email) = $1 AND status = 'pending' LIMIT 1",
        [emailNorm]
      );
      if (pending.rows[0]) {
        return res.status(409).json({
          error: "A trainer request with this email is already pending review."
        });
      }

      await this.pool.query(
        `INSERT INTO trainer_requests (id, full_name, email, phone, gym_name, city, message, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')`,
        [
          randomUUID(),
          name,
          emailNorm,
          String(body?.phone || "").trim(),
          String(body?.gym_name || "").trim(),
          String(body?.city || "").trim(),
          String(body?.message || "").trim()
        ]
      );

      return res.json({
        ok: true,
        message:
          "Request submitted. Superadmin will review and share your credentials."
      });
    } catch {
      return res.status(500).json({ error: "Failed to submit trainer request" });
    }
  }
}
