import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { Pool } from "pg";
import * as bcrypt from "bcryptjs";
import { AuthService } from "./auth.service";
import { toUserRole } from "./auth-role.util";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { RolesGuard } from "./roles.guard";
import { Roles } from "./roles.decorator";
import type { Response } from "express";
import { ensureTrainersTableQueries } from "./trainers-credential.util";

const FALLBACK_SUPERADMIN_EMAIL = "superadmin@gmail.com";
const FALLBACK_SUPERADMIN_PASS = "Fitbase@2026";

@Controller("api/auth")
export class AuthController {
  constructor(
    @Inject("PG_POOL") private readonly pool: Pool | null,
    private readonly authService: AuthService
  ) {}

  private async trainerMustChangePassword(emailNorm: string): Promise<boolean> {
    if (!this.pool) return false;
    try {
      const r = await this.pool.query(
        `SELECT must_change_password FROM trainers
         WHERE LOWER(TRIM(email)) = $1 AND status = 'approved' LIMIT 1`,
        [emailNorm]
      );
      return r.rows[0]?.must_change_password === true;
    } catch {
      return false;
    }
  }

  private async getUserByEmail(email: string) {
    if (!this.pool) return null;
    try {
      const userRes = await this.pool.query(
        `SELECT id, email, password, first_name, last_name, profile_picture, role, country, timezone, trainer_id, approval_status, suspended
         FROM users
         WHERE LOWER(email) = $1
         LIMIT 1`,
        [email]
      );
      return userRes.rows[0] || null;
    } catch (err: any) {
      // Fallback for older schemas missing optional columns.
      if (err?.code !== "42703") throw err;
      const fallback = await this.pool.query(
        `SELECT * FROM users
         WHERE LOWER(email) = $1
         LIMIT 1`,
        [email]
      );
      return fallback.rows[0] || null;
    }
  }

  private async getUserById(id: string) {
    if (!this.pool) return null;
    try {
      const userRes = await this.pool.query(
        `SELECT id, email, first_name, last_name, profile_picture, role, country, timezone, trainer_id
         FROM users
         WHERE id = $1
         LIMIT 1`,
        [id]
      );
      return userRes.rows[0] || null;
    } catch (err: any) {
      if (err?.code !== "42703") throw err;
      const fallback = await this.pool.query(
        `SELECT * FROM users
         WHERE id = $1
         LIMIT 1`,
        [id]
      );
      return fallback.rows[0] || null;
    }
  }

  /** Aligns with Express `runSuperadminSync` so Nest login matches Body Bank / FitBase superadmin. */
  private async runSuperadminSyncFromEnv(): Promise<void> {
    if (!this.pool) return;
    const superadminEmailNorm = String(process.env.SUPERADMIN_EMAIL || "").trim().toLowerCase();
    const superadminPassTrimmed = String(process.env.SUPERADMIN_PASS || "").trim();
    if (!superadminEmailNorm || !superadminPassTrimmed) return;
    const hash = bcrypt.hashSync(superadminPassTrimmed, 10);
    const byEmail = await this.pool.query(`SELECT id, role FROM users WHERE LOWER(email) = $1 LIMIT 1`, [
      superadminEmailNorm
    ]);
    if (byEmail.rows[0]) {
      await this.pool.query(
        `UPDATE users SET role = 'superadmin', password = $1, first_name = 'Super', last_name = 'Admin', approval_status = 'approved', suspended = false WHERE id = $2`,
        [hash, byEmail.rows[0].id]
      );
      await this.pool.query(`UPDATE users SET role = 'user' WHERE role = 'superadmin' AND id != $1`, [
        byEmail.rows[0].id
      ]);
    } else {
      const existingSa = await this.pool.query(`SELECT id FROM users WHERE role = 'superadmin' LIMIT 1`);
      if (existingSa.rows[0]) {
        await this.pool.query(
          `UPDATE users SET email = $1, password = $2, first_name = 'Super', last_name = 'Admin', approval_status = 'approved', suspended = false WHERE role = 'superadmin'`,
          [superadminEmailNorm, hash]
        );
      } else {
        await this.pool.query(
          `INSERT INTO users (id, email, password, first_name, last_name, role, approval_status) VALUES ($1, $2, $3, 'Super', 'Admin', 'superadmin', 'approved')`,
          [randomUUID(), superadminEmailNorm, hash]
        );
      }
    }
  }

