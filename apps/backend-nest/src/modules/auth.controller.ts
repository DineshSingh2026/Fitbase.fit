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
import { Pool } from "pg";
import * as bcrypt from "bcryptjs";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import type { Response } from "express";

@Controller("api/auth")
export class AuthController {
  constructor(
    @Inject("PG_POOL") private readonly pool: Pool | null,
    private readonly authService: AuthService
  ) {}

  @Post("login")
  async login(
    @Body() body: { email?: string; password?: string },
    @Res() res: Response
  ) {
    if (!this.pool) {
      return res.status(500).json({ error: "Server error. Please try again." });
    }

    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "").trim();
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }
    try {
      const userRes = await this.pool.query(
        `SELECT id, email, password, first_name, last_name, profile_picture, role, country, timezone, trainer_id, approval_status, suspended
         FROM users
         WHERE LOWER(email) = $1
         LIMIT 1`,
        [email]
      );
      const user = userRes.rows[0];
      if (!user) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const suspended = user.suspended === true || user.suspended === "t";
      if (suspended) {
        return res.status(403).json({
          error: "suspended",
          message: "Your account has been suspended. Please contact support."
        });
      }

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

      if (!user.password || !bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const token = this.authService.sign({
        id: user.id,
        email: user.email,
        role: user.role,
        trainer_id: user.trainer_id || null
      });

      return res.json({
        id: user.id,
        email: user.email,
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        profile_picture: user.profile_picture || "",
        role: user.role,
        country: user.country || "",
        timezone: user.timezone || "",
        trainer_id: user.trainer_id || null,
        token
      });
    } catch {
      return res.status(500).json({ error: "Server error. Please try again." });
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
    const userRes = await this.pool.query(
      `SELECT id, email, first_name, last_name, profile_picture, role, country, timezone, trainer_id
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [id]
    );
    const user = userRes.rows[0];
    if (!user) throw new UnauthorizedException("User not found");
    return user;
  }
}
