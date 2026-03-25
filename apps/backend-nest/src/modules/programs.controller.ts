import { Body, Controller, Delete, Get, Inject, Param, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { Pool } from "pg";
import { normalizeRoleString } from "./auth-role.util";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { Roles } from "./roles.decorator";
import { RolesGuard } from "./roles.guard";
import { randomUUID } from "crypto";
import * as jwt from "jsonwebtoken";
import { createReadStream, existsSync, statSync } from "fs";
import { join } from "path";
import { PushNotificationService } from "./push-notification.service";

function isAdmin(user: any): boolean {
  return normalizeRoleString(user?.role) === "admin";
}

function isSuperadmin(user: any): boolean {
  return normalizeRoleString(user?.role) === "superadmin";
}

@Controller("api")
export class ProgramsController {
  constructor(
    @Inject("PG_POOL") private readonly pool: Pool | null,
    private readonly push: PushNotificationService
  ) {}

  /** Postgres on Render often has no programs tables until first use (Express SQLite had its own bootstrap). */
  private async ensureProgramsSchema(): Promise<void> {
    if (!this.pool) return;
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS programs (
        id text PRIMARY KEY,
        name text NOT NULL,
        pdf_url text NOT NULL DEFAULT '',
        image_url text,
        youtube_url text DEFAULT '',
        sort_order int DEFAULT 0,
        created_at timestamptz DEFAULT now()
      )
    `);
    await this.pool.query(`ALTER TABLE programs ADD COLUMN IF NOT EXISTS image_url text`);
    await this.pool.query(`ALTER TABLE programs ADD COLUMN IF NOT EXISTS youtube_url text`);
    await this.pool.query(`ALTER TABLE programs ADD COLUMN IF NOT EXISTS sort_order int DEFAULT 0`);
    await this.pool.query(`ALTER TABLE programs ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now()`);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS user_program_assignments (
        id uuid PRIMARY KEY,
        user_id text NOT NULL,
        program_id text NOT NULL,
        assigned_by text,
        assigned_at timestamptz DEFAULT now(),
        removed_at timestamptz,
        seen_at timestamptz
      )
    `);
    await this.pool.query(`ALTER TABLE user_program_assignments ADD COLUMN IF NOT EXISTS seen_at timestamptz`);
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS idx_user_program_assignments_user ON user_program_assignments(user_id)`
    );
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS idx_user_program_assignments_program ON user_program_assignments(program_id)`
    );
  }

  private get jwtSecret(): string {
    return process.env.JWT_SECRET || "fitbase-progress-secret-change-in-production";
  }

  private async trainerCanAccessClient(reqUser: any, clientUserId: string): Promise<boolean> {
    if (!this.pool) return false;
    if (isSuperadmin(reqUser)) return true;
    if (!isAdmin(reqUser)) return false;
    const row = await this.pool.query(
      "SELECT id FROM users WHERE id = $1 AND role = 'user' AND trainer_id = $2 LIMIT 1",
      [clientUserId, reqUser.id]
    );
    return !!row.rows[0];
  }

  @Delete("inbox/:id")
  @UseGuards(JwtAuthGuard)
  async markInboxRead(@Param("id") id: string, @Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Database unavailable" });
    try {
      const rawId = String(id || "").replace(/^inbox-/, "");
      await this.pool.query("UPDATE user_inbox SET is_read = TRUE WHERE id = $1 AND user_id = $2", [
        rawId,
        req.user.id
      ]);
      return res.json({ ok: true });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Failed" });
    }
  }

  @Delete("inbox")
  @UseGuards(JwtAuthGuard)
  async markAllInboxRead(@Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Database unavailable" });
    try {
      await this.pool.query(
        "UPDATE user_inbox SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE",
        [req.user.id]
      );
      return res.json({ ok: true });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Failed" });
    }
  }

  @Get("programs-legacy")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "superadmin")
  async programsLegacy(@Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Database unavailable" });
    try {
      await this.ensureProgramsSchema();
      const rows = await this.pool.query(
        "SELECT id, name, pdf_url, image_url, youtube_url, sort_order FROM programs ORDER BY sort_order, name"
      );
      return res.json(rows.rows);
    } catch (e: any) {
      if (e?.code === "42P01" || e?.code === "42703") return res.json([]);
      console.error("[programs-legacy]", e?.code, e?.message);
      return res.json([]);
    }
  }

  @Get("admin/program-catalog")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "superadmin")
  async programCatalog(@Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Database unavailable" });
    try {
      await this.ensureProgramsSchema();
      const rows = await this.pool.query("SELECT id, name, pdf_url FROM programs ORDER BY name");
      return res.json(rows.rows);
    } catch (e: any) {
      if (e?.code === "42P01" || e?.code === "42703") return res.json([]);
      console.error("[program-catalog]", e?.code, e?.message);
      return res.json([]);
    }
  }

  @Get("programs/user/:userId")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "superadmin")
  async programsByUser(@Param("userId") userId: string, @Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Database unavailable" });
    try {
      await this.ensureProgramsSchema();
      if (!(await this.trainerCanAccessClient(req.user, userId))) {
        return res.status(403).json({ error: "Access denied" });
      }
      const rows = await this.pool.query(
        `SELECT a.id, a.user_id, a.program_id, a.assigned_by, a.assigned_at, a.removed_at,
                p.name as program_name, p.pdf_url, p.youtube_url
         FROM user_program_assignments a
         JOIN programs p ON p.id = a.program_id
         WHERE a.user_id = $1
         ORDER BY a.removed_at IS NULL DESC, a.assigned_at DESC`,
        [userId]
      );
      const users = await this.pool.query(
        "SELECT id, first_name, last_name, email FROM users WHERE id::text IN (SELECT DISTINCT assigned_by FROM user_program_assignments WHERE assigned_by IS NOT NULL)"
      );
      const userMap: Record<string, string> = {};
      users.rows.forEach((u: any) => {
        userMap[u.id] = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email;
      });
      const out = rows.rows.map((r: any) => ({
        id: r.id,
        user_id: r.user_id,
        program_id: r.program_id,
        program_name: r.program_name,
        pdf_url: r.pdf_url,
        youtube_url: r.youtube_url,
        assigned_by: r.assigned_by,
        assigned_by_name: userMap[r.assigned_by] || "—",
        assigned_at: r.assigned_at,
        removed_at: r.removed_at,
        is_active: !r.removed_at
      }));
      return res.json(out);
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Failed" });
    }
  }

  @Post("programs/assign")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "superadmin")
  async assignProgram(
    @Body() body: { user_id?: string; program_id?: string },
    @Req() req: any,
    @Res() res: Response
  ) {
    if (!this.pool) return res.status(500).json({ error: "Database unavailable" });
    try {
      await this.ensureProgramsSchema();
      const userId = String(body?.user_id || "");
      const programId = String(body?.program_id || "");
      if (!userId || !programId) return res.status(400).json({ error: "user_id and program_id required" });
      if (!(await this.trainerCanAccessClient(req.user, userId))) {
        return res.status(403).json({ error: "Access denied" });
      }
      const activeCount = await this.pool.query(
        "SELECT COUNT(*)::int as c FROM user_program_assignments WHERE user_id = $1 AND removed_at IS NULL",
        [userId]
      );
      if (Number(activeCount.rows[0]?.c || 0) >= 4) {
        return res.status(400).json({ error: "User already has maximum 4 programs assigned" });
      }
      const existing = await this.pool.query(
        "SELECT id FROM user_program_assignments WHERE user_id = $1 AND program_id = $2 AND removed_at IS NULL LIMIT 1",
        [userId, programId]
      );
      if (existing.rows[0]) {
        return res.status(400).json({ error: "This program is already assigned to the user" });
      }
      const id = randomUUID();
      await this.pool.query(
        "INSERT INTO user_program_assignments (id, user_id, program_id, assigned_by) VALUES ($1, $2, $3, $4)",
        [id, userId, programId, req.user.id]
      );
      const pn = await this.pool.query("SELECT name FROM programs WHERE id = $1 LIMIT 1", [programId]);
      const pname = String(pn.rows[0]?.name || "Program");
      void this.push.sendToUser(userId, {
        title: "Program assigned",
        body: `Your coach assigned "${pname.slice(0, 80)}"`,
        url: "/dashboard",
        tag: `program-${id}`,
        badgeCount: 1
      });
      return res.json({ id });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Failed" });
    }
  }

  @Delete("programs/assign/:id")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "superadmin")
  async unassignProgram(@Param("id") id: string, @Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Database unavailable" });
    try {
      const assignment = await this.pool.query(
        `SELECT a.id, a.user_id, u.trainer_id
         FROM user_program_assignments a
         LEFT JOIN users u ON u.id::text = a.user_id::text
         WHERE a.id = $1`,
        [id]
      );
      const row = assignment.rows[0];
      if (!row) return res.status(404).json({ error: "Assignment not found" });
      if (isAdmin(req.user) && row.trainer_id !== req.user.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      await this.pool.query(
        "UPDATE user_program_assignments SET removed_at = CURRENT_TIMESTAMP WHERE id = $1 AND removed_at IS NULL",
        [id]
      );
      return res.json({ ok: true });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Failed" });
    }
  }

  @Get("me/programs")
  @UseGuards(JwtAuthGuard)
  async mePrograms(@Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Database unavailable" });
    try {
      const rows = await this.pool.query(
        `SELECT a.id, a.program_id, a.assigned_at, p.name, p.pdf_url, p.image_url, p.youtube_url
         FROM user_program_assignments a
         JOIN programs p ON p.id = a.program_id
         WHERE a.user_id = $1 AND a.removed_at IS NULL
         ORDER BY a.assigned_at DESC`,
        [req.user.id]
      );
      return res.json(rows.rows);
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Failed" });
    }
  }

  @Get("me/program-assignments/unseen")
  @UseGuards(JwtAuthGuard)
  async meProgramUnseen(@Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json([]);
    try {
      const rows = await this.pool.query(
        `SELECT a.id, p.name
         FROM user_program_assignments a
         JOIN programs p ON p.id = a.program_id
         WHERE a.user_id = $1 AND a.removed_at IS NULL AND a.seen_at IS NULL
         ORDER BY a.assigned_at DESC`,
        [req.user.id]
      );
      return res.json(rows.rows);
    } catch {
      return res.status(500).json([]);
    }
  }

  @Post("me/program-assignments/:id/seen")
  @UseGuards(JwtAuthGuard)
  async meProgramSeen(@Param("id") id: string, @Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Database unavailable" });
    try {
      await this.pool.query(
        "UPDATE user_program_assignments SET seen_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2 AND removed_at IS NULL",
        [id, req.user.id]
      );
      return res.json({ ok: true });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Failed" });
    }
  }

  @Post("me/programs/pdf-token")
  @UseGuards(JwtAuthGuard)
  async meProgramPdfToken(@Body() body: { program_id?: string }, @Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Database unavailable" });
    try {
      const programId = String(body?.program_id || "").trim();
      if (!programId) return res.status(400).json({ error: "program_id required" });
      const hasAccess = await this.pool.query(
        "SELECT 1 FROM user_program_assignments a JOIN programs p ON p.id = a.program_id WHERE a.user_id = $1 AND a.program_id = $2 AND a.removed_at IS NULL LIMIT 1",
        [req.user.id, programId]
      );
      if (!hasAccess.rows[0]) {
        return res.status(403).json({ error: "Not authorized to view this program" });
      }
      const token = jwt.sign(
        { programId, userId: req.user.id, purpose: "pdf-view" },
        this.jwtSecret,
        { expiresIn: "10m" }
      );
      const base = (req.protocol + "://" + req.get("host")).replace(/\/$/, "");
      const url =
        base +
        "/api/me/programs/pdf?t=" +
        encodeURIComponent(token) +
        "&f=" +
        encodeURIComponent(programId);
      const viewUrl = base + "/program-viewer.html?url=" + encodeURIComponent(url);
      return res.json({ url, viewUrl });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Failed" });
    }
  }

  @Get("me/programs/pdf")
  async meProgramPdf(@Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Database unavailable" });
    try {
      const token = String(req.query?.t || "");
      const fileParam = String(req.query?.f || "");
      let payload: any = null;
      try {
        payload = jwt.verify(token, this.jwtSecret);
      } catch {
        payload = null;
      }
      if (!payload || payload.purpose !== "pdf-view" || !payload.programId || !payload.userId) {
        return res.status(403).json({ error: "Invalid or expired link" });
      }
      if (payload.programId !== fileParam) {
        return res.status(403).json({ error: "Invalid or expired link" });
      }
      const hasAccess = await this.pool.query(
        "SELECT 1 FROM user_program_assignments WHERE user_id = $1 AND program_id = $2 AND removed_at IS NULL LIMIT 1",
        [payload.userId, fileParam]
      );
      if (!hasAccess.rows[0]) return res.status(403).json({ error: "Not authorized" });

      const filePath = join(process.cwd(), "../../public/programs/pdfs", fileParam);
      if (!existsSync(filePath) || !statSync(filePath).isFile()) {
        return res.status(404).json({ error: "Not found" });
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "inline");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      createReadStream(filePath).pipe(res);
      return;
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Failed" });
    }
  }
}