  private async ensureFallbackSuperadmin(): Promise<void> {
    if (!this.pool) return;
    const hash = bcrypt.hashSync(FALLBACK_SUPERADMIN_PASS, 10);
    const emailNorm = FALLBACK_SUPERADMIN_EMAIL.toLowerCase();
    const byEmail = await this.pool.query(`SELECT id, role FROM users WHERE LOWER(email) = $1 LIMIT 1`, [emailNorm]);
    if (byEmail.rows[0]) {
      await this.pool.query(
        `UPDATE users SET role = 'superadmin', password = $1, first_name = 'Super', last_name = 'Admin', approval_status = 'approved', suspended = false WHERE id = $2`,
        [hash, byEmail.rows[0].id]
      );
      await this.pool.query(`UPDATE users SET role = 'user' WHERE role = 'superadmin' AND id != $1`, [byEmail.rows[0].id]);
      return;
    }
    const existingSa = await this.pool.query(`SELECT id FROM users WHERE role = 'superadmin' LIMIT 1`);
    if (existingSa.rows[0]) {
      await this.pool.query(
        `UPDATE users SET email = $1, password = $2, first_name = 'Super', last_name = 'Admin', approval_status = 'approved', suspended = false WHERE role = 'superadmin'`,
        [FALLBACK_SUPERADMIN_EMAIL, hash]
      );
    } else {
      await this.pool.query(
        `INSERT INTO users (id, email, password, first_name, last_name, role, approval_status) VALUES ($1, $2, $3, 'Super', 'Admin', 'superadmin', 'approved')`,
        [randomUUID(), FALLBACK_SUPERADMIN_EMAIL, hash]
      );
    }
  }

