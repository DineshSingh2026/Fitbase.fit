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
exports.TrainerCompatController = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const jwt = require("jsonwebtoken");
const jwt_auth_guard_1 = require("./jwt-auth.guard");
const roles_guard_1 = require("./roles.guard");
const roles_decorator_1 = require("./roles.decorator");
let TrainerCompatController = class TrainerCompatController {
    constructor(pool) {
        this.pool = pool;
    }
    get secret() {
        return process.env.JWT_SECRET || "fitbase-progress-secret-change-in-production";
    }
    signProgressReportToken(userId) {
        return jwt.sign({ userId, purpose: "progress-report" }, this.secret, {
            expiresIn: process.env.PROGRESS_REPORT_LINK_EXPIRY || "30d"
        });
    }
    verifyProgressReportToken(token) {
        if (!token)
            return null;
        try {
            const decoded = jwt.verify(token, this.secret);
            if (decoded?.purpose === "progress-report" && decoded?.userId)
                return String(decoded.userId);
            return null;
        }
        catch {
            return null;
        }
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
    async assertTrainerCanAccessClient(reqUser, userId) {
        if (!this.pool)
            return false;
        if (reqUser?.role === "superadmin")
            return true;
        if (reqUser?.role !== "admin")
            return false;
        const rows = await this.safeRows("SELECT id FROM users WHERE id = $1 AND role = 'user' AND trainer_id = $2 LIMIT 1", [userId, reqUser.id]);
        return !!rows[0];
    }
    async clients(req, res) {
        if (!this.pool)
            return res.json([]);
        try {
            const trainerId = req.user?.role === "admin" ? String(req.user.id) : null;
            const rows = await this.safeRows("SELECT id, first_name, last_name, email, country, timezone, COALESCE(suspended,false) AS suspended, trainer_id FROM users WHERE role='user' AND (approval_status IS NULL OR approval_status='approved') AND ($1::text IS NULL OR trainer_id = $2) ORDER BY first_name, last_name", [trainerId, trainerId]);
            return res.json(rows);
        }
        catch {
            return res.json([]);
        }
    }
    async tribe(res) {
        if (!this.pool)
            return res.json([]);
        const rows = await this.safeRows("SELECT * FROM tribe_members WHERE status='active' ORDER BY phase DESC, start_date ASC");
        return res.json(rows);
    }
    async addTribe(body, res) {
        if (!this.pool)
            return res.status(500).json({ error: "Failed to add member" });
        try {
            if (!String(body?.first_name || "").trim())
                return res.status(400).json({ error: "Name required" });
            await this.pool.query("INSERT INTO tribe_members (id,first_name,last_name,email,phone,city,phase,start_date,activity_per_week,starting_weight,current_weight,target_weight,next_checkin,notes,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'active')", [
                (0, crypto_1.randomUUID)(),
                body?.first_name || "",
                body?.last_name || "",
                body?.email || "",
                body?.phone || "",
                body?.city || "",
                body?.phase || 1,
                body?.start_date || new Date().toISOString().slice(0, 10),
                body?.activity_per_week || 0,
                body?.starting_weight ?? null,
                body?.current_weight ?? null,
                body?.target_weight ?? null,
                body?.next_checkin || "",
                body?.notes || ""
            ]);
            return res.json({ message: "Member added" });
        }
        catch (e) {
            return res.status(500).json({ error: e?.message || "Failed to add member" });
        }
    }
    async meetings(req, res) {
        if (!this.pool)
            return res.json([]);
        const trainerId = req.user?.role === "admin" ? String(req.user.id) : null;
        const rows = await this.safeRows("SELECT m.*, u.trainer_id FROM meetings m LEFT JOIN users u ON u.id = m.user_id WHERE m.status='scheduled' ORDER BY m.meeting_date ASC, m.time_slot ASC");
        const filtered = trainerId == null ? rows : rows.filter((r) => String(r.trainer_id || "") === trainerId);
        return res.json(filtered);
    }
    async createMeeting(body, req, res) {
        if (!this.pool)
            return res.status(500).json({ error: "Failed to schedule call" });
        try {
            if (!body?.user_id || !body?.meeting_date || !body?.time_slot) {
                return res.status(400).json({ error: "User, date and time slot required" });
            }
            if (req.user?.role === "admin") {
                const ok = await this.assertTrainerCanAccessClient(req.user, String(body.user_id));
                if (!ok)
                    return res.status(403).json({ error: "Access denied" });
            }
            const id = (0, crypto_1.randomUUID)();
            await this.pool.query("INSERT INTO meetings (id, user_id, user_name, user_email, user_phone, meeting_date, time_slot, status, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,'scheduled',$8)", [id, body.user_id, body.user_name || "", body.user_email || "", body.user_phone || "", body.meeting_date, body.time_slot, body.notes || ""]);
            return res.json({ id, message: "Call scheduled successfully" });
        }
        catch (e) {
            return res.status(500).json({ error: e?.message || "Failed to schedule call" });
        }
    }
    async meetingsForUser(userId, req, res) {
        if (!this.pool)
            return res.json([]);
        if (req.user?.role === "user" && String(req.user.id) !== String(userId)) {
            return res.status(403).json({ error: "Access denied" });
        }
        if (req.user?.role === "admin") {
            const ok = await this.assertTrainerCanAccessClient(req.user, String(userId));
            if (!ok)
                return res.status(403).json({ error: "Access denied" });
        }
        const rows = await this.safeRows("SELECT * FROM meetings WHERE user_id = $1 ORDER BY meeting_date DESC, created_at DESC", [userId]);
        return res.json(rows);
    }
    async updateMeeting(id, body, req, res) {
        if (!this.pool)
            return res.status(500).json({ error: "Update failed" });
        const rows = await this.safeRows("SELECT * FROM meetings WHERE id = $1 LIMIT 1", [id]);
        const row = rows[0];
        if (!row)
            return res.status(404).json({ error: "Not found" });
        if (req.user?.role === "user" && String(req.user.id) !== String(row.user_id || "")) {
            return res.status(403).json({ error: "Access denied" });
        }
        if (req.user?.role === "admin") {
            const ok = await this.assertTrainerCanAccessClient(req.user, String(row.user_id || ""));
            if (!ok)
                return res.status(403).json({ error: "Access denied" });
        }
        const updates = [];
        const params = [];
        if (body?.meeting_date !== undefined) {
            params.push(body.meeting_date);
            updates.push(`meeting_date = $${params.length}`);
        }
        if (body?.time_slot !== undefined) {
            params.push(body.time_slot);
            updates.push(`time_slot = $${params.length}`);
        }
        if (body?.status !== undefined) {
            params.push(body.status);
            updates.push(`status = $${params.length}`);
        }
        if (!updates.length)
            return res.status(400).json({ error: "No valid fields" });
        params.push(id);
        await this.pool.query(`UPDATE meetings SET ${updates.join(", ")} WHERE id = $${params.length}`, params);
        return res.json({ message: "Updated" });
    }
    async adminUserProgress(userId, req, res) {
        if (!this.pool)
            return res.status(500).json({ error: "Database unavailable" });
        if (req.user?.role === "admin") {
            const ok = await this.assertTrainerCanAccessClient(req.user, userId);
            if (!ok)
                return res.status(403).json({ error: "Access denied" });
        }
        try {
            const userRow = await this.safeRows("SELECT COALESCE(suspended,false) AS suspended FROM users WHERE id = $1 LIMIT 1", [userId]);
            const suspended = !!userRow[0]?.suspended;
            const progressLogs = await this.safeRows("SELECT * FROM progress_logs WHERE user_id = $1 ORDER BY created_at ASC", [userId]);
            const daily = await this.safeRows("SELECT checkin_date, steps, water_ml, protein_g, sleep_hours FROM daily_checkins WHERE user_id = $1 ORDER BY checkin_date ASC", [userId]);
            const workouts = await this.safeRows("SELECT created_at, duration_seconds FROM workout_logs WHERE user_id = $1 ORDER BY created_at ASC", [userId]);
            const currentWeight = progressLogs.length
                ? progressLogs.filter((x) => x.weight != null).slice(-1)[0]?.weight ?? null
                : null;
            const activeStreak = daily.length;
            const workoutConsistencyPercent = progressLogs.length
                ? ((workouts.length / progressLogs.length) * 100).toFixed(1)
                : "0.0";
            const logs = progressLogs.map((p) => ({
                created_at: p.created_at,
                weight: p.weight,
                body_fat: p.body_fat,
                calories_intake: p.calories_intake,
                protein_intake: p.protein_intake,
                workout_completed: !!p.workout_completed,
                workout_type: p.workout_type,
                strength_bench: p.strength_bench,
                strength_squat: p.strength_squat,
                strength_deadlift: p.strength_deadlift,
                sleep_hours: p.sleep_hours,
                water_intake: p.water_intake,
                steps: null
            }));
            return res.json({
                currentWeight,
                weightChangePercent: null,
                strengthGrowthPercent: null,
                workoutConsistencyPercent,
                activeStreak,
                goalCompletionPercent: 0,
                averageCalories: null,
                averageSleep: null,
                insights: [],
                logs,
                suspended
            });
        }
        catch (e) {
            return res.status(500).json({ error: e?.message || "Failed to load progress" });
        }
    }
    async progressReportLink(userId, req, res) {
        if (req.user?.role === "admin") {
            const ok = await this.assertTrainerCanAccessClient(req.user, userId);
            if (!ok)
                return res.status(403).json({ error: "Access denied" });
        }
        const token = this.signProgressReportToken(userId);
        const baseUrl = `${req.protocol}://${req.get("host")}`.replace(/\/$/, "");
        return res.json({ url: `${baseUrl}/progress-report.html?t=${encodeURIComponent(token)}`, token });
    }
    async progressReport(req, res) {
        const token = String(req.query?.token || req.query?.t || "");
        const userId = this.verifyProgressReportToken(token);
        if (!userId)
            return res.status(401).json({ error: "Invalid or expired link" });
        const rows = await this.safeRows("SELECT * FROM progress_logs WHERE user_id = $1 ORDER BY created_at ASC", [userId]);
        return res.json({
            currentWeight: rows.length ? rows.filter((x) => x.weight != null).slice(-1)[0]?.weight ?? null : null,
            logs: rows
        });
    }
};
exports.TrainerCompatController = TrainerCompatController;
__decorate([
    (0, common_1.Get)("clients"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)("admin", "superadmin"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], TrainerCompatController.prototype, "clients", null);
__decorate([
    (0, common_1.Get)("tribe"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)("admin", "superadmin"),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TrainerCompatController.prototype, "tribe", null);
__decorate([
    (0, common_1.Post)("tribe"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)("admin", "superadmin"),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], TrainerCompatController.prototype, "addTribe", null);
__decorate([
    (0, common_1.Get)("meetings"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)("admin", "superadmin"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], TrainerCompatController.prototype, "meetings", null);
__decorate([
    (0, common_1.Post)("meetings"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], TrainerCompatController.prototype, "createMeeting", null);
__decorate([
    (0, common_1.Get)("meetings/user/:userId"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)("userId")),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], TrainerCompatController.prototype, "meetingsForUser", null);
__decorate([
    (0, common_1.Put)("meetings/:id"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)("id")),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], TrainerCompatController.prototype, "updateMeeting", null);
__decorate([
    (0, common_1.Get)("admin/user-progress/:userId"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)("admin", "superadmin"),
    __param(0, (0, common_1.Param)("userId")),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], TrainerCompatController.prototype, "adminUserProgress", null);
__decorate([
    (0, common_1.Get)("admin/progress-report-link/:userId"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)("admin", "superadmin"),
    __param(0, (0, common_1.Param)("userId")),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], TrainerCompatController.prototype, "progressReportLink", null);
__decorate([
    (0, common_1.Get)("progress-report"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], TrainerCompatController.prototype, "progressReport", null);
exports.TrainerCompatController = TrainerCompatController = __decorate([
    (0, common_1.Controller)("api"),
    __param(0, (0, common_1.Inject)("PG_POOL")),
    __metadata("design:paramtypes", [Object])
], TrainerCompatController);
//# sourceMappingURL=trainer-compat.controller.js.map