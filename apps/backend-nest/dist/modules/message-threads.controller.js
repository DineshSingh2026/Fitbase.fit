"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageThreadsController = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const jwt_auth_guard_1 = require("./jwt-auth.guard");
let MessageThreadsController = class MessageThreadsController {
    constructor(pool) {
        this.pool = pool;
    }
    async ensureThreadTables() {
        if (!this.pool)
            return;
        await this.pool.query(`CREATE TABLE IF NOT EXISTS message_threads (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL,
        subject text DEFAULT '',
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      )`);
        await this.pool.query(`CREATE TABLE IF NOT EXISTS thread_messages (
        id uuid PRIMARY KEY,
        thread_id uuid NOT NULL,
        sender_id uuid,
        sender_role text NOT NULL,
        body text NOT NULL,
        created_at timestamptz DEFAULT now()
      )`);
        await this.pool.query(`CREATE INDEX IF NOT EXISTS message_threads_user_idx ON message_threads (user_id, updated_at DESC)`);
        await this.pool.query(`CREATE INDEX IF NOT EXISTS thread_messages_thread_idx ON thread_messages (thread_id, created_at ASC)`);
    }
    async safeRows(sql, params = []) {
        if (!this.pool)
            return [];
        try {
            const r = await this.pool.query(sql, params);
            return r.rows || [];
        }
        catch (e) {
            if (e?.code === "42P01" || e?.code === "42703")
                return [];
            throw e;
        }
    }
    async listThreads(req, res) {
        if (!this.pool)
            return res.status(500).json({ error: "Database unavailable" });
        try {
            await this.ensureThreadTables();
            const role = String(req.user?.role || "");
            const isAdmin = role === "admin" || role === "superadmin";
            if (isAdmin) {
                const trainerId = role === "admin" ? String(req.user.id || "") : null;
                const rows = await this.safeRows(`SELECT * FROM (
             SELECT DISTINCT ON (t.user_id)
               t.id, t.user_id, t.subject, t.created_at, t.updated_at,
               u.first_name, u.last_name, u.email,
               (SELECT body FROM thread_messages WHERE thread_id = t.id ORDER BY created_at DESC LIMIT 1) AS last_message
             FROM message_threads t
             LEFT JOIN users u ON u.id = t.user_id
             WHERE ($1::text IS NULL OR u.trainer_id = $2)
             ORDER BY t.user_id, t.updated_at DESC
           ) sub
           ORDER BY created_at ASC`, [trainerId, trainerId]);
                return res.json(rows);
            }
            const rows = await this.safeRows(`SELECT t.id, t.user_id, t.subject, t.created_at, t.updated_at,
                (SELECT body FROM thread_messages WHERE thread_id = t.id ORDER BY created_at DESC LIMIT 1) AS last_message
         FROM message_threads t
         WHERE t.user_id = $1
         ORDER BY t.updated_at DESC
         LIMIT 1`, [req.user?.id]);
            return res.json(rows);
        }
        catch (e) {
            return res.status(500).json({ error: e?.message || "Failed to load conversations" });
        }
    }
    async createThread(req, body, res) {
        if (!this.pool)
            return res.status(500).json({ error: "Database unavailable" });
        try {
            await this.ensureThreadTables();
            if (String(req.user?.role || "") !== "user") {
                return res.status(403).json({ error: "Only users can start conversations" });
            }
            const existing = await this.safeRows("SELECT id, user_id, subject, created_at, updated_at FROM message_threads WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1", [req.user.id]);
            let thread = existing[0];
            if (!thread) {
                const id = (0, crypto_1.randomUUID)();
                await this.pool.query("INSERT INTO message_threads (id, user_id, subject) VALUES ($1, $2, $3)", [id, req.user.id, ""]);
                thread = { id, user_id: req.user.id, subject: "" };
            }
            const first = String(body?.first_message || "").trim();
            if (first) {
                await this.pool.query("INSERT INTO thread_messages (id, thread_id, sender_id, sender_role, body) VALUES ($1, $2, $3, $4, $5)", [(0, crypto_1.randomUUID)(), thread.id, req.user.id, "user", first.slice(0, 5000)]);
                await this.pool.query("UPDATE message_threads SET updated_at = now() WHERE id = $1", [thread.id]);
            }
            const fresh = await this.safeRows("SELECT id, user_id, subject, created_at, updated_at FROM message_threads WHERE id = $1 LIMIT 1", [thread.id]);
            return res.status(existing[0] ? 200 : 201).json(fresh[0] || thread);
        }
        catch (e) {
            return res.status(500).json({ error: e?.message || "Failed to create conversation" });
        }
    }
    async getThread(req, id, res) {
        if (!this.pool)
            return res.status(500).json({ error: "Database unavailable" });
        try {
            await this.ensureThreadTables();
            const rows = await this.safeRows("SELECT * FROM message_threads WHERE id = $1 LIMIT 1", [id]);
            const thread = rows[0];
            if (!thread)
                return res.status(404).json({ error: "Conversation not found" });
            const role = String(req.user?.role || "");
            const isAdmin = role === "admin" || role === "superadmin";
            if (!isAdmin && String(thread.user_id) !== String(req.user?.id)) {
                return res.status(403).json({ error: "Access denied" });
            }
            if (isAdmin) {
                const userRows = await this.safeRows("SELECT id, first_name, last_name, email FROM users WHERE id = $1 LIMIT 1", [thread.user_id]);
                thread.user = userRows[0] || null;
            }
            return res.json(thread);
        }
        catch (e) {
            return res.status(500).json({ error: e?.message || "Failed to load conversation" });
        }
    }
    async getThreadMessages(req, id, res) {
        if (!this.pool)
            return res.status(500).json({ error: "Database unavailable" });
        try {
            await this.ensureThreadTables();
            const tRows = await this.safeRows("SELECT * FROM message_threads WHERE id = $1 LIMIT 1", [id]);
            const thread = tRows[0];
            if (!thread)
                return res.status(404).json({ error: "Conversation not found" });
            const role = String(req.user?.role || "");
            const isAdmin = role === "admin" || role === "superadmin";
            if (!isAdmin && String(thread.user_id) !== String(req.user?.id)) {
                return res.status(403).json({ error: "Access denied" });
            }
            if (role === "admin") {
                const scoped = await this.safeRows("SELECT id FROM users WHERE id = $1 AND trainer_id = $2 LIMIT 1", [thread.user_id, req.user.id]);
                if (!scoped[0])
                    return res.status(403).json({ error: "Access denied" });
            }
            const rows = await this.safeRows("SELECT id, thread_id, sender_id, sender_role, body, created_at FROM thread_messages WHERE thread_id = $1 ORDER BY created_at ASC", [id]);
            return res.json(rows);
        }
        catch (e) {
            return res.status(500).json({ error: e?.message || "Failed to load messages" });
        }
    }
    async sendMessage(req, id, body, res) {
        if (!this.pool)
            return res.status(500).json({ error: "Database unavailable" });
        try {
            await this.ensureThreadTables();
            const txt = String(body?.body || "").trim();
            if (!txt)
                return res.status(400).json({ error: "Message body required" });
            const tRows = await this.safeRows("SELECT * FROM message_threads WHERE id = $1 LIMIT 1", [id]);
            const thread = tRows[0];
            if (!thread)
                return res.status(404).json({ error: "Conversation not found" });
            const role = String(req.user?.role || "");
            const isAdmin = role === "admin" || role === "superadmin";
            if (!isAdmin && String(thread.user_id) !== String(req.user?.id)) {
                return res.status(403).json({ error: "Access denied" });
            }
            if (role === "admin") {
                const scoped = await this.safeRows("SELECT id FROM users WHERE id = $1 AND trainer_id = $2 LIMIT 1", [thread.user_id, req.user.id]);
                if (!scoped[0])
                    return res.status(403).json({ error: "Access denied" });
            }
            const msgId = (0, crypto_1.randomUUID)();
            const senderRole = isAdmin ? "admin" : "user";
            await this.pool.query("INSERT INTO thread_messages (id, thread_id, sender_id, sender_role, body) VALUES ($1, $2, $3, $4, $5)", [msgId, id, req.user?.id, senderRole, txt.slice(0, 5000)]);
            await this.pool.query("UPDATE message_threads SET updated_at = now() WHERE id = $1", [id]);
            const saved = await this.safeRows("SELECT id, thread_id, sender_id, sender_role, body, created_at FROM thread_messages WHERE id = $1 LIMIT 1", [msgId]);
            return res.status(201).json(saved[0] || { id: msgId });
        }
        catch (e) {
            return res.status(500).json({ error: e?.message || "Failed to send message" });
        }
    }
};
exports.MessageThreadsController = MessageThreadsController;
__decorate([
    (0, common_1.Get)("threads"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], MessageThreadsController.prototype, "listThreads", null);
__decorate([
    (0, common_1.Post)("threads"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], MessageThreadsController.prototype, "createThread", null);
__decorate([
    (0, common_1.Get)("threads/:id"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)("id")),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], MessageThreadsController.prototype, "getThread", null);
__decorate([
    (0, common_1.Get)("threads/:id/messages"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)("id")),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], MessageThreadsController.prototype, "getThreadMessages", null);
__decorate([
    (0, common_1.Post)("threads/:id/messages"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)("id")),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object]),
    __metadata("design:returntype", Promise)
], MessageThreadsController.prototype, "sendMessage", null);
exports.MessageThreadsController = MessageThreadsController = __decorate([
    (0, common_1.Controller)("api"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Inject)("PG_POOL")),
    __metadata("design:paramtypes", [Object])
], MessageThreadsController);
//# sourceMappingURL=message-threads.controller.js.map