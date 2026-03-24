import { Body, Controller, Get, Inject, Param, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { Pool } from "pg";
import { randomUUID } from "crypto";
import { JwtAuthGuard } from "./jwt-auth.guard";

@Controller("api")
@UseGuards(JwtAuthGuard)
export class MessageThreadsController {
  constructor(@Inject("PG_POOL") private readonly pool: Pool | null) {}

  private async ensureThreadTables() {
    if (!this.pool) return;
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS message_threads (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL,
        subject text DEFAULT '',
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      )`
    );
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS thread_messages (
        id uuid PRIMARY KEY,
        thread_id uuid NOT NULL,
        sender_id uuid,
        sender_role text NOT NULL,
        body text NOT NULL,
        created_at timestamptz DEFAULT now()
      )`
    );
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS message_threads_user_idx ON message_threads (user_id, updated_at DESC)`
    );
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS thread_messages_thread_idx ON thread_messages (thread_id, created_at ASC)`
    );
  }

  private async safeRows(sql: string, params: any[] = []) {
    if (!this.pool) return [];
    try {
      const r = await this.pool.query(sql, params);
      return r.rows || [];
    } catch (e: any) {
      if (e?.code === "42P01" || e?.code === "42703") return [];
      throw e;
    }
  }

  @Get("threads")
  async listThreads(@Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Database unavailable" });
    try {
      await this.ensureThreadTables();
      const role = String(req.user?.role || "");
      const isAdmin = role === "admin" || role === "superadmin";
      if (isAdmin) {
        const trainerId = role === "admin" ? String(req.user.id || "") : null;
        const rows = await this.safeRows(
          `SELECT * FROM (
             SELECT DISTINCT ON (t.user_id)
               t.id, t.user_id, t.subject, t.created_at, t.updated_at,
               u.first_name, u.last_name, u.email,
               (SELECT body FROM thread_messages WHERE thread_id = t.id ORDER BY created_at DESC LIMIT 1) AS last_message
             FROM message_threads t
             LEFT JOIN users u ON u.id::text = t.user_id::text
             WHERE ($1::text IS NULL OR u.trainer_id = $2)
             ORDER BY t.user_id, t.updated_at DESC
           ) sub
           ORDER BY created_at ASC`,
          [trainerId, trainerId]
        );
        return res.json(rows);
      }
      const rows = await this.safeRows(
        `SELECT t.id, t.user_id, t.subject, t.created_at, t.updated_at,
                (SELECT body FROM thread_messages WHERE thread_id = t.id ORDER BY created_at DESC LIMIT 1) AS last_message
         FROM message_threads t
         WHERE t.user_id = $1
         ORDER BY t.updated_at DESC
         LIMIT 1`,
        [req.user?.id]
      );
      return res.json(rows);
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Failed to load conversations" });
    }
  }

  @Post("threads")
  async createThread(@Req() req: any, @Body() body: { first_message?: string }, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Database unavailable" });
    try {
      await this.ensureThreadTables();
      if (String(req.user?.role || "") !== "user") {
        return res.status(403).json({ error: "Only users can start conversations" });
      }
      const existing = await this.safeRows(
        "SELECT id, user_id, subject, created_at, updated_at FROM message_threads WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1",
        [req.user.id]
      );
      let thread = existing[0];
      if (!thread) {
        const id = randomUUID();
        await this.pool.query(
          "INSERT INTO message_threads (id, user_id, subject) VALUES ($1, $2, $3)",
          [id, req.user.id, ""]
        );
        thread = { id, user_id: req.user.id, subject: "" };
      }
      const first = String(body?.first_message || "").trim();
      if (first) {
        await this.pool.query(
          "INSERT INTO thread_messages (id, thread_id, sender_id, sender_role, body) VALUES ($1, $2, $3, $4, $5)",
          [randomUUID(), thread.id, req.user.id, "user", first.slice(0, 5000)]
        );
        await this.pool.query("UPDATE message_threads SET updated_at = now() WHERE id = $1", [thread.id]);
      }
      const fresh = await this.safeRows(
        "SELECT id, user_id, subject, created_at, updated_at FROM message_threads WHERE id = $1 LIMIT 1",
        [thread.id]
      );
      return res.status(existing[0] ? 200 : 201).json(fresh[0] || thread);
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Failed to create conversation" });
    }
  }

  @Get("threads/:id")
  async getThread(@Req() req: any, @Param("id") id: string, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Database unavailable" });
    try {
      await this.ensureThreadTables();
      const rows = await this.safeRows("SELECT * FROM message_threads WHERE id = $1 LIMIT 1", [id]);
      const thread = rows[0];
      if (!thread) return res.status(404).json({ error: "Conversation not found" });
      const role = String(req.user?.role || "");
      const isAdmin = role === "admin" || role === "superadmin";
      if (!isAdmin && String(thread.user_id) !== String(req.user?.id)) {
        return res.status(403).json({ error: "Access denied" });
      }
      if (isAdmin) {
        const userRows = await this.safeRows(
          "SELECT id, first_name, last_name, email FROM users WHERE id = $1 LIMIT 1",
          [thread.user_id]
        );
        thread.user = userRows[0] || null;
      }
      return res.json(thread);
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Failed to load conversation" });
    }
  }

  @Get("threads/:id/messages")
  async getThreadMessages(@Req() req: any, @Param("id") id: string, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Database unavailable" });
    try {
      await this.ensureThreadTables();
      const tRows = await this.safeRows("SELECT * FROM message_threads WHERE id = $1 LIMIT 1", [id]);
      const thread = tRows[0];
      if (!thread) return res.status(404).json({ error: "Conversation not found" });
      const role = String(req.user?.role || "");
      const isAdmin = role === "admin" || role === "superadmin";
      if (!isAdmin && String(thread.user_id) !== String(req.user?.id)) {
        return res.status(403).json({ error: "Access denied" });
      }
      if (role === "admin") {
        const scoped = await this.safeRows(
          "SELECT id FROM users WHERE id = $1 AND trainer_id = $2 LIMIT 1",
          [thread.user_id, req.user.id]
        );
        if (!scoped[0]) return res.status(403).json({ error: "Access denied" });
      }
      const rows = await this.safeRows(
        "SELECT id, thread_id, sender_id, sender_role, body, created_at FROM thread_messages WHERE thread_id = $1 ORDER BY created_at ASC",
        [id]
      );
      return res.json(rows);
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Failed to load messages" });
    }
  }

  @Post("threads/:id/messages")
  async sendMessage(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { body?: string },
    @Res() res: Response
  ) {
    if (!this.pool) return res.status(500).json({ error: "Database unavailable" });
    try {
      await this.ensureThreadTables();
      const txt = String(body?.body || "").trim();
      if (!txt) return res.status(400).json({ error: "Message body required" });
      const tRows = await this.safeRows("SELECT * FROM message_threads WHERE id = $1 LIMIT 1", [id]);
      const thread = tRows[0];
      if (!thread) return res.status(404).json({ error: "Conversation not found" });
      const role = String(req.user?.role || "");
      const isAdmin = role === "admin" || role === "superadmin";
      if (!isAdmin && String(thread.user_id) !== String(req.user?.id)) {
        return res.status(403).json({ error: "Access denied" });
      }
      if (role === "admin") {
        const scoped = await this.safeRows(
          "SELECT id FROM users WHERE id = $1 AND trainer_id = $2 LIMIT 1",
          [thread.user_id, req.user.id]
        );
        if (!scoped[0]) return res.status(403).json({ error: "Access denied" });
      }
      const msgId = randomUUID();
      const senderRole = isAdmin ? "admin" : "user";
      await this.pool.query(
        "INSERT INTO thread_messages (id, thread_id, sender_id, sender_role, body) VALUES ($1, $2, $3, $4, $5)",
        [msgId, id, req.user?.id, senderRole, txt.slice(0, 5000)]
      );
      await this.pool.query("UPDATE message_threads SET updated_at = now() WHERE id = $1", [id]);
      const saved = await this.safeRows(
        "SELECT id, thread_id, sender_id, sender_role, body, created_at FROM thread_messages WHERE id = $1 LIMIT 1",
        [msgId]
      );
      return res.status(201).json(saved[0] || { id: msgId });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Failed to send message" });
    }
  }
}
