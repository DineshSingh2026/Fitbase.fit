import { Body, Controller, Get, Inject, Param, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { Pool } from "pg";
import { randomUUID } from "crypto";
import * as bcrypt from "bcryptjs";

/**
 * Public routes for client join flow (/join/[code]) — same contract as Express server.js
 * so the Next app works when API_SITE_BASE points at Nest only.
 */
@Controller("api/public")
export class PublicSignupController {
  constructor(@Inject("PG_POOL") private readonly pool: Pool | null) {}

  @Get("referral/:code")
  async validateReferral(@Param("code") codeRaw: string, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Failed to validate invite" });
    const code = String(codeRaw || "").trim().toLowerCase();
    if (!code || code.length > 32) return res.status(400).json({ error: "Invalid code" });
    try {
      const r = await this.pool.query(
        `SELECT id, first_name, last_name, email, COALESCE(suspended, FALSE) AS suspended
         FROM users
         WHERE LOWER(TRIM(referral_code)) = $1 AND role = 'admin'
         LIMIT 1`,
        [code]
      );
      const tr = r.rows[0];
      if (!tr || tr.suspended) {
        return res.status(404).json({ error: "Invalid or inactive invite link" });
      }
      const name = [tr.first_name, tr.last_name].filter(Boolean).join(" ").trim() || "Your coach";
      return res.json({ ok: true, trainer_id: tr.id, trainer_name: name });
    } catch {
      return res.status(500).json({ error: "Failed to validate invite" });
    }
  }

  @Post("client-signup-referral")
  async clientSignupReferral(@Body() body: Record<string, unknown>, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Failed to create account" });
    const b = body || {};
    const code = String(b.referral_code || "").trim().toLowerCase();
    const emailNorm = String(b.email || "").trim().toLowerCase();
    const password = String(b.password || "");
    const password2 = String(b.confirm_password || b.password_confirm || "");
    const firstName = String(b.first_name || "").trim();
    const lastName = String(b.last_name || "").trim();
    const dateOfBirth = String(b.date_of_birth || b.dob || "").trim();
    const gender = String(b.gender || "").trim();
    const city = String(b.city || "").trim();
    const whatsapp = String(b.whatsapp || b.whatsapp_number || "").trim();

    if (!code) return res.status(400).json({ error: "Invite code required" });
    if (!emailNorm || !password) return res.status(400).json({ error: "Email and password required" });
    if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
    if (password !== password2) return res.status(400).json({ error: "Passwords do not match" });
    if (!firstName || !lastName) return res.status(400).json({ error: "First and last name required" });

    try {
      const trRes = await this.pool.query(
        `SELECT id FROM users
         WHERE LOWER(TRIM(referral_code)) = $1 AND role = 'admin' AND COALESCE(suspended, FALSE) = FALSE
         LIMIT 1`,
        [code]
      );
      const tr = trRes.rows[0];
      if (!tr) return res.status(400).json({ error: "Invalid or inactive invite link" });
      const trainerId = String(tr.id);

      const exRes = await this.pool.query(
        `SELECT id, approval_status FROM users WHERE LOWER(email) = $1 LIMIT 1`,
        [emailNorm]
      );
      const existing = exRes.rows[0];

      if (existing && String(existing.approval_status || "").toLowerCase() !== "rejected") {
        return res.status(409).json({ error: "Email already registered" });
      }

      const hash = bcrypt.hashSync(password, 10);
      const phone = whatsapp || "";

      if (existing && String(existing.approval_status || "").toLowerCase() === "rejected") {
        await this.pool.query(
          `UPDATE users SET password = $1, first_name = $2, last_name = $3, phone = $4, whatsapp = $5, city = $6,
           date_of_birth = $7, gender = $8, country = $9, timezone = $10, approval_status = 'pending', trainer_id = $11
           WHERE id = $12`,
          [
            hash,
            firstName,
            lastName,
            phone,
            whatsapp,
            city,
            dateOfBirth,
            gender,
            city || "",
            "",
            trainerId,
            existing.id
          ]
        );
        return res.json({
          ok: true,
          pending_approval: true,
          message: "Your request was submitted. Your trainer will approve your account shortly."
        });
      }

      const id = randomUUID();
      await this.pool.query(
        `INSERT INTO users (id, email, password, first_name, last_name, phone, whatsapp, city, date_of_birth, gender, country, timezone, role, approval_status, trainer_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'user', 'pending', $13)`,
        [
          id,
          emailNorm,
          hash,
          firstName,
          lastName,
          phone,
          whatsapp,
          city,
          dateOfBirth,
          gender,
          city || "",
          "",
          trainerId
        ]
      );
      return res.json({
        ok: true,
        pending_approval: true,
        message: "Account created. Your trainer will approve you shortly; then you can log in."
      });
    } catch (e: any) {
      if (e?.code === "23505") {
        return res.status(409).json({ error: "Email already registered" });
      }
      return res.status(500).json({ error: "Failed to create account" });
    }
  }
}
