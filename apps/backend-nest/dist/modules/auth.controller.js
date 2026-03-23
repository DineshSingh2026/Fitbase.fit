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
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const bcrypt = require("bcryptjs");
const auth_service_1 = require("./auth.service");
const jwt_auth_guard_1 = require("./jwt-auth.guard");
let AuthController = class AuthController {
    constructor(pool, authService) {
        this.pool = pool;
        this.authService = authService;
    }
    async login(body, res) {
        if (!this.pool) {
            return res.status(500).json({ error: "Server error. Please try again." });
        }
        const email = String(body?.email || "").trim().toLowerCase();
        const password = String(body?.password || "").trim();
        if (!email || !password) {
            return res.status(400).json({ error: "Email and password required" });
        }
        try {
            const userRes = await this.pool.query(`SELECT id, email, password, first_name, last_name, profile_picture, role, country, timezone, trainer_id, approval_status, suspended
         FROM users
         WHERE LOWER(email) = $1
         LIMIT 1`, [email]);
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
                    message: "Your account is pending admin approval. You will be able to log in once approved."
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
        }
        catch {
            return res.status(500).json({ error: "Server error. Please try again." });
        }
    }
    async me(req) {
        if (!this.pool) {
            throw new common_1.UnauthorizedException("Database is not configured");
        }
        const id = String(req.user?.id || "");
        if (!id)
            throw new common_1.UnauthorizedException("Invalid token");
        const userRes = await this.pool.query(`SELECT id, email, first_name, last_name, profile_picture, role, country, timezone, trainer_id
       FROM users
       WHERE id = $1
       LIMIT 1`, [id]);
        const user = userRes.rows[0];
        if (!user)
            throw new common_1.UnauthorizedException("User not found");
        return user;
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Post)("login"),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
__decorate([
    (0, common_1.Get)("me"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "me", null);
exports.AuthController = AuthController = __decorate([
    (0, common_1.Controller)("api/auth"),
    __param(0, (0, common_1.Inject)("PG_POOL")),
    __metadata("design:paramtypes", [Object, auth_service_1.AuthService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map