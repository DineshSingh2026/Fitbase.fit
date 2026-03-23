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
exports.ProgramsController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("./jwt-auth.guard");
const roles_decorator_1 = require("./roles.decorator");
const roles_guard_1 = require("./roles.guard");
const crypto_1 = require("crypto");
const jwt = require("jsonwebtoken");
const fs_1 = require("fs");
const path_1 = require("path");
function isAdmin(user) {
    return user?.role === "admin";
}
function isSuperadmin(user) {
    return user?.role === "superadmin";
}
let ProgramsController = class ProgramsController {
    constructor(pool) {
        this.pool = pool;
    }
    get jwtSecret() {
        return process.env.JWT_SECRET || "fitbase-progress-secret-change-in-production";
    }
    async trainerCanAccessClient(reqUser, clientUserId) {
        if (!this.pool)
            return false;
        if (isSuperadmin(reqUser))
            return true;
        if (!isAdmin(reqUser))
            return false;
        const row = await this.pool.query("SELECT id FROM users WHERE id = $1 AND role = 'user' AND trainer_id = $2 LIMIT 1", [clientUserId, reqUser.id]);
        return !!row.rows[0];
    }
    async markInboxRead(id, req, res) {
        if (!this.pool)
            return res.status(500).json({ error: "Database unavailable" });
        try {
            const rawId = String(id || "").replace(/^inbox-/, "");
            await this.pool.query("UPDATE user_inbox SET is_read = TRUE WHERE id = $1 AND user_id = $2", [
                rawId,
                req.user.id
            ]);
            return res.json({ ok: true });
        }
        catch (e) {
            return res.status(500).json({ error: e?.message || "Failed" });
        }
    }
    async markAllInboxRead(req, res) {
        if (!this.pool)
            return res.status(500).json({ error: "Database unavailable" });
        try {
            await this.pool.query("UPDATE user_inbox SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE", [req.user.id]);
            return res.json({ ok: true });
        }
        catch (e) {
            return res.status(500).json({ error: e?.message || "Failed" });
        }
    }
    async programsLegacy(res) {
        if (!this.pool)
            return res.status(500).json({ error: "Database unavailable" });
        try {
            const rows = await this.pool.query("SELECT id, name, pdf_url, image_url, youtube_url, sort_order FROM programs ORDER BY sort_order, name");
            return res.json(rows.rows);
        }
        catch (e) {
            return res.status(500).json({ error: e?.message || "Failed" });
        }
    }
    async programCatalog(res) {
        if (!this.pool)
            return res.status(500).json({ error: "Database unavailable" });
        try {
            const rows = await this.pool.query("SELECT id, name, pdf_url FROM programs ORDER BY name");
            return res.json(rows.rows);
        }
        catch (e) {
            return res.status(500).json({ error: e?.message || "Failed" });
        }
    }
    async programsByUser(userId, req, res) {
        if (!this.pool)
            return res.status(500).json({ error: "Database unavailable" });
        try {
            if (!(await this.trainerCanAccessClient(req.user, userId))) {
                return res.status(403).json({ error: "Access denied" });
            }
            const rows = await this.pool.query(`SELECT a.id, a.user_id, a.program_id, a.assigned_by, a.assigned_at, a.removed_at,
                p.name as program_name, p.pdf_url, p.youtube_url
         FROM user_program_assignments a
         JOIN programs p ON p.id = a.program_id
         WHERE a.user_id = $1
         ORDER BY a.removed_at IS NULL DESC, a.assigned_at DESC`, [userId]);
            const users = await this.pool.query("SELECT id, first_name, last_name, email FROM users WHERE id IN (SELECT DISTINCT assigned_by FROM user_program_assignments WHERE assigned_by IS NOT NULL)");
            const userMap = {};
            users.rows.forEach((u) => {
                userMap[u.id] = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email;
            });
            const out = rows.rows.map((r) => ({
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
        }
        catch (e) {
            return res.status(500).json({ error: e?.message || "Failed" });
        }
    }
    async assignProgram(body, req, res) {
        if (!this.pool)
            return res.status(500).json({ error: "Database unavailable" });
        try {
            const userId = String(body?.user_id || "");
            const programId = String(body?.program_id || "");
            if (!userId || !programId)
                return res.status(400).json({ error: "user_id and program_id required" });
            if (!(await this.trainerCanAccessClient(req.user, userId))) {
                return res.status(403).json({ error: "Access denied" });
            }
            const activeCount = await this.pool.query("SELECT COUNT(*)::int as c FROM user_program_assignments WHERE user_id = $1 AND removed_at IS NULL", [userId]);
            if (Number(activeCount.rows[0]?.c || 0) >= 4) {
                return res.status(400).json({ error: "User already has maximum 4 programs assigned" });
            }
            const existing = await this.pool.query("SELECT id FROM user_program_assignments WHERE user_id = $1 AND program_id = $2 AND removed_at IS NULL LIMIT 1", [userId, programId]);
            if (existing.rows[0]) {
                return res.status(400).json({ error: "This program is already assigned to the user" });
            }
            const id = (0, crypto_1.randomUUID)();
            await this.pool.query("INSERT INTO user_program_assignments (id, user_id, program_id, assigned_by) VALUES ($1, $2, $3, $4)", [id, userId, programId, req.user.id]);
            return res.json({ id });
        }
        catch (e) {
            return res.status(500).json({ error: e?.message || "Failed" });
        }
    }
    async unassignProgram(id, req, res) {
        if (!this.pool)
            return res.status(500).json({ error: "Database unavailable" });
        try {
            const assignment = await this.pool.query(`SELECT a.id, a.user_id, u.trainer_id
         FROM user_program_assignments a
         LEFT JOIN users u ON u.id = a.user_id
         WHERE a.id = $1`, [id]);
            const row = assignment.rows[0];
            if (!row)
                return res.status(404).json({ error: "Assignment not found" });
            if (isAdmin(req.user) && row.trainer_id !== req.user.id) {
                return res.status(403).json({ error: "Access denied" });
            }
            await this.pool.query("UPDATE user_program_assignments SET removed_at = CURRENT_TIMESTAMP WHERE id = $1 AND removed_at IS NULL", [id]);
            return res.json({ ok: true });
        }
        catch (e) {
            return res.status(500).json({ error: e?.message || "Failed" });
        }
    }
    async mePrograms(req, res) {
        if (!this.pool)
            return res.status(500).json({ error: "Database unavailable" });
        try {
            const rows = await this.pool.query(`SELECT a.id, a.program_id, a.assigned_at, p.name, p.pdf_url, p.image_url, p.youtube_url
         FROM user_program_assignments a
         JOIN programs p ON p.id = a.program_id
         WHERE a.user_id = $1 AND a.removed_at IS NULL
         ORDER BY a.assigned_at DESC`, [req.user.id]);
            return res.json(rows.rows);
        }
        catch (e) {
            return res.status(500).json({ error: e?.message || "Failed" });
        }
    }
    async meProgramUnseen(req, res) {
        if (!this.pool)
            return res.status(500).json([]);
        try {
            const rows = await this.pool.query(`SELECT a.id, p.name
         FROM user_program_assignments a
         JOIN programs p ON p.id = a.program_id
         WHERE a.user_id = $1 AND a.removed_at IS NULL AND a.seen_at IS NULL
         ORDER BY a.assigned_at DESC`, [req.user.id]);
            return res.json(rows.rows);
        }
        catch {
            return res.status(500).json([]);
        }
    }
    async meProgramSeen(id, req, res) {
        if (!this.pool)
            return res.status(500).json({ error: "Database unavailable" });
        try {
            await this.pool.query("UPDATE user_program_assignments SET seen_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2 AND removed_at IS NULL", [id, req.user.id]);
            return res.json({ ok: true });
        }
        catch (e) {
            return res.status(500).json({ error: e?.message || "Failed" });
        }
    }
    async meProgramPdfToken(body, req, res) {
        if (!this.pool)
            return res.status(500).json({ error: "Database unavailable" });
        try {
            const programId = String(body?.program_id || "").trim();
            if (!programId)
                return res.status(400).json({ error: "program_id required" });
            const hasAccess = await this.pool.query("SELECT 1 FROM user_program_assignments a JOIN programs p ON p.id = a.program_id WHERE a.user_id = $1 AND a.program_id = $2 AND a.removed_at IS NULL LIMIT 1", [req.user.id, programId]);
            if (!hasAccess.rows[0]) {
                return res.status(403).json({ error: "Not authorized to view this program" });
            }
            const token = jwt.sign({ programId, userId: req.user.id, purpose: "pdf-view" }, this.jwtSecret, { expiresIn: "10m" });
            const base = (req.protocol + "://" + req.get("host")).replace(/\/$/, "");
            const url = base +
                "/api/me/programs/pdf?t=" +
                encodeURIComponent(token) +
                "&f=" +
                encodeURIComponent(programId);
            const viewUrl = base + "/program-viewer.html?url=" + encodeURIComponent(url);
            return res.json({ url, viewUrl });
        }
        catch (e) {
            return res.status(500).json({ error: e?.message || "Failed" });
        }
    }
    async meProgramPdf(req, res) {
        if (!this.pool)
            return res.status(500).json({ error: "Database unavailable" });
        try {
            const token = String(req.query?.t || "");
            const fileParam = String(req.query?.f || "");
            let payload = null;
            try {
                payload = jwt.verify(token, this.jwtSecret);
            }
            catch {
                payload = null;
            }
            if (!payload || payload.purpose !== "pdf-view" || !payload.programId || !payload.userId) {
                return res.status(403).json({ error: "Invalid or expired link" });
            }
            if (payload.programId !== fileParam) {
                return res.status(403).json({ error: "Invalid or expired link" });
            }
            const hasAccess = await this.pool.query("SELECT 1 FROM user_program_assignments WHERE user_id = $1 AND program_id = $2 AND removed_at IS NULL LIMIT 1", [payload.userId, fileParam]);
            if (!hasAccess.rows[0])
                return res.status(403).json({ error: "Not authorized" });
            const filePath = (0, path_1.join)(process.cwd(), "../../public/programs/pdfs", fileParam);
            if (!(0, fs_1.existsSync)(filePath) || !(0, fs_1.statSync)(filePath).isFile()) {
                return res.status(404).json({ error: "Not found" });
            }
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Disposition", "inline");
            res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
            res.setHeader("Pragma", "no-cache");
            res.setHeader("Expires", "0");
            (0, fs_1.createReadStream)(filePath).pipe(res);
            return;
        }
        catch (e) {
            return res.status(500).json({ error: e?.message || "Failed" });
        }
    }
};
exports.ProgramsController = ProgramsController;
__decorate([
    (0, common_1.Delete)("inbox/:id"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)("id")),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], ProgramsController.prototype, "markInboxRead", null);
__decorate([
    (0, common_1.Delete)("inbox"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ProgramsController.prototype, "markAllInboxRead", null);
__decorate([
    (0, common_1.Get)("programs-legacy"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)("admin", "superadmin"),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ProgramsController.prototype, "programsLegacy", null);
__decorate([
    (0, common_1.Get)("admin/program-catalog"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)("admin", "superadmin"),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ProgramsController.prototype, "programCatalog", null);
__decorate([
    (0, common_1.Get)("programs/user/:userId"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)("admin", "superadmin"),
    __param(0, (0, common_1.Param)("userId")),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], ProgramsController.prototype, "programsByUser", null);
__decorate([
    (0, common_1.Post)("programs/assign"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)("admin", "superadmin"),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], ProgramsController.prototype, "assignProgram", null);
__decorate([
    (0, common_1.Delete)("programs/assign/:id"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)("admin", "superadmin"),
    __param(0, (0, common_1.Param)("id")),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], ProgramsController.prototype, "unassignProgram", null);
__decorate([
    (0, common_1.Get)("me/programs"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ProgramsController.prototype, "mePrograms", null);
__decorate([
    (0, common_1.Get)("me/program-assignments/unseen"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ProgramsController.prototype, "meProgramUnseen", null);
__decorate([
    (0, common_1.Post)("me/program-assignments/:id/seen"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)("id")),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], ProgramsController.prototype, "meProgramSeen", null);
__decorate([
    (0, common_1.Post)("me/programs/pdf-token"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], ProgramsController.prototype, "meProgramPdfToken", null);
__decorate([
    (0, common_1.Get)("me/programs/pdf"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ProgramsController.prototype, "meProgramPdf", null);
exports.ProgramsController = ProgramsController = __decorate([
    (0, common_1.Controller)("api"),
    __param(0, (0, common_1.Inject)("PG_POOL")),
    __metadata("design:paramtypes", [Object])
], ProgramsController);
//# sourceMappingURL=programs.controller.js.map