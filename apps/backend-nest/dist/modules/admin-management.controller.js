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
exports.AdminManagementController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("./jwt-auth.guard");
const roles_guard_1 = require("./roles.guard");
const roles_decorator_1 = require("./roles.decorator");
const crypto_1 = require("crypto");
const bcrypt = require("bcryptjs");
function isAdmin(user) {
    return user?.role === "admin";
}
function isSuperadmin(user) {
    return user?.role === "superadmin";
}
let AdminManagementController = class AdminManagementController {
    constructor(pool) {
        this.pool = pool;
    }
    async pendingSignups(req, res) {
        if (!this.pool)
            return res.status(500).json({ error: "Failed to fetch pending sign-ups" });
        try {
            let sql = "SELECT id, email, first_name, last_name, created_at, trainer_id FROM users WHERE role = 'user' AND (approval_status IS NULL OR approval_status = 'pending')";
            const params = [];
            if (isAdmin(req.user)) {
                sql += " AND (trainer_id IS NULL OR trainer_id = $1)";
                params.push(req.user.id);
            }
            sql += " ORDER BY created_at DESC";
            const list = await this.pool.query(sql, params);
            return res.json(list.rows);
        }
        catch {
            return res.status(500).json({ error: "Failed to fetch pending sign-ups" });
        }
    }
    async approveUser(id, body, req, res) {
        if (!this.pool)
            return res.status(500).json({ error: "Failed to approve user" });
        try {
            const userRes = await this.pool.query("SELECT id, role, email, first_name, last_name, phone, country, trainer_id FROM users WHERE id = $1 LIMIT 1", [id]);
            const user = userRes.rows[0];
            if (!user)
                return res.status(404).json({ error: "User not found" });
            if (user.role === "admin")
                return res.status(400).json({ error: "Cannot change admin approval" });
            if (isAdmin(req.user) && user.trainer_id && user.trainer_id !== req.user.id) {
                return res.status(403).json({ error: "Access denied" });
            }
            let targetTrainerId = null;
            if (isSuperadmin(req.user)) {
                targetTrainerId = body?.trainer_id ? String(body.trainer_id).trim() : user.trainer_id || null;
            }
            else {
                targetTrainerId = req.user.id;
            }
            if (targetTrainerId) {
                const tr = await this.pool.query("SELECT id FROM users WHERE id = $1 AND role = 'admin' LIMIT 1", [targetTrainerId]);
                if (!tr.rows[0])
                    return res.status(400).json({ error: "Invalid trainer_id" });
            }
            await this.pool.query("UPDATE users SET approval_status = 'approved', trainer_id = COALESCE($1, trainer_id) WHERE id = $2", [targetTrainerId, id]);
            const existingTribe = await this.pool.query("SELECT id FROM tribe_members WHERE LOWER(email) = $1 LIMIT 1", [String(user.email || "").toLowerCase()]);
            if (!existingTribe.rows[0]) {
                const tribeId = (0, crypto_1.randomUUID)();
                const today = new Date().toISOString().split("T")[0];
                const city = String(user.country || "").trim();
                await this.pool.query("INSERT INTO tribe_members (id, first_name, last_name, email, phone, city, phase, start_date, activity_per_week, starting_weight, current_weight, target_weight, next_checkin, notes) VALUES ($1,$2,$3,$4,$5,$6,1,$7,0,$8,$9,$10,$11,$12)", [
                    tribeId,
                    user.first_name || "",
                    user.last_name || "",
                    user.email || "",
                    user.phone || "",
                    city,
                    today,
                    null,
                    null,
                    null,
                    "",
                    "Newly approved"
                ]);
            }
            return res.json({ message: "User approved" });
        }
        catch {
            return res.status(500).json({ error: "Failed to approve user" });
        }
    }
    async rejectUser(id, req, res) {
        if (!this.pool)
            return res.status(500).json({ error: "Failed to reject user" });
        try {
            const userRes = await this.pool.query("SELECT id, role, trainer_id FROM users WHERE id = $1 LIMIT 1", [id]);
            const user = userRes.rows[0];
            if (!user)
                return res.status(404).json({ error: "User not found" });
            if (user.role === "admin")
                return res.status(400).json({ error: "Cannot change admin approval" });
            if (isAdmin(req.user) && user.trainer_id && user.trainer_id !== req.user.id) {
                return res.status(403).json({ error: "Access denied" });
            }
            await this.pool.query("UPDATE users SET approval_status = 'rejected' WHERE id = $1", [id]);
            return res.json({ message: "User rejected" });
        }
        catch {
            return res.status(500).json({ error: "Failed to reject user" });
        }
    }
    async pendingSignupById(id, req, res) {
        if (!this.pool)
            return res.status(500).json({ error: "Failed to fetch sign-up request" });
        try {
            let sql = "SELECT id, email, first_name, last_name, phone, country, timezone, created_at, trainer_id FROM users WHERE id = $1 AND role = 'user' AND (approval_status IS NULL OR approval_status = 'pending')";
            const params = [id];
            if (isAdmin(req.user)) {
                sql += " AND (trainer_id IS NULL OR trainer_id = $2)";
                params.push(req.user.id);
            }
            const userRes = await this.pool.query(sql, params);
            const user = userRes.rows[0];
            if (!user)
                return res.status(404).json({ error: "Not found" });
            return res.json(user);
        }
        catch {
            return res.status(500).json({ error: "Failed to fetch sign-up request" });
        }
    }
    async createClient(body, req, res) {
        if (!this.pool)
            return res.status(500).json({ error: "Failed to create client" });
        try {
            const emailNorm = String(body?.email || "").trim().toLowerCase();
            const pwd = String(body?.password || "");
            if (!emailNorm || !pwd)
                return res.status(400).json({ error: "Email and password are required" });
            if (pwd.length < 6)
                return res.status(400).json({ error: "Password must be at least 6 characters" });
            const existing = await this.pool.query("SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1", [
                emailNorm
            ]);
            if (existing.rows[0])
                return res.status(409).json({ error: "Email already registered" });
            let trainerId = null;
            if (isAdmin(req.user)) {
                trainerId = req.user.id;
            }
            else if (body?.trainer_id) {
                const tr = await this.pool.query("SELECT id FROM users WHERE id = $1 AND role = 'admin' LIMIT 1", [String(body.trainer_id).trim()]);
                if (!tr.rows[0])
                    return res.status(400).json({ error: "Invalid trainer_id" });
                trainerId = tr.rows[0].id;
            }
            const id = (0, crypto_1.randomUUID)();
            const hash = bcrypt.hashSync(pwd, 10);
            const country = String(body?.country || "").trim();
            const timezone = String(body?.timezone || "").trim();
            await this.pool.query("INSERT INTO users (id, email, password, first_name, last_name, phone, country, timezone, role, approval_status, trainer_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'user','approved',$9)", [
                id,
                emailNorm,
                hash,
                body?.first_name || "",
                body?.last_name || "",
                body?.phone || "",
                country,
                timezone,
                trainerId
            ]);
            const tribeId = (0, crypto_1.randomUUID)();
            const today = new Date().toISOString().split("T")[0];
            await this.pool.query("INSERT INTO tribe_members (id, first_name, last_name, email, phone, city, phase, start_date, activity_per_week, starting_weight, current_weight, target_weight, next_checkin, notes) VALUES ($1,$2,$3,$4,$5,$6,1,$7,0,$8,$9,$10,$11,$12)", [
                tribeId,
                body?.first_name || "",
                body?.last_name || "",
                emailNorm,
                body?.phone || "",
                country,
                today,
                null,
                null,
                null,
                "",
                "Added by trainer dashboard"
            ]);
            return res.json({
                id,
                email: emailNorm,
                first_name: body?.first_name || "",
                last_name: body?.last_name || "",
                role: "user",
                approval_status: "approved",
                trainer_id: trainerId || null
            });
        }
        catch {
            return res.status(500).json({ error: "Failed to create client" });
        }
    }
    async users(req, res) {
        if (!this.pool)
            return res.status(500).json({ error: "Server error" });
        try {
            let sql = "SELECT id, first_name, last_name, email, country, timezone, COALESCE(suspended, false) as suspended, trainer_id FROM users WHERE role = 'user' AND (approval_status IS NULL OR approval_status = 'approved') AND (email NOT LIKE '%@test.fitbase.fit') AND (LOWER(first_name) NOT LIKE '%e2e%')";
            const params = [];
            if (isAdmin(req.user)) {
                sql += " AND trainer_id = $1";
                params.push(req.user.id);
            }
            sql += " ORDER BY first_name, last_name";
            const list = await this.pool.query(sql, params);
            return res.json(list.rows);
        }
        catch (e) {
            return res.status(500).json({ error: e?.message || "Server error" });
        }
    }
    async suspendUser(id, req, res) {
        if (!this.pool)
            return res.status(500).json({ error: "Failed to suspend user" });
        try {
            const userRes = await this.pool.query("SELECT id, role, trainer_id FROM users WHERE id = $1 LIMIT 1", [id]);
            const user = userRes.rows[0];
            if (!user)
                return res.status(404).json({ error: "User not found" });
            if (user.role !== "user")
                return res.status(400).json({ error: "Can only suspend client users" });
            if (isAdmin(req.user) && user.trainer_id !== req.user.id) {
                return res.status(403).json({ error: "Access denied" });
            }
            await this.pool.query("UPDATE users SET suspended = TRUE WHERE id = $1", [id]);
            return res.json({ message: "User suspended" });
        }
        catch {
            return res.status(500).json({ error: "Failed to suspend user" });
        }
    }
    async reactivateUser(id, req, res) {
        if (!this.pool)
            return res.status(500).json({ error: "Failed to reactivate user" });
        try {
            const userRes = await this.pool.query("SELECT id, role, trainer_id FROM users WHERE id = $1 LIMIT 1", [id]);
            const user = userRes.rows[0];
            if (!user)
                return res.status(404).json({ error: "User not found" });
            if (user.role !== "user")
                return res.status(400).json({ error: "Can only reactivate client users" });
            if (isAdmin(req.user) && user.trainer_id !== req.user.id) {
                return res.status(403).json({ error: "Access denied" });
            }
            await this.pool.query("UPDATE users SET suspended = FALSE WHERE id = $1", [id]);
            return res.json({ message: "User reactivated" });
        }
        catch {
            return res.status(500).json({ error: "Failed to reactivate user" });
        }
    }
    async recentActivity(req, res) {
        if (!this.pool)
            return res.status(500).json([]);
        try {
            const limit = 10;
            const activities = [];
            const trainerId = isAdmin(req.user) ? req.user.id : null;
            const sc = await this.pool.query(`SELECT s.full_name, s.created_at
         FROM sunday_checkins s
         LEFT JOIN users u ON u.id = s.user_id
         WHERE ($1::text IS NULL OR u.trainer_id = $2)
         ORDER BY s.created_at DESC LIMIT $3`, [trainerId, trainerId, limit]);
            sc.rows.forEach((r) => activities.push({
                name: r.full_name || "Unknown",
                type: "Check-in",
                status: "NEW",
                created_at: r.created_at
            }));
            const wl = await this.pool.query(`SELECT u.first_name, u.last_name, w.created_at
         FROM workout_logs w LEFT JOIN users u ON u.id = w.user_id
         WHERE ($1::text IS NULL OR u.trainer_id = $2)
         ORDER BY w.created_at DESC LIMIT $3`, [trainerId, trainerId, limit]);
            wl.rows.forEach((r) => activities.push({
                name: `${r.first_name || ""} ${r.last_name || ""}`.trim() || "User",
                type: "Workout logged",
                status: "DONE",
                created_at: r.created_at
            }));
            const cm = await this.pool.query(`SELECT c.name, c.created_at
         FROM contact_messages c
         LEFT JOIN users u ON u.id = c.user_id
         WHERE ($1::text IS NULL OR u.trainer_id = $2)
         ORDER BY c.created_at DESC LIMIT $3`, [trainerId, trainerId, limit]);
            cm.rows.forEach((r) => activities.push({
                name: r.name || "Unknown",
                type: "Message",
                status: "UNREAD",
                created_at: r.created_at
            }));
            const ps = await this.pool.query(`SELECT first_name, last_name, created_at
         FROM users
         WHERE role='user' AND approval_status='pending' AND ($1::text IS NULL OR trainer_id = $2)
         ORDER BY created_at DESC LIMIT $3`, [trainerId, trainerId, limit]);
            ps.rows.forEach((r) => activities.push({
                name: `${r.first_name || ""} ${r.last_name || ""}`.trim() || "New user",
                type: "Sign-up",
                status: "PENDING",
                created_at: r.created_at
            }));
            activities.sort((a, b) => new Date(String(b.created_at || 0)).getTime() - new Date(String(a.created_at || 0)).getTime());
            return res.json(activities.slice(0, limit));
        }
        catch {
            return res.status(500).json([]);
        }
    }
    async performanceInsights(req, res) {
        if (!this.pool)
            return res.status(500).json({ error: "Database unavailable", summary: {}, data: [] });
        try {
            const source = String(req.query?.source || "all").toLowerCase();
            const dateFrom = req.query?.from ? String(req.query.from) : null;
            const dateTo = req.query?.to ? String(req.query.to) : null;
            const filterUserId = req.query?.user_id ? String(req.query.user_id) : null;
            const scopedUserId = isAdmin(req.user) ? null : filterUserId;
            const trainerId = isAdmin(req.user) ? req.user.id : null;
            const hasDate = !!(dateFrom || dateTo);
            const summary = {};
            const usersApproved = await this.pool.query("SELECT COUNT(*)::int as c FROM users WHERE role='user' AND (approval_status IS NULL OR approval_status = 'approved') AND ($1::text IS NULL OR trainer_id = $2)", [trainerId, trainerId]);
            summary.users_approved = usersApproved.rows[0]?.c || 0;
            const pendingAudit = await this.pool.query("SELECT COUNT(*)::int as c FROM audit_requests WHERE status='pending'");
            summary.pending_requests = pendingAudit.rows[0]?.c || 0;
            const dailyCheckins = await this.pool.query("SELECT COUNT(*)::int as c FROM daily_checkins d LEFT JOIN users u ON u.id = d.user_id WHERE ($1::text IS NULL OR u.trainer_id = $2)", [trainerId, trainerId]);
            summary.daily_checkins = dailyCheckins.rows[0]?.c || 0;
            const counters = [
                { key: "workouts", sql: "SELECT COUNT(*)::int as c FROM workout_logs w", dateCol: "w.created_at", userCol: "w.user_id" },
                { key: "sunday_checkin", sql: "SELECT COUNT(*)::int as c FROM sunday_checkins", dateCol: "created_at", userCol: "user_id" },
                { key: "audit", sql: "SELECT COUNT(*)::int as c FROM audit_requests", dateCol: "created_at", userCol: null },
                { key: "part2", sql: "SELECT COUNT(*)::int as c FROM part2_audit", dateCol: "created_at", userCol: null },
                { key: "meetings", sql: "SELECT COUNT(*)::int as c FROM meetings WHERE status='scheduled'", dateCol: "created_at", userCol: "user_id" },
                { key: "messages", sql: "SELECT COUNT(*)::int as c FROM contact_messages", dateCol: "created_at", userCol: "user_id" }
            ];
            for (const item of counters) {
                let sql = item.sql;
                const conditions = [];
                const params = [];
                if (hasDate && item.dateCol) {
                    if (dateFrom) {
                        params.push(dateFrom);
                        conditions.push(`date(${item.dateCol}) >= date($${params.length})`);
                    }
                    if (dateTo) {
                        params.push(dateTo);
                        conditions.push(`date(${item.dateCol}) <= date($${params.length})`);
                    }
                }
                if (scopedUserId && item.userCol) {
                    params.push(scopedUserId);
                    conditions.push(`${item.userCol} = $${params.length}`);
                }
                if (conditions.length) {
                    sql += (item.sql.toLowerCase().includes(" where ") ? " AND " : " WHERE ") + conditions.join(" AND ");
                }
                const row = await this.pool.query(sql, params);
                summary[item.key] = row.rows[0]?.c || 0;
            }
            let data = [];
            if (source === "all" || source === "overview") {
                const limit = 80;
                const w = await this.pool.query("SELECT w.id, w.user_id, w.workout_name, w.duration_seconds, w.created_at, u.first_name, u.last_name FROM workout_logs w LEFT JOIN users u ON w.user_id = u.id ORDER BY w.created_at DESC LIMIT 200");
                const sc = await this.pool.query("SELECT id, user_id, full_name, reply_email, created_at FROM sunday_checkins ORDER BY created_at DESC LIMIT 200");
                const ar = await this.pool.query("SELECT id, first_name, last_name, email, created_at FROM audit_requests ORDER BY created_at DESC LIMIT 200");
                const p2 = await this.pool.query("SELECT id, name, email, created_at FROM part2_audit ORDER BY created_at DESC LIMIT 200");
                const meet = await this.pool.query("SELECT id, user_id, user_name, user_email, meeting_date, time_slot, created_at FROM meetings ORDER BY created_at DESC LIMIT 200");
                const msg = await this.pool.query("SELECT id, user_id, name, email, message, created_at FROM contact_messages ORDER BY created_at DESC LIMIT 200");
                data = [
                    ...w.rows.map((r) => ({ ...r, _source: "workouts", _date: r.created_at })),
                    ...sc.rows.map((r) => ({ ...r, _source: "sunday_checkin", _date: r.created_at })),
                    ...ar.rows.map((r) => ({ ...r, _source: "audit", _date: r.created_at })),
                    ...p2.rows.map((r) => ({ ...r, _source: "part2", _date: r.created_at })),
                    ...meet.rows.map((r) => ({ ...r, _source: "meetings", _date: r.created_at })),
                    ...msg.rows.map((r) => ({ ...r, _source: "messages", _date: r.created_at }))
                ];
                if (hasDate) {
                    data = data.filter((r) => {
                        const d = String(r._date || r.created_at || "").slice(0, 10);
                        return (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo);
                    });
                }
                if (scopedUserId)
                    data = data.filter((r) => r.user_id === scopedUserId);
                data.sort((a, b) => new Date(String(b._date || b.created_at || 0)).getTime() - new Date(String(a._date || a.created_at || 0)).getTime());
                data = data.slice(0, limit);
            }
            else {
                const limit = 500;
                const params = [];
                let sql = "";
                const addDateUserFilters = (dateCol, userCol) => {
                    const where = [];
                    if (dateFrom) {
                        params.push(dateFrom);
                        where.push(`date(${dateCol}) >= date($${params.length})`);
                    }
                    if (dateTo) {
                        params.push(dateTo);
                        where.push(`date(${dateCol}) <= date($${params.length})`);
                    }
                    if (scopedUserId && userCol) {
                        params.push(scopedUserId);
                        where.push(`${userCol} = $${params.length}`);
                    }
                    return where;
                };
                if (source === "workouts") {
                    sql =
                        "SELECT w.id, w.user_id, w.workout_name, w.duration_seconds, w.feedback, w.created_at, u.first_name, u.last_name, u.email FROM workout_logs w LEFT JOIN users u ON w.user_id = u.id";
                    const where = addDateUserFilters("w.created_at", "w.user_id");
                    if (where.length)
                        sql += " WHERE " + where.join(" AND ");
                    sql += ` ORDER BY w.created_at DESC LIMIT ${limit}`;
                }
                else if (source === "sunday_checkin") {
                    sql = "SELECT id, user_id, full_name, reply_email, plan, total_weight_loss, created_at FROM sunday_checkins";
                    const where = addDateUserFilters("created_at", "user_id");
                    if (where.length)
                        sql += " WHERE " + where.join(" AND ");
                    sql += ` ORDER BY created_at DESC LIMIT ${limit}`;
                }
                else if (source === "audit") {
                    sql = "SELECT id, first_name, last_name, email, city, goals, status, created_at FROM audit_requests";
                    const where = addDateUserFilters("created_at", null);
                    if (where.length)
                        sql += " WHERE " + where.join(" AND ");
                    sql += ` ORDER BY created_at DESC LIMIT ${limit}`;
                }
                else if (source === "part2") {
                    sql = "SELECT id, name, email, mobile, activity_level, created_at FROM part2_audit";
                    const where = addDateUserFilters("created_at", null);
                    if (where.length)
                        sql += " WHERE " + where.join(" AND ");
                    sql += ` ORDER BY created_at DESC LIMIT ${limit}`;
                }
                else if (source === "meetings") {
                    sql =
                        "SELECT id, user_id, user_name, user_email, user_phone, meeting_date, time_slot, status, created_at FROM meetings";
                    const where = addDateUserFilters("created_at", "user_id");
                    if (where.length)
                        sql += " WHERE " + where.join(" AND ");
                    sql += ` ORDER BY created_at DESC LIMIT ${limit}`;
                }
                else if (source === "messages") {
                    sql = "SELECT id, user_id, name, email, phone, message, created_at FROM contact_messages";
                    const where = addDateUserFilters("created_at", "user_id");
                    if (where.length)
                        sql += " WHERE " + where.join(" AND ");
                    sql += ` ORDER BY created_at DESC LIMIT ${limit}`;
                }
                if (sql) {
                    const rows = await this.pool.query(sql, params);
                    data = rows.rows;
                }
            }
            const stats = { ...summary, sunday_checkins: summary.sunday_checkin };
            return res.json({
                summary,
                stats,
                data,
                filters: { source, dateFrom, dateTo, user_id: filterUserId || null }
            });
        }
        catch (e) {
            return res.status(500).json({ error: e?.message || "Server error", summary: {}, data: [] });
        }
    }
};
exports.AdminManagementController = AdminManagementController;
__decorate([
    (0, common_1.Get)("pending-signups"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AdminManagementController.prototype, "pendingSignups", null);
__decorate([
    (0, common_1.Post)("approve-user/:id"),
    __param(0, (0, common_1.Param)("id")),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AdminManagementController.prototype, "approveUser", null);
__decorate([
    (0, common_1.Post)("reject-user/:id"),
    __param(0, (0, common_1.Param)("id")),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], AdminManagementController.prototype, "rejectUser", null);
__decorate([
    (0, common_1.Get)("pending-signup/:id"),
    __param(0, (0, common_1.Param)("id")),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], AdminManagementController.prototype, "pendingSignupById", null);
__decorate([
    (0, common_1.Post)("create-client"),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AdminManagementController.prototype, "createClient", null);
__decorate([
    (0, common_1.Get)("users"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AdminManagementController.prototype, "users", null);
__decorate([
    (0, common_1.Post)("users/:id/suspend"),
    __param(0, (0, common_1.Param)("id")),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], AdminManagementController.prototype, "suspendUser", null);
__decorate([
    (0, common_1.Post)("users/:id/reactivate"),
    __param(0, (0, common_1.Param)("id")),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], AdminManagementController.prototype, "reactivateUser", null);
__decorate([
    (0, common_1.Get)("recent-activity"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AdminManagementController.prototype, "recentActivity", null);
__decorate([
    (0, common_1.Get)("performance-insights"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AdminManagementController.prototype, "performanceInsights", null);
exports.AdminManagementController = AdminManagementController = __decorate([
    (0, common_1.Controller)("api/admin"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)("admin", "superadmin"),
    __param(0, (0, common_1.Inject)("PG_POOL")),
    __metadata("design:paramtypes", [Object])
], AdminManagementController);
//# sourceMappingURL=admin-management.controller.js.map