import { Body, Controller, Get, Inject, Param, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { Pool } from "pg";
import { randomUUID } from "crypto";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { PushNotificationService } from "./push-notification.service";

/** Client ↔ trainer threads use user_id = client. Trainer ↔ superadmin uses user_id = trainer + thread_kind = ops. */
const KIND_CLIENT = "client";
const KIND_OPS = "ops";

@Controller("api")
@UseGuards(JwtAuthGuard)
export class MessageThreadsController {
  constructor(
    @Inject("PG_POOL") private readonly pool: Pool | null,
    private readonly pushNotifications: PushNotificationService
  ) {}

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
    await this.pool.query(`ALTER TABLE message_threads ADD COLUMN IF NOT EXISTS thread_kind text DEFAULT '${KIND_CLIENT}'`);
    await this.pool.query(
      `UPDATE message_threads SET thread_kind = $1 WHERE thread_kind IS NULL OR thread_kind = ''`,
      [KIND_CLIENT]
    );
    await this.pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS message_threads_ops_trainer_unique ON message_threads (user_id) WHERE thread_kind = '${KIND_OPS}'`
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
      `CREATE INDEX IF NOT EXISTS message_threads_kind_idx ON message_threads (thread_kind, updated_at DESC)`
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

  private threadKind(thread: { thread_kind?: string } | null): string {
    const k = String(thread?.thread_kind || KIND_CLIENT).trim();
    return k === KIND_OPS ? KIND_OPS : KIND_CLIENT;
  }

  private async ensureOpsThreadForTrainer(trainerUserId: string): Promise<string> {
    if (!this.pool) throw new Error("Database unavailable");
    const rows = await this.safeRows(
      `SELECT id FROM message_threads WHERE user_id = $1::uuid AND thread_kind = $2 LIMIT 1`,
      [trainerUserId, KIND_OPS]
    );
    if (rows[0]?.id) return String(rows[0].id);
    const id = randomUUID();
    await this.pool.query(
      `INSERT INTO message_threads (id, user_id, subject, thread_kind) VALUES ($1, $2::uuid, $3, $4)`,
      [id, trainerUserId, "", KIND_OPS]
    );
    return id;
  }

  private async assertThreadAccess(req: any, thread: any): Promise<{ ok: boolean; status?: number; error?: string }> {
    const role = String(req.user?.role || "");
    const uid = String(req.user?.id || "");
    const kind = this.threadKind(thread);

    if (role === "user") {
      if (kind !== KIND_CLIENT || String(thread.user_id) !== uid) {
        return { ok: false, status: 403, error: "Access denied" };
      }
      return { ok: true };
    }

    if (role === "superadmin") {
      if (kind !== KIND_OPS) {
        return { ok: false, status: 403, error: "Super admin can only access trainer conversations" };
      }
      return { ok: true };
    }

    if (role === "admin") {
      if (kind === KIND_OPS) {
        if (String(thread.user_id) !== uid) return { ok: false, status: 403, error: "Access denied" };
        return { ok: true };
      }
      const scoped = await this.safeRows(
        "SELECT id FROM users WHERE id = $1::uuid AND role = 'user' AND trainer_id::text = $2::text LIMIT 1",
        [thread.user_id, uid]
      );
      if (!scoped[0]) return { ok: false, status: 403, error: "Access denied" };
      return { ok: true };
    }

    return { ok: false, status: 403, error: "Access denied" };
  }

  /** Must be registered before routes like threads/:id that could capture path segments. */
  @Post("threads/ops/open")
  async openOpsThread(@Req() req: any, @Body() body: { trainer_user_id?: string }, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Database unavailable" });
    try {
      await this.ensureThreadTables();
      const role = String(req.user?.role || "");
      let trainerUserId = "";
      if (role === "admin") {
        trainerUserId = String(req.user?.id || "");
      } else if (role === "superadmin") {
        trainerUserId = String(body?.trainer_user_id || "").trim();
        if (!trainerUserId) return res.status(400).json({ error: "trainer_user_id required" });
        const tr = await this.safeRows(
          "SELECT id FROM users WHERE id = $1::uuid AND role = 'admin' LIMIT 1",
          [trainerUserId]
        );
        if (!tr[0]) return res.status(404).json({ error: "Trainer not found" });
      } else {
        return res.status(403).json({ error: "Forbidden" });
      }
      const threadId = await this.ensureOpsThreadForTrainer(trainerUserId);
      const urows = await this.safeRows(
        "SELECT id, first_name, last_name, email FROM users WHERE id = $1::uuid LIMIT 1",
        [trainerUserId]
      );
      const u = urows[0] || {};
      const last = await this.safeRows(
        "SELECT body FROM thread_messages WHERE thread_id = $1::uuid ORDER BY created_at DESC LIMIT 1",
        [threadId]
      );
      return res.json({
        id: threadId,
        user_id: trainerUserId,
        thread_kind: KIND_OPS,
        first_name: u.first_name,
        last_name: u.last_name,
        email: u.email,
        last_message: last[0]?.body ?? null
      });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Failed to open conversation" });
    }
  }

  @Get("threads")
  async listThreads(@Req() req: any, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Database unavailable" });
    try {
      await this.ensureThreadTables();
      const role = String(req.user?.role || "");

      if (role === "superadmin") {
        const rows = await this.safeRows(
          `SELECT u.id::text AS trainer_user_id, u.first_name, u.last_name, u.email,
                  t.id AS id, t.created_at, t.updated_at,
                  (SELECT body FROM thread_messages WHERE thread_id = t.id ORDER BY created_at DESC LIMIT 1) AS last_message
           FROM users u
           LEFT JOIN message_threads t ON t.user_id::text = u.id::text AND t.thread_kind = $1
           WHERE u.role = 'admin' AND COALESCE(u.suspended, false) = false
           ORDER BY COALESCE(t.updated_at, u.created_at) DESC NULLS LAST`,
          [KIND_OPS]
        );
        const mapped = rows.map((r: any) => ({
          id: r.id || null,
          user_id: r.trainer_user_id,
          trainer_user_id: r.trainer_user_id,
          thread_kind: KIND_OPS,
          first_name: r.first_name,
          last_name: r.last_name,
          email: r.email,
          last_message: r.last_message,
          created_at: r.created_at,
          updated_at: r.updated_at
        }));
        return res.json(mapped);
      }

      if (role === "admin") {
        const trainerId = String(req.user.id || "");
        const opsId = await this.ensureOpsThreadForTrainer(trainerId);
        const sa = await this.safeRows(
          "SELECT first_name, last_name FROM users WHERE role = 'superadmin' ORDER BY created_at ASC LIMIT 1"
        );
        const opsLast = await this.safeRows(
          "SELECT body FROM thread_messages WHERE thread_id = $1::uuid ORDER BY created_at DESC LIMIT 1",
          [opsId]
        );
        const opsRow = {
          id: opsId,
          user_id: trainerId,
          thread_kind: KIND_OPS,
          first_name: sa[0]?.first_name || "Super",
          last_name: sa[0]?.last_name || "Admin",
          email: null as string | null,
          last_message: opsLast[0]?.body ?? null
        };
        const clientRows = await this.safeRows(
          `SELECT * FROM (
             SELECT DISTINCT ON (t.user_id)
               t.id, t.user_id, t.subject, t.thread_kind, t.created_at, t.updated_at,
               u.first_name, u.last_name, u.email,
               (SELECT body FROM thread_messages WHERE thread_id = t.id ORDER BY created_at DESC LIMIT 1) AS last_message
             FROM message_threads t
             LEFT JOIN users u ON u.id::text = t.user_id::text
             WHERE (t.thread_kind = $2 OR t.thread_kind IS NULL)
             AND u.trainer_id::text = $1::text
             ORDER BY t.user_id, t.updated_at DESC
           ) sub
           ORDER BY updated_at DESC`,
          [trainerId, KIND_CLIENT]
        );
        return res.json([opsRow, ...clientRows]);
      }

      const rows = await this.safeRows(
        `SELECT t.id, t.user_id, t.subject, t.thread_kind, t.created_at, t.updated_at,
                (SELECT body FROM thread_messages WHERE thread_id = t.id ORDER BY created_at DESC LIMIT 1) AS last_message,
                coach.first_name AS trainer_first_name,
                coach.last_name AS trainer_last_name,
                coach.email AS trainer_email
         FROM message_threads t
         LEFT JOIN users client ON client.id::text = t.user_id::text
         LEFT JOIN users coach ON coach.id::text = client.trainer_id::text
         WHERE t.user_id = $1::uuid AND (t.thread_kind = $2 OR t.thread_kind IS NULL)
         ORDER BY t.updated_at DESC
         LIMIT 1`,
        [req.user?.id, KIND_CLIENT]
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
        return res.status(403).json({ error: "Only clients can start this conversation" });
      }
      const existing = await this.safeRows(
        `SELECT id, user_id, subject, thread_kind, created_at, updated_at FROM message_threads
         WHERE user_id = $1::uuid AND (thread_kind = $2 OR thread_kind IS NULL)
         ORDER BY updated_at DESC LIMIT 1`,
        [req.user.id, KIND_CLIENT]
      );
      let thread = existing[0];
      if (!thread) {
        const id = randomUUID();
        await this.pool.query(
          `INSERT INTO message_threads (id, user_id, subject, thread_kind) VALUES ($1, $2::uuid, $3, $4)`,
          [id, req.user.id, "", KIND_CLIENT]
        );
        thread = { id, user_id: req.user.id, subject: "", thread_kind: KIND_CLIENT };
      }
      const first = String(body?.first_message || "").trim();
      if (first) {
        await this.pool.query(
          "INSERT INTO thread_messages (id, thread_id, sender_id, sender_role, body) VALUES ($1, $2::uuid, $3::uuid, $4, $5)",
          [randomUUID(), thread.id, req.user.id, "user", first.slice(0, 5000)]
        );
        await this.pool.query("UPDATE message_threads SET updated_at = now() WHERE id = $1::uuid", [thread.id]);
      }
      const fresh = await this.safeRows(
        `SELECT t.id, t.user_id, t.subject, t.thread_kind, t.created_at, t.updated_at,
                (SELECT body FROM thread_messages WHERE thread_id = t.id ORDER BY created_at DESC LIMIT 1) AS last_message,
                coach.first_name AS trainer_first_name,
                coach.last_name AS trainer_last_name,
                coach.email AS trainer_email
         FROM message_threads t
         LEFT JOIN users client ON client.id::text = t.user_id::text
         LEFT JOIN users coach ON coach.id::text = client.trainer_id::text
         WHERE t.id = $1::uuid
         LIMIT 1`,
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
      const rows = await this.safeRows("SELECT * FROM message_threads WHERE id = $1::uuid LIMIT 1", [id]);
      const thread = rows[0];
      if (!thread) return res.status(404).json({ error: "Conversation not found" });
      const gate = await this.assertThreadAccess(req, thread);
      if (!gate.ok) return res.status(gate.status || 403).json({ error: gate.error || "Access denied" });
      const kind = this.threadKind(thread);
      if (kind === KIND_CLIENT) {
        const userRows = await this.safeRows(
          "SELECT id, first_name, last_name, email FROM users WHERE id = $1::uuid LIMIT 1",
          [thread.user_id]
        );
        thread.user = userRows[0] || null;
      } else {
        const userRows = await this.safeRows(
          "SELECT id, first_name, last_name, email FROM users WHERE id = $1::uuid LIMIT 1",
          [thread.user_id]
        );
        thread.trainer = userRows[0] || null;
      }
      thread.thread_kind = kind;
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
      const tRows = await this.safeRows("SELECT * FROM message_threads WHERE id = $1::uuid LIMIT 1", [id]);
      const thread = tRows[0];
      if (!thread) return res.status(404).json({ error: "Conversation not found" });
      const gate = await this.assertThreadAccess(req, thread);
      if (!gate.ok) return res.status(gate.status || 403).json({ error: gate.error || "Access denied" });
      const rows = await this.safeRows(
        "SELECT id, thread_id, sender_id, sender_role, body, created_at FROM thread_messages WHERE thread_id = $1::uuid ORDER BY created_at ASC",
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
      const tRows = await this.safeRows("SELECT * FROM message_threads WHERE id = $1::uuid LIMIT 1", [id]);
      const thread = tRows[0];
      if (!thread) return res.status(404).json({ error: "Conversation not found" });
      const gate = await this.assertThreadAccess(req, thread);
      if (!gate.ok) return res.status(gate.status || 403).json({ error: gate.error || "Access denied" });
      const role = String(req.user?.role || "");
      let senderRole = "user";
      if (role === "superadmin") senderRole = "superadmin";
      else if (role === "admin") senderRole = "admin";
      const msgId = randomUUID();
      await this.pool.query(
        "INSERT INTO thread_messages (id, thread_id, sender_id, sender_role, body) VALUES ($1, $2::uuid, $3::uuid, $4, $5)",
        [msgId, id, req.user?.id, senderRole, txt.slice(0, 5000)]
      );
      await this.pool.query("UPDATE message_threads SET updated_at = now() WHERE id = $1::uuid", [id]);
      const saved = await this.safeRows(
        "SELECT id, thread_id, sender_id, sender_role, body, created_at FROM thread_messages WHERE id = $1::uuid LIMIT 1",
        [msgId]
      );
      void this.pushNotifyChatRecipients(thread, senderRole, txt, id);
      return res.status(201).json(saved[0] || { id: msgId });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Failed to send message" });
    }
  }

  private async pushNotifyChatRecipients(thread: any, senderRole: string, text: string, threadId: string): Promise<void> {
    if (!this.pool || !this.pushNotifications.isConfigured()) return;
    const preview = text.slice(0, 140);
    const url = "/dashboard";
    const tag = `thread-${threadId}`;
    try {
      const kind = this.threadKind(thread);
      if (kind === KIND_CLIENT) {
        const clientId = String(thread.user_id);
        if (senderRole === "user") {
          const r = await this.pool.query("SELECT trainer_id FROM users WHERE id = $1::uuid LIMIT 1", [clientId]);
          const tid = r.rows[0]?.trainer_id;
          if (tid) {
            await this.pushNotifications.sendToUser(String(tid), {
              title: "New client message",
              body: preview,
              url,
              tag,
              badgeCount: 1
            });
          }
        } else {
          await this.pushNotifications.sendToUser(clientId, {
            title: "New message from your coach",
            body: preview,
            url,
            tag,
            badgeCount: 1
          });
        }
      } else {
        const trainerId = String(thread.user_id);
        if (senderRole === "superadmin") {
          await this.pushNotifications.sendToUser(trainerId, {
            title: "Super Admin replied",
            body: preview,
            url,
            tag,
            badgeCount: 1
          });
        } else if (senderRole === "admin") {
          const sas = await this.pool.query("SELECT id FROM users WHERE role = $1", ["superadmin"]);
          for (const row of sas.rows || []) {
            await this.pushNotifications.sendToUser(String(row.id), {
              title: "Trainer message",
              body: preview,
              url,
              tag,
              badgeCount: 1
            });
          }
        }
      }
    } catch {
      /* non-fatal */
    }
  }
}
