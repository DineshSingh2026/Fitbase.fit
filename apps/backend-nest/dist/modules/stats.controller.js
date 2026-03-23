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
exports.StatsController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("./jwt-auth.guard");
const roles_guard_1 = require("./roles.guard");
const roles_decorator_1 = require("./roles.decorator");
let StatsController = class StatsController {
    constructor(pool) {
        this.pool = pool;
    }
    async safeCount(sql, params = []) {
        if (!this.pool)
            return 0;
        try {
            const r = await this.pool.query(sql, params);
            return Number(r.rows?.[0]?.c || 0);
        }
        catch (e) {
            if (e?.code === "42P01" || e?.code === "42703")
                return 0;
            throw e;
        }
    }
    async stats(req, res) {
        if (!this.pool) {
            return res.status(500).json({ error: "Database unavailable" });
        }
        try {
            const trainerId = req.user?.role === "admin" ? String(req.user.id || "") : null;
            const activeMembers = await this.safeCount("SELECT COUNT(*)::int AS c FROM users WHERE role='user' AND (approval_status IS NULL OR approval_status='approved') AND ($1::text IS NULL OR trainer_id = $2)", [trainerId, trainerId]);
            const pendingSignups = await this.safeCount("SELECT COUNT(*)::int AS c FROM users WHERE role='user' AND (approval_status IS NULL OR approval_status='pending') AND ($1::text IS NULL OR trainer_id = $2)", [trainerId, trainerId]);
            const dailyCheckins = await this.safeCount("SELECT COUNT(*)::int AS c FROM daily_checkins d LEFT JOIN users u ON u.id = d.user_id WHERE ($1::text IS NULL OR u.trainer_id = $2)", [trainerId, trainerId]);
            const messages = await this.safeCount("SELECT COUNT(*)::int AS c FROM contact_messages c LEFT JOIN users u ON u.id = c.user_id WHERE ($1::text IS NULL OR u.trainer_id = $2)", [trainerId, trainerId]);
            const pendingRequests = await this.safeCount("SELECT COUNT(*)::int AS c FROM audit_requests WHERE status='pending'");
            return res.json({
                pending_requests: pendingRequests,
                active_members: activeMembers,
                daily_checkins: dailyCheckins,
                pending_signups: pendingSignups,
                messages
            });
        }
        catch (e) {
            return res.status(500).json({ error: e?.message || "Failed to fetch stats" });
        }
    }
};
exports.StatsController = StatsController;
__decorate([
    (0, common_1.Get)("stats"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], StatsController.prototype, "stats", null);
exports.StatsController = StatsController = __decorate([
    (0, common_1.Controller)("api"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)("admin", "superadmin"),
    __param(0, (0, common_1.Inject)("PG_POOL")),
    __metadata("design:paramtypes", [Object])
], StatsController);
//# sourceMappingURL=stats.controller.js.map