  @Post("login")
  async login(
    @Body() body: { email?: string; password?: string },
    @Res() res: Response
  ) {
    if (!this.pool) {
      return res.status(503).json({
        error: "database_unconfigured",
        message:
          "Database is not connected. On Render, open fitbase-backend-nest → Environment → set DATABASE_URL from your Postgres instance, then redeploy."
      });
    }

    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "").trim();
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }
    try {
      const superadminEmailNorm = String(process.env.SUPERADMIN_EMAIL || "").trim().toLowerCase();
      const superadminPassTrimmed = String(process.env.SUPERADMIN_PASS || "").trim();
      const matchesEnvSuperadmin =
        !!superadminEmailNorm &&
        !!superadminPassTrimmed &&
        email === superadminEmailNorm &&
        password === superadminPassTrimmed;
      const matchesFallback =
        email === FALLBACK_SUPERADMIN_EMAIL.toLowerCase() && password === FALLBACK_SUPERADMIN_PASS;

      // Heal DB first (same as Express): promotes env email to superadmin even if row was user/pending.
      if (matchesFallback) {
        await this.ensureFallbackSuperadmin();
      } else if (matchesEnvSuperadmin) {
        await this.runSuperadminSyncFromEnv();
      }

      let user = await this.getUserByEmail(email);
      if (!user) {
        await ensureTrainersTableQueries(this.pool);
        const trSt = await this.pool.query(
          `SELECT status FROM trainers WHERE LOWER(TRIM(email)) = $1 ORDER BY created_at DESC LIMIT 1`,
          [email]
        );
        const st = String(trSt.rows[0]?.status || "").toLowerCase();
        if (st === "pending") {
          return res.status(403).json({
            error: "pending_review",
            message: "Application under review"
          });
        }
        if (st === "rejected") {
          return res.status(403).json({
            error: "not_approved",
            message: "Application not approved"
          });
        }
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const suspended = user.suspended === true || user.suspended === "t";
      if (suspended) {
        return res.status(403).json({
          error: "suspended",
          message: "Your account has been suspended. Please contact support."
        });
      }

      const initialRole = toUserRole(user.role);
      const staffRole = initialRole === "superadmin" || initialRole === "admin";
      if (!staffRole) {
        const status = user.approval_status || "approved";
        if (status === "rejected") {
          return res.status(403).json({
            error: "rejected",
            message: "Your request was rejected. Please sign up again to submit a new request."
          });
        }
        if (status !== "approved") {
          return res.status(403).json({
            error: "pending_approval",
            message:
              "Your account is pending admin approval. You will be able to log in once approved."
          });
        }
      }

      if (!user.password || !bcrypt.compareSync(password, user.password)) {
        if (matchesFallback) {
          await this.ensureFallbackSuperadmin();
        } else if (matchesEnvSuperadmin || (superadminEmailNorm && superadminPassTrimmed && email === superadminEmailNorm)) {
          await this.runSuperadminSyncFromEnv();
        }
        user = await this.getUserByEmail(email);
        if (!user?.password || !bcrypt.compareSync(password, user.password)) {
          return res.status(401).json({ error: "Invalid email or password" });
        }
      }

      const resolvedRole = toUserRole(user.role);
      const rawRoleTrim = String(user.role || "").trim();
      if (
        (resolvedRole === "superadmin" || resolvedRole === "admin") &&
        rawRoleTrim.toLowerCase() === resolvedRole &&
        rawRoleTrim !== resolvedRole
      ) {
        await this.pool.query(`UPDATE users SET role = $1 WHERE id = $2`, [resolvedRole, user.id]);
      }

      const mustChange =
        resolvedRole === "admin" ? await this.trainerMustChangePassword(String(user.email || "").trim().toLowerCase()) : false;

      const token = this.authService.sign({
        id: user.id,
        email: user.email,
        role: resolvedRole,
        trainer_id: user.trainer_id || null,
        must_change_password: mustChange || undefined
      });

      return res.json({
        id: user.id,
        email: user.email,
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        profile_picture: user.profile_picture || "",
        role: resolvedRole,
        country: user.country || "",
        timezone: user.timezone || "",
        trainer_id: user.trainer_id || null,
        must_change_password: mustChange,
        token
      });
    } catch (e: any) {
      console.error("[auth/login]", e?.message || e);
      return res.status(500).json({ error: "Server error. Please try again." });
    }
  }

  @Post("trainer/login")
  async trainerLogin(
    @Body() body: { email?: string; password?: string },
    @Res() res: Response
  ) {
    if (!this.pool) {
      return res.status(503).json({ error: "database_unconfigured", message: "Database is not connected." });
    }
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "").trim();
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }
    try {
      await ensureTrainersTableQueries(this.pool);
      const trRes = await this.pool.query(
        `SELECT id, email, password_hash, must_change_password, status FROM trainers
         WHERE LOWER(TRIM(email)) = $1 AND status = 'approved' LIMIT 1`,
        [email]
      );
      const trow = trRes.rows[0];
      if (!trow) {
        const anyTr = await this.pool.query(
          `SELECT status FROM trainers WHERE LOWER(TRIM(email)) = $1 ORDER BY created_at DESC LIMIT 1`,
          [email]
        );
        const st = String(anyTr.rows[0]?.status || "").toLowerCase();
        if (st === "pending") {
          return res.status(403).json({ error: "pending_review", message: "Application under review" });
        }
        if (st === "rejected") {
          return res.status(403).json({ error: "not_approved", message: "Application not approved" });
        }
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const hash = String(trow.password_hash || "");
      const user = await this.getUserByEmail(email);
      let valid = false;
      if (hash && bcrypt.compareSync(password, hash)) valid = true;
      else if (user?.password && bcrypt.compareSync(password, user.password)) valid = true;
      if (!valid) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      if (!user || toUserRole(user.role) !== "admin") {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      const suspended = user.suspended === true || user.suspended === "t";
      if (suspended) {
        return res.status(403).json({
          error: "suspended",
          message: "Your account has been suspended. Please contact support."
        });
      }

      const mustChange = trow.must_change_password === true;
      const token = this.authService.sign({
        id: user.id,
        email: user.email,
        role: "admin",
        trainer_id: user.trainer_id || null,
        must_change_password: mustChange || undefined
      });

      return res.json({
        id: user.id,
        email: user.email,
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        profile_picture: user.profile_picture || "",
        role: "admin",
        country: user.country || "",
        timezone: user.timezone || "",
        trainer_id: user.trainer_id || null,
        must_change_password: mustChange,
        token
      });
    } catch (e: any) {
      console.error("[auth/trainer/login]", e?.message || e);
      return res.status(500).json({ error: "Server error. Please try again." });
    }
  }

  @Post("trainer/change-password")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  async trainerChangePassword(
    @Body() body: { new_password?: string },
    @Req() req: any,
    @Res() res: Response
  ) {
    if (!this.pool) return res.status(503).json({ error: "database_unconfigured" });
    const newPassword = String(body?.new_password || "");
    if (newPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }
    if (!/[A-Z]/.test(newPassword)) {
      return res.status(400).json({ error: "Password must include at least one uppercase letter" });
    }
    if (!/\d/.test(newPassword)) {
      return res.status(400).json({ error: "Password must include at least one number" });
    }
    const id = String(req.user?.id || "");
    const user = await this.getUserById(id);
    if (!user) return res.status(401).json({ error: "User not found" });
    const emailNorm = String(user.email || "").trim().toLowerCase();
    try {
      await ensureTrainersTableQueries(this.pool);
      const hash = bcrypt.hashSync(newPassword, 10);
      await this.pool.query(
        `UPDATE trainers SET password_hash = $1, temp_password = NULL, must_change_password = FALSE
         WHERE LOWER(TRIM(email)) = $2 AND status = 'approved'`,
        [hash, emailNorm]
      );
      await this.pool.query(`UPDATE users SET password = $1 WHERE id = $2`, [hash, id]);
      const token = this.authService.sign({
        id: user.id,
        email: user.email,
        role: "admin",
        trainer_id: user.trainer_id || null
      });
      return res.json({ success: true, token });
    } catch (e: any) {
      console.error("[auth/trainer/change-password]", e?.message || e);
      return res.status(500).json({ error: "Failed to update password" });
    }
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: any) {
    if (!this.pool) {
      throw new UnauthorizedException("Database is not configured");
    }
    const id = String(req.user?.id || "");
    if (!id) throw new UnauthorizedException("Invalid token");
    const user = await this.getUserById(id);
    if (!user) throw new UnauthorizedException("User not found");
    const role = toUserRole(user.role);
    let must_change_password = false;
    if (role === "admin") {
      must_change_password = await this.trainerMustChangePassword(String(user.email || "").trim().toLowerCase());
    }
    return { ...user, must_change_password };
  }
}
