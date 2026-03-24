import { Body, Controller, Inject, Post, Res } from "@nestjs/common";
import { Pool } from "pg";
import { randomUUID } from "crypto";
import type { Response } from "express";

@Controller("api")
export class ClientRequestsController {
  constructor(@Inject("PG_POOL") private readonly pool: Pool | null) {}

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

  @Post("client-requests")
  async createClientRequest(
    @Body()
    body: {
      full_name?: string;
      email?: string;
      phone?: string;
      city?: string;
      goal_focus?: string;
      message?: string;
      heard_about?: string;
    },
    @Res() res: Response
  ) {
    if (!this.pool) return res.status(500).json({ error: "Failed to submit request" });

    try {
      await this.ensureClientRequestsTable();
      const name = String(body?.full_name || "").trim();
      const emailNorm = String(body?.email || "").trim().toLowerCase();
      if (!name || !emailNorm) {
        return res.status(400).json({ error: "Full name and email are required" });
      }

      const existingUser = await this.pool.query(
        "SELECT id, role FROM users WHERE LOWER(email) = $1 LIMIT 1",
        [emailNorm]
      );
      if (existingUser.rows[0]) {
        return res.status(409).json({
          error: "An account with this email already exists. Sign in or use a different email."
        });
      }

      const pending = await this.pool.query(
        "SELECT id FROM client_requests WHERE LOWER(email) = $1 AND status = 'pending' LIMIT 1",
        [emailNorm]
      );
      if (pending.rows[0]) {
        return res.status(409).json({
          error: "A coaching request with this email is already pending review."
        });
      }

      await this.pool.query(
        `INSERT INTO client_requests (id, full_name, email, phone, city, goal_focus, message, heard_about, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')`,
        [
          randomUUID(),
          name,
          emailNorm,
          String(body?.phone || "").trim(),
          String(body?.city || "").trim(),
          String(body?.goal_focus || "").trim(),
          String(body?.message || "").trim(),
          String(body?.heard_about || "").trim()
        ]
      );

      return res.json({
        ok: true,
        message:
          "Thanks — we received your request. FitBase will match you with a coach; your trainer will send you an invite link to complete signup."
      });
    } catch {
      return res.status(500).json({ error: "Failed to submit request" });
    }
  }
}
